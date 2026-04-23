# Coasty Command — Computer-Use Daemon

**Open-source daemon that gives AI agents full computer control.**

Browser automation · Terminal execution · Desktop control · File operations · Screenshot capture

<br />

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-Server-blue)](https://modelcontextprotocol.io)
[![WebSocket](https://img.shields.io/badge/Transport-WebSocket-brightgreen)]()

<br />

---

<br />

## What is this?

Coasty Command is a **headless computer-use daemon** that exposes 50+ commands via **MCP (Model Context Protocol)** and **WebSocket**, allowing any AI agent to control your machine directly.

Unlike chatbots that only *talk* about tasks — agents using Coasty Command **actually perform them**: browsing the web, running commands, clicking through UIs, and managing files.

> Computer use capabilities similar to Anthropic's Claude Computer Use, but fully open-source, extensible, and agent-first.

<br />

---

<br />

## Commands

**Browser** — Navigation, form filling, element interaction, multi-tab management, screenshot capture.

**Terminal** — Command execution, file operations, script running, package management, output streaming.

**Desktop** — Mouse & keyboard control, window management, screenshot analysis, UI element detection.

**Files** — Read, write, edit, search files and directories.

<br />

---

<br />

## Architecture

```
AI Agent ←──── MCP stdio / WebSocket ────→ Coasty Command Daemon
  │                                            │
  │ (Claude Desktop, Cursor, Cline,          │
  │  custom agents, OpenClaw, ...)           │
  │                                   ┌──────┴──────────────────┐
  │                                   │  Browser (Puppeteer)     │
  │                                   │  Terminal (shell)        │
  │                                   │  Desktop (xdotool /      │
  │                                   │    PowerShell / Swift)   │
  │                                   │  File operations         │
  │                                   │  Screenshot capture      │
  └───────────────────────────────────┴──────────────────────────┘
```

<br />

---

<br />

## Quick Start

### Prerequisites

- **Node.js** 20+
- **TypeScript** 5.7+
- **Browser**: Chrome, Edge, Brave, or Chromium installed
- **Linux**: `xdotool`, `wmctrl`, `xclip`
- **macOS**: Xcode CLI tools
- **Windows**: PowerShell (pre-installed)

### 1. Install

```bash
# Clone or install the package
cd daemon
npm install
```

### 2. Configure token

```bash
export COASTY_TOKEN="your-secret-token"
```

> Default token is `changeme` — always override for production.

### 3. Run

**MCP stdio mode** (for Claude Desktop, Cursor, Cline, etc.):

```bash
npm start
# or
npm run stdio
```

**WebSocket server mode** (custom integrations):

```bash
npm run ws
# or
npm run ws -- --port 9999
```

**System check**:

```bash
npm run test
```

**View available commands**:

```bash
npm start info
```

<br />

---

<br />

## MCP Integration

Coasty Command speaks the **Model Context Protocol** — the open standard for AI tool integration. Connect it to:

- **Claude Desktop** — add to `claude_desktop_config.json`
- **Cursor** — MCP settings
- **Cline** — MCP extension
- **Any MCP-compatible client**

```json
{
  "mcpServers": {
    "coasty-command": {
      "command": "node",
      "args": ["path/to/coasty-command/dist/index.js"],
      "env": {
        "COASTY_TOKEN": "your-token"
      }
    }
  }
}
```

<br />

---

## WebSocket Integration

Connect via WebSocket for real-time streaming:

```typescript
import { WebSocket } from 'ws'

const ws = new WebSocket('ws://localhost:9999', {
  headers: { Authorization: 'Bearer your-token' }
})

ws.on('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'commands/browser.navigate',
    params: { url: 'https://example.com' }
  }))
})

ws.on('message', (data) => {
  console.log(JSON.parse(data.toString()))
})
```

<br />

---

<br />

## Tech Stack

| Layer | Technologies |
| --- | --- |
| **Runtime** | Node.js 20+, TypeScript 5.7 |
| **Protocol** | MCP stdio, WebSocket (ws) |
| **Browser** | Puppeteer-core (Chrome/Edge/Brave) |
| **Desktop (Linux)** | xdotool, wmctrl, xclip |
| **Desktop (macOS)** | CoreGraphics (Swift), osascript |
| **Desktop (Windows)** | PowerShell, user32.dll |
| **Image Processing** | Sharp |

<br />

---

<br />

## Project Structure

```
daemon/
├── src/
│   ├── index.ts                    # Entry point, CLI parser
│   └── executor/
│       ├── transport/
│       │   ├── mcp-server.ts       # MCP protocol handler
│       │   └── ws-server.ts        # WebSocket server
│       ├── handlers/
│       │   ├── browser.ts          # Browser automation (575 lines)
│       │   ├── desktop.ts          # Mouse/keyboard/desktop (769 lines)
│       │   ├── terminal.ts         # Shell command execution
│       │   ├── file-ops.ts         # File read/write/search
│       │   └── screenshot.ts       # Screenshot capture
│       └── shared/
│           ├── permissions.ts      # Access control
│           ├── safety.ts           # Safety guardrails
│           └── display-manager.ts  # Multi-monitor support
├── tests/
│   ├── safety.test.ts
│   └── auth.test.ts
├── package.json
└── tsconfig.json
```

<br />

---

<br />

## Platform Support

| Platform | Browser | Terminal | Desktop | Files |
| --- | --- | --- | --- | --- |
| **Linux** | ✅ | ✅ | ✅ (xdotool) | ✅ |
| **macOS** | ✅ | ✅ | ✅ (Swift) | ✅ |
| **Windows** | ✅ | ✅ | ✅ (PowerShell) | ✅ |

<br />

---

<br />

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit your changes
4. Open a pull request

Bug reports and feature requests welcome in [Issues](https://github.com/JakoLex/open-computer-use/issues).

<br />

---

<br />

## License

[Apache License 2.0](LICENSE) — Copyright (c) 2025 Open Computer Use Contributors

<br />

---

<br />

<div align="center">

**[Star on GitHub](https://github.com/JakoLex/open-computer-use)**

</div>
