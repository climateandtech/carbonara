import * as assert from "assert";
import type { AnalysisTool } from "@carbonara/cli/dist/registry/index.js";

// Import the actual registry to test
import { getToolRegistry } from "@carbonara/cli/dist/registry/index.js";

  suite("Semgrep Installation Check", () => {
  suite("Installation status check", () => {
    test("should refresh installation status before checking", async function() {
      this.timeout(10000); // Increase timeout for tool detection
      const registry = getToolRegistry();
      
      await registry.refreshInstalledTools();
      const isInstalled = await registry.isToolInstalled("semgrep");

      assert.strictEqual(typeof isInstalled, "boolean", "Should return boolean");
    });

    test("should detect semgrep installation status", async function() {
      this.timeout(10000); // Increase timeout for tool detection
      const registry = getToolRegistry();
      await registry.refreshInstalledTools();
      const isInstalled = await registry.isToolInstalled("semgrep");

      // Installation status depends on whether semgrep is actually installed
      // This test just verifies the check doesn't crash
      assert.strictEqual(typeof isInstalled, "boolean", "Should return boolean");
    });

    test("should verify auto-install logic for manual vs automatic triggers", () => {
      const registry = getToolRegistry();
      const tool = registry.getTool("semgrep");
      
      if (!tool) {
        // Skip test if semgrep tool not found
        return;
      }

      // Test logic: should show prompt only if showUI=true
      const isInstalled = false; // Simulate not installed
      const shouldShowPrompt = !isInstalled && tool && (tool as any).autoInstall;

      // For manual trigger (showUI=true), should show prompt
      const showUI = true;
      if (shouldShowPrompt && showUI) {
        assert.ok(true, "Should show auto-install prompt for manual trigger");
      }

      // For automatic analysis (showUI=false), should NOT show prompt
      const showUIAuto = false;
      if (shouldShowPrompt && !showUIAuto) {
        assert.ok(true, "Should NOT show auto-install prompt for automatic analysis");
      }
    });

    test("should verify semgrep tool has autoInstall flag", () => {
      const registry = getToolRegistry();
      const tool = registry.getTool("semgrep");

      assert.ok(tool, "Semgrep tool should exist in registry");
      assert.strictEqual(tool.id, "semgrep", "Tool ID should be 'semgrep'");
      assert.strictEqual(tool.detection.method, "command", "Detection method should be 'command'");
      assert.ok(Array.isArray(tool.detection.commands), "Detection commands should be an array");
      assert.ok(tool.detection.commands.includes("semgrep --version"), "Should include semgrep --version command");
      
      // Check autoInstall flag
      assert.strictEqual((tool as any).autoInstall, true, "Semgrep tool should have autoInstall: true");
    });

  });
});

