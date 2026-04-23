/**
 * Display manager — detects displays/monitors using platform-specific methods.
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

function parseXrandrOutput(): DisplayInfo[] {
  const { execFileSync } = require('child_process')
  const displays: DisplayInfo[] = []

  try {
    const result = execFileSync('xrandr', ['--query'], { timeout: 5000 }).toString()

    const lines = result.split('\n')
    let currentOutput: { name: string; connected: boolean } | null = null

    for (const line of lines) {
      const connectedMatch = line.match(/^(\S+)\s+connected/)
      if (connectedMatch) {
        currentOutput = { name: connectedMatch[1], connected: true }
      } else if (line.trim().startsWith('connected')) {
        const match = line.trim().match(/^connected\s+(\S+)/)
        if (match) {
          currentOutput = { name: match[1], connected: true }
        }
      }

      if (currentOutput && line.includes('primary')) {
        const boundsMatch = line.match(/(\d+)x(\d+)\+(\d+)\+(\d+)/)
        if (boundsMatch) {
          const [, width, height, x, y] = boundsMatch
          const id = displays.length === 0 ? 1 : nextId()
          const isPrimary = displays.length === 0
          displays.push({
            id,
            name: currentOutput.name || `Display ${id}`,
            width: parseInt(width),
            height: parseInt(height),
            isPrimary,
            scaleFactor: 1,
            bounds: { x: parseInt(x), y: parseInt(y), width: parseInt(width), height: parseInt(height) },
          })
          currentOutput = null
        }
      } else if (currentOutput && line.match(/^\s*(\d+)x(\d+)/) && !line.includes('connected')) {
        const match = line.match(/^\s*(\d+)x(\d+)\+(\d+)\+(\d+)/)
        if (match && line.trim() !== '') {
          const [, width, height, x, y] = match
          const id = displays.length === 0 ? 1 : nextId()
          const isPrimary = displays.length === 0
          displays.push({
            id,
            name: currentOutput.name || `Display ${id}`,
            width: parseInt(width),
            height: parseInt(height),
            isPrimary,
            scaleFactor: 1,
            bounds: { x: parseInt(x), y: parseInt(y), width: parseInt(width), height: parseInt(height) },
          })
          currentOutput = null
        }
      }
    }
  } catch {
    // xrandr failed — fall through to screeninfo or defaults
  }

  // Fallback: try screeninfo
  if (displays.length === 0) {
    try {
      const result = execFileSync('python3', ['-c', `
import subprocess, sys
try:
    import screeninfo
    monitors = screeninfo.get_monitors()
    for i, m in enumerate(monitors):
        is_primary = "PRIMARY" in str(m) if hasattr(m, 'is_primary') else i == 0
        print(f"{m.name},{m.width},{m.height},{m.x},{m.y},{is_primary}")
except ImportError:
    print("NOT_INSTALLED")
`], { timeout: 5000 }).toString()

      if (result.trim() !== 'NOT_INSTALLED') {
        for (const line of result.trim().split('\n')) {
          const [name, width, height, x, y, isPrimary] = line.split(',')
          const id = parseInt(width) || nextId()
          displays.push({
            id,
            name: name || `Display ${id}`,
            width: parseInt(width) || 1920,
            height: parseInt(height) || 1080,
            isPrimary: isPrimary === 'True',
            scaleFactor: 1,
            bounds: { x: parseInt(x) || 0, y: parseInt(y) || 0, width: parseInt(width) || 1920, height: parseInt(height) || 1080 },
          })
        }
      }
    } catch { /* screeninfo not available */ }
  }

  return displays
}

function detectLinuxDisplayInfo(): DisplayInfo[] {
  // Try Wayland-specific tools first
  const { execFileSync, spawnSync } = require('child_process')

  // Try hyprctl (Hyprland)
  if (process.env.HYPRLAND_CMD || process.env.HYPRLAND_INSTANCE_SIGNATURE) {
    try {
      const result = execFileSync('hyprctl', ['monitors'], { timeout: 5000 }).toString()
      const lines = result.trim().split('\n\n')
      const displays: DisplayInfo[] = []

      for (const block of lines) {
        const nameMatch = block.match(/name\s+(.*)/)
        const resMatch = block.match(/resolution\s+(.*)/)
        const posMatch = block.match(/origin\s+(.*)/)
        const isPrimary = block.includes('current') || posMatch?.index === 0

        if (nameMatch && resMatch && posMatch) {
          const resolution = resMatch[1].split(' ').map(Number)
          const origin = posMatch[1].split(' ').map(Number)
          displays.push({
            id: displays.length + 1,
            name: nameMatch[1].trim(),
            width: resolution[0],
            height: resolution[1],
            isPrimary: isPrimary && !displays.some(d => d.isPrimary),
            scaleFactor: 1,
            bounds: { x: origin[0], y: origin[1], width: resolution[0], height: resolution[1] },
          })
        }
      }

      if (displays.length > 0) return displays
    } catch { /**/ }
  }

  // Try wayland display server tools
  if (process.env.WAYLAND_DISPLAY) {
    // Try wlrctl
    try {
      const result = execFileSync('wlrctl', ['output', '--print'], { timeout: 5000 }).toString()
      // Parse wlrctl output if available
    } catch { /**/ }
  }

  // Fall back to xrandr (works via XWayland on Wayland too)
  try {
    return parseXrandrOutput()
  } catch { /**/ }

  return []
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
    // macOS: use system_profiler to detect displays
    const { execFileSync } = require('child_process')
    try {
      const result = execFileSync('/usr/sbin/system_profiler', [
        'SPDisplaysDataType', '-json',
      ], { timeout: 5000 }).toString()

      // Fallback: use 'screeninfo' or system_profiler
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

  // Linux: detect displays
  if (process.platform === 'linux') {
    const linuxDisplays = detectLinuxDisplayInfo()
    if (linuxDisplays.length > 0) {
      linuxDisplays.forEach(d => displays.push(d))
    }
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
