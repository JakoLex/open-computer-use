/**
 * Parameter normalization — ported from local-executor.ts.
 * Normalizes parameter names from backend format to handler format
 * and applies multi-display coordinate offset for multi-monitor setups.
 */

import { getActiveDisplay } from './display-manager'

export function normalizeParams(command: string, params: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = { ...params }

  // File operations: filepath → path
  if (p.filepath !== undefined && p.path === undefined) {
    p.path = p.filepath
  }
  // Directory operations: dirpath → path
  if (p.dirpath !== undefined && p.path === undefined) {
    p.path = p.dirpath
  }
  // File edit: find/replace → old_text/new_text
  if (p.find !== undefined && p.old_text === undefined) {
    p.old_text = p.find
  }
  if (p.replace !== undefined && p.new_text === undefined) {
    p.new_text = p.replace
  }
  // Tab management: tab_index → index
  if (p.tab_index !== undefined && p.index === undefined) {
    p.index = p.tab_index
  }

  // Multi-display coordinate offset + type coercion (safety)
  const COORD_COMMANDS = new Set(['click', 'click_with_modifiers', 'double_click', 'scroll', 'drag'])
  if (COORD_COMMANDS.has(command)) {
    // Coerce coordinate fields to Number (prevents injection)
    for (const field of ['x', 'y', 'x1', 'y1', 'x2', 'y2'] as const) {
      if (p[field] !== undefined) p[field] = Number(p[field])
    }
    if (p.clicks !== undefined) p.clicks = Number(p.clicks)

    // Apply display offset for multi-monitor setups
    const { x: ox, y: oy } = getActiveDisplay().bounds
    if (ox !== 0 || oy !== 0) {
      if (p.x !== undefined && typeof p.x === 'number' && !isNaN(p.x)) p.x += ox
      if (p.y !== undefined && typeof p.y === 'number' && !isNaN(p.y)) p.y += oy
      if (p.x1 !== undefined && typeof p.x1 === 'number' && !isNaN(p.x1)) p.x1 += ox
      if (p.y1 !== undefined && typeof p.y1 === 'number' && !isNaN(p.y1)) p.y1 += oy
      if (p.x2 !== undefined && typeof p.x2 === 'number' && !isNaN(p.x2)) p.x2 += ox
      if (p.y2 !== undefined && typeof p.y2 === 'number' && !isNaN(p.y2)) p.y2 += oy
    }
  }

  return p
}
