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

Coasty Command is a **headless computer-use daemon** that exposes **57 commands** via **MCP (Model Context Protocol)** and **WebSocket**, allowing any AI agent to control your machine directly.

Unlike chatbots that only *talk* about tasks — agents using Coasty Command **actually perform them**: browsing the web, running commands, clicking through UIs, and managing files.

> Computer use capabilities similar to Anthropic's Claude Computer Use, but fully open-source, extensible, and agent-first.

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
```

**WebSocket server mode** (custom integrations):

```bash
npm run ws
# or
npm run ws -- --port 9999
```

**System check**:

```bash
npm run test    # Run system diagnostics
npm start info  # List all commands
```

**Test a specific command**:

```bash
npm start test_cmd screenshot
```

<br />

---

<br />

## Commands

Coasty Command exposes **57 commands** across 6 categories:

### Browser Automation (18 commands)

`browser_navigate` · `browser_go_back` · `browser_go_forward` · `browser_click` · `browser_type` · `browser_hover` · `browser_press_key` · `browser_wait` · `browser_find_element` · `browser_get_text` · `browser_scroll` · `browser_drag` · `browser_select_option` · `browser_upload_file` · `browser_evaluate` · `browser_list_bookmarks` · `browser_get_bookmark` · `browser_take_screenshot`

### Terminal & File Ops (14 commands)

`terminal_list_sessions` · `terminal_start_session` · `terminal_send` · `terminal_close` · `execute_command` · `file_read` · `file_write` · `file_edit` · `file_create` · `file_delete` · `file_copy` · `file_move` · `directory_list` · `directory_create` · `directory_delete`

### Desktop Control (15 commands)

`screenshot` · `click` · `double_click` · `type` · `key_<key>` · `scroll` · `drag` · `get_displays` · `set_active_display` · `detect_elements` · `ocr`

### Window Management (Windows, 9 commands)

`list_windows` · `switch_to_window` · `close_window` · `minimize` · `maximize` · `restore` · `arrange_windows` · `move_window`

### System Utilities

`check_permissions`, `restart_daemon`, `show_info`

### Windows-Specific Window Management

`list_windows`, `switch_to_window`, `close_window`, `minimize_window`, `maximize_window`, `restore_window`, `arrange_windows`, `move_window`

<br />

---

<br />

## Modes

| Mode | Command | Use Case |
|---|---|---|
| **MCP stdio** | `coasty-command` | Claude Desktop, Cursor, Cline |
| **WebSocket** | `coasty-command ws [port]` | Custom HTTP/WSS integrations |
| **Info** | `coasty-command info` | List all 57 commands |
| **System check** | `coasty-command test` | Diagnose platform setup |
| **Test command** | `coasty-command test_cmd <cmd>` | Run single command and see result |

<br />

---

<br />

## Authentication

Static token via `COASTY_TOKEN` env var. The daemon uses timing-safe string comparison to prevent timing attacks.

```bash
COASTY_TOKEN=secret npm start
```

The default value is `changeme` and will print a startup warning. Never use this in production.

<br />

---

<br />

## MCP Integration

Coasty Command speaks the **Model Context Protocol** — the open standard for AI tool integration. Connect it to:

- **Claude Desktop** — add to `claude_desktop_config.json`
- **Cursor** — MCP settings panel
- **Cline** — MCP extension
- **OpenWebUI** — Tools configuration
- **Any MCP-compatible client**

```json
{
  "mcpServers": {
    "coasty-command": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "COASTY_TOKEN": "your-secret-token"
      }
    }
  }
}
```

<br />

---

<br />

## WebSocket Integration

Connect via WebSocket for real-time streaming:

```typescript
import { WebSocket } from 'ws'

const ws = new WebSocket('ws://localhost:8765')
ws.on('open', () => {
  // Send a browser command
  ws.send(JSON.stringify({
    id: 1,
    method: 'browser_navigate',
    params: { url: 'https://example.com' }
  }))
})

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString())
  console.log('Result:', msg)
})
```

HTTP status endpoint: `GET http://localhost:8766/status`

