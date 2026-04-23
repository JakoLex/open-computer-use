import { executeTerminal, connectTerminal, readTerminal, closeTerminal, typeTerminal, clearTerminal } from './handlers/terminal'
import { captureScreenshot } from './handlers/screenshot'
import {
  readFile, writeFile, editFile, appendFile, deleteFile, fileExists,
  listDirectory, deleteDirectory,
} from './handlers/file-ops'
import {
  openBrowser, navigateBrowser, clickBrowser, typeBrowser,
  getBrowserDom, getBrowserClickables, getBrowserState,
  getBrowserInfo, scrollBrowser, closeBrowser,
  executeBrowser, waitBrowser, screenshotBrowser,
  listBrowserTabs, openBrowserTab, closeBrowserTab, switchBrowserTab,
} from './handlers/browser'
import {
  desktopClick, desktopClickWithModifiers, desktopDoubleClick, desktopType,
  desktopKeyPress, desktopKeyCombo, desktopScroll, desktopDrag,
} from './handlers/desktop'
import { getActiveDisplay } from './shared/display-manager'
import { normalizeParams } from './shared/params'
import { updateIndicator, isActiveState, stopIndicator, startIndicator } from './shared/cli-indicator'
import { execFile } from 'child_process'

type CommandHandler = (params: any) => Promise<any>

/** Run a shell command and parse its output into a result object. */
function runShellForResult(opts: {
  cmd: string
  args: string[]
  parse: (stdout: string) => any
  env?: Record<string, string>
}): Promise<any> {
  return new Promise((resolve) => {
    execFile(opts.cmd, opts.args, {
      timeout: 8000,
      env: opts.env ? { ...process.env, ...opts.env } : undefined,
    }, (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message })
        return
      }
      try {
        resolve(opts.parse(stdout))
      } catch {
        resolve({ success: true, output: stdout.trim() })
      }
    })
  })
}

export interface CommandMeta {
  name: string
  description: string
}

export class LocalExecutor {
  private handlers: Map<string, CommandHandler> = new Map()

