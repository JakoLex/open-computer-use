/**
 * Desktop automation — mouse/keyboard/scroll/drag (all platforms).
 *
 * Uses platform-native tools:
 * - Windows: PowerShell + user32.dll calls
 * - macOS: CoreGraphics via inline Swift scripts
 * - Linux: xdotool/wmctrl
 */

import { execFile, spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { isAccessibilityGranted } from '../shared/permissions'

let _hasPromptedAccessibility = false

function requireAccessibility(): { success: false; error: string; permissionDenied?: true; permissionType?: 'accessibility' } | null {
  if (process.platform !== 'darwin') return null
  if (isAccessibilityGranted()) return null

  if (!_hasPromptedAccessibility) {
    _hasPromptedAccessibility = true
    console.warn('[Desktop] macOS Accessibility permission required. Open System Settings > Privacy & Security > Accessibility and enable terminal/Node.js.')
  }

  return {
    success: false,
    error: 'macOS Accessibility permission is required for desktop automation (clicks, typing, scrolling). Open System Settings > Privacy & Security > Accessibility and enable your terminal.',
    permissionDenied: true,
    permissionType: 'accessibility',
  }
}

function runPowershell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', script], {
      timeout: 10000,
    }, (error, stdout, stderr) => {
      if (error) reject(error)
      else resolve(stdout.trim())
    })
  })
}

function runBash(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('/bin/bash', ['-c', command], {
      timeout: 10000,
    }, (error, stdout, stderr) => {
      if (error) reject(error)
      else resolve(stdout.trim())
    })
  })
}

function runBashWithEnv(command: string, envOverrides?: Record<string, string | undefined>): Promise<string> {
  return new Promise((resolve, reject) => {
    const opts = { timeout: 10000, ...envOverrides }
    execFile('/bin/bash', ['-c', command], opts, (error, stdout, stderr) => {
      if (error) reject(error)
      else resolve(stdout.trim())
    })
  })
}

function runSwift(code: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('swift', ['-'], { timeout: 10000 })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => { stdout += d })
    proc.stderr.on('data', (d) => { stderr += d })
    proc.on('close', (exitCode) => {
      if (exitCode !== 0) reject(new Error(stderr.trim() || `swift exited with code ${exitCode}`))
      else resolve(stdout.trim())
    })
    proc.on('error', reject)
    proc.stdin.write(code)
    proc.stdin.end()
  })
}

let _xauthorityCache: string | null = null

function discoverXauthority(): string | null {
  if (_xauthorityCache) return _xauthorityCache
  try {
    const uid = os.userInfo().uid
    const home = os.homedir()
    const xauthDir = `/run/user/${uid}`
    if (fs.existsSync(xauthDir)) {
      const files = fs.readdirSync(xauthDir)
        .filter(f => f.startsWith('xauth_') || f.startsWith('.xauth'))
        .sort()
      if (files.length > 0) {
        _xauthorityCache = path.join(xauthDir, files[files.length - 1])
        return _xauthorityCache
      }
    }
    const iceAuth = path.join(home, '.ICEauthority')
    if (fs.existsSync(iceAuth)) {
      _xauthorityCache = iceAuth
      return _xauthorityCache
    }
    const xauth = path.join(home, '.Xauthority')
    if (fs.existsSync(xauth)) {
      _xauthorityCache = xauth
      return xauth
    }
  } catch (_) {}
  return null
}

function getLinuxX11Env(): Record<string, string | undefined> {
  const xauthFile = discoverXauthority() || null
  return {
    DISPLAY: ':0',
    ...(xauthFile ? { XAUTHORITY: xauthFile } : {}),
  }
}

function validateInt(v: any, name: string): number {
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`Invalid ${name}: expected a number`)
  return Math.round(n)
}

function runOsascript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-e', script], { timeout: 10000 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout.trim())
    })
  })
}

function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