Token: `COASTY_TOKEN` header or `Authorization: Bearer <token>`

<br />

---

<br />

## Architecture

```
                    AI Agent (Claude Desktop, Cursor, Cline, ...)
                           │
               ┌───────────┴───────────┐
               │  MCP stdio  │  WebSocket (TCP)  │
               └───────────┬───────────┘
                           │
                    Coasty Command Daemon
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
┌──────┴──────┐  ┌────────┴────────┐  ┌───────┴───────┐
│  Handlers   │  │    Shared       │  │  Transport    │
│             │  │   Modules       │  │               │
│ desktop.ts  │  │ permissions.ts  │  │ mcp-server.ts │
│ browser.ts  │  │ safety.ts       │  │ ws-server.ts  │
│ terminal.ts │  │ display-man     │  │ auth.ts       │
│ file-ops.ts │  │ params.ts       │  │               │
│ screenshot. │  │ cli-indicator   │  │               │
└──────┬──────┘  └────────┬────────┘  └───────────────┘
       │                   │
       └───────────────────┘
                           │
┌──────────────────────────┴──────────────────────────┐
│  Platform-Specific Backends                         │
│                                                     │
│  Browser:     Puppeteer-core (Chrome/Edge/Brave)    │
│  Terminal:    PowerShell (Win) / bash (mac/Linux)   │
│  Desktop:     xdotool (Linux) / Swift (macOS)       │
│                PowerShell + user32.dll (Windows)     │
│  Screenshot:  scrot / screencapture / PowerShell    │
└─────────────────────────────────────────────────────┘
```

<br />

---

<br />

## Full Project Structure

```
open-computer-use/
├── daemon/                     # ⭐ Computer-use daemon (20 source files)
│   ├── src/
│   │   ├── index.ts            # CLI entry, 5 subcommands
│   │   └── executor/
│   │       ├── local-executor.ts   # Command registry (57 commands)
│   │       ├── auth.ts             # Token auth (timing-safe)
│   │       ├── transport/
│   │       │   ├── mcp-server.ts   # MCP stdio server
│   │       │   └── ws-server.ts    # WebSocket server
│   │       ├── handlers/
│   │       │   ├── browser.ts      # Puppeteer browser automation (18 cmds)
│   │       │   ├── desktop.ts      # Mouse, keyboard, scroll, drag (12 cmds)
│   │       │   ├── terminal.ts     # Shell sessions & commands (5 cmds)
│   │       │   ├── file-ops.ts     # File/dir CRUD (12 cmds)
│   │       │   ├── screenshot.ts   # Cross-platform screenshots (3 cmds)
│   │       │   └── index.ts        # Barrel exports
│   │       └── shared/
│   │           ├── display-manager.ts  # Multi-display detection
│   │           ├── safety.ts           # Path cmd/env validation
│   │           ├── params.ts           # Param normalization
│   │           ├── permissions.ts      # macOS access checks
│   │           ├── cli-indicator.ts    # Terminal spinners
│   │           └── index.ts            # Barrel exports
│   ├── tests/
│   │   ├── safety.test.ts      # Path, cmd, env security (38 tests)
│   │   └── auth.test.ts        # Token auth verification (18 tests)
│   ├── package.json            # Dependencies: MCP SDK, ws, puppeteer-core
│   ├── tsconfig.json           # CommonJS build config
│   └── README.md               # Extended daemon docs
│
├── app/                        # Next.js frontend (stripped to status UI)
│   ├── page.tsx                # Redirects to /
│   ├── home-client.tsx         # Status dashboard (polls daemon)
│   ├── status/page.tsx         # Health status endpoint
│   ├── api-docs/page.tsx       # MCP + WebSocket API docs
│   ├── api/health/route.ts     # HTTP health check
│   ├── layout.tsx              # Root layout (dark theme only)
│   ├── layout-client.tsx       # ThemeProvider client wrapper
│   ├── error.tsx, not-found.tsx, sitemap.ts, robots.ts
│   └── ...                       # Error boundary, 404, SEO
│

│   ├── src/main/               # Main process (tray, auth, ws-bridge)
│   ├── src/renderer/           # React UI (auth, overlay, chat)
│   └── ...
│
├── lib/                        # Shared libraries (stripped down)
│   ├── config.ts               # Env constants (stub)
│   ├── utils.ts                # cn() class merge utility
│   ├── status/                 # Health checker for frontend UI
│   ├── constants/              # Basic constants
│   └── models/                 # Model type definitions
│
├── infra/                      # AWS/Cloud infrastructure
├── docker/                     # Docker configurations
├── scripts/                    # CI/deploy scripts
├── next.config.ts              # Next.js config (i18n removed)
├── middleware.ts               # Security headers (CSP, HSTS)
├── tsconfig.json               # TypeScript config
└── package.json, lockfile
```

