from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator, List

from agents.mcp import MCPServerStreamableHttp


@asynccontextmanager
async def create_barf_mcp_server() -> AsyncIterator[MCPServerStreamableHttp]:
    """Create and yield the BARF MCP server connection."""
    url = os.environ.get("BARF_MCP_URL", "http://10.0.0.104:8000/mcp")
    token = os.environ.get("BARF_MCP_TOKEN", "")

    async with MCPServerStreamableHttp(
        name="barf_mcp_server",
        params={
            "url": url,
            "headers": {"Authorization": f"Bearer {token}"} if token else {},
            "timeout": 10,
        },
        cache_tools_list=True,
        max_retry_attempts=3,
    ) as server:
        yield server


@asynccontextmanager
async def create_all_mcp_servers() -> AsyncIterator[List[MCPServerStreamableHttp]]:
    """Create all MCP server connections."""
    async with create_barf_mcp_server() as barf_server:
        yield [barf_server]
