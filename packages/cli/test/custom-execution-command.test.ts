import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { mkdtempSync, rmSync } from 'fs';
import { getToolRegistry } from '../src/registry/index.js';
import { 
  setCustomExecutionCommand, 
  getCustomExecutionCommand,
  clearCustomExecutionCommand,
  loadProjectConfig,
  recordToolError,
  getToolLastError
} from '../src/utils/config.js';
import { execa, execaCommand } from 'execa';

// Mock execa to control detection results for CI reliability
vi.mock('execa', () => ({
  execa: vi.fn(),
  execaCommand: vi.fn()
}));

describe('Custom Execution Command', () => {
  let testDir: string;
  let originalCwd: string;
  let mockExeca: ReturnType<typeof vi.fn>;
  let mockExecaCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExeca = vi.mocked(execa);
    mockExecaCommand = vi.mocked(execaCommand);
    
    // Default: mock detection to fail (tool not installed)
    mockExecaCommand.mockImplementation((command: string) => {
      if (command.includes('npm list')) {
        return Promise.resolve({
          exitCode: 0,
          stdout: '(empty)',
          stderr: '',
          command: '',
          escapedCommand: '',
          killed: false,
          signal: null,
          timedOut: false
        } as any);
      }
      return Promise.resolve({
        exitCode: 127,
        stdout: '',
        stderr: 'command not found',
        command: '',
        escapedCommand: '',
        killed: false,
        signal: null,
        timedOut: false
      } as any);
    });
    // Create isolated test directory
    testDir = mkdtempSync(path.join(os.tmpdir(), 'carbonara-custom-exec-test-'));
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

  test('should set and get custom execution command as string', async () => {
    await setCustomExecutionCommand('greenframe', 'greenframe analyze {url} --format=json', testDir);
    
    const customCommand = await getCustomExecutionCommand('greenframe', testDir);
    expect(customCommand).toBe('greenframe analyze {url} --format=json');
    
    // Verify config was updated
    const config = await loadProjectConfig(testDir);
    expect(config?.tools?.greenframe?.customExecutionCommand).toBe('greenframe analyze {url} --format=json');
    expect(config?.tools?.greenframe?.installationStatus?.installed).toBe(true);
  });

  test('should set and get custom execution command as array', async () => {
    const commandArray = ['greenframe', 'analyze', '{url}', '--format=json'];
    await setCustomExecutionCommand('greenframe', commandArray, testDir);
    
    const customCommand = await getCustomExecutionCommand('greenframe', testDir);
    expect(customCommand).toEqual(commandArray);
    
    // Verify config was updated
    const config = await loadProjectConfig(testDir);
    expect(config?.tools?.greenframe?.customExecutionCommand).toEqual(commandArray);
    expect(config?.tools?.greenframe?.installationStatus?.installed).toBe(true);
  });

  test('should clear custom execution command', async () => {
    await setCustomExecutionCommand('greenframe', 'greenframe analyze {url}', testDir);
    
    let customCommand = await getCustomExecutionCommand('greenframe', testDir);
    expect(customCommand).toBe('greenframe analyze {url}');
    
    await clearCustomExecutionCommand('greenframe', testDir);
    
    customCommand = await getCustomExecutionCommand('greenframe', testDir);
    expect(customCommand).toBeNull();
    
    // Verify config was updated
    const config = await loadProjectConfig(testDir);
    expect(config?.tools?.greenframe?.customExecutionCommand).toBeUndefined();
  });

  test('should mark tool as installed when custom execution command is set', async () => {
    const registry = getToolRegistry();
    
    // Use a tool that's definitely not installed (test-analyzer is built-in, so use a non-existent one)
    // Or check initial state without assuming it's not installed
    await registry.refreshInstalledTools();
    const initialInstalled = await registry.isToolInstalled('greenframe');
    
    // Set custom execution command
    await setCustomExecutionCommand('greenframe', 'greenframe analyze {url}', testDir);
    
    // Refresh and check again
    await registry.refreshInstalledTools();
    const isInstalled = await registry.isToolInstalled('greenframe');
    
    // Tool should be marked as installed when custom command is set
    // (regardless of initial state)
    expect(isInstalled).toBe(true);
    
    // Verify it's marked in config
    const config = await loadProjectConfig(testDir);
    expect(config?.tools?.greenframe?.installationStatus?.installed).toBe(true);
  });

  test('should still track errors when using custom execution command', async () => {
    // Set custom execution command
    await setCustomExecutionCommand('greenframe', 'invalid-command-that-fails', testDir);
    
    // Record an error (simulating execution failure)
    await recordToolError('greenframe', 'Command failed: invalid-command-that-fails', testDir);
    
    // Verify error was recorded
    const lastError = await getToolLastError('greenframe', testDir);
    expect(lastError).not.toBeNull();
    expect(lastError?.message).toContain('Command failed');
    
    // Verify config has both custom command and error
    const config = await loadProjectConfig(testDir);
    expect(config?.tools?.greenframe?.customExecutionCommand).toBe('invalid-command-that-fails');
    expect(config?.tools?.greenframe?.lastError).toBeDefined();
    expect(config?.tools?.greenframe?.installationStatus?.installed).toBe(true);
  });

  test('should allow multiple tools with custom execution commands', async () => {
    await setCustomExecutionCommand('greenframe', 'greenframe analyze {url}', testDir);
    await setCustomExecutionCommand('if-webpage-scan', ['npx', '--package=@grnsft/if', 'if-run', '--manifest', '{manifest}'], testDir);
    
    const greenframeCommand = await getCustomExecutionCommand('greenframe', testDir);
    const ifCommand = await getCustomExecutionCommand('if-webpage-scan', testDir);
    
    expect(greenframeCommand).toBe('greenframe analyze {url}');
    expect(ifCommand).toEqual(['npx', '--package=@grnsft/if', 'if-run', '--manifest', '{manifest}']);
    
    // Verify both are marked as installed
    const config = await loadProjectConfig(testDir);
    expect(config?.tools?.greenframe?.installationStatus?.installed).toBe(true);
    expect(config?.tools?.['if-webpage-scan']?.installationStatus?.installed).toBe(true);
  });
});

