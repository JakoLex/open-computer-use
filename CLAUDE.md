# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Coasty** is an open-source AI computer-use daemon. It exposes 50+ commands via two transports:
- **MCP stdio**: Direct integration with Claude Desktop, Cursor, Cline, and any MCP-compatible client
- **WebSocket** (TCP, port 8765): Programmatic API for custom integrations

## Architecture

### Frontend (Next.js 15 + React 19)
- **Framework**: Next.js 15 with App Router, TypeScript, Tailwind CSS
- **State Management**: Zustand stores for chat, models, user, and sessions
- **Key Libraries**:
  - Vercel AI SDK (`ai`) for streaming LLM responses
  - Radix UI for accessible components
  - Supabase for authentication and database
  - Stripe for billing/subscriptions
- **Provider System**: Multi-provider AI support (OpenAI, Anthropic, Azure, Google, Mistral, xAI, OpenRouter, Perplexity)

### Backend (Python FastAPI)
- **Framework**: FastAPI with async/await patterns
- **Key Services**:
  - `multi_agent_executor.py`: Orchestrates multi-agent task execution with browser, terminal, and desktop agents
  - `vm_control.py`: WebSocket-based VM control with persistent connections and auto-reconnection
  - `database.py`: Supabase integration for user data, chats, and billing
  - `agent_billing.py`: Tracks usage and credits for agent sessions
  - `search.py`: Google Custom Search API integration
- **API Routes**: `/api/chat`, `/api/models`, `/api/search`, `/api/vm`, `/api/billing`, `/api/files`

### VM Agent System
- **Architecture**: Docker containers running Ubuntu 22.04 with XFCE desktop
- **Agent Types**:
  - **Browser Agent**: Web automation using Chrome with remote debugging (search-first strategy)
  - **Terminal Agent**: Command execution and file operations
  - **Desktop Agent**: UI automation with screenshot analysis
- **Communication**: WebSocket protocol on port 8080 (8081 for localhost)
- **Tools**: Each agent has specialized tools (browser navigation, terminal commands, desktop controls)

### Daemon (`daemon/`) — Core Component

Standalone Node.js CLI tool that exposes 57 computer-use commands via MCP stdio (for Claude Desktop, Cursor, Cline) and WebSocket (port 8765, for custom integrations).

#### Command Categories (57 total)

| Category | Count | Examples |
|---|---|---|
| **Browser Automation** | 18 | `browser_navigate`, `browser_click`, `browser_type`, `browser_evaluate`, `browser_take_screenshot` |
| **Desktop Control** | 12 | `click`, `double_click`, `type`, `key_press`, `key_combo`, `scroll`, `drag`, `screenshot`, `detect_elements`, `ocr` |
| **Terminal Execution** | 6 | `terminal_start_session`, `terminal_send`, `terminal_close`, `execute_command` |
| **File Operations** | 12+ | `file_read`, `file_write`, `file_edit`, `file_delete`, `directory_list`, `file_copy`, `file_move` |
| **Window Management** | 9 | `list_windows`, `switch_to_window`, `minimize`, `arrange_windows` |
| **System Utilities** | 5+ | `get_displays`, `set_active_display`, `check_permissions`, `restart_daemon`, `show_info` |

#### Platform-Specific Implementations

**Windows:**

- **Desktop Automation**: PowerShell + user32.dll P/Invoke (`mouse_event`, `keybd_event`, `SendKeys`)
  - Click/double-click via `System.Windows.Forms.Cursor` + `mouse_event` DLL calls
  - Typing via `SendKeys::SendWait()` with special character escaping
  - Key combos via `keybd_event` with virtual key codes (supports Win key, modifiers)
  - Scroll via `MOUSEEVENTF_WHEEL` (120 units per notch)
  - Drag via cursor position + mousedown/mouseup sequence
- **Browser**: `puppeteer-core` with Chrome/Edge/Brave detection
- **Terminal**: `powershell.exe -Command`
- **Window Management**: PowerShell + `user32.dll ShowWindow`

**macOS:**

- **Desktop Automation**: Swift scripts via CoreGraphics + `osascript`
- **Browser**: `puppeteer-core` with Chrome/Edge/Brave detection
- **Terminal**: `/bin/bash -c`
- **Permissions**: Checks Screen Recording + Accessibility programmatically

**Linux (Arch/CachyOS/Wayland):**

