import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

export default defineConfig({
  testDir: './src/test/e2e',
  outputDir: './src/test/e2e/test-results',
  timeout: 60 * 1000,
  expect: {
    timeout: 20 * 1000,
  },
  fullyParallel: false, // VSCode instances might conflict
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Only one worker to avoid VSCode instance conflicts
  reporter: [
    ['list'],
    ['html', { outputFolder: './src/test/e2e/playwright-report', open: 'never' }]
  ],
  use: {
    actionTimeout: 20 * 1000,
    navigationTimeout: 60 * 1000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      // Disable debugging features that VSCode Electron doesn't support
      args: ['--disable-dev-shm-usage'],
    },
  },

  projects: [
    {
      name: 'vscode-extension',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: undefined, // We don't need a web server for VSCode extension testing

  // Global setup and teardown
  globalSetup: './src/test/e2e/global-setup.ts',
  globalTeardown: './src/test/e2e/global-teardown.ts',
}); 