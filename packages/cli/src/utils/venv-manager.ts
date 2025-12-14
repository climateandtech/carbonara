import fs from 'fs';
import path from 'path';
import { execa } from 'execa';
import os from 'os';

export interface VenvInfo {
  path: string;
  pythonPath: string;
  pipPath: string;
  binDir: string;
  exists: boolean;
}

/**
 * Get the path to the project's venv directory
 */
export function getVenvPath(projectPath: string): string {
  return path.join(projectPath, '.carbonara', 'venv');
}

/**
 * Get the path to a binary in the venv
 */
export function getVenvBinaryPath(projectPath: string, binary: string): string {
  const venvPath = getVenvPath(projectPath);
  const isWindows = os.platform() === 'win32';
  const binDir = isWindows ? 'Scripts' : 'bin';
  const extension = isWindows ? '.exe' : '';
  return path.join(venvPath, binDir, `${binary}${extension}`);
}

/**
 * Get information about the project's venv
 */
export function getVenvInfo(projectPath: string): VenvInfo {
  const venvPath = getVenvPath(projectPath);
  const isWindows = os.platform() === 'win32';
  const binDir = isWindows ? 'Scripts' : 'bin';
  const pythonName = isWindows ? 'python.exe' : 'python';
  const pipName = isWindows ? 'pip.exe' : 'pip';
  
  return {
    path: venvPath,
    pythonPath: path.join(venvPath, binDir, pythonName),
    pipPath: path.join(venvPath, binDir, pipName),
    binDir: path.join(venvPath, binDir),
    exists: fs.existsSync(venvPath) && fs.existsSync(path.join(venvPath, binDir, pythonName)),
  };
}

/**
 * Find available Python executable (python3 or python)
 */
async function findPythonExecutable(): Promise<string> {
  // Try python3 first (Unix-like systems)
  try {
    await execa('python3', ['--version'], { stdio: 'pipe' });
    return 'python3';
  } catch {
    // Fall back to python (Windows or systems where python3 isn't available)
    try {
      await execa('python', ['--version'], { stdio: 'pipe' });
      return 'python';
    } catch {
      throw new Error('Python is not installed. Please install Python 3.7+ to use this feature.');
    }
  }
}

/**
 * Ensure the project venv exists, creating it if necessary
 */
export async function ensureVenv(projectPath: string): Promise<VenvInfo> {
  const venvInfo = getVenvInfo(projectPath);
  
  if (venvInfo.exists) {
    return venvInfo;
  }
  
  // Find Python executable
  const pythonCmd = await findPythonExecutable();
  
  // Create .carbonara directory if it doesn't exist
  const carbonaraDir = path.join(projectPath, '.carbonara');
  if (!fs.existsSync(carbonaraDir)) {
    fs.mkdirSync(carbonaraDir, { recursive: true });
  }
  
  // Create venv
  console.log(`Creating Python virtual environment at ${venvInfo.path}...`);
  await execa(pythonCmd, ['-m', 'venv', venvInfo.path], {
    stdio: 'inherit',
  });
  
  // Upgrade pip in the venv
  console.log('Upgrading pip in virtual environment...');
  await execa(venvInfo.pythonPath, ['-m', 'pip', 'install', '--upgrade', 'pip'], {
    stdio: 'inherit',
  });
  
  return getVenvInfo(projectPath);
}

/**
 * Install a package in the project venv
 */
export async function installInVenv(
  projectPath: string,
  packageName: string,
  upgrade: boolean = true
): Promise<boolean> {
  try {
    // Ensure venv exists
    const venvInfo = await ensureVenv(projectPath);
    
    // Build pip install command
    const pipArgs = ['-m', 'pip', 'install'];
    if (upgrade) {
      pipArgs.push('--upgrade');
    }
    pipArgs.push(packageName);
    
    console.log(`Installing ${packageName} in virtual environment...`);
    await execa(venvInfo.pythonPath, pipArgs, {
      stdio: 'inherit',
    });
    
    return true;
  } catch (error: any) {
    console.error(`Failed to install ${packageName} in venv:`, error.message);
    return false;
  }
}

/**
 * Check if a binary exists in the venv
 */
export function isBinaryInVenv(projectPath: string, binary: string): boolean {
  const binaryPath = getVenvBinaryPath(projectPath, binary);
  return fs.existsSync(binaryPath);
}

/**
 * Get the command to run a binary from venv (for use in detection/execution)
 * Returns the full path to the binary
 */
export function getVenvCommand(projectPath: string, binary: string): string {
  return getVenvBinaryPath(projectPath, binary);
}