const KEY_MAP_XDOTOOL: Record<string, string> = {
  enter: 'Return', return: 'Return', tab: 'Tab',
  escape: 'Escape', esc: 'Escape',
  backspace: 'BackSpace', delete: 'Delete',
  up: 'Up', down: 'Down', left: 'Left', right: 'Right',
  home: 'Home', end: 'End', pageup: 'Page_Up', pagedown: 'Page_Down', space: 'space',
  insert: 'Insert', capslock: 'Caps_Lock',
  numlock: 'Num_Lock', scrolllock: 'Scroll_Lock',
  printscreen: 'Print', prtsc: 'Print', menu: 'Menu',
  f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5', f6: 'F6',
  f7: 'F7', f8: 'F8', f9: 'F9', f10: 'F10', f11: 'F11', f12: 'F12',
}

const MODIFIER_MAP_XDOTOOL: Record<string, string> = {
  ctrl: 'ctrl', control: 'ctrl',
  alt: 'alt', option: 'alt',
  shift: 'shift',
  cmd: 'super', command: 'super', win: 'super', super: 'super', meta: 'super',
}

const VK_CODES: Record<string, number> = {
  win: 0x5B, lwin: 0x5B, rwin: 0x5C, super: 0x5B, command: 0x5B, cmd: 0x5B,
  ctrl: 0xA2, lctrl: 0xA2, rctrl: 0xA3, control: 0xA2,
  alt: 0xA4, lalt: 0xA4, ralt: 0xA5, menu: 0xA4,
  shift: 0xA0, lshift: 0xA0, rshift: 0xA1,
  enter: 0x0D, return: 0x0D,
  tab: 0x09, escape: 0x1B, esc: 0x1B,
  backspace: 0x08, delete: 0x2E, del: 0x2E, space: 0x20,
  insert: 0x2D, capslock: 0x14,
  numlock: 0x90, scrolllock: 0x91,
  printscreen: 0x2C, prtsc: 0x2C,
  up: 0x26, down: 0x28, left: 0x25, right: 0x27,
  home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
  apps: 0x5D,
  f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75,
  f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7A, f12: 0x7B,
  a: 0x41, b: 0x42, c: 0x43, d: 0x44, e: 0x45, f: 0x46, g: 0x47,
  h: 0x48, i: 0x49, j: 0x4A, k: 0x4B, l: 0x4C, m: 0x4D, n: 0x4E,
  o: 0x4F, p: 0x50, q: 0x51, r: 0x52, s: 0x53, t: 0x54, u: 0x55,
  v: 0x56, w: 0x57, x: 0x58, y: 0x59, z: 0x5A,
  '0': 0x30, '1': 0x31, '2': 0x32, '3': 0x33, '4': 0x34,
  '5': 0x35, '6': 0x36, '7': 0x37, '8': 0x38, '9': 0x39,
}

const WIN_MODIFIERS = new Set(['ctrl', 'control', 'lctrl', 'rctrl', 'alt', 'lalt', 'ralt', 'menu', 'shift', 'lshift', 'rshift', 'win', 'lwin', 'rwin', 'super', 'command', 'cmd'])

function buildKeybdEventScript(keys: { vk: number; isModifier: boolean }[]): string {
  const lines = [
    'Add-Type @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class KbdOps {',
    '    [DllImport("user32.dll")]',
    '    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);',
    '    public const uint KEYEVENTF_KEYUP = 0x02;',
    '}',
    '"@',
  ]

  const modifiers = keys.filter(k => k.isModifier)
  const nonModifiers = keys.filter(k => !k.isModifier)

  for (const m of modifiers) {
    lines.push(`[KbdOps]::keybd_event(${m.vk}, 0, 0, 0)`)
  }
  if (modifiers.length > 0) lines.push('Start-Sleep -Milliseconds 50')

  for (const k of nonModifiers) {
    lines.push(`[KbdOps]::keybd_event(${k.vk}, 0, 0, 0)`)
    lines.push('Start-Sleep -Milliseconds 30')
    lines.push(`[KbdOps]::keybd_event(${k.vk}, 0, [KbdOps]::KEYEVENTF_KEYUP, 0)`)
  }

  if (nonModifiers.length === 0) {
    lines.push('Start-Sleep -Milliseconds 50')
  }

  for (const m of [...modifiers].reverse()) {
    lines.push(`[KbdOps]::keybd_event(${m.vk}, 0, [KbdOps]::KEYEVENTF_KEYUP, 0)`)
  }

  return lines.join('\n')
}

