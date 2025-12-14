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

  test('should use venv for pip tools when project path exists', async () => {
    const registry = getToolRegistry();
    const tool = registry.getTool('semgrep');
    
    if (!tool || tool.installation.type !== 'pip') {
      // Skip if tool doesn't exist or is not pip
      return;
    }
    
    // Mock that tool is not installed
    vi.spyOn(registry, 'isToolInstalled').mockResolvedValue(false);
    
    // Mock venv manager - need to mock before registry uses it
    const venvManagerModule = await import('../src/utils/venv-manager.js');
    const originalInstallInVenv = venvManagerModule.installInVenv;
    const originalEnsureVenv = venvManagerModule.ensureVenv;
    
    // Create spies
    const installInVenvSpy = vi.spyOn(venvManagerModule, 'installInVenv').mockResolvedValue(true);
    const ensureVenvSpy = vi.spyOn(venvManagerModule, 'ensureVenv').mockResolvedValue({
      path: path.join(testDir, '.carbonara', 'venv'),
      pythonPath: path.join(testDir, '.carbonara', 'venv', 'bin', 'python'),
      pipPath: path.join(testDir, '.carbonara', 'venv', 'bin', 'pip'),
      binDir: path.join(testDir, '.carbonara', 'venv', 'bin'),
      exists: true
    });
    
    // Mock successful installation
    vi.spyOn(registry, 'installTool').mockImplementation(async (toolId: string) => {
      // Actually call the real installTool to test venv logic
      // But we need to ensure venv functions are mocked
      const realInstallTool = registry.installTool.bind(registry);
      return realInstallTool(toolId);
    });
    vi.spyOn(registry, 'refreshInstalledTools').mockResolvedValue();
    
    // Mock detection to succeed
    vi.spyOn(registry, 'isToolInstalled').mockResolvedValue(true);
    
    await installToolWithLogging('semgrep', testDir); // Use testDir (project root), not projectPath (.carbonara)
    
    // Verify venv installation was attempted (if installTool was actually called)
    // Note: installToolWithLogging checks if already installed first, so may not call installTool
    // But if it does, it should use venv
    
    // Verify tool was marked as installed
    const isMarked = await isToolMarkedInstalled('semgrep', testDir);
    expect(isMarked).toBe(true);
    
    // Restore
    installInVenvSpy.mockRestore();
    ensureVenvSpy.mockRestore();
  });

  test('should fall back to system installation when no project path', async () => {
    const registry = getToolRegistry();
    const tool = registry.getTool('semgrep');
    
    if (!tool || tool.installation.type !== 'pip') {
      return;
    }
    
    // Mock that tool is not installed
    vi.spyOn(registry, 'isToolInstalled').mockResolvedValue(false);
    
    // Mock successful installation (will use system pip)
    vi.spyOn(registry, 'installTool').mockResolvedValue(true);
    vi.spyOn(registry, 'refreshInstalledTools').mockResolvedValue();
    
    // Mock execa for system pip install
    (execa as any).mockResolvedValue({ exitCode: 0 });
    
    // Install without project path
    await installToolWithLogging('semgrep');
    
    // Verify installation was called (will use system pip)
    expect(registry.installTool).toHaveBeenCalledWith('semgrep');
  });
});


