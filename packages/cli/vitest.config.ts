import { defineConfig } from "vitest/config";

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

export default defineConfig({
  test: {
    environment: "node",
    include: isCI
      ? ["**/test/**/*.test.ts", "**/test/**/*.test.js", "!**/test/**/megalinter.test.ts"]
      : ["**/test/**/*.test.ts", "**/test/**/*.test.js"],
    exclude: isCI
      ? ["**/node_modules/**", "**/test/**/megalinter.test.ts"]
      : ["**/node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.js", "src/**/*.ts"],
      exclude: ["src/**/*.test.js", "src/**/*.test.ts"],
    },
    testTimeout: isCI ? 10000 : 15000, // 10s for CI, 15s for local
    passWithNoTests: true,
    // Environment variables for tests
    env: {
      CI: isCI ? 'true' : 'false',
    },
  },
});
