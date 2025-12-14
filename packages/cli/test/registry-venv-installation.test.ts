import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { mkdtempSync, rmSync } from 'fs';
import { getToolRegistry } from '../src/registry/index.js';
import { execa, execaCommand } from 'execa';
import { installInVenv, ensureVenv } from '../src/utils/venv-manager.js';

// Mock execa to control installation results
vi.mock('execa', () => ({
  execa: vi.fn(),
  execaCommand: vi.fn()
}));

// Create mock functions that can be controlled in tests
const mockEnsureVenv = vi.fn();
const mockInstallInVenv = vi.fn();

// Mock venv-manager
vi.mock('../src/utils/venv-manager.js', async () => {
  const actual = await vi.importActual('../src/utils/venv-manager.js');
  return {
    ...actual,
    ensureVenv: (...args: any[]) => mockEnsureVenv(...args),
    installInVenv: (...args: any[]) => mockInstallInVenv(...args),
    getVenvPath: (projectPath: string) => path.join(projectPath, '.carbonara', 'venv'),
    getVenvBinaryPath: (projectPath: string, binary: string) => {
      const isWindows = os.platform() === 'win32';
      const binDir = isWindows ? 'Scripts' : 'bin';
      const extension = isWindows ? '.exe' : '';
      return path.join(projectPath, '.carbonara', 'venv', binDir, `${binary}${extension}`);
    },
    getVenvInfo: (projectPath: string) => {
      const venvPath = path.join(projectPath, '.carbonara', 'venv');
      const isWindows = os.platform() === 'win32';
      const binDir = isWindows ? 'Scripts' : 'bin';
      const pythonName = isWindows ? 'python.exe' : 'python';
      const pythonPath = path.join(venvPath, binDir, pythonName);
      const exists = fs.existsSync(pythonPath);
      return {
        path: venvPath,
        pythonPath,
        pipPath: path.join(venvPath, binDir, isWindows ? 'pip.exe' : 'pip'),
        binDir: path.join(venvPath, binDir),
        exists
      };
    },
    isBinaryInVenv: (projectPath: string, binary: string) => {
      const venvPath = path.join(projectPath, '.carbonara', 'venv');
      const isWindows = os.platform() === 'win32';
      const binDir = isWindows ? 'Scripts' : 'bin';
      const binaryName = isWindows ? `${binary}.exe` : binary;
      return fs.existsSync(path.join(venvPath, binDir, binaryName));
    },
    getVenvCommand: (projectPath: string, binary: string) => {
      const isWindows = os.platform() === 'win32';
      const binDir = isWindows ? 'Scripts' : 'bin';
      const extension = isWindows ? '.exe' : '';
      return path.join(projectPath, '.carbonara', 'venv', binDir, `${binary}${extension}`);
    }
  };
});

