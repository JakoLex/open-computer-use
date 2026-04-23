# Coasty Command — Computer-Use Daemon

Headless CLI daemon that exposes 50+ computer-use commands (desktop control, browser automation, terminal, files) via [MCP](https://github.com/modelcontextprotocol/specification) (stdio) and WebSocket transports. Allows AI agents to control your local machine.

## Quick Start

### Install dependencies
```bash
cd daemon
npm install
npm run build
```

### Start MCP stdio mode
For Claude Desktop, Cursor, OpenWebUI, and other MCP-compatible agents:
```bash
COASTY_TOKEN=your-secret npm run stdio
```

### Start WebSocket mode
```bash
COASTY_TOKEN=your-secret node dist/index.js ws 8765
```

### Check status (HTTP endpoint)
```bash
curl http://localhost:8766/
```

### List available commands
```bash
node dist/index.js info
```

### Run system check
```bash
node dist/index.js test
```

## Configuration

Copy `.env.example` to `.env` and adjust as needed:
```bash
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `COASTY_TOKEN` | Auth token for client connections | `changeme` |
| `WS_PORT` | WebSocket server port | `8765` |
| `STATUS_PORT` | HTTP status server port | `8766` |
| `BROWSER_PATH` | Override auto-detected browser path | (auto-detect) |
| `SCREENSHOT_QUALITY` | JPEG quality 0-100 | `70` |
| `SCREENSHOT_MAX_WIDTH` | Max screenshot width | `1920` |
| `SCREENSHOT_MAX_HEIGHT` | Max screenshot height | `1080` |
| `COMMAND_TIMEOUT` | Command timeout in ms | `60000` |

## Commands

| Group | Count | Commands |
|---|---|---|
| Desktop | 6 | screenshot, click, click_with_modifiers, double_click, type, key_press, key_combo, scroll, drag |
| Terminal | 7 | terminal_connect, terminal_execute, terminal_read, terminal_type, terminal_clear, terminal_close, execute_command |
| File | 11 | file_read, file_write, file_edit, file_append, file_delete, file_exists, file_upload, file_download, file_list_downloads, directory_list, directory_delete |
| Browser | 20 | browser_open, browser_connect, browser_navigate, browser_click, browser_type, browser_get_dom, browser_dom, browser_get_clickables, browser_state, browser_info, browser_get_context, browser_scroll, browser_close, browser_screenshot, browser_wait, browser_list_tabs, browser_open_tab, browser_close_tab, browser_switch_tab, browser_execute |
| Window | 8 | list_windows, switch_to_window, arrange_windows, move_window, close_window, minimize_window, maximize_window, restore_window |
| System | 2 | detect_elements, ocr |

## Transports

### MCP (Model Context Protocol) — stdio
Standard transport for Claude Desktop, Cursor, and other MCP-compatible tools.

**Claude Desktop config** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "coasty-command": {
      "command": "node",
      "args": ["/path/to/daemon/dist/index.js", "stdio"],
      "env": {
        "COASTY_TOKEN": "your-secret"
      }
    }
  }
}
```

### WebSocket
Network-based transport for custom clients:

```
Client → Server:
  { type: 'auth', token: 'your-secret' }     // First message
  { type: 'command', command: 'click', parameters: { x: 100, y: 200 } }
  { type: 'ping' }                             // Heartbeat
Server → Client:
  { type: 'result', success: true, data: { ... } }
  { type: 'pong', connected_clients: 1, uptime: 123 }
```

## Security

Defense-in-depth validation prevents catastrophic operations:
- Credential files blocked (SSH, AWS, Docker, browser passwords, etc.)
- System directories protected (Windows System, /boot, /sbin, /dev, /proc, etc.)
- Dangerous commands blocked (rm -rf /, fork bombs, raw disk writes, registry deletion)
- Parameter type coercion prevents injection attacks
- Environment sanitization strips secrets before child process execution
- All tokens validated with timing-safe comparison

## Development

```bash
# Build from TypeScript
npm run build

# Run in dev mode with hot reload
npm run dev

# Run tests
npm test

# Watch mode for tests
npm run test:watch
```

## Platform Notes

- **Linux**: Requires `xdotool`, `wmctrl`, and a screenshot tool (`scrot`, `gnome-screenshot`, or `import`)
- **macOS**: Requires Screen Recording and Accessibility permissions in System Settings
- **Windows**: Requires PowerShell; browser discovery checks standard install locations