function needsKeybdEvent(keys: string[]): boolean {
  return keys.some(k => {
    const lower = k.toLowerCase()
    return lower === 'win' || lower === 'lwin' || lower === 'rwin' ||
           lower === 'super' || lower === 'command' || lower === 'cmd'
  })
}

const KEY_MAP_WIN: Record<string, string> = {
  enter: '{ENTER}', tab: '{TAB}', escape: '{ESC}', esc: '{ESC}',
  backspace: '{BACKSPACE}', delete: '{DELETE}',
  up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
  home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}', space: ' ',
  insert: '{INSERT}', capslock: '{CAPSLOCK}',
  numlock: '{NUMLOCK}', scrolllock: '{SCROLLLOCK}',
  printscreen: '{PRTSC}', prtsc: '{PRTSC}',
  f1: '{F1}', f2: '{F2}', f3: '{F3}', f4: '{F4}', f5: '{F5}', f6: '{F6}',
  f7: '{F7}', f8: '{F8}', f9: '{F9}', f10: '{F10}', f11: '{F11}', f12: '{F12}',
}

const KEY_MAP_MACOS: Record<string, number> = {
  enter: 36, return: 36,
  tab: 48,
  space: 49,
  backspace: 51, delete: 51,
  escape: 53, esc: 53,
  up: 126, down: 125, left: 123, right: 124,
  home: 115, end: 119,
  pageup: 116, pagedown: 121,
  forwarddelete: 117,
  capslock: 57,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97,
  f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
}

const MAC_KEY_NORMALIZATION: Record<string, string> = {
  ctrl: 'cmd', control: 'cmd', lctrl: 'cmd', rctrl: 'cmd',
  alt: 'option', lalt: 'option', ralt: 'option', menu: 'option',
  win: 'cmd', lwin: 'cmd', rwin: 'cmd', super: 'cmd', windows: 'cmd', meta: 'cmd',
  fn: 'fn', function: 'fn',
  backspace: 'backspace', delete: 'forwarddelete', del: 'forwarddelete',
  esc: 'escape', return: 'enter',
}

function normalizeKeysForPlatform(keys: string[]): string[] {
  if (process.platform !== 'darwin') return keys
  return keys.map(k => {
    const lower = k.toLowerCase()
    return MAC_KEY_NORMALIZATION[lower] ?? k
  })
}

