/**
 * Terminal — shell session execution.
 */

import { execFile } from 'child_process'
import * as os from 'os'
import { sanitizeChildEnv, checkDangerousCommand as checkDanger } from '../shared/safety'

interface TerminalSession {
  id: string
  cwd: string
}

const sessions: Map<string, TerminalSession> = new Map()
let sessionCounter = 0

export async function connectTerminal(params: { cwd?: string } = {}): Promise<any> {
  const id = `term_${++sessionCounter}`
  const cwd = params.cwd || os.homedir()
  sessions.set(id, { id, cwd })

  return {
    success: true,
    session_id: id,
    cwd,
    message: `Terminal session ${id} created`,
  }
}

export async function executeTerminal(params: {
  command: string
  timeout?: number
  session_id?: string
}): Promise<any> {
  const { command, timeout = 30 } = params

  // Block catastrophic commands
  const risk = checkDanger(command)
  if (risk.blocked) {
    return { success: false, output: '', exit_code: -1, error: risk.reason }
  }

  let cwd = os.homedir()
  if (params.session_id && sessions.has(params.session_id)) {
    cwd = sessions.get(params.session_id)!.cwd
  }

  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
    const args = process.platform === 'win32'
      ? ['-Command', command]
      : ['-c', command]

    const child = execFile(shell, args, {
      cwd,
      timeout: timeout * 1000,
      maxBuffer: 1024 * 1024,
      env: sanitizeChildEnv(),
    }, (error, stdout, stderr) => {
      const output = stdout + (stderr ? `\n${stderr}` : '')
      resolve({
        success: !error,
        output: String(output).slice(0, 5000),
        exit_code: error?.code ?? 0,
        error: error?.message ? String(error.message) : undefined,
      })
    })

    setTimeout(() => {
      child.kill('SIGKILL')
      resolve({
        success: false,
        output: '',
        exit_code: -1,
        error: `Command timed out after ${timeout}s`,
      })
    }, (timeout + 1) * 1000)
  })
}

export async function readTerminal(params: { session_id?: string } = {}): Promise<any> {
  return { success: true, output: '', message: 'No pending output' }
}

export async function typeTerminal(params: { text: string }): Promise<any> {
  return { success: true, message: `Text ready to send (use terminal_execute)` }
}

export async function clearTerminal(params: {} = {}): Promise<any> {
  return { success: true, message: 'Terminal cleared' }
}

export async function closeTerminal(params: { session_id?: string } = {}): Promise<any> {
  if (params.session_id) {
    sessions.delete(params.session_id)
  }
  return {
    success: true,
    message: `Terminal session ${params.session_id || 'default'} closed`,
  }
}
