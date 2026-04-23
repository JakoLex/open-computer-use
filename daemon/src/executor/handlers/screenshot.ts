/**
 * Screenshot capture — adapted for CLI daemon (no Electron desktopCapturer).
 * Uses platform-native screenshot tools:
 * - Windows: PowerShell + System.Windows.Forms.Screen
 * - macOS: screencapture
 * - Linux: grim+slurp (Wayland), scrot (X11), gnome-screenshot, import
 */

import { execFile } from 'child_process'
import * as os from 'os'
import { getActiveDisplaySize } from '../shared/display-manager'
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'
import { homedir } from 'os'

const JPEG_QUALITY = 70

interface ScreenshotTempFile {
  path: string
  cleanup: () => void
}

function createTempFile(): ScreenshotTempFile {
  const dir = path.join(os.tmpdir(), 'coasty-daemon')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const filePath = path.join(dir, `screenshot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`)
  return {
    path: filePath,
    cleanup: () => {
      try { rmSync(filePath, { force: true }) } catch { /* ignore */ }
    },
  }
}

function execAsync(cmd: string, args: string[], timeout: number = 10000, envOverrides?: Record<string, string>): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(cmd, args, {
      timeout,
      env: { ...process.env, ...(envOverrides || {}) },
    }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: error ? (error as any).code || 1 : 0,
      })
    })
  })
}

function commandExists(cmd: string): boolean {
  try {
    execFile('which', [cmd], { timeout: 2000 }, (error) => {
      if (!error) return
    })
    return true
  } catch {
    return false
  }
}

function detectDesktopEnvironment(): string {
  const xdg = (process.env.XDG_CURRENT_DESKTOP || '').toLowerCase()
  const session = (process.env.XDG_SESSION_DESKTOP || '').toLowerCase()
  const desktop = (process.env.XDG_DATA_DIRS || '').toLowerCase()

  if (xdg.includes('kde') || xdg.includes('plasma') || session.includes('plasma')) return 'kde-plasma'
  if (xdg.includes('gnome') || xdg.includes('budgie') || session.includes('gnome')) return 'gnome'
  if (xdg.includes('hyprland')) return 'hyprland'
  if (xdg.includes('sway')) return 'sway'
  if (xdg.includes('xfce')) return 'xfce'
  if (xdg.includes('cinnamon')) return 'cinnamon'
  if (xdg.includes('lxde')) return 'lxde'
  if (xdg.includes('lxqt')) return 'lxqt'
  if (xdg.includes('budgie')) return 'budgie'

  return 'unknown'
}

function checkDisplayServers(): { wayland: boolean; x11: boolean } {
  const waylandDisplay = process.env.WAYLAND_DISPLAY
  const xDisplay = process.env.DISPLAY
  const sessionType = process.env.XDG_SESSION_TYPE

  return {
    wayland: !!waylandDisplay || sessionType === 'wayland',
    x11: !!xDisplay || sessionType === 'x11',
  }
}

// ─── Window/Screen Selection Helpers ───

/**
 * Prompt user to select a screen region or full screen.
 * Returns the path to the saved screenshot.
 */
async function promptScreenSelection(tmpPath: string, tool: string, args: string[]): Promise<string | null> {
  // Non-interactive mode: take full screen screenshot
  try {
    const result = await execAsync(tool, args, 10000)
    if (existsSync(tmpPath)) return tmpPath
  } catch { /* ignore */ }
  return null
}