<br />

---

<br />

## Platform Support

| Feature | Linux | macOS | Windows |
|---|---|---|---|
| **Browser** | ✅ Chromium/Chrome | ✅ Chrome/Edge/Brave | ✅ Chrome/Edge/Brave |
| **Terminal** | ✅ bash/sh | ✅ /bin/bash | ✅ PowerShell |
| **Desktop** | ✅ xdotool | ✅ CoreGraphics/Swift | ✅ user32.dll |
| **Screenshot** | ✅ scrot/gnome | ✅ screencapture | ✅ PowerShell |
| **Window mgmt** | ✅ wmctrl | ⚠ Limited | ✅ Full support |

### Screenshot Tool Discovery

| Platform | Tools checked |
|---|---|
| **Windows** | PowerShell + `PrintWindow`, `Bitmap`, `BitBlt` |
| **macOS** | `screencapture` (builtin) |
| **Linux** | `scrot` → `gnome-screenshot` → `import` (ImageMagick) |

<br />

---

<br />

## Build & Test

```bash
# Build frontend
npm run build            # → 11 pages generated

# Build daemon
cd daemon && npm run build    # → dist/ output

# Run tests
cd daemon && npm test        # → 56 passing tests
```

<br />

---

<br />

## Dependencies

| Package | Purpose |
|---|---|
| `@modelcontextprotocol/sdk` | MCP stdio server |
| `ws` | WebSocket server |
| `puppeteer-core` | Browser automation (headless Chrome) |
| `sharp` | Screenshot compression (JPEG, 70%) |
| `yargs` | CLI argument parsing |
| `chalk` | Terminal colors |
| `ora` | Terminal spinners/status indicators |
| `execa` | Child process execution (shell) |
| `@types/*` | TypeScript type definitions |

<br />

---

<br />

## Stripped Features (Previously Removed)

The following cloud/enterprise features were removed in v2 as part of the daemon-only rewrite:

- **Supabase auth** (database, sessions, login)
- **Chat system** (messages, conversations, streaming)
- **Billing/Stripe** (credits, subscriptions, webhooks)
- **Cloud VMs** (Azure/AWS instances, VNC, SSH)
- **Multi-chat** (concurrent AI conversations)
- **i18n** (33 locale files, next-intl)
- **PostHog analytics**
- **Settings pages** (appearance, billing, connections)
- **Machine manager** (cards, VNC viewer, file transfer)
- **Blog, pricing, terms, privacy pages**

Total: **574 files deleted** (205K lines) → **23 files remaining** (daemon + status UI)

<br />

---

<br />

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: add your feature"`
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

[Star on GitHub](https://github.com/JakoLex/open-computer-use) · [Report Bug](https://github.com/JakoLex/open-computer-use/issues)

</div>
