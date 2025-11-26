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

  test('should show as not installed when detection fails, even if config flag is set', async () => {
    const registry = getToolRegistry();
    
    // Mark tool as installed in config (simulating successful installation)
    await markToolInstalled('if-webpage-scan', testDir);
    
    // Refresh to check detection
    await registry.refreshInstalledTools();
    
    // Detection will likely fail (tool not actually installed)
    const isInstalled = await registry.isToolInstalled('if-webpage-scan');
    
    // Detection failure should take precedence - show as NOT INSTALLED (red)
    // Config flag is only used to allow running, not to change display status
    // This ensures users see accurate installation status
    expect(isInstalled).toBe(false);
    
    // However, the config flag should still allow running (checked in analyze command)
    const { isToolMarkedInstalled } = await import('../src/utils/config.js');
    const canRun = await isToolMarkedInstalled('if-webpage-scan', testDir);
    expect(canRun).toBe(true); // Config flag allows running even if detection fails
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

  test('should check detection commands are configured correctly', async () => {
    const registry = getToolRegistry();
    const tool = registry.getTool('if-webpage-scan');
    
    expect(tool).toBeDefined();
    expect(tool?.detection).toBeDefined();
    
    // Tool should have detection.commands array (new approach)
    const detection = tool!.detection as any;
    expect(detection.commands).toBeDefined();
    expect(Array.isArray(detection.commands)).toBe(true);
    expect(detection.commands.length).toBeGreaterThan(0);
    
    // Should include commands to check both base package and plugin package
    const commands = detection.commands as string[];
    expect(commands.some(cmd => cmd.includes('@grnsft/if'))).toBe(true);
    expect(commands.some(cmd => cmd.includes('@tngtech/if-webpage-plugins') || cmd.includes('npm list'))).toBe(true);
    
    // The tool installation.package should include base packages
    expect(tool!.installation.package).toContain('@grnsft/if');
    expect(tool!.installation.package).toContain('@tngtech/if-webpage-plugins');
    
    // Detection commands should verify both base and plugin packages
    // This test verifies the explicit detection commands are configured correctly
  });
});

