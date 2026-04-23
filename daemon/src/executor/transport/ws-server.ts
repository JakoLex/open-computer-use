/**
 * WebSocket server — provides a network-based protocol for agent connections.
 *
 * Connections require authentication via the first message body.
 * After auth, clients send { type: 'command', command, parameters } and receive results.
 *
 * Protocol:
 *   Client → Server:
 *     { type: 'auth', token: '...' }          // First message
 *     { type: 'command', command: 'click', parameters: { x: 100, y: 200 } }
 *     { type: 'cmd', command: 'file_read', params: { path: '/tmp/test.txt' } }
 *     { type: 'ping' }                           // Heartbeat
 *   Server → Client:
 *     { type: 'result', success: true, data: { success: true } }
 *     { type: 'error', message: '...' }
 *     { type: 'pong' }
 */

import { WebSocketServer, WebSocket } from 'ws'
import { LocalExecutor } from '../local-executor'
import { getToken, verifyToken } from '../auth'
import chalk from 'chalk'

let executor: LocalExecutor | null = null
let wss: WebSocketServer | null = null
let connectedClients: Map<string, WebSocket> = new Map()
let wsTokens: Map<WebSocket, string> = new Map()
let commandIdCounter = 0

export interface WsServerOptions {
  port?: number
}

export async function startWsServer(options: WsServerOptions = {}): Promise<void> {
  const port = options.port || parseInt(process.env.WS_PORT || '8765') || 8765

  executor = new LocalExecutor()
  wss = new WebSocketServer({ port, host: '0.0.0.0' })

  console.log(chalk.green.bold(`[WS] WebSocket server listening on port ${port}`))
  console.log(chalk.dim(`     Token: ${getToken() === 'changeme' ? 'CHANGE ME' : 'Set via COASTY_TOKEN env var'}`))
  console.log(`     Command handlers: 60 (desktop, terminal, file, browser, window)\n`)

  wss.on('connection', (ws: WebSocket) => {
    const clientId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    connectedClients.set(clientId, ws)
    console.log(chalk.cyan(`[WS] New connection: ${clientId}`))
    console.log(chalk.dim(`     Active connections: ${connectedClients.size}`))
    wsTokens.set(ws, '')  // Initialize with empty token (will be set on auth)

    ws.on('message', async (data: Buffer) => {
      let msg: any
      try {
        msg = JSON.parse(data.toString())
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }))
        return
      }

      // Route the message
      const result = await handleMessage(ws, clientId, msg)
      if (result) {
        ws.send(JSON.stringify(result))
      }
    })

    ws.on('close', () => {
      connectedClients.delete(clientId)
      console.log(chalk.yellow(`[WS] Disconnected: ${clientId} (${connectedClients.size} remaining)`))
    })

    ws.on('error', (err) => {
      console.error(chalk.red(`[WS] Error on ${clientId}:`), err.message)
      connectedClients.delete(clientId)
    })
  })

  wss.on('error', (err) => {
    console.error(chalk.red('[WS] Server error:'), err.message)
  })

  // Add HTTP status server that runs alongside WS
  startStatusServer(port + 1)
}

async function handleMessage(
  ws: WebSocket,
  clientId: string,
  msg: any,
): Promise<any | null> {
  const { type } = msg

  // Auth (first message from new connection)
  if (type === 'auth' || type === 'authenticate') {
    const t = msg.token || msg.authToken || msg.params?.token
    if (!verifyToken(t)) {
      return { type: 'error', message: 'Authentication failed' }
    }
    wsTokens.set(ws, t as string)
    console.log(chalk.cyan(`[WS] ${clientId} authenticated`))
    return { type: 'connected', clientId, message: 'Authenticated and ready' }
  }

  // Require authentication for non-auth messages
  const token = wsTokens.get(ws) as string
  if (!token && type !== 'auth') {
    return { type: 'error', message: 'Not authenticated' }
  }

  // Commands
  if (type === 'command' || type === 'cmd') {
    const command = msg.command || msg.name
    const params = msg.parameters || msg.params || {}

    if (!command) {
      return { type: 'error', message: 'Missing command name' }
    }

    try {
      const result = await executor!.executeCommand(command, params)
      return {
        type: 'result',
        success: result.success !== false,
        data: result,
        command,
      }
    } catch (error: any) {
      return {
        type: 'error',
        message: error.message || 'Command execution failed',
        command,
      }
    }
  }

  // Ping/pong
  if (type === 'ping') {
    const status = {
      connected_clients: connectedClients.size,
      uptime: process.uptime(),
      available_commands: 60,
    }
    return { type: 'pong', ...status }
  }

  // Disconnect
  if (type === 'disconnect' || type === 'bye') {
    ws.close()
    return null
  }

  return { type: 'error', message: `Unknown message type: ${type}` }
}

function startStatusServer(port: number): void {
  import('http').then(({ createServer }) => {
    const server = createServer((_req, res) => {
      const status = {
        status: 'running',
        uptime: process.uptime(),
        platform: process.platform,
        commands: executor?.getCommandMetas().length ?? 0,
        connections: connectedClients.size,
        token_configured: getToken() !== 'changeme',
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(status))
    })
    server.listen(port, '0.0.0.0', () => {
      console.log(chalk.green(`[Status] HTTP status server on port ${port}`))
      console.log(chalk.dim(`     GET / → status JSON`))
      console.log('')
    })
  })
}

/** Get current number of connected clients. */
export function getConnectedCount(): number {
  return connectedClients.size
}

/** Get the token being used. */
export function getServerToken(): string {
  return getToken()
}
