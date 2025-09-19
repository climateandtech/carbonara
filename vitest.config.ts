import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/test/**/*.test.ts', '**/test/**/*.test.js'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/plugins/vscode/**',  // Exclude VSCode extension tests
      '**/out/**',
      '**/test-build/**'
    ],
    passWithNoTests: true
  }
})