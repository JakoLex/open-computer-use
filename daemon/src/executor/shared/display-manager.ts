/**
 * Display manager — ported from Electron's display-manager.ts
 * Uses Node.js os.userInfo() + platform-specific commands to detect displays/monitors.
 * Provides: getDisplayList, getActiveDisplay, setActiveDisplay
 */

export interface DisplayInfo {
  id: number
  name: string
  width: number
  height: number
  isPrimary: boolean
  scaleFactor: number
  bounds: { x: number; y: number; width: number; height: number }
}

let activeDisplayId: number | null = null

let currentIdCounter = 0

function nextId(): number {
  return ++currentIdCounter
}

export function getDisplayList(): DisplayInfo[] {
  const displays: DisplayInfo[] = []
  let primaryId = 1

  if (process.platform === 'win32') {
    // Windows: use powershell to detect monitors
    const { execFileSync } = require('child_process')
    try {
      const result = execFileSync('powershell.exe', [
        '-NoProfile', '-Command',
        '[System.Windows.Forms.Screen]::AllScreens | ' +
        'ForEach-Object { $_.Bounds.Left.ToString() + "," + $_.Bounds.Top.ToString() + "," + ' +
        '$_.Bounds.Width.ToString() + "," + $_.Bounds.Height.ToString() + "," + $_.Primary.ToString() }',
      ], { timeout: 5000 }).toString().trim()

      const screens = result.split(';') || []
      let foundPrimary = false

      for (const screen of screens) {
        if (!screen.trim()) continue
        const [x, y, width, height, primary] = screen.split(',')
        const isPrimary = !foundPrimary || primary?.trim().toLowerCase() === 'true'
        if (isPrimary && !foundPrimary) {
          foundPrimary = true
          primaryId = 1
        }
        const id = isPrimary ? 1 : nextId()
        displays.push({
          id,
          name: isPrimary ? 'Main Display' : `Display ${id}`,
          width: parseInt(width) || 1920,
          height: parseInt(height) || 1080,
          isPrimary,
          scaleFactor: 1,
          bounds: {
            x: parseInt(x) || 0,
            y: parseInt(y) || 0,
            width: parseInt(width) || 1920,
            height: parseInt(height) || 1080,
          },
        })
      }
    } catch { /* fallback to primary only */ }
  } else if (process.platform === 'darwin') {
    // macOS: use screen command to detect displays
    const { execFileSync } = require('child_process')
    try {
      const result = execFileSync('/usr/sbin/system_profiler', [
        'SPDisplaysDataType', '-json',
      ], { timeout: 5000 }).toString().trim()

      // Fallback: use 'screen' CLI if available
      let foundPrimary = false
      try {
        const screens = execFileSync('/bin/bash', [
          '-c',
          'screeninfo 2>/dev/null | grep -oP \'Monitor [^:]+: \\d+x\\d+\\+\\d+\\+\\d+\' || ' +
          'system_profiler SPDisplaysDataType 2>/dev/null | grep "Resolution" | head -2',
        ], { timeout: 5000 }).toString().trim()

        if (screens) {
          const lines = screens.split('\n')
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim()
            if (!line) continue
            const match = line.match(/(\d+)x(\d+)\+(\d+)\+(\d+)/)
            if (match) {
              const [, width, height, x, y] = match
              const id = i === 0 ? 1 : nextId()
              const isPrimary = i === 0
              if (isPrimary && !foundPrimary) {
                foundPrimary = true
                primaryId = 1
              }
              displays.push({
                id,
                name: isPrimary ? 'Main Display' : `Display ${i + 1}`,
                width: parseInt(width),
                height: parseInt(height),
                isPrimary,
                scaleFactor: 1,
                bounds: {
                  x: parseInt(x) || 0,
                  y: parseInt(y) || 0,
                  width: parseInt(width),
                  height: parseInt(height),
                },
              })
            }
          }
        }
      } catch { /* no screeninfo */ }
    } catch { /* fallback to primary only */ }
  }

  // Fallback: single primary display covering 0,0 at 1920x1080
  if (displays.length === 0) {
    displays.push({
      id: 1,
      name: 'Main Display',
      width: 1920,
      height: 1080,
      isPrimary: true,
      scaleFactor: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    })
  }

  // Ensure exactly one primary
  const primaryExists = displays.some(d => d.isPrimary)
  if (!primaryExists && displays.length > 0) {
    displays[0].isPrimary = true
    displays[0].name = 'Main Display'
  }

  return displays
}

export function getActiveDisplayId(): number | null {
  const displays = getDisplayList()
  if (activeDisplayId !== null) {
    if (displays.some(d => d.id === activeDisplayId)) {
      return activeDisplayId
    }
    console.warn(`[DisplayManager] Display ${activeDisplayId} not found, falling back to primary`)
    activeDisplayId = null
  }

  const primary = displays.find(d => d.isPrimary)
  return primary ? primary.id : null
}

export function setActiveDisplayId(id: number | null): void {
  const displays = getDisplayList()
  if (id !== null && !displays.some(d => d.id === id)) {
    console.warn(`[DisplayManager] Display ${id} not found, falling back to primary`)
    id = null
  }
  activeDisplayId = id
}

export function getActiveDisplay(): Pick<DisplayInfo, 'id' | 'name' | 'width' | 'height' | 'isPrimary' | 'scaleFactor' | 'bounds'> {
  const displays = getDisplayList()
  const id = getActiveDisplayId()
  const match = id !== null ? displays.find((d) => d.id === id) : undefined
  if (match) return match

  // Display disconnected — fall back to primary
  console.warn(`[DisplayManager] Falling back to primary display`)
  return displays[0] || {
    id: 1, name: 'Main Display', width: 1920, height: 1080,
    isPrimary: true, scaleFactor: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  }
}

export function getActiveDisplaySize(): { width: number; height: number } {
  const d = getActiveDisplay()
  return { width: d.width, height: d.height }
}
