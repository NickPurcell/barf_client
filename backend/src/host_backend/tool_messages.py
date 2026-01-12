"""Tool message formatters for UI display."""
from __future__ import annotations

import json
from typing import Callable

ToolMessageFormatter = Callable[[dict], str]

TOOL_MESSAGES: dict[str, ToolMessageFormatter] = {
    "web_search_call": lambda args: f"Searching the web for \"{args.get('query', '...')}\"",
    "uart_write": lambda args: f"Writing to UART: {args.get('command', '...')}",
    "i2c_write": lambda args: f"I2C Write: device 0x{args.get('device', 0):02X} reg 0x{args.get('register', 0):02X}",
    "i2c_read": lambda args: f"I2C Read: device 0x{args.get('device', 0):02X} reg 0x{args.get('register', 0):02X}",
}


def format_tool_message(tool_name: str, arguments: str) -> str:
    """Format a human-readable message for a tool call."""
    formatter = TOOL_MESSAGES.get(tool_name)
    if not formatter:
        return f"Running {tool_name}..."
    try:
        args = json.loads(arguments) if arguments else {}
        return formatter(args)
    except json.JSONDecodeError:
        return f"Running {tool_name}..."
