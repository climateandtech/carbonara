import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { mkdtempSync, rmSync } from 'fs';
import { getToolRegistry } from '../src/registry/index.js';
import { markToolInstalled, flagDetectionFailed } from '../src/utils/config.js';

describe('Tool Detection with Config Fallback', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // Create isolated test directory
    testDir = mkdtempSync(path.join(os.tmpdir(), 'carbonara-detection-test-'));
    originalCwd = process.cwd();
    process.chdir(testDir);

    // Create minimal package.json
    const packageJson = {
      name: 'carbonara-test-project',
      version: '1.0.0',
      private: true
    };
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Create .carbonara directory and config
    const carbonaraDir = path.join(testDir, '.carbonara');
    fs.mkdirSync(carbonaraDir, { recursive: true });
    const config = {
      name: 'Test Project',
      description: 'Test',
      projectType: 'web',
      projectId: 1,
      database: { path: '.carbonara/carbonara.db' },
      tools: {}
    };
    fs.writeFileSync(
      path.join(carbonaraDir, 'carbonara.config.json'),
      JSON.stringify(config, null, 2)
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should use config flag when detection fails but installation succeeded', async () => {
    const registry = getToolRegistry();
    
    // Mark tool as installed in config (simulating successful installation)
    await markToolInstalled('if-webpage-scan', testDir);
    
    // Refresh to check detection
    await registry.refreshInstalledTools();
    
    // Detection will likely fail (tool not actually installed), but config flag should make it pass
    const isInstalled = await registry.isToolInstalled('if-webpage-scan');
    
    // Should return true because of config fallback (even if actual detection fails)
    // Note: This test verifies the fallback mechanism works
    // In real scenarios, if tool is actually installed, detection would also pass
    expect(isInstalled).toBe(true);
  });

  test('should not trust detection if previously flagged as failed', async () => {
    const registry = getToolRegistry();
    
    // Mark as installed
    await markToolInstalled('if-webpage-scan', testDir);
    
    // Flag detection as failed (false positive)
    await flagDetectionFailed('if-webpage-scan', testDir);
    
    // Refresh to check detection
    await registry.refreshInstalledTools();
    
    // Detection should now return false (don't trust it, even if config says installed)
    // The detectionFailed flag takes precedence
    const isInstalled = await registry.isToolInstalled('if-webpage-scan');
    
    // Should return false because detection was flagged as failed
    // (even though installationStatus was set, it gets cleared when flagging)
    expect(isInstalled).toBe(false);
  });

  test('should handle tools without config gracefully', async () => {
    const registry = getToolRegistry();
    
    // Tool not in config, not actually installed
    const isInstalled = await registry.isToolInstalled('if-webpage-scan');
    
    // Should return false (no config flag, no actual installation)
    expect(isInstalled).toBe(false);
  });

  test('should check plugin packages from manifestTemplate', async () => {
    const registry = getToolRegistry();
    const tool = registry.getTool('if-webpage-scan');
    
    expect(tool).toBeDefined();
    expect(tool?.manifestTemplate).toBeDefined();
    
    // Extract plugin packages
    const plugins = registry.extractPluginPackages(tool!.manifestTemplate!);
    
    // Should extract @tngtech/if-webpage-plugins
    expect(plugins).toContain('@tngtech/if-webpage-plugins');
    
    // The tool installation.package should include base packages
    expect(tool!.installation.package).toContain('@grnsft/if');
    expect(tool!.installation.package).toContain('@tngtech/if-webpage-plugins');
    
    // So when checking installation, both base and plugin packages should be verified
    // This test verifies the extraction works, actual detection is tested elsewhere
  });
});

