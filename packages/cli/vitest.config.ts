import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/test/**/*.test.ts", "**/test/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.js", "src/**/*.ts"],
      exclude: ["src/**/*.test.js", "src/**/*.test.ts"],
    },
    testTimeout: 15000, // 15 seconds for CLI operations
    passWithNoTests: true,
  },
});
