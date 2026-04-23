import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['node_modules/', 'dist/', 'tests/'],
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
