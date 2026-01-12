import sys
import pathlib

# Allow relative imports by adding src to path
pkg_root = pathlib.Path(__file__).resolve().parent
sys.path.append(str(pkg_root.parent))

import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import logging

from agents.memory import SQLiteSession

from host_backend.my_agents import build_all_agents
from dotenv import load_dotenv

load_dotenv()
from host_backend.my_servers import create_all_mcp_servers
from host_backend.openai_streamer import OpenAIStreamer
from host_backend.tool_messages import format_tool_message
from host_backend.uart_reader import uart_reader
from host_backend.i2c_reader import i2c_reader

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# CORS origins - restrict in production
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",") if os.getenv("CORS_ORIGINS") else ["*"]

# In-memory session storage (one session per WebSocket connection)
_sessions: dict[str, SQLiteSession] = {}

def get_session(session_id: str) -> SQLiteSession:
    """Get or create an in-memory SQLiteSession for conversation history."""
    if session_id not in _sessions:
        _sessions[session_id] = SQLiteSession(
            session_id=session_id,
            db_path=":memory:",
        )
    return _sessions[session_id]

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up Backend Server...")
    logging.getLogger("httpx").setLevel(logging.WARNING)

    async with create_all_mcp_servers() as mcp_servers:
        logger.info(f"MCP Servers created: {len(mcp_servers)}")
        agents = build_all_agents(mcp_servers)
        app.state.agents = agents
        logger.info("Agents built.")
        
        # Start UART reader
        await uart_reader.ensure_running()
        logger.info("UART Reader started.")

        # Start I2C reader
        await i2c_reader.ensure_running()
        logger.info("I2C Reader started.")

        yield

    logger.info("Shutting down...")
    await uart_reader.stop()
    await i2c_reader.stop()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

streamer = OpenAIStreamer(max_turns=100)

MAX_MESSAGE_SIZE = 32 * 1024  # 32KB limit

@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    agent = app.state.agents.get("barf")
    if not agent:
        await websocket.close(code=1011, reason="Agent not found")
        return

    # Create session for this connection (in-memory conversation history)
    session_id = str(uuid.uuid4())
    session = get_session(session_id)
    logger.info(f"Chat session started: {session_id}")

    try:
        while True:
            user_text = await websocket.receive_text()

            if len(user_text) > MAX_MESSAGE_SIZE:
                await websocket.send_json({"type": "error", "message": "Message too large"})
                continue

            streamed = streamer.start_stream(agent, user_text, session=session)

            async for label, content in streamer.iter_labeled_deltas(streamed):
                if label == "final":
                    await websocket.send_json({
                        "type": "content",
                        "delta": content
                    })
                elif label == "tool_call":
                    message = format_tool_message(content["name"], content["args"])
                    await websocket.send_json({
                        "type": "tool_call",
                        "tool_name": content["name"],
                        "message": message,
                        "tool_data": content,
                    })

            await websocket.send_json({"type": "end_turn"})

    except WebSocketDisconnect:
        logger.info(f"Chat Client disconnected: {session_id}")
        # Clean up session on disconnect
        if session_id in _sessions:
            del _sessions[session_id]
    except Exception as e:
        logger.error(f"Chat Error: {e}")

@app.websocket("/ws/uart")
async def websocket_uart(websocket: WebSocket):
    await websocket.accept()
    queue = uart_reader.add_listener()
    try:
        while True:
            try:
                # Use timeout so we can exit cleanly during shutdown
                line = await asyncio.wait_for(queue.get(), timeout=1.0)
                await websocket.send_text(line)
            except asyncio.TimeoutError:
                # Check if UART reader is still running
                if not uart_reader.is_running():
                    break
                continue
    except WebSocketDisconnect:
        logger.info("UART Client disconnected")
    except Exception as e:
        logger.error(f"UART Error: {e}")
    finally:
        uart_reader.remove_listener(queue)


@app.get("/debug/i2c")
async def debug_i2c():
    """Debug endpoint to check I2C reader status."""
    return i2c_reader.get_diagnostics()


@app.get("/debug/uart")
async def debug_uart():
    """Debug endpoint to check UART reader status."""
    return uart_reader.get_diagnostics()


@app.websocket("/ws/i2c")
async def websocket_i2c(websocket: WebSocket):
    await websocket.accept()
    logger.info("I2C WebSocket client connected")
    queue = i2c_reader.add_listener()
    try:
        while True:
            try:
                # Use timeout so we can exit cleanly during shutdown
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                logger.info(f"I2C WebSocket sending: {event[:100]}...")
                await websocket.send_text(event)
            except asyncio.TimeoutError:
                # Check if I2C reader is still running
                if not i2c_reader.is_running():
                    break
                continue
    except WebSocketDisconnect:
        logger.info("I2C Client disconnected")
    except Exception as e:
        logger.error(f"I2C Error: {e}")
    finally:
        i2c_reader.remove_listener(queue)


if __name__ == "__main__":
    import uvicorn
    import argparse

    parser = argparse.ArgumentParser(description="Run the Host Backend Server")
    parser.add_argument("--port", type=int, default=8000, help="Port to run the server on")
    args = parser.parse_args()

    logger.info(f"Starting server on port {args.port}")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=args.port,
        timeout_graceful_shutdown=3,  # Force exit after 3s if tasks don't complete
    )
