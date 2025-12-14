import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getVenvPath,
  getVenvBinaryPath,
  getVenvInfo,
  ensureVenv,
  installInVenv,
  isBinaryInVenv,
  getVenvCommand,
} from '../src/utils/venv-manager.js';
import { execa } from 'execa';

// Mock execa to control venv creation and pip install
vi.mock('execa', () => ({
  execa: vi.fn(),
  execaCommand: vi.fn(),
}));

describe('venv-manager', () => {
  let testDir: string;
  let projectPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbonara-venv-test-'));
    projectPath = testDir;
    
    // Create .carbonara directory
    const carbonaraDir = path.join(projectPath, '.carbonara');
    fs.mkdirSync(carbonaraDir, { recursive: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getVenvPath', () => {
    test('should return correct venv path', () => {
      const venvPath = getVenvPath(projectPath);
      expect(venvPath).toBe(path.join(projectPath, '.carbonara', 'venv'));
    });
  });

  describe('getVenvBinaryPath', () => {
    test('should return correct binary path for Unix', () => {
      vi.spyOn(os, 'platform').mockReturnValue('linux');
      const binaryPath = getVenvBinaryPath(projectPath, 'semgrep');
      expect(binaryPath).toBe(path.join(projectPath, '.carbonara', 'venv', 'bin', 'semgrep'));
    });

    test('should return correct binary path for Windows', () => {
      vi.spyOn(os, 'platform').mockReturnValue('win32');
      const binaryPath = getVenvBinaryPath(projectPath, 'semgrep');
      expect(binaryPath).toBe(path.join(projectPath, '.carbonara', 'venv', 'Scripts', 'semgrep.exe'));
    });
  });

  describe('getVenvInfo', () => {
    test('should return correct info when venv does not exist', () => {
      const info = getVenvInfo(projectPath);
      expect(info.path).toBe(path.join(projectPath, '.carbonara', 'venv'));
      expect(info.exists).toBe(false);
    });

    test('should return correct info when venv exists', () => {
      const venvPath = path.join(projectPath, '.carbonara', 'venv');
      const binDir = os.platform() === 'win32' ? 'Scripts' : 'bin';
      const pythonName = os.platform() === 'win32' ? 'python.exe' : 'python';
      
      fs.mkdirSync(path.join(venvPath, binDir), { recursive: true });
      fs.writeFileSync(path.join(venvPath, binDir, pythonName), '#!/usr/bin/env python');
      
      const info = getVenvInfo(projectPath);
      expect(info.exists).toBe(true);
      expect(info.pythonPath).toBe(path.join(venvPath, binDir, pythonName));
    });
  });

  describe('isBinaryInVenv', () => {
    test('should return false when binary does not exist', () => {
      expect(isBinaryInVenv(projectPath, 'semgrep')).toBe(false);
    });

    test('should return true when binary exists', () => {
      const venvPath = path.join(projectPath, '.carbonara', 'venv');
      const binDir = os.platform() === 'win32' ? 'Scripts' : 'bin';
      const binaryName = os.platform() === 'win32' ? 'semgrep.exe' : 'semgrep';
      
      fs.mkdirSync(path.join(venvPath, binDir), { recursive: true });
      fs.writeFileSync(path.join(venvPath, binDir, binaryName), '#!/usr/bin/env python');
      
      expect(isBinaryInVenv(projectPath, 'semgrep')).toBe(true);
    });
  });

  describe('getVenvCommand', () => {
    test('should return full path to binary', () => {
      const command = getVenvCommand(projectPath, 'semgrep');
      const expected = getVenvBinaryPath(projectPath, 'semgrep');
      expect(command).toBe(expected);
    });
  });

  describe('ensureVenv', () => {
    test('should create venv if it does not exist', async () => {
      // Mock execa to actually create venv structure
      (execa as any).mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'python3' || cmd === 'python') {
          if (args.includes('venv')) {
            // Create venv structure
            const venvPath = args[args.length - 1];
            const binDir = os.platform() === 'win32' ? 'Scripts' : 'bin';
            const pythonName = os.platform() === 'win32' ? 'python.exe' : 'python';
            fs.mkdirSync(path.join(venvPath, binDir), { recursive: true });
            fs.writeFileSync(path.join(venvPath, binDir, pythonName), '#!/usr/bin/env python');
            return Promise.resolve({ exitCode: 0 });
          } else if (args.includes('pip')) {
            // pip upgrade
            return Promise.resolve({ exitCode: 0 });
          }
        }
        return Promise.resolve({ exitCode: 0 });
      });
      
      const info = await ensureVenv(projectPath);
      
      expect(info.exists).toBe(true);
      expect(execa).toHaveBeenCalled();
    });

    test('should return existing venv info if venv already exists', async () => {
      const venvPath = path.join(projectPath, '.carbonara', 'venv');
      const binDir = os.platform() === 'win32' ? 'Scripts' : 'bin';
      const pythonName = os.platform() === 'win32' ? 'python.exe' : 'python';
      
      fs.mkdirSync(path.join(venvPath, binDir), { recursive: true });
      fs.writeFileSync(path.join(venvPath, binDir, pythonName), '#!/usr/bin/env python');
      
      const info = await ensureVenv(projectPath);
      
      expect(info.exists).toBe(true);
      expect(execa).not.toHaveBeenCalled();
    });
  });

  describe('installInVenv', () => {
    test('should install package in venv', async () => {
      // Mock venv exists
      const venvPath = path.join(projectPath, '.carbonara', 'venv');
      const binDir = os.platform() === 'win32' ? 'Scripts' : 'bin';
      const pythonName = os.platform() === 'win32' ? 'python.exe' : 'python';
      
      fs.mkdirSync(path.join(venvPath, binDir), { recursive: true });
      fs.writeFileSync(path.join(venvPath, binDir, pythonName), '#!/usr/bin/env python');
      
      (execa as any).mockResolvedValueOnce({ exitCode: 0 }); // pip install
      
      const success = await installInVenv(projectPath, 'semgrep');
      
      expect(success).toBe(true);
      expect(execa).toHaveBeenCalled();
    });

    test('should return false on installation failure', async () => {
      // Mock venv exists
      const venvPath = path.join(projectPath, '.carbonara', 'venv');
      const binDir = os.platform() === 'win32' ? 'Scripts' : 'bin';
      const pythonName = os.platform() === 'win32' ? 'python.exe' : 'python';
      
      fs.mkdirSync(path.join(venvPath, binDir), { recursive: true });
      fs.writeFileSync(path.join(venvPath, binDir, pythonName), '#!/usr/bin/env python');
      
      (execa as any).mockRejectedValueOnce(new Error('Installation failed'));
      
      const success = await installInVenv(projectPath, 'semgrep');
      
      expect(success).toBe(false);
    });
  });
});

