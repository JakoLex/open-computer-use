/**
 * Permission checks — adapted for CLI daemon (no Electron).
 * Uses platform-specific shell commands instead of Electron APIs.
 */

import { execFile, execFileSync } from 'child_process'
import * as fs from 'fs'

export interface PermissionStatus {
  screenRecording: 'granted' | 'denied' | 'not-applicable'
  accessibility: 'granted' | 'denied' | 'not-applicable'
}

function promisifyExecFile(cmd: string, args: string[], options?: any): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 5000, ...options }, (error, stdout, stderr) => {
      if (error) reject(error)
      else resolve({ stdout: stdout.toString(), stderr: stderr.toString() })
    })
  })
}

export async function checkAllPermissions(): Promise<PermissionStatus> {
  if (process.platform !== 'darwin') {
    return { screenRecording: 'not-applicable', accessibility: 'granted' }
  }

  const status: PermissionStatus = {
    screenRecording: 'denied',
    accessibility: 'denied',
  }

  // --- Accessibility ---
  // Try running osascript to query System Events — works if Accessibility is granted.
  try {
    await promisifyExecFile('/usr/bin/osascript', [
      '-e', 'tell application "System Events" to set appName to name of first process',
    ], { timeout: 3000 })
    status.accessibility = 'granted'
  } catch { /* not granted */ }

  // --- Screen Recording ---
  // Try capturing a screenshot to /tmp — works if Screen Recording is granted.
  // Note: -i opens interactive mode, use -p for programmatic capture.
  try {
    const tmp = '/tmp/.coasty_test_screenshot.png'
    await promisifyExecFile('/usr/bin/screencapture', ['-x', '-p', tmp], { timeout: 3000 })
    // Verify file was created and is valid
    try {
      const stat = fs.statSync(tmp)
      if (stat.size > 100) {
        status.screenRecording = 'granted'
        fs.unlinkSync(tmp)
      }
    } catch { /* file not created */ }
  } catch { /* not granted */ }

  // Fallback: try screencapture without -p (headless check)
  if (status.screenRecording !== 'granted') {
    try {
      const tmp = '/tmp/.coasty_test_screenshot2.png'
      await promisifyExecFile('/usr/bin/screencapture', ['-x', '-t', 'png', tmp], { timeout: 3000 })
      try {
        const stat = fs.statSync(tmp)
        if (stat.size > 100) {
          status.screenRecording = 'granted'
          fs.unlinkSync(tmp)
        }
      } catch { /* file not created */ }
    } catch { /* not granted */ }
  }

  return status
}

export function isAccessibilityGranted(): boolean {
  if (process.platform !== 'darwin') return true
  try {
    const result = execFileSync('/usr/bin/osascript', [
      '-e', 'tell application "System Events" to UI elements of process (path of me)',
    ], { timeout: 3000 }).toString().trim()
    return result.length > 0
  } catch {
    return false
  }
}

export function openAccessibilitySettings(): void {
  if (process.platform !== 'darwin') return
  execFile('/usr/bin/open', [
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  ], () => {})
}

export function openScreenRecordingSettings(): void {
  if (process.platform !== 'darwin') return
  execFile('/usr/bin/open', [
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  ], () => {})
}
