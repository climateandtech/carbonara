/**
 * Base profiler adapter interface and utilities
 */

import type { CpuProfileResult, CpuProfileLine, ProfilerAdapter } from '../cpu-profiler-service.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

/**
 * Base class for profiler adapters with common utilities
 */
export abstract class BaseProfilerAdapter implements ProfilerAdapter {
  protected language: string;
  protected appName: string;

  constructor(language: string, appName: string = 'app') {
    this.language = language;
    this.appName = appName;
  }

  abstract checkAvailability(): Promise<boolean>;
  abstract profile(
    command: string,
    duration: number,
    options?: Record<string, any>
  ): Promise<CpuProfileResult>;
  abstract getInstallInstructions(): string;

  /**
   * Execute a command and return stdout
   */
  protected async executeCommand(command: string, cwd?: string): Promise<string> {
    try {
      const { stdout } = await execAsync(command, { cwd, timeout: (duration || 30) * 1000 + 10000 });
      return stdout.trim();
    } catch (error: any) {
      throw new Error(`Command failed: ${error.message}`);
    }
  }

  /**
   * Check if a command exists in PATH
   */
  protected async commandExists(command: string): Promise<boolean> {
    try {
      await execAsync(`which ${command}`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a temporary file path
   */
  protected createTempFile(prefix: string, suffix: string): string {
    const tempDir = tmpdir();
    const fileName = `${prefix}-${Date.now()}${suffix}`;
    return path.join(tempDir, fileName);
  }

  /**
   * Read and parse JSON file
   */
  protected async readJsonFile(filePath: string): Promise<any> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Create a normalized CpuProfileResult
   */
  protected createProfileResult(
    lines: CpuProfileLine[],
    samplesTotal: number,
    scenario?: { type: 'url' | 'test' | 'server'; value: string }
  ): CpuProfileResult {
    return {
      app: this.appName,
      lang: this.language as any,
      timestamp: new Date().toISOString(),
      samples_total: samplesTotal,
      lines,
      scenario
    };
  }

  /**
   * Normalize file paths to absolute paths
   */
  protected normalizeFilePath(filePath: string, baseDir?: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    if (baseDir) {
      return path.resolve(baseDir, filePath);
    }
    return path.resolve(process.cwd(), filePath);
  }
}