function safeXdotoolKey(key: string): string {
  const lower = key.toLowerCase()
  const mapped = KEY_MAP_XDOTOOL[lower] || MODIFIER_MAP_XDOTOOL[lower]
  if (mapped) return mapped
  if (/^[a-zA-Z0-9]$/.test(key)) return key
  throw new Error(`Unknown key for automation: "${key}"`)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function desktopClick(params: {
  x: number
  y: number
  button?: string
}): Promise<any> {
  try {
    const denied = requireAccessibility()
    if (denied) return denied

    const x = validateInt(params.x, 'x')
    const y = validateInt(params.y, 'y')
    const button = params.button === 'right' ? 'right' : 'left'

    if (process.platform === 'win32') {
      const clickType = button === 'right' ? 'RightClick' : 'Click'
      await runPowershell(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);
    public const int MOUSEEVENTF_LEFTDOWN = 0x02;
    public const int MOUSEEVENTF_LEFTUP = 0x04;
    public const int MOUSEEVENTF_RIGHTDOWN = 0x08;
    public const int MOUSEEVENTF_RIGHTUP = 0x10;
}
"@
${button === 'right'
  ? '[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0); [MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)'
  : '[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); [MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)'}
`)
    } else if (process.platform === 'linux') {
      await runBashWithEnv(`xdotool mousemove ${x} ${y} click ${button === 'right' ? '3' : '1'}`, getLinuxX11Env())
    } else if (process.platform === 'darwin') {
      const downType = button === 'right' ? ".rightMouseDown" : '.leftMouseDown'
      const upType = button === 'right' ? ".rightMouseUp" : '.leftMouseUp'
      const btn = button === 'right' ? '.right' : '.left'
      await runSwift(`
import Cocoa
let pt = CGPoint(x: ${x}, y: ${y})
CGEvent(mouseEventSource: nil, mouseType: ${downType}, mouseCursorPosition: pt, mouseButton: ${btn})?.post(tap: .cghidEventTap)
usleep(50000)
CGEvent(mouseEventSource: nil, mouseType: ${upType}, mouseCursorPosition: pt, mouseButton: ${btn})?.post(tap: .cghidEventTap)
`)
    }

    return { success: true, message: `Clicked at (${x}, ${y})` }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function desktopClickWithModifiers(params: {
  x: number
  y: number
  button?: string
  hold_keys?: string[]
  clicks?: number
}): Promise<any> {
  try {
    const denied = requireAccessibility()
    if (denied) return denied

    const x = validateInt(params.x, 'x')
    const y = validateInt(params.y, 'y')
    const button = params.button === 'right' ? 'right' : (params.button === 'middle' ? 'middle' : 'left')
    const clicks = validateInt(params.clicks ?? 1, 'clicks')
    const keys = normalizeKeysForPlatform(params.hold_keys ?? [])

    if (process.platform === 'win32') {
      const vkKeys = keys.map(k => ({
        vk: VK_CODES[k.toLowerCase()] || k.toUpperCase().charCodeAt(0),
        isModifier: true,
      }))
      const downFlags = button === 'right' ? '0x08' : '0x02'
      const upFlags = button === 'right' ? '0x10' : '0x04'
      const lines = [
        'Add-Type -AssemblyName System.Windows.Forms',
        'Add-Type @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        'public class ModClickOps {',
        '    [DllImport("user32.dll")]',
        '    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);',
        '    [DllImport("user32.dll")]',
        '    public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);',
        '    public const uint KEYEVENTF_KEYUP = 0x02;',
        '}',
        '"@',
      ]
      for (const k of vkKeys) {
        lines.push(`[ModClickOps]::keybd_event(${k.vk}, 0, 0, 0)`)
      }
      lines.push('Start-Sleep -Milliseconds 50')
      lines.push(`[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`)
      lines.push('Start-Sleep -Milliseconds 30')
      for (let i = 0; i < clicks; i++) {
        lines.push(`[ModClickOps]::mouse_event(${downFlags}, 0, 0, 0, 0)`)
        lines.push(`[ModClickOps]::mouse_event(${upFlags}, 0, 0, 0, 0)`)
        if (i < clicks - 1) lines.push('Start-Sleep -Milliseconds 50')
      }
      lines.push('Start-Sleep -Milliseconds 30')
      for (const k of [...vkKeys].reverse()) {
        lines.push(`[ModClickOps]::keybd_event(${k.vk}, 0, [ModClickOps]::KEYEVENTF_KEYUP, 0)`)
      }
      await runPowershell(lines.join('\n'))
    } else if (process.platform === 'linux') {
      const linuxEnv = getLinuxX11Env()
      const parts: string[] = []
      for (const key of keys) {
        parts.push(`xdotool keydown ${safeXdotoolKey(key)}`)
      }
      const xdoBtn = button === 'right' ? 3 : button === 'middle' ? 2 : 1
      parts.push(`xdotool mousemove ${x} ${y}`)
      if (clicks >= 2) {
        parts.push(`xdotool click --repeat ${clicks} --delay 80 ${xdoBtn}`)
      } else {
        parts.push(`xdotool click ${xdoBtn}`)
      }
      for (const key of keys) {
        parts.push(`xdotool keyup ${safeXdotoolKey(key)}`)
      }
      await runBashWithEnv(parts.join(' && '), linuxEnv)
    } else if (process.platform === 'darwin') {
      const flagMap: Record<string, string> = {
        shift: '.maskShift', cmd: '.maskCommand', command: '.maskCommand',
        option: '.maskAlternate', alt: '.maskAlternate',
        ctrl: '.maskControl', control: '.maskControl', fn: '.maskSecondaryFn',
      }
      const flags = keys
        .map(k => flagMap[k.toLowerCase()])
        .filter(Boolean)
      const flagExpr = flags.length > 0
        ? `CGEventFlags([${flags.join(', ')}])`
        : 'CGEventFlags(rawValue: 0)'
      const downType = button === 'right' ? ".rightMouseDown" : '.leftMouseDown'
      const upType = button === 'right' ? ".rightMouseUp" : '.leftMouseUp'
      const btn = button === 'right' ? '.right' : '.left'

      let swiftCode = `
import Cocoa
let pt = CGPoint(x: ${x}, y: ${y})
let flags = ${flagExpr}
`
      for (let i = 0; i < clicks; i++) {
        const clickState = i + 1
        swiftCode += `
let down${i} = CGEvent(mouseEventSource: nil, mouseType: ${downType}, mouseCursorPosition: pt, mouseButton: ${btn})
down${i}?.flags = flags
down${i}?.setIntegerValueField(.mouseEventClickState, value: ${clickState})
down${i}?.post(tap: .cghidEventTap)
usleep(30000)
let up${i} = CGEvent(mouseEventSource: nil, mouseType: ${upType}, mouseCursorPosition: pt, mouseButton: ${btn})
up${i}?.flags = flags
up${i}?.setIntegerValueField(.mouseEventClickState, value: ${clickState})
up${i}?.post(tap: .cghidEventTap)
`
        if (i < clicks - 1) swiftCode += 'usleep(50000)\n'
      }
      await runSwift(swiftCode)
    }

    return { success: true, message: `Clicked at (${x}, ${y}) with modifiers [${keys.join(', ')}]` }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function desktopDoubleClick(params: {
  x: number
  y: number
}): Promise<any> {
  try {
    const denied = requireAccessibility()
    if (denied) return denied

    const x = validateInt(params.x, 'x')
    const y = validateInt(params.y, 'y')

    if (process.platform === 'win32') {
      await runPowershell(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps2 {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);
    public const int MOUSEEVENTF_LEFTDOWN = 0x02;
    public const int MOUSEEVENTF_LEFTUP = 0x04;
}
"@
[MouseOps2]::mouse_event([MouseOps2]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
[MouseOps2]::mouse_event([MouseOps2]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
[MouseOps2]::mouse_event([MouseOps2]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
[MouseOps2]::mouse_event([MouseOps2]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
`)
    } else if (process.platform === 'linux') {
      await runBashWithEnv(`xdotool mousemove ${x} ${y} click --repeat 2 1`, getLinuxX11Env())
    } else if (process.platform === 'darwin') {
      await runSwift(`
import Cocoa
let pt = CGPoint(x: ${x}, y: ${y})
let down1 = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: pt, mouseButton: .left)
down1?.post(tap: .cghidEventTap)
usleep(30000)
let up1 = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: pt, mouseButton: .left)
up1?.post(tap: .cghidEventTap)
usleep(50000)
let down2 = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: pt, mouseButton: .left)
down2?.setIntegerValueField(.mouseEventClickState, value: 2)
down2?.post(tap: .cghidEventTap)
usleep(30000)
let up2 = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: pt, mouseButton: .left)
up2?.setIntegerValueField(.mouseEventClickState, value: 2)
up2?.post(tap: .cghidEventTap)
`)
    }

    return { success: true, message: `Double-clicked at (${x}, ${y})` }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function desktopType(params: { text: string }): Promise<any> {
  try {
    const denied = requireAccessibility()
    if (denied) return denied

    const { text } = params

    if (process.platform === 'win32') {
      const escaped = text
        .replace(/[+^%~(){}[\]]/g, '{$&}')
      await runPowershell(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}')
`)
  } else if (process.platform === 'linux') {
       await runBashWithEnv(`xdotool type --clearmodifiers -- ${JSON.stringify(text)}`, getLinuxX11Env())
    } else if (process.platform === 'darwin') {
      await runOsascript(`tell application "System Events" to keystroke "${escapeAppleScript(text)}"`)
    }

    return { success: true, message: `Typed "${text.slice(0, 50)}"` }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function desktopKeyPress(params: { keys: string[] }): Promise<any> {
  try {
    const denied = requireAccessibility()
    if (denied) return denied

    const { keys: rawKeys } = params
    const keys = normalizeKeysForPlatform(rawKeys)

    if (process.platform === 'win32') {
      if (needsKeybdEvent(keys)) {
        const vkKeys = keys.map(k => ({
          vk: VK_CODES[k.toLowerCase()] || k.toUpperCase().charCodeAt(0),
          isModifier: WIN_MODIFIERS.has(k.toLowerCase()),
        }))
        await runPowershell(buildKeybdEventScript(vkKeys))
      } else {
        const sendKeys = keys.map(k => KEY_MAP_WIN[k.toLowerCase()] || k).join('')
        await runPowershell(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${sendKeys.replace(/'/g, "''")}')
`)
      }
 } else if (process.platform === 'linux') {
       const x11env = getLinuxX11Env()
       for (const key of keys) {
         const mapped = safeXdotoolKey(key)
         await runBashWithEnv(`xdotool key ${mapped}`, x11env)
       }
    } else if (process.platform === 'darwin') {
      for (const key of keys) {
        const lower = key.toLowerCase()
        const macKeyCode = KEY_MAP_MACOS[lower]
        if (macKeyCode !== undefined) {
          await runOsascript(`tell application "System Events" to key code ${macKeyCode}`)
        } else {
          await runOsascript(`tell application "System Events" to keystroke "${escapeAppleScript(key)}"`)
        }
      }
    }

    return { success: true, message: `Pressed keys: ${keys.join(', ')}` }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function desktopKeyCombo(params: { keys: string[] }): Promise<any> {
  try {
    const denied = requireAccessibility()
    if (denied) return denied

    const { keys: rawKeys } = params
    const keys = normalizeKeysForPlatform(rawKeys)

    if (keys.length === 1) {
      return desktopKeyPress({ keys })
    }
    if (keys.length === 0) {
      return { success: false, error: 'No keys specified' }
    }

    if (process.platform === 'win32') {
      const vkKeys = keys.map(k => ({
        vk: VK_CODES[k.toLowerCase()] || k.toUpperCase().charCodeAt(0),
        isModifier: WIN_MODIFIERS.has(k.toLowerCase()),
      }))
      await runPowershell(buildKeybdEventScript(vkKeys))
    } else if (process.platform === 'linux') {
      const modifiers: string[] = []
      let finalKey = ''
      for (const key of keys) {
        const lower = key.toLowerCase()
        if (MODIFIER_MAP_XDOTOOL[lower]) {
          modifiers.push(MODIFIER_MAP_XDOTOOL[lower])
        } else {
          finalKey = safeXdotoolKey(key)
        }
      }
      const combo = [...modifiers, finalKey].join('+')
      await runBashWithEnv(`xdotool key ${combo}`, getLinuxX11Env())
    } else if (process.platform === 'darwin') {
      const modifiers: string[] = []
      let finalKey = ''
      for (const key of keys) {
        const lower = key.toLowerCase()
        if (['ctrl', 'control', 'alt', 'option', 'shift', 'cmd', 'command', 'win', 'super', 'meta', 'fn', 'function'].includes(lower)) {
          const mapped = (lower === 'ctrl' || lower === 'control') ? 'control down'
            : (lower === 'alt' || lower === 'option') ? 'option down'
            : (lower === 'cmd' || lower === 'command' || lower === 'win' || lower === 'super' || lower === 'meta') ? 'command down'
            : (lower === 'fn' || lower === 'function') ? 'fn down'
            : `${lower} down`
          modifiers.push(mapped)
        } else {
          finalKey = key
        }
      }
      const using = modifiers.length ? ` using {${modifiers.join(', ')}}` : ''
      const macKeyCode = KEY_MAP_MACOS[finalKey.toLowerCase()]
      if (macKeyCode !== undefined) {
        await runOsascript(`tell application "System Events" to key code ${macKeyCode}${using}`)
      } else {
        await runOsascript(`tell application "System Events" to keystroke "${escapeAppleScript(finalKey)}"${using}`)
      }
    }

    return { success: true, message: `Key combo: ${keys.join('+')}` }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function desktopScroll(params: {
  clicks: number
  direction?: 'vertical' | 'horizontal'
  x?: number
  y?: number
}): Promise<any> {
  try {
    const denied = requireAccessibility()
    if (denied) return denied

    const rawClicks = validateInt(params.clicks, 'clicks')
    const direction = params.direction ?? 'vertical'
    const x = params.x !== undefined ? validateInt(params.x, 'x') : undefined
    const y = params.y !== undefined ? validateInt(params.y, 'y') : undefined
    const MAX_SCROLL_CLICKS = 500
    const amount = Math.min(Math.abs(rawClicks), MAX_SCROLL_CLICKS)
    const scrollUp = rawClicks > 0

    if (process.platform === 'win32') {
      const moveScript = (x !== undefined && y !== undefined)
        ? `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})\nStart-Sleep -Milliseconds 100\n`
        : ''
      const wheelDelta = (0x0800) | ((scrollUp ? 120 : -120) * amount)
      await runPowershell(`
Add-Type -AssemblyName System.Windows.Forms
${moveScript}Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ScrollOps {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    public const int MOUSEEVENTF_WHEEL = 0x0800;
}
"@
[ScrollOps]::mouse_event([ScrollOps]::MOUSEEVENTF_WHEEL, 0, 0, ${(scrollUp ? 120 : -120) * amount}, 0)
`)
    } else if (process.platform === 'linux') {
      const linuxEnv = getLinuxX11Env()
      const parts: string[] = []
      if (x !== undefined && y !== undefined) {
        parts.push(`xdotool mousemove ${x} ${y}`)
      }
      const button = scrollUp ? 4 : 5
      parts.push(`xdotool click --repeat ${amount} --delay 50 ${button}`)
      await runBashWithEnv(parts.join(' && '), linuxEnv)
    } else if (process.platform === 'darwin') {
      const delta = scrollUp ? amount * 3 : -(amount * 3)
      const moveCmd = (x !== undefined && y !== undefined)
        ? `CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: ${x}, y: ${y}), mouseButton: .left)?.post(tap: .cghidEventTap)\nusleep(50000)\n`
        : ''
      await runSwift(`
import Cocoa
${moveCmd}if let scrollEvent = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: Int32(${delta}), wheel2: 0, wheel3: 0) {
    scrollEvent.post(tap: .cghidEventTap)
}
`)
    }

    return { success: true, message: `Scrolled ${scrollUp ? 'up' : 'down'} ${amount} clicks` }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function desktopDrag(params: {
  x1: number
  y1: number
  x2: number
  y2: number
  hold_keys?: string[]
}): Promise<any> {
  try {
    const denied = requireAccessibility()
    if (denied) return denied

    const x1 = validateInt(params.x1, 'x1')
    const y1 = validateInt(params.y1, 'y1')
    const x2 = validateInt(params.x2, 'x2')
    const y2 = validateInt(params.y2, 'y2')
    const hold_keys = params.hold_keys ?? []

    if (process.platform === 'win32') {
      const xm = Math.round((x1 + x2) / 2), ym = Math.round((y1 + y2) / 2)
      const modVks = hold_keys.map(k => VK_CODES[k.toLowerCase()] || k.toUpperCase().charCodeAt(0))

      const lines = [
        'Add-Type -AssemblyName System.Windows.Forms',
        'Add-Type @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        'public class DragOps {',
        '    [DllImport("user32.dll")]',
        '    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);',
        '    [DllImport("user32.dll")]',
        '    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);',
        '    [DllImport("user32.dll")]',
        '    public static extern int GetSystemMetrics(int nIndex);',
        '    public const int MOUSEEVENTF_MOVE = 0x0001;',
        '    public const int MOUSEEVENTF_LEFTDOWN = 0x02;',
        '    public const int MOUSEEVENTF_LEFTUP = 0x04;',
        '    public const int MOUSEEVENTF_ABSOLUTE = 0x8000;',
        '    public const uint KEYEVENTF_KEYUP = 0x02;',
        '}',
        '"@',
        '$sw = [DragOps]::GetSystemMetrics(0)',
        '$sh = [DragOps]::GetSystemMetrics(1)',
      ]
      const absCoord = (px: number, py: number) =>
        `[int](${px} * 65536 / $sw + 0.5), [int](${py} * 65536 / $sh + 0.5)`

      for (const vk of modVks) {
        lines.push(`[DragOps]::keybd_event(${vk}, 0, 0, 0)`)
      }
      if (modVks.length > 0) lines.push('Start-Sleep -Milliseconds 50')
      lines.push(`[DragOps]::mouse_event([DragOps]::MOUSEEVENTF_MOVE -bor [DragOps]::MOUSEEVENTF_ABSOLUTE, ${absCoord(x1, y1)}, 0, 0)`)
      lines.push('Start-Sleep -Milliseconds 100')
      lines.push('[DragOps]::mouse_event([DragOps]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)')
      lines.push('Start-Sleep -Milliseconds 50')
      lines.push(`[DragOps]::mouse_event([DragOps]::MOUSEEVENTF_MOVE -bor [DragOps]::MOUSEEVENTF_ABSOLUTE, ${absCoord(xm, ym)}, 0, 0)`)
      lines.push('Start-Sleep -Milliseconds 50')
      lines.push(`[DragOps]::mouse_event([DragOps]::MOUSEEVENTF_MOVE -bor [DragOps]::MOUSEEVENTF_ABSOLUTE, ${absCoord(x2, y2)}, 0, 0)`)
      lines.push('Start-Sleep -Milliseconds 100')
      lines.push('[DragOps]::mouse_event([DragOps]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)')
      if (modVks.length > 0) lines.push('Start-Sleep -Milliseconds 30')
      for (const vk of [...modVks].reverse()) {
        lines.push(`[DragOps]::keybd_event(${vk}, 0, [DragOps]::KEYEVENTF_KEYUP, 0)`)
      }
      await runPowershell(lines.join('\n'))
    } else if (process.platform === 'linux') {
      const linuxEnv = getLinuxX11Env()
      const parts: string[] = []
      for (const key of hold_keys) {
        parts.push(`xdotool keydown ${safeXdotoolKey(key)}`)
      }
      await runBashWithEnv(`xdotool mousemove ${x1} ${y1}`, linuxEnv)
      parts.push('sleep 0.3')
      parts.push('xdotool mousedown 1')
      parts.push('sleep 0.2')
      const xm = Math.round((x1 + x2) / 2), ym = Math.round((y1 + y2) / 2)
      parts.push(`xdotool mousemove ${xm} ${ym}`)
      parts.push('sleep 0.15')
      parts.push(`xdotool mousemove ${x2} ${y2}`)
      parts.push('sleep 0.2')
      parts.push('xdotool mouseup 1')
      for (const key of hold_keys) {
        parts.push(`xdotool keyup ${safeXdotoolKey(key)}`)
      }
      await runBashWithEnv(parts.join(' && '), linuxEnv)
    } else if (process.platform === 'darwin') {
      await runSwift(`
import Cocoa
let start = CGPoint(x: ${x1}, y: ${y1})
let end = CGPoint(x: ${x2}, y: ${y2})
CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: start, mouseButton: .left)?.post(tap: .cghidEventTap)
usleep(100000)
let mid = CGPoint(x: (start.x + end.x) / 2, y: (start.y + end.y) / 2)
CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: mid, mouseButton: .left)?.post(tap: .cghidEventTap)
usleep(50000)
CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: end, mouseButton: .left)?.post(tap: .cghidEventTap)
usleep(100000)
CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: end, mouseButton: .left)?.post(tap: .cghidEventTap)
`)
    }

    return { success: true, message: `Dragged from (${x1},${y1}) to (${x2},${y2})` }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