  // Descriptive metadata for each command, used for MCP tool registration
  private readonly commandDescriptions: Record<string, string> = {
    screenshot: 'Capture a screenshot of the current screen/display and return it as base64 encoded JPEG data.',
    click: 'Click at the specified screen coordinates. Optionally specify mouse button (left/right/middle).',
    click_with_modifiers: 'Click at coordinates while holding down modifier keys. Supports multiple clicks.',
    double_click: 'Double-click at the specified screen coordinates.',
    type: 'Type text at the current cursor/selection position. Sends keystrokes sequentially.',
    key_press: 'Press one or more keys. Use key names like "enter", "escape", "tab", etc.',
    key_combo: 'Execute a key combination (keyboard shortcut). Pass an array like ["ctrl", "c"] to copy.',
    scroll: 'Scroll the screen/direction at the current cursor position. Positive = up, negative = down.',
    drag: 'Drag from one screen coordinate to another. Optionally hold keys during drag.',
    detect_elements: '[VM only] Use AI vision to detect and describe interactive elements on the current screen.',
    ocr: '[VM only] Run OCR on the current screen to extract all visible text.',
    terminal_connect: 'Open a new terminal/powershell session. Runs in /tmp if no cwd specified.',
    terminal_execute: 'Execute a command in the terminal session. Waits for a short debounce to collect output.',
    terminal_read: 'Read any pending output from the terminal session.',
    terminal_type: 'Type keystrokes into the active terminal session.',
    terminal_clear: 'Send a clear command to the terminal (CLS on Windows, clear/reset on Unix).',
    terminal_close: 'Close the terminal session and wait for the process to exit.',
    execute_command: '(deprecated) Same as terminal_execute.',
    file_read: 'Read the entire contents of a file. Supports binary, returns base64 encoded data.',
    file_write: 'Overwrite the entire contents of a file. Creates parent directories if they do not exist.',
    file_edit: 'Open a file and replace all occurrences of old_text with new_text. Supports line numbers.',
    file_append: 'Append content to the end of a file. Creates parent directories if they do not exist.',
    file_delete: 'Delete a file from the filesystem. Returns an error if the file does not exist.',
    file_exists: 'Check if a file or directory exists at the given path.',
    file_upload: 'Write content to a file (alias for file_write).',
    file_download: 'Read the contents of a file (alias for file_read).',
    file_list_downloads: 'List all files in the downloads directory.',
    directory_list: 'List all files in a directory. Returns size, name, and path for each entry.',
    directory_delete: 'Delete a directory and all its contents. Requires an empty directory.',
    browser_open: 'Open a browser (default installed browser). Supports optional URL parameter.',
    browser_connect: '(alias) Same as browser_open.',
    browser_navigate: 'Navigate to the specified URL in the active browser window/tab.',
    browser_click: 'Click at screen coordinates or CSS selector. Can also match clickable text.',
    browser_type: 'Type text at the current cursor position or into a specific DOM element via CSS selector.',
    browser_get_dom: 'Return the DOM structure of the current page with interactive elements, accessibility info, and text.',
    browser_dom: '(alias) Same as browser_get_dom.',
    browser_get_clickables: 'Return all clickable/interactive elements on the current page as an array with labels and coordinates.',
    browser_state: 'Get information about the current tab, including URL, page title, and tab count.',
    browser_info: 'Return detailed browser information: path, executable name, installed browsers, version.',
    browser_get_context: '(alias) Same as browser_state.',
    browser_scroll: 'Scroll the browser page. Accepts click count (positive=up, negative=down) or direction keyword.',
    browser_close: 'Close the browser window/tab. If a tab is open, closes it; otherwise closes the entire browser window.',
    browser_screenshot: 'Take a screenshot of the browser viewport. Falls back to desktop screenshot if no browser is open.',
    browser_wait: 'Wait until an element appears or text is visible on the page. Polls every 200ms up to timeout.',
    browser_list_tabs: 'List all open browser tabs with their titles.',
    browser_open_tab: 'Open a new browser tab with the specified URL.',
    browser_close_tab: 'Close a browser tab at the specified index (0-based).',
    browser_switch_tab: 'Switch to the browser tab at the specified index (0-based).',
    browser_execute: 'Execute JavaScript in the context of the current page and return the result.',
    list_windows: 'List all visible windows across all displays/workspaces. Returns title and process ID.',
    switch_to_window: 'Switch the active window to the one matching the given title (substring match).',
    arrange_windows: 'Arrange all open windows in a tiling layout.',
    move_window: 'Move a window to the specified screen coordinates.',
    close_window: 'Close the active (frontmost) window.',
    minimize_window: 'Minimize the active (frontmost) window.',
    maximize_window: 'Maximize the active (frontmost) window to fill the screen.',
    restore_window: 'Restore the active window from maximized/minimized state.',
  }

  constructor() {
    this.registerHandlers()
  }

  /** List all registered commands with their descriptions. Used by MCP tool registration. */
  getCommandMetas(): CommandMeta[] {
    const metas: CommandMeta[] = []
    for (const [name, description] of Object.entries(this.commandDescriptions)) {
      metas.push({ name, description })
    }
    return metas
  }

