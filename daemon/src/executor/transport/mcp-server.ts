/**
 * MCP stdio server — exposes all 50+ commands as MCP tools.
 *
 * This allows agents using the Model Context Protocol (e.g., OpenWebUI, Claude Desktop, Cursor, Windsurf)
 * to connect and call computer-use commands via stdio.
 *
 * Usage: npx coasty-command (runs in stdio mode by default)
 * Or explicitly: npx coasty-command stdio
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { LocalExecutor } from '../local-executor'
import { getToken } from '../auth'
import chalk from 'chalk'

let executor: LocalExecutor | null = null
let isRunning = false

// Param schemas grouped by command pattern
const PARAM_SCHEMAS: Record<string, Record<string, { type: string; description?: string }>> = {
  click: { x: { type: 'number', description: 'X screen coordinate' }, y: { type: 'number', description: 'Y screen coordinate' }, button: { type: 'string', description: 'left, right, or middle' } },
  click_with_modifiers: { x: { type: 'number' }, y: { type: 'number' }, hold_keys: { type: 'array' }, clicks: { type: 'number', description: 'Number of clicks' } },
  double_click: { x: { type: 'number' }, y: { type: 'number' } },
  drag: { x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' }, hold_keys: { type: 'array' } },
  scroll: { clicks: { type: 'number', description: 'Number of scroll clicks (positive=up, negative=down)' }, direction: { type: 'string' } },
  type: { text: { type: 'string', description: 'Text to type at cursor position' } },
  key_combo: { keys: { type: 'array', description: 'Array of key names, e.g. ["ctrl", "c"]' } },
  key_press: { keys: { type: 'array', description: 'Array of keys to press' } },
  terminal_execute: { command: { type: 'string', description: 'Shell command to execute' }, timeout: { type: 'number' } },
  terminal_connect: { cwd: { type: 'string', description: 'Working directory' } },
  file_read: { path: { type: 'string', description: 'File path to read' } },
  file_write: { path: { type: 'string', description: 'File path to write/overwrite' } },
  file_edit: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } },
  browser_navigate: { url: { type: 'string', description: 'URL to navigate to' } },
  browser_type: { text: { type: 'string' }, selector: { type: 'string' } },
  browser_click: { selector: { type: 'string', description: 'CSS selector' }, x: { type: 'number' }, y: { type: 'number' }, text: { type: 'string' } },
  switch_to_window: { window: { type: 'string', description: 'Window title (substring match)' }, title: { type: 'string' } },
  browser_wait: { selector: { type: 'string' }, text: { type: 'string' }, timeout: { type: 'number' } },
  browser_execute: { code: { type: 'string', description: 'JavaScript code to execute in the browser' }, script: { type: 'string' } },
  browser_open_tab: { url: { type: 'string' } },
  browser_close_tab: { index: { type: 'number' } },
  browser_switch_tab: { index: { type: 'number' } },
}

function getParamSchema(command: string): Record<string, { type: string; description?: string }> {
  return PARAM_SCHEMAS[command] ?? { _any: { type: 'object', description: 'Any command-specific parameters (see documentation)' } }
}

async function handler(executor: LocalExecutor, command: string, args: any) {
  const result = await executor.executeCommand(command, args)
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  }
}

export async function startMcpServer(): Promise<void> {
  if (isRunning) {
    console.error(chalk.red('[MCP] Server is already running'))
    return
  }

  executor = new LocalExecutor()
  isRunning = true

  const server = new McpServer({
    name: 'coasty-command',
    version: '1.0.0',
  })

  console.log(chalk.green.bold(`[MCP] Starting server`))

  const commands = executor.getCommandMetas()

  for (const cmd of commands) {
    const paramSchema = getParamSchema(cmd.name)

    server.tool(
      cmd.name,
      cmd.description,
      paramSchema,
      async (args: any) => {
        try {
          const result = await executor.executeCommand(cmd.name, args)
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          }
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: error.message || String(error) }, null, 2) }],
            isError: true,
          }
        }
      },
    )
  }

  const transport = new StdioServerTransport()

  console.log(chalk.green('[MCP] Transport connected, ready to receive requests'))
  console.log(chalk.dim(`     Available tools: 60`))
  console.log(chalk.dim(`     Platform: ${process.platform} ${process.arch}`))
  console.log(chalk.dim(`     Token: ${getToken() === 'changeme' ? 'CHANGE ME' : 'Set via COASTY_TOKEN env var'}`))
  console.log('')

  await server.connect(transport)
}