- **Desktop Automation**: `xdotool` for mouse/keyboard, `xdotool` for window management
- **Browser**: `puppeteer-core` with `--no-sandbox --disable-setuid-sandbox` (Linux), `--ozone-platform-hint=auto` (Wayland)
- **Terminal**: `/bin/bash`
- **Screenshot**: `grim` (Wayland), `scrot` (X11), `import` (ImageMagick), `gnome-screenshot`, `spectacle`
- **Display Detection**: `xrandr` (works on both X11 and Wayland via XWayland), `hyprctl` (Hyprland)
- **File Operations**: Native Node.js + standard POSIX commands

#### Architecture

- **Entry**: `daemon/src/index.ts` — CLI with 7 subcommands (`stdio`, `ws`, `info`, `test`, `test_cmd`, etc.)
- **Command Registry**: `daemon/src/executor/local-executor.ts` — 57 command handlers
- **MCP Transport**: `daemon/src/executor/transport/mcp-server.ts` — Uses `@modelcontextprotocol/sdk` v1.10.0
- **WebSocket Transport**: `daemon/src/executor/transport/ws-server.ts` — Custom TCP server on port 8765
- **Handler Modules**: `daemon/src/executor/handlers/` — browser, desktop, terminal, file-ops, screenshot

```
daemon/src/
├── index.ts                      # CLI entry
├── executor/
│   ├── local-executor.ts         # 57 command handlers
│   ├── auth.ts                   # COASTY_TOKEN auth
│   ├── transport/
│   │   ├── mcp-server.ts         # MCP stdio protocol
│   │   └── ws-server.ts          # WebSocket server
│   ├── handlers/
│   │   ├── browser.ts            # Puppeteer automation
│   │   ├── desktop.ts            # Mouse/keyboard/scroll/drag
│   │   ├── terminal.ts           # Shell sessions
│   │   ├── file-ops.ts           # File CRUD
│   │   ├── screenshot.ts         # Cross-platform screenshots
│   │   └── index.ts
│   └── shared/
│       ├── display-manager.ts    # Multi-display detection
│       ├── safety.ts             # Path sanitization, command whitelist
│       ├── params.ts             # Param normalization
│       ├── permissions.ts        # macOS permission checks
│       └── cli-indicator.ts      # Terminal spinners (ora)
```

### Key Design Patterns

#### Multi-Agent Execution Flow
1. **Task Planning**: LLM decomposes user request into sequential subtasks
2. **Agent Assignment**: Each subtask assigned to specialized agent (browser/terminal/desktop)
3. **Sequential Execution**: Tasks execute in order (no dependencies system)
4. **Context Passing**: Previous task summaries passed to next task for context
5. **Streaming**: All execution streams via Server-Sent Events to frontend

#### Provider Architecture
- Located in `lib/providers/` and `backend/app/providers/`
- Each provider implements streaming chat with tool calling
- Frontend providers handle model selection and API routing
- Backend providers execute tools and manage agent workflows

#### State Management
- **Chat Store** (`lib/chat-store/`): Manages conversations, messages, attachments
- **Model Store** (`lib/model-store/`): Available models and provider configurations
- **User Store** (`lib/user-store/`): User profile and authentication state
- **VM Store** (`lib/vm-store/`): Virtual machine sessions and connections

## Development Commands

### Frontend Development

```bash
# Install dependencies
npm install

# Development server (with Turbopack)
npm run dev

# Production build
npm run build

# Start production server
npm start

# Type checking
npm run type-check

# Linting
npm run lint
```

### Backend Development

```bash
# Navigate to backend directory
cd backend

# Create virtual environment (first time)
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run development server (from backend directory)
python main.py

# Or use the helper script
# Windows:
.\run_backend.bat
# Linux/Mac:
./run_backend.sh
```

### Daemon Development

```bash
# Navigate to daemon directory
cd daemon

# Install dependencies
npm install

# Development mode
npm run dev

# Build (compile TypeScript)
npm run build

# Start daemon with MCP stdio
npm run stdio

# Start daemon with WebSocket
node dist/index.js ws --token your-token-here
```

### Docker Deployment

```bash
# Build and start all services
docker-compose up --build

# Start services in detached mode
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# AI Desktop container (separate compose file)
docker-compose -f docker-compose.ai-desktop.yml up --build
```

### Testing

```bash
# Backend tests
cd backend
pytest

# Run specific test file
pytest tests/test_specific.py

# Run with coverage
pytest --cov=app tests/
```

## Environment Configuration

