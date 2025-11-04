/**
 * Python profiler adapter using py-spy or Scalene
 */

import { BaseProfilerAdapter } from './base-adapter.js';
import type { CpuProfileResult, CpuProfileLine } from '../cpu-profiler-service.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

export class PythonProfilerAdapter extends BaseProfilerAdapter {
  private usePySpy: boolean = true;

  constructor(appName?: string) {
    super('python', appName || 'python-app');
  }

  async checkAvailability(): Promise<boolean> {
    // Check for py-spy first (preferred)
    const hasPySpy = await this.commandExists('py-spy');
    if (hasPySpy) {
      this.usePySpy = true;
      return true;
    }

    // Check for Scalene
    const hasScalene = await this.commandExists('scalene');
    if (hasScalene) {
      this.usePySpy = false;
      return true;
    }

    return false;
  }

  getInstallInstructions(): string {
    if (this.usePySpy) {
      return 'Install py-spy: pip install py-spy';
    }
    return 'Install Scalene: pip install scalene';
  }

  async profile(
    command: string,
    duration: number,
    options?: Record<string, any>
  ): Promise<CpuProfileResult> {
    const isAvailable = await this.checkAvailability();
    if (!isAvailable) {
      throw new Error(`Profiler not available. ${this.getInstallInstructions()}`);
    }

    if (this.usePySpy) {
      return this.profileWithPySpy(command, duration, options);
    } else {
      return this.profileWithScalene(command, duration, options);
    }
  }

  private async profileWithPySpy(
    command: string,
    duration: number,
    options?: Record<string, any>
  ): Promise<CpuProfileResult> {
    const outputFile = this.createTempFile('py-spy-profile', '.speedscope.json');
    const rate = options?.rate || 99;
    const nonblocking = options?.nonblocking !== false;

    try {
      // Start the command in background
      const { spawn } = await import('child_process');
      const process = spawn('sh', ['-c', command], { detached: true });
      const pid = process.pid;

      if (!pid) {
        throw new Error('Failed to start process');
      }

      // Wait a bit for process to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Run py-spy to record
      const pySpyCommand = `py-spy record --pid ${pid} --duration ${duration} --rate ${rate} ${nonblocking ? '--nonblocking' : ''} -o ${outputFile}`;
      await this.executeCommand(pySpyCommand);

      // Parse speedscope JSON
      const profileData = await this.readJsonFile(outputFile);
      const lines = this.parseSpeedscopeProfile(profileData);

      // Cleanup
      await fs.promises.unlink(outputFile).catch(() => {});

      return this.createProfileResult(
        lines,
        profileData.samples?.length || 0,
        options?.scenario
      );
    } catch (error: any) {
      // Cleanup on error
      await fs.promises.unlink(outputFile).catch(() => {});
      throw new Error(`Py-spy profiling failed: ${error.message}`);
    }
  }

  private async profileWithScalene(
    command: string,
    duration: number,
    options?: Record<string, any>
  ): Promise<CpuProfileResult> {
    const outputFile = this.createTempFile('scalene-profile', '.txt');

    try {
      // Run Scalene with profiling
      const scaleneCommand = `scalene --profile-only --cpu-only --outfile ${outputFile} ${command}`;
      await this.executeCommand(scaleneCommand);

      // Parse Scalene text output
      const content = await fs.promises.readFile(outputFile, 'utf-8');
      const lines = this.parseScaleneOutput(content);

      // Cleanup
      await fs.promises.unlink(outputFile).catch(() => {});

      // Estimate total samples from duration (Scalene doesn't provide exact count)
      const estimatedSamples = duration * 100; // Rough estimate

      return this.createProfileResult(
        lines,
        estimatedSamples,
        options?.scenario
      );
    } catch (error: any) {
      // Cleanup on error
      await fs.promises.unlink(outputFile).catch(() => {});
      throw new Error(`Scalene profiling failed: ${error.message}`);
    }
  }

  private parseSpeedscopeProfile(data: any): CpuProfileLine[] {
    const lines: CpuProfileLine[] = [];
    const lineMap = new Map<string, { samples: number; cpu_ms?: number }>();

    if (!data.shared || !data.profiles) {
      return lines;
    }

    const frames = data.shared.frames || [];
    const samples = data.profiles[0]?.samples || [];

    // Group samples by file and line
    samples.forEach((sample: any) => {
      if (!sample || !Array.isArray(sample)) return;

      sample.forEach((frameIdx: number) => {
        const frame = frames[frameIdx];
        if (!frame || !frame.file) return;

        const file = this.normalizeFilePath(frame.file);
        const line = frame.line || 0;
        const key = `${file}:${line}`;

        const existing = lineMap.get(key) || { samples: 0, cpu_ms: 0 };
        existing.samples++;
        lineMap.set(key, existing);
      });
    });

    const totalSamples = samples.length;

    // Convert to CpuProfileLine format
    lineMap.forEach((value, key) => {
      const [file, lineStr] = key.split(':');
      const line = parseInt(lineStr, 10);
      const percent = totalSamples > 0 ? (value.samples / totalSamples) * 100 : 0;

      lines.push({
        file,
        line,
        samples: value.samples,
        percent,
        function: frames.find((f: any) => f.file === file && f.line === line)?.name
      });
    });

    // Sort by samples descending
    return lines.sort((a, b) => b.samples - a.samples);
  }

  private parseScaleneOutput(content: string): CpuProfileLine[] {
    const lines: CpuProfileLine[] = [];
    const lineMap = new Map<string, { samples: number; percent: number }>();

    // Parse Scalene's per-line CPU percentage format
    // Format: "path/to/file.py:123: 45.2%"
    const lineRegex = /^(.+):(\d+):\s+(\d+\.?\d*)%/gm;
    let match;

    while ((match = lineRegex.exec(content)) !== null) {
      const file = this.normalizeFilePath(match[1]);
      const line = parseInt(match[2], 10);
      const percent = parseFloat(match[3]);
      const key = `${file}:${line}`;

      lineMap.set(key, { samples: Math.round(percent * 10), percent }); // Rough estimate
    }

    // Calculate total samples for percentage calculation
    const totalPercent = Array.from(lineMap.values()).reduce((sum, v) => sum + v.percent, 0);
    const totalSamples = totalPercent > 0 ? Math.round(totalPercent * 10) : 1000;

    // Convert to CpuProfileLine format
    lineMap.forEach((value, key) => {
      const [file, lineStr] = key.split(':');
      const line = parseInt(lineStr, 10);

      lines.push({
        file,
        line,
        samples: value.samples,
        percent: value.percent
      });
    });

    // Sort by percent descending
    return lines.sort((a, b) => b.percent - a.percent);
  }
}

