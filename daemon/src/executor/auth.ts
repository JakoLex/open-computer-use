/**
 * Simple token-based authentication for the daemon.
 *
 * Token is read from env var COASTY_TOKEN (fallback to "changeme" for dev).
 * No persistence, no refresh, no OAuth — just a static token.
 */

const DEFAULT_TOKEN = 'changeme'

let token: string = undefined as any // loaded at import time below

// Initialize token on module load (before any server starts)
token = (
  process.env.COASTY_TOKEN ||
  process.env.COASTY_AUTH_TOKEN ||
  DEFAULT_TOKEN
)

/** Get the configured token. */
export function getToken(): string {
  return token
}

/** Verify a token string against the configured token. */
export function verifyToken(input: string | undefined | null): boolean {
  if (!input) return false
  return timingSafeEqual(input, token)
}

/** Secure comparison to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