describe('Registry Venv Installation', () => {
  let testDir: string;
  let originalCwd: string;
  let mockExeca: ReturnType<typeof vi.fn>;
  let mockExecaCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExeca = vi.mocked(execa);
    mockExecaCommand = vi.mocked(execaCommand);
    mockEnsureVenv.mockClear();
    mockInstallInVenv.mockClear();
    
    // Create isolated test directory
    testDir = mkdtempSync(path.join(os.tmpdir(), 'carbonara-registry-venv-test-'));
    originalCwd = process.cwd();
    process.chdir(testDir);

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

  test('should use venv for pip tool installation when project root exists', async () => {
    const registry = getToolRegistry();
    const tool = registry.getTool('semgrep');
    
    if (!tool || tool.installation.type !== 'pip') {
      // Skip if tool doesn't exist or is not pip
      return;
    }

    // Mock venv functions
    mockEnsureVenv.mockResolvedValue({
      path: path.join(testDir, '.carbonara', 'venv'),
      pythonPath: path.join(testDir, '.carbonara', 'venv', 'bin', 'python'),
      pipPath: path.join(testDir, '.carbonara', 'venv', 'bin', 'pip'),
      binDir: path.join(testDir, '.carbonara', 'venv', 'bin'),
      exists: true
    });
    mockInstallInVenv.mockResolvedValue(true);
    
    // Mock detection to succeed after installation
    mockExecaCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'semgrep 1.0.0',
      stderr: '',
      command: '',
      escapedCommand: '',
      killed: false,
      signal: null,
      timedOut: false
    } as any);

    // Mock that tool is not installed initially
    vi.spyOn(registry, 'isToolInstalled').mockResolvedValue(false);
    
    // Mock refreshInstalledTools to mark tool as installed after venv install
    vi.spyOn(registry, 'refreshInstalledTools').mockImplementation(async () => {
      // After refresh, tool should be detected as installed
      vi.spyOn(registry, 'isToolInstalled').mockResolvedValue(true);
    });

    const result = await registry.installTool('semgrep');
    
    // Verify venv installation was attempted when project root exists
    // This is the key test: verify the venv path is used
    // Note: Paths may be normalized (e.g., /var vs /private/var on macOS), so we use fs.realpathSync
    expect(mockInstallInVenv).toHaveBeenCalled();
    const installCall = mockInstallInVenv.mock.calls[0];
    const actualPath = fs.realpathSync(installCall[0]);
    const expectedPath = fs.realpathSync(testDir);
    expect(actualPath).toBe(expectedPath); // Project path (normalized)
    expect(installCall[1]).toBe(tool.installation.package); // Package name
    
    // When venv is used, system pip should not be called
    const pipCalls = mockExeca.mock.calls.filter((call: any[]) => 
      (call[0] === 'python3' || call[0] === 'python') && 
      call[1]?.includes('pip')
    );
    expect(pipCalls.length).toBe(0);
    
    // Installation result depends on detection, but we've verified venv was used
    // The important thing is that venv path was attempted
  });

  test('should fall back to system pip when no project root', async () => {
    // Change to a directory without .carbonara
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'carbonara-no-project-'));
    process.chdir(tempDir);
    
    const registry = getToolRegistry();
    const tool = registry.getTool('semgrep');
    
    if (!tool || tool.installation.type !== 'pip') {
      process.chdir(originalCwd);
      if (fs.existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
      return;
    }

    // Mock system pip install
    mockExeca.mockResolvedValue({ exitCode: 0 });
    
    // Mock detection to succeed
    mockExecaCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'semgrep 1.0.0',
      stderr: '',
      command: '',
      escapedCommand: '',
      killed: false,
      signal: null,
      timedOut: false
    } as any);

    const result = await registry.installTool('semgrep');
    
    expect(result).toBe(true);
    // Should have called system pip (python3 -m pip install)
    const pipCalls = mockExeca.mock.calls.filter((call: any[]) => 
      (call[0] === 'python3' || call[0] === 'python') && 
      call[1]?.includes('pip') && 
      call[1]?.includes('install')
    );
    expect(pipCalls.length).toBeGreaterThan(0);
    
    process.chdir(originalCwd);
    if (fs.existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('should handle venv installation failure gracefully', async () => {
    const registry = getToolRegistry();
    const tool = registry.getTool('semgrep');
    
    if (!tool || tool.installation.type !== 'pip') {
      return;
    }

    // Mock venv functions to fail
    mockEnsureVenv.mockResolvedValue({
      path: path.join(testDir, '.carbonara', 'venv'),
      pythonPath: path.join(testDir, '.carbonara', 'venv', 'bin', 'python'),
      pipPath: path.join(testDir, '.carbonara', 'venv', 'bin', 'pip'),
      binDir: path.join(testDir, '.carbonara', 'venv', 'bin'),
      exists: true
    });
    mockInstallInVenv.mockResolvedValue(false);

    const result = await registry.installTool('semgrep');
    
    expect(result).toBe(false);
    // Should have attempted venv installation
    expect(mockInstallInVenv).toHaveBeenCalled();
  });
});

