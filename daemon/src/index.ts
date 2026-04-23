#!/usr/bin/env node
/**
 * coasty-command — Computer-use daemon for AI agents
 *
 * Exposes 50+ commands (desktop control, browser automation, terminal, files)
 * via MCP stdio or WebSocket, allowing any MCP-compatible agent to control the machine.
 *
 * Usage:
 *   coasty-command              # Start in MCP stdio mode (for Claude Desktop, etc.)
 *   coasty-command stdio        # Explicit MCP stdio mode
 *   coasty-command ws           # Start WebSocket server mode
 *   coasty-command ws --port 9999
 *   coasty-command info         # Show installed commands
 *   coasty-command test         # Run a quick system check
 */

import chalk from 'chalk'
import { LocalExecutor } from './executor/local-executor'
import { startMcpServer, startWsServer } from './executor/transport'
import { getToken } from './executor/auth'
import { checkAllPermissions } from './executor/shared'
import { getDisplayList } from './executor/shared/display-manager'
import { execSync } from 'child_process'
import os from 'os'

async function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'stdio'

  // Handle --help / -h
  if (['--help', '-h', 'help', '-?'].includes(command)) {
    printUsage()
    return
  }

  // Token warning
  const token = getToken()
  if (token === 'changeme') {
    console.warn(chalk.yellow('') + chalk.yellow('⚠ WARNING: Using default token "changeme". Set COASTY_TOKEN env var for production.\n'))
  }

  switch (command) {
    case 'stdio':
    case 'mcp':
      console.log(chalk.green.bold('▓▓▓ Coasty Command — Computer-Use Daemon (MCP mode)\n'))
      console.log(chalk.dim(`     Platform:     ${process.platform} ${process.arch}`))
      console.log(chalk.dim(`     Node:         ${process.version}`))
      console.log(chalk.dim(`     Token:        ${token === 'changeme' ? 'CHANGE ME (set COASTY_TOKEN)' : 'configured'}`))
      console.log(chalk.dim(`     Displays:     ${getDisplayList().length} active`))
      console.log(chalk.dim(`     Home:         ${os.homedir()}`))
      console.log('')
      await startMcpServer()
      break

    case 'ws':
    case 'websocket':
      const port = parseInt(args[1]?.replace(/--port=/, '').replace(/^--port */, '')) || 8765
      console.log(chalk.green.bold('▓▓▓ Coasty Command — Computer-Use Daemon (WebSocket mode)\n'))
      console.log(chalk.dim(`     Platform:     ${process.platform} ${process.arch}`))
      console.log(chalk.dim(`     Node:         ${process.version}`))
      console.log(chalk.dim(`     WS Port:      ${port}`))
      console.log(chalk.dim(`     Token:        ${token === 'changeme' ? 'CHANGE ME (set COASTY_TOKEN)' : 'configured'}`))
      console.log(chalk.dim(`     Status API:   http://localhost:${port + 1}/status`))
      console.log('')
      await startWsServer({ port })
      break

  case 'info':
       const executor = new LocalExecutor()
      const commands = executor.getCommandMetas()
      const groups = {
        desktop: [],
        terminal: [],
        file: [],
        browser: [],
        window: [],
        system: [],
        other: [],
      }
      for (const cmd of commands) {
        const name = cmd.name
        if (name === 'screenshot' || name.startsWith('click') || name === 'type' || name === 'key_' || name === 'scroll' || name === 'drag') groups.desktop.push(cmd)
        else if (name.startsWith('terminal') || (name === 'execute_command')) groups.terminal.push(cmd)
        else if (name.startsWith('file_') || name.startsWith('directory_')) groups.file.push(cmd)
        else if (name.startsWith('browser')) groups.browser.push(cmd)
        else if (name.startsWith('list_windows') || name.startsWith('switch_to_window') || name.startsWith('close_window') || name.startsWith('minimize') || name.startsWith('maximize') || name.startsWith('restore') || name.startsWith('arrange') || name.startsWith('move')) groups.window.push(cmd)
        else if (name === 'get_displays' || name === 'set_active_display' || name === 'detect_elements' || name === 'ocr') groups.system.push(cmd)
        else groups.other.push(cmd)
      }

      console.log(chalk.green.bold('▓▓▓ Coasty Command — Installed Commands\n'))
      console.log(chalk.bold(`  Total: ${commands.length} commands`) + '\n')

      for (const [group, cmds] of Object.entries(groups)) {
        if (cmds.length === 0) continue
        console.log(chalk.cyan(`  ${group.toUpperCase()} (${cmds.length}):`))
        for (const cmd of cmds) {
          const desc = cmd.description.length > 70
            ? cmd.description.slice(0, 67) + '...'
            : cmd.description
          console.log(`    ${cmd.name.padEnd(25)} ${desc}`)
        }
        console.log('')
      }
      break

    case 'test':
    case 'check':
      console.log(chalk.green.bold('▓▓▓ Coasty Command — System Check\n'))

      console.log(chalk.dim(`  Platform:      ${process.platform} ${process.arch}`))
      console.log(chalk.dim(`  Node version:  ${process.version}`))
      console.log(chalk.dim(`  Home:          ${os.homedir()}`))
      console.log(chalk.dim(`  OS:            ${os.type()} ${os.release()}`))
      console.log(chalk.dim(`  CPU cores:     ${os.cpus().length}\n`))

      // Check screenshot tools
      console.log(chalk.bold('  Screenshot tools:'))
      try {
        let tools = ['scrot', 'gnome-screenshot', 'screencapture', 'import']
        if (process.platform === 'win32') tools = ['powershell']
        const available: string[] = []
        const missing: string[] = []
        for (const tool of tools) {
          try {
            execSync(`which ${tool}`, { timeout: 1000, stdio: 'pipe' })
            available.push(tool)
          } catch {
            missing.push(tool)
          }
        }
        console.log(chalk.green(`    ✓ ${available.join(', ')}`))
        if (missing.length > 0 && available.length === 0) {
          console.log(chalk.red(`    ✗ No screenshot tools found — screenshots may not work`))
        } else if (missing.length > 0) {
          console.log(chalk.yellow(`    ~ Not found: ${missing.join(', ')}`))
        }
      } catch {
        console.log(chalk.red('    ✗ Could not check screenshot tools'))
      }

      // Check browser
      console.log('')
      console.log(chalk.bold('  Browsers:'))
      const browsers = process.platform === 'win32'
        ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']
        : process.platform === 'darwin'
          ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
          : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge']
      const { existsSync } = require('fs')
      const found: string[] = []
      for (const b of browsers) {
        if (existsSync(b)) found.push(b.split('/').pop() || b)
      }
      console.log(chalk.green(`    ✓ ${found.join(', ') || 'none (install Chrome/Edge for browser automation)'}`))

      // Check xdotool / wmctrl
      if (process.platform === 'linux') {
        console.log('')
        console.log(chalk.bold('  Window management:') + (process.platform === 'linux' ? '' : ''))
        try {
          const xdotools = ['xdotool', 'wmctrl']
          for (const tool of xdotools) {
            try {
              execSync(`which ${tool}`, { timeout: 1000, stdio: 'pipe' })
              console.log(chalk.green(`    ✓ ${tool}`))
            } catch {
              console.log(chalk.red(`    ✗ ${tool} not found (needed for window switching)`.padEnd(40)) + chalk.yellow('  run: sudo apt install xdotool wmctrl'))
            }
          }
        } catch { /* skip */ }
      }

      // macOS permissions
      if (process.platform === 'darwin') {
        console.log('')
        console.log(chalk.bold('  macOS permissions:'))
        const perms = await checkAllPermissions()
        console.log(chalk[perms.accessibility === 'granted' ? 'green' : 'red'](
          `    ${perms.accessibility === 'granted' ? '✓' : '✗'} Accessibility`
        ))
        console.log(chalk[perms.screenRecording === 'granted' ? 'green' : 'red'](
          `    ${perms.screenRecording === 'granted' ? '✓' : '✗'} Screen Recording`
        ))
      }

      console.log('\n' + chalk.green.bold('\n  Ready to go! Start with: coasty-command\ndefault token: "changeme" — set COASTY_TOKEN to change.\n'))
      break

   case 'test_cmd':
        const testCmd = args[1] || 'screenshot'
        const testParamsRaw = args[2]
        let params: Record<string, any> = {}
        if (testParamsRaw) {
          try { params = JSON.parse(testParamsRaw) } catch { params = {} }
        }
        const testExecutor = new LocalExecutor()
       console.log(chalk.dim(`  Running "coasty-command test_cmd ${testCmd}\\n`))
       const result = await testExecutor.executeCommand(testCmd, params)
       console.log(JSON.stringify(result, null, 2))
       process.exit(0)
       break

    default:
      console.log(chalk.yellow(`Unknown command: ${command}`))
      console.log('')
      printUsage()
      process.exit(1)
  }

  // Keep running
  if (command === 'stdio' || command === 'ws') {
    // SIGTERM/SIGINT graceful shutdown
    process.on('SIGTERM', () => {
      console.log(chalk.yellow('\n[Coastery Command] Shutting down (SIGTERM)...'))
      process.exit(0)
    })
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n[Coastery Command] Shutting down (SIGINT)...'))
      process.exit(0)
    })
  }
}

