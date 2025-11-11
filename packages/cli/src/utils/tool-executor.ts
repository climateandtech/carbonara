import execa from 'execa';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface IsolatedExecutionOptions {
  /**
   * Command to execute
   */
  command: string;
  /**
   * Arguments for the command
   */
  args?: string[];
  /**
   * Working directory for execution (will be created if it doesn't exist)
   */
  cwd?: string;
  /**
   * Environment variables to set (will be merged with isolated env)
   */
  env?: Record<string, string>;
  /**
   * Standard I/O options
   */
  stdio?: 'pipe' | 'inherit' | 'ignore';
  /**
   * Timeout in milliseconds
   */
  timeout?: number;
}

/**
 * Creates an isolated environment for executing external tools.
 * This prevents tools from accessing the parent workspace's npm/node_modules context,
 * which can cause failures when tools run npm list or check for dependencies.
 * 
 * Key isolation features:
 * - Creates a clean temporary directory
 * - Sets environment variables to prevent npm from checking parent workspace
 * - Preserves PATH so globally installed tools remain accessible
 * - Creates minimal package.json in temp dir to satisfy npm checks
 */
export class IsolatedToolExecutor {
  private tempDir: string | null = null;

  /**
   * Creates a temporary directory for isolated execution
   */
  async createIsolatedEnvironment(): Promise<string> {
    if (this.tempDir && fs.existsSync(this.tempDir)) {
      return this.tempDir;
    }

    // Create a unique temporary directory in system temp (not workspace)
    // This ensures npm won't find parent workspace package.json files
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbonara-tool-'));
    
    // Create a minimal package.json to satisfy npm checks
    // This prevents npm from traversing up to parent directories
    const minimalPackageJson = {
      name: 'carbonara-tool-execution',
      version: '1.0.0',
      private: true,
      description: 'Isolated environment for Carbonara tool execution'
    };
    
    fs.writeFileSync(
      path.join(this.tempDir, 'package.json'),
      JSON.stringify(minimalPackageJson, null, 2)
    );

    // Create .npmrc to prevent npm from checking parent directories
    const npmrcContent = [
      'package-lock=false',
      'save=false',
      'audit=false',
      'fund=false',
      'loglevel=error'
    ].join('\n');
    
    fs.writeFileSync(
      path.join(this.tempDir, '.npmrc'),
      npmrcContent
    );

    return this.tempDir;
  }

  /**
   * Gets isolated environment variables
   */
  private getIsolatedEnv(additionalEnv?: Record<string, string>): Record<string, string> {
    // Filter out undefined values from process.env
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    // Preserve PATH so globally installed tools are accessible
    // PATH is already set correctly from process.env

    // Set npm configuration to prevent checking parent workspace
    // Create a separate npm cache/config directory in temp to avoid workspace issues
    const npmConfigDir = path.join(this.tempDir || os.tmpdir(), '.npm-config');
    if (!fs.existsSync(npmConfigDir)) {
      fs.mkdirSync(npmConfigDir, { recursive: true });
    }
    
    env.NPM_CONFIG_PREFIX = npmConfigDir;
    env.NPM_CONFIG_CACHE = npmConfigDir;
    
    // Suppress npm warnings/errors that don't affect tool functionality
    env.NPM_CONFIG_LOGLEVEL = 'error';
    env.NPM_CONFIG_AUDIT = 'false';
    env.NPM_CONFIG_FUND = 'false';
    
    // Prevent npm from traversing up to parent directories
    // Set npm to not check for package.json in parent directories
    env.NPM_CONFIG_IGNORE_SCRIPTS = 'false'; // We want scripts, just not parent checks
    
    // Set working directory context
    if (this.tempDir) {
      env.PWD = this.tempDir;
    }

    // Merge any additional environment variables
    if (additionalEnv) {
      Object.assign(env, additionalEnv);
    }

    return env;
  }

  /**
   * Executes a command in an isolated environment
   */
  async execute(options: IsolatedExecutionOptions): Promise<execa.ExecaReturnValue<string>> {
    // Ensure isolated environment exists
    const cwd = options.cwd || await this.createIsolatedEnvironment();
    
    // Ensure working directory exists
    if (!fs.existsSync(cwd)) {
      fs.mkdirSync(cwd, { recursive: true });
    }

    // Get isolated environment
    const env = this.getIsolatedEnv(options.env);

    // Execute command
    return await execa(options.command, options.args || [], {
      cwd,
      env,
      stdio: options.stdio || 'pipe',
      timeout: options.timeout,
      reject: false // We'll handle errors ourselves
    });
  }

  /**
   * Cleans up the temporary directory
   */
  cleanup(): void {
    if (this.tempDir && fs.existsSync(this.tempDir)) {
      try {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
        console.warn(`Warning: Could not clean up temp directory ${this.tempDir}:`, error);
      }
      this.tempDir = null;
    }
  }

  /**
   * Gets the current temporary directory path
   */
  getTempDir(): string | null {
    return this.tempDir;
  }
}

/**
 * Convenience function to execute a command in isolation
 */
export async function executeInIsolation(
  command: string,
  args?: string[],
  options?: Omit<IsolatedExecutionOptions, 'command' | 'args'>
): Promise<execa.ExecaReturnValue<string>> {
  const executor = new IsolatedToolExecutor();
  try {
    return await executor.execute({
      command,
      args,
      ...options
    });
  } finally {
    executor.cleanup();
  }
}

