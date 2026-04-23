/**
 * Tests for token authentication.
 *
 * Note: The auth module initializes its token at import time from env vars.
 * Since vitest loads modules once per file, we test against the default token.
 */

import { describe, test, expect } from 'vitest'
import { getToken, verifyToken } from '../src/executor/auth'

describe('token auth', () => {
  describe('getToken', () => {
    test('returns a non-empty string', () => {
      const token = getToken()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    })

    test('returns "changeme" in default (no env override)', () => {
      // This is the default token when no env var is set
      expect(getToken()).toBe('changeme')
    })
  })

  describe('verifyToken', () => {
    test('rejects empty string', () => {
      expect(verifyToken('')).toBe(false)
    })

    test('rejects null', () => {
      expect(verifyToken(null as any)).toBe(false)
    })

    test('rejects undefined', () => {
      expect(verifyToken(undefined)).toBe(false)
    })

    test('rejects wrong token', () => {
      expect(verifyToken('wrong-token')).toBe(false)
    })

    test('rejects same-length different tokens', () => {
      // 'changeme' is 8 chars — use another 8-char different string
      expect(verifyToken('notchang')).toBe(false)
    })

    test('timing-safe comparison for different lengths', () => {
      // verifyToken returns false early for different lengths
      expect(verifyToken('short')).toBe(false)
      expect(verifyToken('a'.repeat(100))).toBe(false)
    })
  })

  describe('timing attack resistance', () => {
    test('different lengths rejected before character comparison', () => {
      // Internal timingSafeEqual returns false on length mismatch
      // The function should be fast for length-mismatched inputs
      const start = Date.now()
      for (let i = 0; i < 100; i++) {
        verifyToken('different')
      }
      const duration = Date.now() - start
      // Should complete quickly (< 10ms for 100 iterations)
      expect(duration).toBeLessThan(10)
    })
  })
})
