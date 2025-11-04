/**
 * Ruby profiler adapter using rbspy or stackprof
 */

import { BaseProfilerAdapter } from './base-adapter.js';
import type { CpuProfileResult, CpuProfileLine } from '../cpu-profiler-service.js';
import fs from 'fs';

export class RubyProfilerAdapter extends BaseProfilerAdapter {
  private useRbspy: boolean = true;

  constructor(appName?: string) {
    super('ruby', appName || 'ruby-app');
  }

  async checkAvailability(): Promise<boolean> {
    // Check for rbspy first (preferred, sampling)
    const hasRbspy = await this.commandExists('rbspy');
    if (hasRbspy) {
      this.useRbspy = true;
      return true;
    }

    // Check for stackprof (in-process)
    const hasStackprof = await this.commandExists('stackprof');
    if (hasStackprof) {
      this.useRbspy = false;
      return true;
    }

    return false;
  }

  getInstallInstructions(): string {
    if (this.useRbspy) {
      return 'Install rbspy: gem install rbspy';
    }
    return 'Install stackprof: gem install stackprof';
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

    if (this.useRbspy) {
      return this.profileWithRbspy(command, duration, options);
    } else {
      return this.profileWithStackprof(command, duration, options);
    }
  }

  private async profileWithRbspy(
    command: string,
    duration: number,
    options?: Record<string, any>
  ): Promise<CpuProfileResult> {
    const outputFile = this.createTempFile('rbspy-profile', '.speedscope.json');

    try {
      // Start the command in background
      const { spawn } = await import('child_process');
      const process = spawn('sh', ['-c', command]);
      const pid = process.pid;

      if (!pid) {
        throw new Error('Failed to start process');
      }

      // Wait a bit for process to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Run rbspy to record
      const rbspyCommand = `rbspy record --pid ${pid} --duration ${duration} --format speedscope -o ${outputFile}`;
      await this.executeCommand(rbspyCommand);

      // Parse speedscope JSON (same format as py-spy)
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
      throw new Error(`Rbspy profiling failed: ${error.message}`);
    }
  }

  private async profileWithStackprof(
    command: string,
    duration: number,
    options?: Record<string, any>
  ): Promise<CpuProfileResult> {
    const outputFile = this.createTempFile('stackprof-profile', '.dump');
    const textFile = this.createTempFile('stackprof-profile', '.txt');

    try {
      // Run with stackprof environment variable
      const env = { ...process.env, STACKPROF: 'cpu', STACKPROF_OUT: outputFile };
      const stackprofCommand = `STACKPROF=cpu STACKPROF_OUT=${outputFile} ${command}`;
      
      // Run with timeout
      const timeoutCommand = `timeout ${duration} ${stackprofCommand} || true`;
      await this.executeCommand(timeoutCommand, options?.cwd);

      // Generate text report with line information
      const reportCommand = `stackprof ${outputFile} --text --line > ${textFile}`;
      await this.executeCommand(reportCommand);

      // Parse text output
      const content = await fs.promises.readFile(textFile, 'utf-8');
      const lines = this.parseStackprofOutput(content);

      // Cleanup
      await fs.promises.unlink(outputFile).catch(() => {});
      await fs.promises.unlink(textFile).catch(() => {});

      // Estimate total samples
      const estimatedSamples = duration * 100;

      return this.createProfileResult(
        lines,
        estimatedSamples,
        options?.scenario
      );
    } catch (error: any) {
      // Cleanup on error
      await fs.promises.unlink(outputFile).catch(() => {});
      await fs.promises.unlink(textFile).catch(() => {});
      throw new Error(`Stackprof profiling failed: ${error.message}`);
    }
  }

  private parseSpeedscopeProfile(data: any): CpuProfileLine[] {
    // Reuse the same parsing logic as Python adapter
    const lines: CpuProfileLine[] = [];
    const lineMap = new Map<string, { samples: number }>();

    if (!data.shared || !data.profiles) {
      return lines;
    }

    const frames = data.shared.frames || [];
    const samples = data.profiles[0]?.samples || [];

    samples.forEach((sample: any) => {
      if (!sample || !Array.isArray(sample)) return;

      sample.forEach((frameIdx: number) => {
        const frame = frames[frameIdx];
        if (!frame || !frame.file) return;

        const file = this.normalizeFilePath(frame.file);
        const line = frame.line || 0;
        const key = `${file}:${line}`;

        const existing = lineMap.get(key) || { samples: 0 };
        existing.samples++;
        lineMap.set(key, existing);
      });
    });

    const totalSamples = samples.length;

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

    return lines.sort((a, b) => b.samples - a.samples);
  }

  private parseStackprofOutput(content: string): CpuProfileLine[] {
    const lines: CpuProfileLine[] = [];
    const lineMap = new Map<string, { samples: number; percent: number }>();

    // Parse stackprof's per-line output format
    // Format varies, but typically shows file:line with samples
    const lineRegex = /^(.+):(\d+).*?(\d+\.?\d*)%/gm;
    let match;

    while ((match = lineRegex.exec(content)) !== null) {
      const file = this.normalizeFilePath(match[1]);
      const line = parseInt(match[2], 10);
      const percent = parseFloat(match[3]);
      const key = `${file}:${line}`;

      lineMap.set(key, { samples: Math.round(percent * 10), percent });
    }

    const totalPercent = Array.from(lineMap.values()).reduce((sum, v) => sum + v.percent, 0);
    const totalSamples = totalPercent > 0 ? Math.round(totalPercent * 10) : 1000;

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

    return lines.sort((a, b) => b.percent - a.percent);
  }
}