async function screenshotWindows(): Promise<{ data: Buffer; format: string } | null> {
  return new Promise((resolve) => {
    const tmp = createTempFile()
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bounds = $screen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$filePath = "${tmp.path.replace(/\\/g, '\\\\')}"
$jpeg = [System.Drawing.Imaging.ImageFormat]::Jpeg
$bitmap.Save($filePath, $jpeg)
$graphics.Dispose()
$bitmap.Dispose()
echo "DONE: $filePath"
`
    execFile('powershell.exe', ['-NoProfile', '-Command', script], {
      timeout: 10000,
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      if (error) {
        tmp.cleanup()
        resolve(null)
        return
      }
      try {
        const data = readFileSync(tmp.path)
        tmp.cleanup()
        resolve({ data, format: 'jpeg' })
      } catch {
        tmp.cleanup()
        resolve(null)
      }
    })
  })
}

async function screenshotMacOS(): Promise<{ data: Buffer; format: string } | null> {
  return new Promise((resolve) => {
    const tmp = createTempFile()
    execFile('/usr/bin/screencapture', [
      '-x', '-t', 'jpg', '-J', JPEG_QUALITY.toString(), tmp.path,
    ], { timeout: 10000 }, (error) => {
      if (error) {
        tmp.cleanup()
        resolve(null)
        return
      }
      try {
        const data = readFileSync(tmp.path)
        tmp.cleanup()
        resolve({ data, format: 'jpeg' })
      } catch {
        tmp.cleanup()
        resolve(null)
      }
    })
  })
}

async function screenshotLinux(): Promise<{ data: Buffer; format: string } | null> {
  const tmp = createTempFile()
  const { wayland, x11 } = checkDisplayServers()
  const waylandDisplay = process.env.WAYLAND_DISPLAY
  const xDisplay = process.env.DISPLAY
  const uid = process.getuid()
  let xauthPath: string | undefined

  // Find X authority file for proper X11 access
  try {
    const xauthPatterns = [
      `/run/user/${uid}/.Xauthority`,
      `/run/user/${uid}/xauth_*`,
      `/tmp/.X11-unix/X*`,
    ]
    const fs = require('node:fs')
    for (const pattern of xauthPatterns) {
      try {
        const files = fs.globSync(pattern)
        if (files.length > 0) {
          for (const f of files) {
            if (!f.includes('lock')) {
              xauthPath = f
              break
            }
          }
          if (!xauthPath && files.length > 0) xauthPath = files[0]
          break
        }
      } catch { /* ignore */ }
    }
  } catch { /* use default XAUTHORITY */ }

  // ── Wayland paths ──
  if (wayland) {
    // Try grim (works on sway, hyprland, wlroots-based, and generic Wayland)
    if (commandExists('grim')) {
      try {
        await execAsync('grim', [tmp.path], 10000)
        if (existsSync(tmp.path) && existsSync(tmp.path + '.jpg') === false && commandExists('convert')) {
          await execAsync('convert', [tmp.path, `-quality`, JPEG_QUALITY.toString(), `${tmp.path}.jpg`], 5000)
          if (existsSync(`${tmp.path}.jpg`)) {
            const data = readFileSync(`${tmp.path}.jpg`)
            tmp.cleanup()
            return { data, format: 'jpeg' }
          }
        }
        if (existsSync(tmp.path)) {
          const data = readFileSync(tmp.path)
          tmp.cleanup()
          return { data, format: 'png' }
        }
      } catch { /**/ }
    }

    // Try gnome-screenshot on GNOME/Wayland
    if (commandExists('gnome-screenshot')) {
      try {
        const result = await execAsync('gnome-screenshot', ['--file', tmp.path, '--delay', '2'], 12000)
        if (existsSync(tmp.path)) {
          if (commandExists('convert')) {
            await execAsync('convert', [tmp.path, `-quality`, JPEG_QUALITY.toString(), `${tmp.path}.jpg`], 5000)
            if (existsSync(`${tmp.path}.jpg`)) {
              const data = readFileSync(`${tmp.path}.jpg`)
              tmp.cleanup()
              return { data, format: 'jpeg' }
            }
          }
          const data = readFileSync(tmp.path)
          tmp.cleanup()
          return { data, format: data.length > 100 ? 'png' : 'jpeg' }
        }
      } catch { /**/ }
    }

    // Try gnome-screenshot-g3 (newer GNOME)
    if (commandExists('gnome-screenshot-g3')) {
      try {
        const result = await execAsync('gnome-screenshot-g3', ['--file', tmp.path], 10000)
        if (existsSync(tmp.path)) {
          const data = readFileSync(tmp.path)
          tmp.cleanup()
          return { data, format: 'png' }
        }
      } catch { /**/ }
    }

    // Try spectacle on KDE/Wayland
    if (commandExists('spectacle')) {
      try {
        await execAsync('spectacle', ['-r', '-b', '-f', tmp.path], 12000, {
          ...process.env,
          WAYLAND_DISPLAY: waylandDisplay || '',
          DISPLAY: ':0',
        })
        if (existsSync(tmp.path)) {
          if (commandExists('convert')) {
            await execAsync('convert', [tmp.path, `-quality`, JPEG_QUALITY.toString(), `${tmp.path}.jpg`], 5000)
            if (existsSync(`${tmp.path}.jpg`)) {
              const data = readFileSync(`${tmp.path}.jpg`)
              tmp.cleanup()
              return { data, format: 'jpeg' }
            }
          }
          const data = readFileSync(tmp.path)
          tmp.cleanup()
          return { data, format: 'png' }
        }
      } catch { /**/ }
    }

    // Try screengrab (KDE Plasma alternative on Wayland)
    if (commandExists('screengrab')) {
      try {
        await execAsync('screengrab', ['--filename', tmp.path], 10000, {
          ...process.env,
          WAYLAND_DISPLAY: waylandDisplay || '',
        })
        if (existsSync(tmp.path)) {
          const data = readFileSync(tmp.path)
          tmp.cleanup()
          return { data, format: 'png' }
        }
      } catch { /**/ }
    }
  }

  // ── X11 paths ──
  const x11Env: Record<string, string> = {
    ...process.env,
    ...(xDisplay ? { DISPLAY: xDisplay } : {}),
    ...(xauthPath ? { XAUTHORITY: xauthPath } : {}),
  }

  if (x11 || !!xDisplay || true) {
    // scrot (X11 primary — CachyOS default)
    if (commandExists('scrot')) {
      try {
        await execAsync('scrot', ['-f', tmp.path, '--quality', JPEG_QUALITY.toString()], 12000, x11Env)
        if (existsSync(tmp.path)) {
          const stat = require('fs').statSync(tmp.path)
          if (stat.size > 100) {
            const data = readFileSync(tmp.path)
            tmp.cleanup()
            const fmt = tmp.path.endsWith('.png') ? 'png' : 'jpeg'
            return { data, format: fmt }
          }
        }
      } catch { /**/ }
    }

    // import (ImageMagick) — works on both X11 and Wayland via X11 forwarding
    if (commandExists('import')) {
      try {
        await execAsync('import', ['-window', 'root', '-quality', JPEG_QUALITY.toString(), tmp.path], 12000, x11Env)
        if (existsSync(tmp.path)) {
          const data = readFileSync(tmp.path)
          if (data.length > 100) {
            tmp.cleanup()
            return { data, format: 'jpeg' }
          }
        }
      } catch { /**/ }
    }

    // gnome-screenshot as additional fallback
    if (commandExists('gnome-screenshot')) {
      try {
        await execAsync('gnome-screenshot', ['-f', tmp.path], 10000, x11Env)
        if (existsSync(tmp.path)) {
          const data = readFileSync(tmp.path)
          tmp.cleanup()
          if (data.length > 100) {
            return { data, format: data.length > 100 ? 'jpeg' : null }
          }
        }
      } catch { /**/ }
    }
  }

  // No screenshot worked
  tmp.cleanup()
  return null
}

export async function captureScreenshot(): Promise<any> {
  let result: { data: Buffer; format: string } | null = null

  if (process.platform === 'win32') {
    result = await screenshotWindows()
  } else if (process.platform === 'darwin') {
    result = await screenshotMacOS()
    if (!result) {
      try {
        const tmp = createTempFile()
        execFile('/usr/bin/screencapture', ['-x', '-t', 'png', tmp.path], { timeout: 10000 }, () => {
          if (existsSync(tmp.path)) {
            try {
              execFile('/bin/bash', ['-c', `sips -s format jpeg -s formatOptions ${JPEG_QUALITY} "${tmp.path}" --out "${tmp.path}" 2>/dev/null || echo ""`], { timeout: 5000 }, () => {
                try {
                  const data = readFileSync(tmp.path)
                  tmp.cleanup()
                  result = { data, format: 'jpeg' }
                } catch { tmp.cleanup() }
              })
            } catch { tmp.cleanup() }
          }
        })
        await new Promise(r => setTimeout(r, 3000))
        if (result) return buildResult(result)
      } catch { /* no fallback */ }
    }
  } else if (process.platform === 'linux') {
    result = await screenshotLinux()
  }

  if (!result) {
    return { success: false, error: 'Screenshot capture failed — no screenshot tool available. Install grim+slurp (Wayland), scrot (X11), or import (ImageMagick).' }
  }

  return buildResult(result)
}

function buildResult(result: { data: Buffer; format: string }): Promise<any> {
  return new Promise((resolve) => {
    const base64 = result.data.toString('base64')
    const format = result.format === 'jpeg' ? 'jpeg' : 'png'
    resolve({
      success: true,
      screenshot: `data:image/${format};base64,${base64}`,
      frontendScreenshot: `data:image/${format};base64,${base64}`,
    })
  })
}