function printUsage(): void {
  console.log(chalk.green.bold('▓▓▓ Coasty Command — Computer-Use Daemon\n'))
  console.log('  Usage:')
  console.log('    coasty-command                  Start in MCP stdio mode')
  console.log('    coasty-command stdio            Start MCP stdio server')
  console.log('    coasty-command ws [port]        Start WebSocket server (default: 8765)')
  console.log('    coasty-command info             List all available commands')
  console.log('    coasty-command test             Run system check')
  console.log('    coasty-command test_cmd <cmd>   Test a single command')
  console.log('')
  console.log(chalk.dim('  Environment:'))
  console.log(chalk.dim('    COASTY_TOKEN          Auth token (default: "changeme")'))
  console.log(chalk.dim('    WS_PORT               WebSocket port (default: 8765)'))
  console.log(chalk.dim('    BROWSER_PATH          Override browser path'))
  console.log('')
  console.log(chalk.cyan('  Examples:'))
  console.log(chalk.dim('    COASTY_TOKEN=my-secret coasty-command'))
  console.log(chalk.dim('    coasty-command ws 9999'))
  console.log(chalk.dim('    coasty-command test_cmd screenshot'))
  console.log(chalk.dim('    coasty-command test_cmd terminal_execute "ls -la"'))
  console.log('')
}

main().catch((err) => {
  console.error(chalk.red('Fatal error:'), err)
  process.exit(1)
})
