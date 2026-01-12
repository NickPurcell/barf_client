# BARF Host

Desktop application for debugging Raspberry Pi devices via UART using AI-powered conversational interface.

## Prerequisites

- Node.js 18+
- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- A Raspberry Pi running the BARF MCP server
- An OpenAI API key

## Quick Start

### Windows

1. Install prerequisites:
   - Node.js 18+ from https://nodejs.org/
   - Python 3.12+ from https://python.org/
   - uv:
     ```powershell
     powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
     ```

2. Setup and run:
   ```powershell
   cd path\to\barf\host
   uv sync
   cd frontend
   npm install
   npm run dev
   ```

### macOS

1. Install prerequisites:
   ```bash
   brew install node@18 python@3.12
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

2. Setup and run:
   ```bash
   cd path/to/barf/host
   uv sync
   cd frontend
   npm install
   npm run dev
   ```

### Linux (Ubuntu/Debian)

1. Install prerequisites:
   ```bash
   # Node.js 18+
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Python 3.12+
   sudo apt-get install python3.12 python3.12-venv

   # uv
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

2. Setup and run (same as macOS)

## First Launch

When you start the app, a settings dialog will appear prompting you for:

1. **Raspberry Pi IP Address** - The IP address of your Pi running the BARF MCP server
2. **OpenAI API Key** - Your OpenAI API key (starts with `sk-...`)
3. **OpenAI Model** - The model to use (default: `o4-mini`)

These settings are saved locally and remembered for future sessions. The app will verify the Pi connection before proceeding.

**Note:** The agent runs in "YOLO mode" - tools execute without confirmation.

## Troubleshooting

**"uv: command not found"**
- Restart your terminal after installing uv
- Windows: Add `%USERPROFILE%\.local\bin` to PATH
- macOS/Linux: Run `source ~/.bashrc` or ensure `~/.local/bin` is in PATH

**Python version mismatch**
- The `uv` tool automatically uses the version specified in `.python-version`
- Ensure `uv sync` completes without errors

**Virtual environment issues**
- Delete the `.venv` directory and run `uv sync` again

**Backend fails to start**
- Verify the Pi is reachable at the configured IP address
- Ensure the BARF MCP server is running on the Pi (port 8000)
- Check that your OpenAI API key is valid

**"No Pi found at that IP address"**
- Confirm the Pi's IP address is correct
- Ensure the MCP server is running on the Pi: `http://<pi-ip>:8000/mcp`
- Check network connectivity between your computer and the Pi

## Architecture

- **Backend**: Python FastAPI server with OpenAI Agents SDK
- **Frontend**: React + TypeScript Electron app
- **Communication**: WebSocket connections for chat and UART streaming

See `CLAUDE.md` for detailed architecture documentation.
