import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/test/**/*.test.ts', '**/test/**/*.test.js'],
    coverage: {
      include: ['src/**/*.js', 'src/**/*.ts'],
      exclude: ['src/**/*.test.js', 'src/**/*.test.ts']
    },
    testTimeout: 15000, // 15 seconds for database operations
    passWithNoTests: true
  }
})
