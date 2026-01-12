from __future__ import annotations

import asyncio
import logging
from typing import List, Optional, Set
import os

import aiohttp

logger = logging.getLogger(__name__)

DEFAULT_UART_URL = "http://10.0.0.104:8000/uart"
DEFAULT_BUFFER_MAX_LINES = 1000


class UartReader:
    """
    Simple SSE/line reader that buffers UART output.

    It keeps only the most recent `max_lines` lines to avoid unbounded memory
    growth and reconnects automatically on transient failures.

    Supports listeners (asyncio.Queue) for real-time broadcasting.
    """

    def __init__(self, url: str = DEFAULT_UART_URL, max_lines: int = DEFAULT_BUFFER_MAX_LINES) -> None:
        self.url = os.getenv("BARF_UART_URL", url)
        # We start with two "teed" outputs:
        # 1. An explicit queue for the agent (polled via read_uart/drain).
        # 2. A set of dynamic listeners (used by the UI).
        self._agent_queue: asyncio.Queue[str] = asyncio.Queue(maxsize=max_lines)
        self._ui_queues: Set[asyncio.Queue[str]] = set()

        self._task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()
        self._debug = os.getenv("BARF_UART_DEBUG", "0").lower() not in {"0", "false", "no", ""}
        
        # Diagnostics
        self._status = "initialized"
        self._last_error: Optional[str] = None
        self._lines_read = 0
        self._last_activity = "never"

    async def ensure_running(self) -> None:
        """Start the background reader if it's not already running."""
        if self._task and not self._task.done():
            return

        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._run(), name="uart_reader")

    def add_listener(self) -> asyncio.Queue[str]:
        """
        Create and register a new listener queue (e.g. for the UI).
        """
        q: asyncio.Queue[str] = asyncio.Queue()
        self._ui_queues.add(q)
        return q

    def remove_listener(self, q: asyncio.Queue[str]) -> None:
        """Remove a listener queue."""
        self._ui_queues.discard(q)

    def is_running(self) -> bool:
        """Check if the reader task is still running."""
        return self._task is not None and not self._task.done() and not self._stop_event.is_set()

    def get_diagnostics(self) -> dict:
        return {
            "status": self._status,
            "url": self.url,
            "last_error": self._last_error,
            "lines_read_total": self._lines_read,
            "last_activity": self._last_activity,
            "agent_queue_size": self._agent_queue.qsize(),
            "active_listeners": len(self._ui_queues),
            "task_running": self._task is not None and not self._task.done(),
        }

    async def _run(self) -> None:
        """Continuously stream lines from the UART SSE endpoint."""
        import datetime
        self._status = "starting"
        while not self._stop_event.is_set():
            try:
                self._status = "connecting"
                if self._debug:
                    logger.debug(f"Connecting to {self.url}")
                # Short read timeout allows faster response to shutdown signals
                timeout = aiohttp.ClientTimeout(total=None, sock_connect=5, sock_read=5)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.get(
                        self.url,
                        headers={"Accept": "text/event-stream"},
                    ) as resp:
                        resp.raise_for_status()
                        self._status = "connected"
                        self._last_error = None

                        partial = ""
                        async for raw in resp.content.iter_chunked(1):
                            if self._stop_event.is_set():
                                break

                            if not raw:
                                continue

                            self._last_activity = datetime.datetime.now().isoformat()
                            partial += raw.decode("utf-8", errors="replace")

                            # Split on either newline or carriage-return.
                            while "\n" in partial or "\r" in partial:
                                line, sep, remainder = partial.partition("\n")
                                if sep == "":
                                    line, sep, remainder = partial.partition("\r")
                                partial = remainder
                                line = line.rstrip("\r\n")

                                # SSE sends lines prefixed with "data:" by convention.
                                if line.startswith("data:"):
                                    line = line[5:].lstrip()

                                if not line:
                                    continue
                                
                                self._lines_read += 1
                                if self._debug:
                                    logger.debug(f"UART: {line}")

                                # Tee the line to Agent (drop oldest if full)
                                if self._agent_queue.full():
                                    try:
                                        self._agent_queue.get_nowait()
                                    except asyncio.QueueEmpty:
                                        pass  # Race condition: queue was drained between check and get
                                try:
                                    self._agent_queue.put_nowait(line)
                                except asyncio.QueueFull:
                                    pass  # Queue filled between get and put

                                # Tee the line to UI listeners
                                for q in list(self._ui_queues):
                                    try:
                                        q.put_nowait(line)
                                    except asyncio.QueueFull:
                                        # Should not happen with unbounded queue
                                        pass

            except asyncio.CancelledError:
                raise  # Propagate cancellation
            except Exception as exc:
                self._status = "error"
                self._last_error = str(exc)
                logger.debug(f"Reconnecting after error: {exc}")
                await asyncio.sleep(1)

    async def drain(self, wait_seconds: float = 0.0) -> List[str]:
        """
        Return all buffered lines from the Agent's queue.
        
        If the queue is empty and `wait_seconds` > 0, wait up to that long for
        new data to arrive before returning.
        """
        lines = []

        # If empty, wait for at least one item
        if self._agent_queue.empty() and wait_seconds > 0:
            try:
                # wait_for returns the value from the coroutine
                first_line = await asyncio.wait_for(self._agent_queue.get(), timeout=wait_seconds)
                lines.append(first_line)
            except asyncio.TimeoutError:
                pass

        # Drain the rest immediately without waiting
        while not self._agent_queue.empty():
            try:
                lines.append(self._agent_queue.get_nowait())
            except asyncio.QueueEmpty:
                break  # Queue was drained by another task

        return lines

    async def stop(self) -> None:
        """Stop the background reader."""
        self._stop_event.set()
        if self._task:
            self._task.cancel()
            try:
                # Give the task a short time to clean up, then move on
                await asyncio.wait_for(asyncio.shield(self._task), timeout=2.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
        self._status = "stopped"


# Default singleton instance for the agent tools.
uart_reader = UartReader()