### Frontend Environment Variables (.env)
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE`: Supabase service role key (server-side)
- `CSRF_SECRET`: CSRF protection secret (required)
- `ENCRYPTION_KEY`: For encrypting user API keys (required for BYOK)
- `PYTHON_BACKEND_URL`: Backend API URL (default: http://0.0.0.0:8001)
- `NEXT_PUBLIC_BACKEND_URL`: Public backend URL (default: http://localhost:8001)
- Azure credentials for VM provisioning (AZURE_*)
- Stripe keys for billing (STRIPE_*)
- Google Search API keys (GOOGLE_SEARCH_*)

### Backend Environment Variables (backend/.env)
- `DEBUG`: Enable debug mode (true/false)
- `CORS_ORIGINS`: Allowed CORS origins (comma-separated)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`: Supabase config
- `CSRF_SECRET`, `ENCRYPTION_KEY`: Security keys (must match frontend)
- `GOOGLE_SEARCH_KEY`, `GOOGLE_SEARCH_CX`: Google Custom Search API

See `.env.example` for complete configuration templates.

## Code Organization

### Frontend Structure
- `app/`: Next.js app directory with routes and layouts
  - `c/[chatId]/`: Individual chat pages
  - `api/`: API route handlers (Next.js API routes)
  - `auth/`, `billing/`, `account/`: Feature-specific pages
- `components/`: Reusable React components
  - `ui/`: shadcn/ui components (Radix UI based)
  - `common/`: Shared components (chat interface, message display)
  - `prompt-kit/`: Prompt-related components
- `lib/`: Business logic and utilities
  - `providers/`: AI provider implementations
  - `chat-store/`, `model-store/`, `user-store/`: Zustand state stores
  - `supabase/`: Database client and queries
  - `services/`: Service layer (API calls, utilities)

### Backend Structure
- `backend/app/`
  - `api/routes/`: FastAPI route handlers
  - `services/`: Core business logic
    - `multi_agent_executor.py`: Multi-agent orchestration
    - `vm_control.py`: VM WebSocket management
    - `database.py`: Supabase operations
    - `agent_billing.py`: Usage tracking
  - `core/`: Configuration, middleware, logging
  - `models/`: Pydantic data models
  - `providers/`: AI provider integrations
  - `utils/`: Utility functions

### Docker Structure

- `docker/ai-desktop/`: Ubuntu desktop container with AI agents
  - Includes Chrome, Node.js, Python, automation tools
  - WebSocket server for agent communication
  - VNC server for remote desktop access

## Key Workflows

### Adding a New AI Provider

1. **Frontend**: Create provider in `lib/providers/your-provider.ts`
   - Implement `streamChat()` method with tool calling support
   - Add to `lib/providers/index.ts`

2. **Backend**: Add provider support in `backend/app/providers/`
   - Configure API keys in environment
   - Update model lists in `models.py`

### Creating a New Agent Type

1. Add agent type to `AgentType` enum in `multi_agent_executor.py`
2. Create agent prompt in `_get_*_agent_prompt()` method
3. Define agent tools in `_get_*_tools()` method
4. Update task planner to recognize new agent type

### Adding New VM Tools

1. Create tool function in `backend/app/api/routes/chat_vm_tools.py`
2. Define tool schema (name, description, parameters)
3. Add tool to appropriate agent's tool list in `multi_agent_executor.py`
4. Implement tool execution in VM agent server (if needed)

### Adding a New Daemon Command

1. Create handler function in the appropriate module (`daemon/src/executor/handlers/desktop.ts`, `browser.ts`, `terminal.ts`, `file-ops.ts`, or a new module)
2. Register the command name → handler mapping in `daemon/src/executor/local-executor.ts` `registerHandlers()`
3. Add parameter normalization in `normalizeParams()` if needed
4. Run `npm run build` in the `daemon/` directory to compile

### Adding Platform-Specific Desktop Automation

1. Add the function in `daemon/src/executor/handlers/desktop.ts` with `process.platform` branching
2. **Windows**: Use `runPowershell()` with user32.dll P/Invoke via `Add-Type @"..."@`
3. **macOS**: Use `runSwift()` for CoreGraphics or `runBash()` with `osascript` for System Events
4. **Linux**: Use `runBash()` with `xdotool` or `wmctrl`
5. Register in `local-executor.ts`

### Adding a New Daemon Screenshot Handler

1. Update `daemon/src/executor/handlers/screenshot.ts`
2. Add platform-specific tool detection via `commandExists()`
3. Add Wayland tools (grim/slurp/spectacle) for Wayland compositors
4. Add X11 tools (scrot/import/gnome-screenshot) for X11 sessions

