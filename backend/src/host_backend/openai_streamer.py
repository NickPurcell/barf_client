from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

from agents import Runner
from agents.items import MessageOutputItem, ToolCallItem
from agents.memory import Session
from agents.stream_events import RawResponsesStreamEvent, RunItemStreamEvent, StreamEvent
from openai.types.responses import (
    ResponseReasoningTextDeltaEvent,
    ResponseReasoningSummaryTextDeltaEvent,
    ResponseTextDeltaEvent,
)

logger = logging.getLogger(__name__)

class OpenAIStreamer:
    """Helper to run an agent and stream tokens to stdout."""

    def __init__(self, *, max_turns: int = 20) -> None:
        self.max_turns = max_turns

    def start_stream(self, agent: Any, user_query: str, session: Session | None = None, **kwargs: Any) -> Any:
        """Kick off a single streamed run and return it."""
        return Runner.run_streamed(
            agent,
            user_query,
            max_turns=self.max_turns,
            session=session,
            **kwargs,
        )

    async def iter_events(self, streamed: Any) -> AsyncIterator[StreamEvent]:
        """Yield raw stream events for an existing streamed result."""
        async for event in streamed.stream_events():
            yield event

    async def iter_labeled_deltas(
        self, streamed: Any
    ) -> AsyncIterator[tuple[str, str]]:
        """
        Yield labeled deltas to make it easy for callers to render reasoning vs final output.

        Labels:
          - ("reasoning_start", "~~~REASONING STEP~~~") once before first reasoning delta
          - ("reasoning", <delta>) for each reasoning delta
          - ("final_start", "~~~FINAL OUTPUT~~~") once before first output_text delta
          - ("final", <delta>) for each output_text delta
          - ("final_message", <full_text>) once when the SDK emits the completed message_output_item
        """
        saw_reasoning = False
        saw_final = False
        last_message_output_text: str | None = None

        async for event in self.iter_events(streamed):
            if isinstance(event, RawResponsesStreamEvent):
                data = event.data
                # Handle both raw reasoning tokens and reasoning summary tokens
                if isinstance(data, (ResponseReasoningTextDeltaEvent, ResponseReasoningSummaryTextDeltaEvent)) and data.delta:
                    if not saw_reasoning:
                        saw_reasoning = True
                        yield ("reasoning_start", "~~~REASONING STEP~~~")
                    yield ("reasoning", data.delta)
                elif isinstance(data, ResponseTextDeltaEvent) and data.delta:
                    if not saw_final:
                        saw_final = True
                        yield ("final_start", "~~~FINAL OUTPUT~~~")
                    yield ("final", data.delta)
            elif isinstance(event, RunItemStreamEvent):
                item = event.item
                if isinstance(item, MessageOutputItem):
                    # Track the latest completed assistant message; emit once after the stream ends.
                    text = ""
                    raw_item = getattr(item, "raw_item", None)
                    if raw_item and getattr(raw_item, "content", None):
                        # Collect any output_text parts; ignore refusals/other content types.
                        for content_part in raw_item.content:
                            if getattr(content_part, "type", None) == "output_text":
                                text += getattr(content_part, "text", "") or ""
                    if text:
                        last_message_output_text = text
                elif isinstance(item, ToolCallItem):
                    raw = item.raw_item
                    # Handle different tool types - hosted tools use 'type', function tools use 'name'
                    tool_name = getattr(raw, "name", None) or getattr(raw, "type", "unknown_tool")
                    # Arguments: function tools use 'arguments', web search uses 'action.query'
                    arguments = getattr(raw, "arguments", "") or ""
                    if not arguments and hasattr(raw, "action"):
                        action = raw.action
                        if hasattr(action, "query"):
                            arguments = json.dumps({"query": action.query})
                    yield ("tool_call", {"name": tool_name, "args": arguments})

        # Emit the final message once, after the stream completes. Falls back to final_output if
        # nothing was collected (e.g., text not streamed).
        if last_message_output_text is None:
            final_output = getattr(streamed, "final_output", None)
            if isinstance(final_output, str):
                last_message_output_text = final_output
        if last_message_output_text:
            yield ("final_message", last_message_output_text)

    async def stream_to_stdout(
        self, agent: Any, user_query: str, *, prefix: str = "BarfAgent: ", **kwargs: Any
    ) -> str:
        """Stream model tokens to stdout and return the concatenated text."""
        try:
            streamed = self.start_stream(agent, user_query, **kwargs)
        except Exception as exc:
            logger.debug(f"{prefix}failed to start stream ({exc})")
            return ""

        collected: list[str] = []

        try:
            async for event in self.iter_events(streamed):
                if not isinstance(event, RawResponsesStreamEvent):
                    continue

                data = event.data
                if isinstance(data, ResponseTextDeltaEvent) and data.delta:
                    collected.append(str(data.delta))
        except Exception as exc:
            logger.debug(f"Stream error: {exc}")
        finally:
            final_output = getattr(streamed, "final_output", None)
            if not collected and final_output:
                collected.append(str(final_output))

        return "".join(collected)