  async executeCommand(command: string, parameters: any = {}): Promise<any> {
    const handler = this.handlers.get(command)
    if (!handler) {
      console.warn(`[LocalExecutor] Unknown command: ${command}`)
      return { success: false, error: `Unknown command: ${command}` }
    }

    try {
      // Normalize parameters before passing to handler
      const normalized = this.normalizeParams(command, parameters)
      return await handler(normalized)
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      }
    }
  }

  /**
   * Normalize parameter names from backend format to handler format.
   * Backend sends: filepath, dirpath, find, replace
   * Handlers expect: path, old_text, new_text
   */
  private normalizeParams(command: string, params: any): any {
    const p = { ...params }

    // File operations: filepath → path
    if (p.filepath !== undefined && p.path === undefined) {
      p.path = p.filepath
    }
    // Directory operations: dirpath → path
    if (p.dirpath !== undefined && p.path === undefined) {
      p.path = p.dirpath
    }
    // File edit: find/replace → old_text/new_text
    if (p.find !== undefined && p.old_text === undefined) {
      p.old_text = p.find
    }
    if (p.replace !== undefined && p.new_text === undefined) {
      p.new_text = p.replace
    }
    // Tab management: tab_index → index
    if (p.tab_index !== undefined && p.index === undefined) {
      p.index = p.tab_index
    }

    // Multi-display coordinate offset: the backend sends coordinates relative
    // to the captured display, but desktop automation APIs use global screen
    // coordinates that span all monitors. Offset by the active display's origin
    // so clicks/drags/scrolls land on the correct screen.
    //
    // Defence-in-depth: ALWAYS coerce coordinate fields to Number, even when
    // offset is (0, 0). This prevents non-numeric strings (e.g. shell injection
    // payloads) from reaching desktop-automation functions. The automation layer
    // also validates with validateInt(), but early coercion here ensures NaN
    // propagates rather than a raw string.
    const COORD_COMMANDS = new Set(['click', 'click_with_modifiers', 'double_click', 'scroll', 'drag'])
    if (COORD_COMMANDS.has(command)) {
      // Unconditional type coercion — turns injection strings into NaN
      for (const field of ['x', 'y', 'x1', 'y1', 'x2', 'y2'] as const) {
        if (p[field] !== undefined) p[field] = Number(p[field])
      }
      if (p.clicks !== undefined) p.clicks = Number(p.clicks)

      // Apply display offset for multi-monitor setups
      const { x: ox, y: oy } = getActiveDisplay().bounds
      if (ox !== 0 || oy !== 0) {
        if (p.x !== undefined) p.x += ox
        if (p.y !== undefined) p.y += oy
        if (p.x1 !== undefined) p.x1 += ox
        if (p.y1 !== undefined) p.y1 += oy
        if (p.x2 !== undefined) p.x2 += ox
        if (p.y2 !== undefined) p.y2 += oy
      }
    }

    return p
  }

  /**
   * Wrap a handler to show a CLI indicator during execution.
   * In daemon mode, we don't have an overlay window to hide — the CLI indicator
   * provides visual feedback that an agent is using the computer.
   */
  private withOverlayHidden(handler: CommandHandler): CommandHandler {
    return async (params) => {
      // No overlay to hide in daemon mode — just execute the handler
      return await handler(params)
    }
  }

  private registerHandlers(): void {
    // ========================
    // DESKTOP / SCREENSHOT
    // ========================
    this.handlers.set('screenshot', () => captureScreenshot())

    // Desktop mouse — hide overlay so clicks don't hit it
    this.handlers.set('click', this.withOverlayHidden((p) => desktopClick(p)))
    this.handlers.set('click_with_modifiers', this.withOverlayHidden((p) => desktopClickWithModifiers(p)))
    this.handlers.set('double_click', this.withOverlayHidden((p) => desktopDoubleClick(p)))

    // Desktop keyboard — hide overlay so it can't steal focus
    this.handlers.set('type', this.withOverlayHidden((p) => desktopType(p)))
    this.handlers.set('key_press', this.withOverlayHidden((p) => desktopKeyPress(p)))
    this.handlers.set('key_combo', this.withOverlayHidden((p) => desktopKeyCombo(p)))

    // Desktop scroll and drag — hide overlay so it can't intercept
    this.handlers.set('scroll', this.withOverlayHidden((p) => desktopScroll(p)))
    this.handlers.set('drag', this.withOverlayHidden((p) => desktopDrag(p)))

    // Stubs for VM-only features
    this.handlers.set('detect_elements', async () => ({
      success: false,
      error: 'Element detection is not available on local machines. Use screenshot + AI analysis instead.',
    }))
    this.handlers.set('ocr', async () => ({
      success: false,
      error: 'OCR is not available on local machines. Use screenshot + AI analysis instead.',
    }))

    // ========================
    // TERMINAL
    // ========================
    this.handlers.set('terminal_connect', (p) => connectTerminal(p))
    this.handlers.set('terminal_execute', (p) => executeTerminal(p))
    this.handlers.set('terminal_read', (p) => readTerminal(p))
    this.handlers.set('terminal_type', (p) => typeTerminal(p))
    this.handlers.set('terminal_clear', (p) => clearTerminal(p))
    this.handlers.set('terminal_close', (p) => closeTerminal(p))
    // Deprecated alias
    this.handlers.set('execute_command', (p) => executeTerminal(p))

    // ========================
    // FILE OPERATIONS
    // ========================
    this.handlers.set('file_read', (p) => readFile(p))
    this.handlers.set('file_write', (p) => writeFile(p))
    this.handlers.set('file_edit', (p) => editFile(p))
    this.handlers.set('file_append', (p) => appendFile(p))
    this.handlers.set('file_delete', (p) => deleteFile(p))
    this.handlers.set('file_exists', (p) => fileExists(p))
    this.handlers.set('directory_list', (p) => listDirectory(p))
    this.handlers.set('directory_delete', (p) => deleteDirectory(p))
    // file_upload → same as file_write for local machine
    this.handlers.set('file_upload', (p) => writeFile(p))
    // file_download → same as file_read for local machine
    this.handlers.set('file_download', (p) => readFile(p))
    // file_list_downloads → same as directory_list for local machine
    this.handlers.set('file_list_downloads', (p) => listDirectory(p))

    // ========================
    // BROWSER AUTOMATION
    // ========================
    this.handlers.set('browser_open', (p) => openBrowser(p))
    this.handlers.set('browser_connect', (p) => openBrowser(p)) // alias: connect = open for local
    this.handlers.set('browser_navigate', (p) => navigateBrowser(p))
    this.handlers.set('browser_click', (p) => clickBrowser(p))
    this.handlers.set('browser_type', (p) => typeBrowser(p))
    this.handlers.set('browser_get_dom', (p) => getBrowserDom(p))
    this.handlers.set('browser_dom', (p) => getBrowserDom(p)) // alias used by backend tool name
    this.handlers.set('browser_get_clickables', (p) => getBrowserClickables(p))
    this.handlers.set('browser_state', (p) => getBrowserState(p))
    this.handlers.set('browser_info', (p) => getBrowserInfo(p))
    this.handlers.set('browser_get_context', (p) => getBrowserState(p)) // context = state for local
    this.handlers.set('browser_scroll', (p) => scrollBrowser(p))
    this.handlers.set('browser_close', (p) => closeBrowser(p))

    // Browser JS execution
    this.handlers.set('browser_execute', (p) => executeBrowser(p))

    // Browser screenshot (prefer page screenshot, fall back to desktop)
    this.handlers.set('browser_screenshot', async () => {
      const result = await screenshotBrowser()
      if (result) return result
      return captureScreenshot() // Fallback to desktop screenshot
    })

    // Browser wait (proper element/text polling with timeout)
    this.handlers.set('browser_wait', (p) => waitBrowser(p))

    // Browser tab management
    this.handlers.set('browser_list_tabs', () => listBrowserTabs())
    this.handlers.set('browser_open_tab', (p) => openBrowserTab(p))
    this.handlers.set('browser_close_tab', (p) => closeBrowserTab(p))
    this.handlers.set('browser_switch_tab', (p) => switchBrowserTab(p))

    // ========================
    // WINDOW MANAGEMENT
    // ========================
    this.handlers.set('list_windows', async () => {
      return runShellForResult(
        process.platform === 'win32'
          ? {
            cmd: 'powershell.exe',
            args: ['-NoProfile', '-Command',
              'Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object Id, MainWindowTitle | ConvertTo-Json'],
            parse: (stdout: string) => {
              const windows = JSON.parse(stdout || '[]')
              const list = (Array.isArray(windows) ? windows : [windows]).map((w: any) => ({
                id: String(w.Id),
                title: w.MainWindowTitle,
              }))
              return { success: true, windows: list, count: list.length }
            },
          }
          : process.platform === 'linux'
            ? {
              cmd: '/bin/bash',
              args: ['-c', 'wmctrl -l 2>/dev/null || xdotool search --name "" getwindowname %@ 2>/dev/null'],
              parse: (stdout: string) => {
                const lines = stdout.trim().split('\n').filter(Boolean)
                const windows = lines.map((line, i) => ({
                  id: String(i),
                  title: line.split(/\s+/).slice(3).join(' ') || line,
                }))
                return { success: true, windows, count: windows.length }
              },
            }
            : {
              cmd: '/usr/bin/osascript',
              args: ['-e', 'tell application "System Events" to get name of every window of every process whose visible is true'],
              parse: (stdout: string) => {
                const titles = stdout.split(',').map(s => s.trim()).filter(Boolean)
                const windows = titles.map((title, i) => ({ id: String(i), title }))
                return { success: true, windows, count: windows.length }
              },
            },
      )
    })

    this.handlers.set('switch_to_window', this.withOverlayHidden(async (p) => {
      const title = p.window || p.title || ''
      if (!title) return { success: false, error: 'No window title specified' }
      // Pass title via environment variable to avoid shell injection.
      // Env vars are out-of-band — they never go through shell parsing.
      const env = { _COASTY_WIN_TITLE: title }
      return runShellForResult(
        process.platform === 'win32'
          ? {
            cmd: 'powershell.exe',
            args: ['-NoProfile', '-Command',
              `$t = $env:_COASTY_WIN_TITLE; ` +
              `$w = Get-Process | Where-Object { $_.MainWindowTitle -like "*$t*" } | Select-Object -First 1; ` +
              `if ($w) { [void][System.Reflection.Assembly]::LoadWithPartialName("Microsoft.VisualBasic"); ` +
              `[Microsoft.VisualBasic.Interaction]::AppActivate($w.Id); "Switched" } else { "Not found" }`],
            parse: (stdout: string) => ({
              success: stdout.trim().includes('Switched'),
              message: stdout.trim().includes('Switched') ? `Switched to "${title}"` : `Window "${title}" not found`,
            }),
            env,
          }
          : process.platform === 'linux'
            ? {
              cmd: '/bin/bash',
              args: ['-c', 'wmctrl -a "$_COASTY_WIN_TITLE" 2>/dev/null && echo OK || xdotool search --name "$_COASTY_WIN_TITLE" windowactivate 2>/dev/null && echo OK'],
              parse: (stdout: string) => ({
                success: stdout.includes('OK'),
                message: stdout.includes('OK') ? `Switched to "${title}"` : `Window "${title}" not found`,
              }),
              env,
            }
            : {
              cmd: '/usr/bin/osascript',
              args: ['-e', 'tell application "System Events" to set frontmost of (first process whose name contains (system attribute "_COASTY_WIN_TITLE")) to true'],
              parse: () => ({ success: true, message: `Switched to "${title}"` }),
              env,
            },
      )
    }))

    this.handlers.set('arrange_windows', async (p) => {
      return { success: true, message: `Window arrangement: ${p.arrangement || 'tile'} (not yet implemented)` }
    })
    this.handlers.set('move_window', async (p) => {
      return { success: true, message: `Window move to (${p.x}, ${p.y}) (not yet implemented)` }
    })

    // Window operations: close, minimize, maximize, restore
    const windowOp = async (op: string) => {
      if (process.platform === 'win32') {
        const psMap: Record<string, string> = {
          close: 'Stop-Process -Id (Get-Process | Where-Object { $_.MainWindowHandle -eq [System.Diagnostics.Process]::GetCurrentProcess().MainWindowHandle }).Id',
          minimize: 'Add-Type -Name Win -Namespace Native -MemberDefinition \'[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);\'; $h = (Get-Process | Sort-Object -Property StartTime -Descending | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1).MainWindowHandle; [Native.Win]::ShowWindow($h, 6)',
          maximize: 'Add-Type -Name Win -Namespace Native -MemberDefinition \'[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);\'; $h = (Get-Process | Sort-Object -Property StartTime -Descending | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1).MainWindowHandle; [Native.Win]::ShowWindow($h, 3)',
          restore: 'Add-Type -Name Win -Namespace Native -MemberDefinition \'[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);\'; $h = (Get-Process | Sort-Object -Property StartTime -Descending | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1).MainWindowHandle; [Native.Win]::ShowWindow($h, 9)',
        }
        if (psMap[op]) {
          return runShellForResult({
            cmd: 'powershell.exe',
            args: ['-NoProfile', '-Command', psMap[op]],
            parse: () => ({ success: true, message: `Window ${op} executed` }),
          })
        }
      }
      return { success: true, message: `Window ${op} (limited support on this platform)` }
    }

    this.handlers.set('close_window', () => windowOp('close'))
    this.handlers.set('minimize_window', () => windowOp('minimize'))
    this.handlers.set('maximize_window', () => windowOp('maximize'))
    this.handlers.set('restore_window', () => windowOp('restore'))
  }
}
