import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/test/**/*.test.ts', '**/test/**/*.test.js'],
    coverage: {
      include: ['src/**/*.js', 'src/**/*.ts'],
      exclude: ['src/**/*.test.js', 'src/**/*.test.ts']
    },
    testTimeout: 15000, // 15 seconds for CLI operations
    hookTimeout: 30000, // 30 seconds for setup/teardown hooks
    poolTimeout: 120000, // 120 seconds for worker pool communication (prevents "onTaskUpdate" timeout)
    teardownTimeout: 30000, // 30 seconds for teardown operations
    passWithNoTests: true,
    setupFiles: ['./test/setup.ts'] // Local error suppression for worker timeouts
  }
})