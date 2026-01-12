from agents import function_tool

from .uart_reader import uart_reader


@function_tool
async def read_uart() -> str:
    """
    Dump and clear the buffered UART output from the SSE stream.
    Starts the reader on first use if it is not already running.
    """
    await uart_reader.ensure_running()
    # Wait briefly to allow any in-flight SSE messages to arrive.
    lines = await uart_reader.drain(wait_seconds=1.5)
    if not lines:
        return "(uart buffer empty)"
    return "\n".join(lines)


@function_tool
async def uart_diagnostics() -> str:
    """
    Get diagnostic information about the background UART reader connection.
    Useful for debugging why RX might not be printing.
    """
    import json
    return json.dumps(uart_reader.get_diagnostics(), indent=2)


ALL_LOCAL_TOOLS = [
    read_uart,
    uart_diagnostics,
]
