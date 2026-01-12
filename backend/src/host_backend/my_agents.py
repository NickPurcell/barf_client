from __future__ import annotations

import os
from typing import Sequence

from agents import Agent, WebSearchTool
from agents.model_settings import ModelSettings
from agents.mcp import MCPServerStreamableHttp
from openai.types.shared import Reasoning

from .my_tools import ALL_LOCAL_TOOLS


def build_barf_agent(
    mcp_servers: Sequence[MCPServerStreamableHttp],
) -> Agent:
    """
    Build the main lab agent that can use BOTH:
      - Local Python tools (ALL_LOCAL_TOOLS)
      - MCP tools from the given MCP servers (provides uart_write, etc.)
    """
    model_name = os.getenv("OPENAI_MODEL", "o4-mini")

    return Agent(
        name="BarfAgent",
        model=model_name,
        instructions=(
            "You are an assistant that helps users debug Raspberry Pi's. "
            "You can write to and read from the UART of the Raspberry Pi. "
            "Never run more than a single UART command at a time. Make sure each command was successful before running the next one. "
            "NEVER run UART commands in parallel. Always wait for the previous command to complete before running the next one. This is very important."
            "When using UART to complete a task, always try to be minimal and efficient.  You can check the current state, but don't check every single state after each command."
            "When the user asks you to do something, assume you will use UART unless otherwise specified. "
            "When using the web search tool, always try to find latest information, and assume the user is askig for info related to raspbery pis."
            "If the user doesn't specify the device the Pi is interfacing with, ask them to specify it. "
            "If the user asks you to interface with a device you are not familiar with, or asks you to do something you are not familiar with, ask them to clarify."
            "In your responses to the user, refer to devices as Master or Slave, instead use Primary and Secondary respectively."
        ),
        tools=[WebSearchTool()],
        mcp_servers=list(mcp_servers),
        model_settings=ModelSettings(
            tool_choice="auto",
            reasoning=Reasoning(
                effort="low",
            ),
        ),
    )


def build_all_agents(
    mcp_servers: Sequence[MCPServerStreamableHttp],
) -> dict[str, Agent]:
    """Build and return all agents used by the application."""
    return {
        "barf": build_barf_agent(mcp_servers),
    }
