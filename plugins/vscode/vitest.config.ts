import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Exclude VSCode-specific tests and e2e tests from vitest
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/tests/e2e/**',  // Playwright E2E tests
      '**/.{idea,git,cache,output,temp}/**'
    ],
    // Only include pure unit tests that don't need VSCode API
    include: [
      '**/src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      '**/tests/unit/**/*.test.ts'
    ],
    setupFiles: ['./tests/unit/vscode.mock.ts'],
  },
})