## Important Technical Details

### WebSocket Connection Management
- VM connections are persistent with auto-reconnection
- Heartbeat mechanism prevents stale connections
- Connection reuse minimizes latency
- Password authentication for VNC access

### Tool Response Handling
- Tool responses are truncated to prevent context overflow (5000 chars)
- `frontendScreenshot` field is preserved and not sent to model
- Screenshots are compressed (JPEG, 1280x720 max) before transmission

### Streaming Architecture
- All AI responses stream via Server-Sent Events (SSE)
- Tool calls and results stream separately from text
- Frontend accumulates chunks and updates UI reactively
- `finish` event signals completion with full content

### Task Execution Rules
- Tasks execute sequentially (no parallel execution)
- Each task receives context from all previous completed tasks
- Tasks can request user input via `[NEED_USER_INPUT]` markers
- Execution stops if agent encounters critical blocker

### Browser Agent Strategy
- **Search-First**: Always use Google Search before opening browser
- **Minimal Browsing**: Only open browser when action is required (forms, clicks, purchases)
- **State Validation**: Use `browser_state()` to verify actions
- **Tab Management**: Reuse tabs instead of excessive navigation

### Security Considerations

- CSRF protection on all state-changing operations
- API keys encrypted with `ENCRYPTION_KEY` (BYOK feature)
- Rate limiting on backend endpoints
- Supabase Row Level Security (RLS) for data access
- No credentials stored in VM environments
- **Daemon**: Token-based auth via `COASTY_TOKEN`, timing-safe comparison
- **Daemon**: Path sanitization and command whitelisting for file operations
- **Daemon**: Window title passed via env var (`_COASTY_WIN_TITLE`) to avoid shell injection in window switching

## Common Development Tasks

### Adding a New Feature
1. Design API endpoints in `backend/app/api/routes/`
2. Implement business logic in `backend/app/services/`
3. Create frontend components in `components/`
4. Add state management in appropriate store (`lib/*-store/`)
5. Wire up API calls in `lib/services/` or route handlers

### Debugging Daemon Desktop Automation Issues

1. Verify `xdotool` (Linux), PowerShell `user32.dll` (Windows), or `osascript` + CoreGraphics (macOS) is installed
2. On Linux/Wayland: ensure `xdotool` works with your display server; test with `xdotool search --name ""`
3. On Linux/Wayland: screenshot tools priority is `grim` → `gnome-screenshot` → `spectacle` → `scrot` → `import`
4. On Linux Wayland-only distros: install `grim` + `slurp` for Wayland screenshots, `xdotool` works via XWayland
5. Browser automation: ensure Chrome/Edge/Brave is installed on the system
6. On Linux: browser uses `--no-sandbox` flag for headless Chrome on Arch/CachyOS
7. Check daemon logs for `[Desktop]`, `[Browser]`, `[Screenshot]` prefixes

### Debugging VM Agent Issues

### Debugging VM Agent Issues
1. Check WebSocket connection status in `vm_control.py` logs
2. Verify agent tools are registered in `multi_agent_executor.py`
3. Test tool execution with reduced context
4. Check container logs: `docker logs <container-id>`
5. Verify VNC connection: `ws://localhost:8081` (localhost) or `ws://<ip>:8080`

### Optimizing Performance
1. **Frontend**: Use React.memo for expensive components, lazy load routes
2. **Backend**: Enable caching in `cache.py`, optimize database queries
3. **Streaming**: Batch small chunks, compress screenshots
4. **VM**: Reuse connections, minimize tool calls, truncate responses

### Database Migrations
- Supabase migrations handled via Supabase Dashboard or CLI
- Schema changes require updating Supabase types in `types/supabase.ts`
- Run `supabase gen types typescript` to regenerate types

## Ports and Services

- **Frontend**: 3000 (Next.js dev server)
- **Backend**: 8001 (FastAPI server)
- **VM Agent WebSocket**: 8080 (remote), 8081 (localhost)
- **VNC**: 5900 (desktop access)
- **Supabase**: Hosted service (URLs in .env)

## Additional Notes

- **Frontend uses React Server Components** where applicable for better performance
- **Backend runs on uvicorn** with auto-reload in development
- **VM containers** are ephemeral and should be treated as stateless
- **Billing system** tracks agent usage by session duration
- **Multi-model support** allows users to switch providers mid-conversation
- **Screenshot compression** is critical for performance (JPEG, 70% quality)
- **Puppeteer browser automation** uses temp user-data-dir to avoid Chrome profile locks
