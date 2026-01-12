# I2C Tab Implementation Plan

## Overview
Add an I2C monitoring tab alongside the existing UART tab, styled in bright blue instead of green, with formatted display of I2C bus activity.

## I2C Payload Format
```json
{"action":"write","device":32,"register":1,"success":true}
{"action":"write","device":32,"register":1,"success":false}
{"action":"read","device":32,"register":1,"success":true,"data":[12,34,56]}
{"action":"read","device":32,"register":1,"success":false,"data":[]}
```

---

## Step 1: Backend - Create I2C Reader

**File: `/home/nickyp/barf/host/backend/src/host_backend/i2c_reader.py`** (new file)

Create a new file modeled on `uart_reader.py` with the following changes:
- Connect to SSE endpoint at `http://10.0.0.104:8000/i2c`
- Parse incoming JSON payloads instead of raw lines
- Store as structured `I2CEvent` dataclass:
  ```python
  @dataclass
  class I2CEvent:
      action: str          # "read" or "write"
      device: int          # device address (e.g., 32)
      register: int        # register number
      success: bool        # operation success
      data: list[int]      # empty for writes, populated for successful reads
      timestamp: float     # time.time() when received
  ```
- Expose similar methods: `ensure_running()`, `add_listener()`, `drain()`, `stop()`
- Distribute JSON strings (not parsed objects) to UI queues for frontend parsing

---

## Step 2: Backend - Add WebSocket Endpoint

**File: `/home/nickyp/barf/host/backend/src/host_backend/server.py`**

Add new WebSocket endpoint `/ws/i2c`:
```python
@app.websocket("/ws/i2c")
async def websocket_i2c(websocket: WebSocket):
    # Same pattern as /ws/uart but using i2c_reader
```

Import and initialize `i2c_reader` similar to `uart_reader`:
- Create global `i2c_reader` instance
- Call `ensure_running()` on startup
- Call `stop()` on shutdown

---

## Step 3: Backend - Update Tool Messages

**File: `/home/nickyp/barf/host/backend/src/host_backend/tool_messages.py`**

Add formatters for I2C tools:
```python
TOOL_MESSAGES: dict[str, ToolMessageFormatter] = {
    # ... existing entries ...
    "i2c_write": lambda args: f"I2C Write: device 0x{args.get('device', 0):02X} reg {args.get('register', 0)}",
    "i2c_read": lambda args: f"I2C Read: device 0x{args.get('device', 0):02X} reg {args.get('register', 0)}",
}
```

---

## Step 4: Frontend - Add Blue Color Theme

**File: `/home/nickyp/barf/host/frontend/tailwind.config.js`**

Add retro-blue color palette alongside retro-green:
```javascript
colors: {
    // ... existing colors ...
    'retro-blue': {
        light: '#33ccff',    // Bright cyan-blue for terminal text
        dark: '#001122',     // Dark blue background
        dim: '#0088cc',      // Dimmed blue
    }
}
```

---

## Step 5: Frontend - Add Blue Terminal Styles

**File: `/home/nickyp/barf/host/frontend/src/index.css`**

Add `.terminal-text-blue` class with blue glow:
```css
.terminal-text-blue {
    font-family: 'Fira Code', monospace;
    color: #33ccff;
    text-shadow: 0 0 5px rgba(51, 204, 255, 0.4),
                 0 0 10px rgba(51, 204, 255, 0.2);
}
```

Add blue scrollbar variant and scanline-blue class.

---

## Step 6: Frontend - Create I2C Terminal Component

**File: `/home/nickyp/barf/host/frontend/src/components/I2CTerminal.tsx`** (new file)

Create component modeled on `UARTTerminal.tsx` with:

### Key Differences:
1. **WebSocket**: Connect to `/ws/i2c` instead of `/ws/uart`
2. **Color Scheme**: Blue (#33ccff) instead of green (#33ff33)
3. **Data Parsing**: Parse JSON payloads, not raw lines
4. **Stylized Display**: Format each I2C event as:
   ```
   [W] 0x20:01 ✓           (write success)
   [W] 0x20:01 ✗           (write failure)
   [R] 0x20:01 → [0C,22,38] ✓   (read success with hex data)
   [R] 0x20:01 ✗           (read failure)
   ```

### Interface for parsed events:
```typescript
interface I2CEvent {
    action: 'read' | 'write';
    device: number;
    register: number;
    success: boolean;
    data: number[];
}
```

### Visual styling:
- `[W]` prefix for writes, `[R]` prefix for reads
- Device address in hex (0x20)
- Register number
- Data array as hex bytes for successful reads
- ✓ (green) for success, ✗ (red) for failure
- Blue base color for text

---

## Step 7: Frontend - Create Tabbed Terminal Container

**File: `/home/nickyp/barf/host/frontend/src/components/TerminalTabs.tsx`** (new file)

Create a wrapper component that:
1. Renders tab buttons: `UART` | `I2C` (like Chrome tabs)
2. Shows active tab indicator (underline or highlight)
3. Conditionally renders `<UARTTerminal />` or `<I2CTerminal />` based on selection
4. Tab styling:
   - UART tab: Green accent when active
   - I2C tab: Blue accent when active
   - Both tabs visible at all times
   - Active tab has colored underline/highlight

### Tab button styling:
```tsx
<div className="flex border-b border-border">
    <button
        className={`px-4 py-2 ${activeTab === 'uart' ? 'border-b-2 border-retro-green-light text-retro-green-light' : 'text-text'}`}
        onClick={() => setActiveTab('uart')}
    >
        UART
    </button>
    <button
        className={`px-4 py-2 ${activeTab === 'i2c' ? 'border-b-2 border-retro-blue-light text-retro-blue-light' : 'text-text'}`}
        onClick={() => setActiveTab('i2c')}
    >
        I2C
    </button>
</div>
```

---

## Step 8: Frontend - Update App Layout

**File: `/home/nickyp/barf/host/frontend/src/App.tsx`**

Replace `<UARTTerminal />` with `<TerminalTabs />`:
```tsx
// Change from:
<UARTTerminal />

// To:
<TerminalTabs />
```

Import the new TerminalTabs component.

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `backend/src/host_backend/i2c_reader.py` | **CREATE** | I2C SSE reader (modeled on uart_reader.py) |
| `backend/src/host_backend/server.py` | MODIFY | Add `/ws/i2c` WebSocket endpoint |
| `backend/src/host_backend/tool_messages.py` | MODIFY | Add i2c_write, i2c_read formatters |
| `frontend/tailwind.config.js` | MODIFY | Add retro-blue color palette |
| `frontend/src/index.css` | MODIFY | Add blue terminal text styles |
| `frontend/src/components/I2CTerminal.tsx` | **CREATE** | I2C terminal component (blue theme) |
| `frontend/src/components/TerminalTabs.tsx` | **CREATE** | Tab container for UART/I2C switching |
| `frontend/src/App.tsx` | MODIFY | Replace UARTTerminal with TerminalTabs |

---

## Implementation Order

1. Backend changes first (I2C reader, WebSocket, tool messages)
2. Frontend styling (Tailwind config, CSS)
3. I2C Terminal component
4. Tab container component
5. App.tsx integration
6. Test end-to-end

---

## Visual Design Reference

```
┌─────────────────────────────────────────────────────────┐
│  UART    I2C                                            │
│  ────    ═════  (blue underline on active tab)          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [R] 0x20:01 → [0C,22,38] ✓                            │
│  [W] 0x20:01 ✓                                         │
│  [R] 0x20:02 ✗                                         │
│  [W] 0x1F:00 ✓                                         │
│  █ (blinking cursor)                                   │
│                                                         │
│  ─────────────── (scanlines effect) ────────────────   │
└─────────────────────────────────────────────────────────┘
```

All I2C text in bright blue (#33ccff) with blue glow effect.
