/**
 * Screenshot capture — adapted for CLI daemon (no Electron desktopCapturer).
 * Uses platform-native screenshot tools:
 * - Windows: PowerShell + System.Windows.Forms.Screen
 * - macOS: screencapture
 * - Linux: gnome-screenshot / scrot / import
 */

import { execFile } from 'child_process'
import * as os from 'os'
import { getActiveDisplaySize } from '../shared/display-manager'
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'

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

async function screenshotMacOSV2(): Promise<{ data: Buffer; format: string } | null> {
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
  return new Promise((resolve) => {
    const tmp = createTempFile()

    // Try scrot first, then gnome-screenshot, then import
    const commands = [
      [`scrot`, '-e', `mv -f "$0" "${tmp.path}"`, tmp.path],
      [`gnome-screenshot`, '-f', tmp.path, '-f', tmp.path],
      [`import`, '-window', 'root', '-quality', JPEG_QUALITY.toString(), tmp.path],
    ]

    // gnome-screenshot with single -f
    execFile('/bin/bash', ['-c',
      `gnome-screenshot -f "${tmp.path}" 2>/dev/null || ` +
      `scrot -e 'cat "$0"' "${tmp.path}" 2>/dev/null || ` +
      `import -window root "${tmp.path}" 2>/dev/null || ` +
      `xwd -root | convert xwd:- jpg:${tmp.path} 2>/dev/null || ` +
      `echo "NONE_FOUND"`,
    ], { timeout: 10000 }, (error, stdout, stderr) => {
      if (existsSync(tmp.path)) {
        try {
          const data = readFileSync(tmp.path)
          if (data.length > 100) { // sanity check (not empty)
            tmp.cleanup()
            resolve({ data, format: 'jpeg' })
            return
          }
        } catch { /* ignore */ }
      }
      tmp.cleanup()
      resolve(null)
    })
  })
}

export async function captureScreenshot(): Promise<any> {
  let result: { data: Buffer; format: string } | null = null

  if (process.platform === 'win32') {
    result = await screenshotWindows()
  } else if (process.platform === 'darwin') {
    result = await screenshotMacOS()
    if (!result) {
      // Fallback: try with screencapture + ImageMagick
      try {
        const tmp = createTempFile()
        execFile('/usr/bin/screencapture', ['-x', '-t', 'png', tmp.path], { timeout: 10000 }, () => {
          if (existsSync(tmp.path)) {
            try {
              // Use ImageMagick conversion if sharp isn't available
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
        await new Promise(r => setTimeout(r, 3000)) // wait for async
        if (result) return buildResult(result)
      } catch { /* no fallback */ }
    }
  } else if (process.platform === 'linux') {
    result = await screenshotLinux()
  }

  if (!result) {
    return { success: false, error: 'Screenshot capture failed — no screenshot tool available. Install scrot (Linux), or ensure screencapture (macOS) / PowerShell (Windows) works.' }
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
