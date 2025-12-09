import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { installToolWithLogging } from '../src/utils/tool-installer.js';
import { getToolRegistry } from '../src/registry/index.js';
import { markToolInstalled, isToolMarkedInstalled, loadProjectConfig } from '../src/utils/config.js';
import { logToolAction, getToolLogs } from '../src/utils/tool-logger.js';
import { execa } from 'execa';

// Mock execa to control installation results
vi.mock('execa', () => ({
  execa: vi.fn()
}));

describe('installToolWithLogging', () => {
  let testDir: string;
  let projectPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbonara-test-'));
    projectPath = path.join(testDir, '.carbonara');
    fs.mkdirSync(projectPath, { recursive: true });
    
    // Create a minimal config file
    const configPath = path.join(projectPath, 'carbonara.config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      name: 'Test Project',
      description: 'Test',
      type: 'web'
    }, null, 2));
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should throw error if tool not found', async () => {
    await expect(installToolWithLogging('nonexistent-tool', projectPath))
      .rejects.toThrow("Tool 'nonexistent-tool' not found in registry");
  });

  test('should return success if tool already installed', async () => {
    const registry = getToolRegistry();
    const tool = registry.getTool('semgrep');
    
    // Mock that tool is already installed
    vi.spyOn(registry, 'isToolInstalled').mockResolvedValue(true);
    
    const result = await installToolWithLogging('semgrep', projectPath);
    
    expect(result.success).toBe(true);
    expect(result.tool.id).toBe('semgrep');
    expect(result.error).toBeUndefined();
    
    // Should not call installTool if already installed
    expect(execa).not.toHaveBeenCalled();
  });

  test('should install tool, log action, and mark as installed on success', async () => {
    const registry = getToolRegistry();
    const tool = registry.getTool('semgrep');
    
    // Mock that tool is not installed
    vi.spyOn(registry, 'isToolInstalled').mockResolvedValue(false);
    
    // Mock successful installation
    vi.spyOn(registry, 'installTool').mockResolvedValue(true);
    vi.spyOn(registry, 'refreshInstalledTools').mockResolvedValue();
    
    // Mock execa for pip install
    (execa as any).mockResolvedValue({ exitCode: 0 });
    
    const result = await installToolWithLogging('semgrep', projectPath);
    
    expect(result.success).toBe(true);
    expect(result.tool.id).toBe('semgrep');
    expect(result.error).toBeUndefined();
    
    // Verify installation was called
    expect(registry.installTool).toHaveBeenCalledWith('semgrep');
    
    // Verify tool was marked as installed
    const isMarked = await isToolMarkedInstalled('semgrep', projectPath);
    expect(isMarked).toBe(true);
    
    // Verify action was logged
    const logs = await getToolLogs('semgrep', 10, projectPath);
    expect(logs.length).toBeGreaterThan(0);
    const installLog = logs.find(log => log.action === 'install');
    expect(installLog).toBeDefined();
    expect(installLog?.exitCode).toBe(0);
  });

  test('should handle installation failure and log error', async () => {
    const registry = getToolRegistry();
    
    // Mock that tool is not installed
    vi.spyOn(registry, 'isToolInstalled').mockResolvedValue(false);
    
    // Mock failed installation
    vi.spyOn(registry, 'installTool').mockResolvedValue(false);
    vi.spyOn(registry, 'refreshInstalledTools').mockResolvedValue();
    
    const result = await installToolWithLogging('semgrep', projectPath);
    
    expect(result.success).toBe(false);
    expect(result.tool.id).toBe('semgrep');
    
    // Should not mark as installed on failure
    const isMarked = await isToolMarkedInstalled('semgrep', projectPath);
    expect(isMarked).toBe(false);
    
    // Verify error was logged
    const logs = await getToolLogs('semgrep', 10, projectPath);
    const errorLog = logs.find(log => log.action === 'error' || (log.action === 'install' && log.exitCode === 1));
    expect(errorLog).toBeDefined();
  });

  test('should handle installation exception and log error', async () => {
    const registry = getToolRegistry();
    
    // Mock that tool is not installed
    vi.spyOn(registry, 'isToolInstalled').mockResolvedValue(false);
    
    // Mock installation throwing an error
    vi.spyOn(registry, 'installTool').mockRejectedValue(new Error('Installation failed'));
    
    const result = await installToolWithLogging('semgrep', projectPath);
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Installation failed');
    
    // Should not mark as installed on error
    const isMarked = await isToolMarkedInstalled('semgrep', projectPath);
    expect(isMarked).toBe(false);
    
    // Verify error was logged
    const logs = await getToolLogs('semgrep', 10, projectPath);
    const errorLog = logs.find(log => log.action === 'error');
    expect(errorLog).toBeDefined();
    expect(errorLog?.error).toContain('Installation failed');
  });

  test('should work without projectPath (no config/logging)', async () => {
    const registry = getToolRegistry();
    
    // Mock that tool is not installed
    vi.spyOn(registry, 'isToolInstalled').mockResolvedValue(false);
    
    // Mock successful installation
    vi.spyOn(registry, 'installTool').mockResolvedValue(true);
    vi.spyOn(registry, 'refreshInstalledTools').mockResolvedValue();
    
    const result = await installToolWithLogging('semgrep');
    
    expect(result.success).toBe(true);
    expect(result.tool.id).toBe('semgrep');
    // Should not throw even without projectPath
  });

  test('should build correct install command for npm tools', async () => {
    const registry = getToolRegistry();
    const tool = registry.getTool('if-webpage-scan');
    
    if (!tool) {
      // Skip if tool doesn't exist
      return;
    }
    
    // Mock that tool is not installed
    vi.spyOn(registry, 'isToolInstalled').mockResolvedValue(false);
    
    // Mock successful installation
    vi.spyOn(registry, 'installTool').mockResolvedValue(true);
    vi.spyOn(registry, 'refreshInstalledTools').mockResolvedValue();
    
    // Mock execa for npm install
    (execa as any).mockResolvedValue({ exitCode: 0 });
    
    await installToolWithLogging('if-webpage-scan', projectPath);
    
    // Verify logs contain npm command
    const logs = await getToolLogs('if-webpage-scan', 10, projectPath);
    const installLog = logs.find(log => log.action === 'install');
    expect(installLog?.command).toContain('npm install');
  });
});

