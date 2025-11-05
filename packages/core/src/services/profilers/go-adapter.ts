/**
 * Go profiler adapter using pprof
 */

import { BaseProfilerAdapter } from './base-adapter.js';
import type { CpuProfileResult, CpuProfileLine } from '../cpu-profiler-service.js';
import fs from 'fs';

export class GoProfilerAdapter extends BaseProfilerAdapter {
  constructor(appName?: string) {
    super('go', appName || 'go-app');
  }

  async checkAvailability(): Promise<boolean> {
    // Check for go tool (includes pprof)
    return await this.commandExists('go');
  }

  getInstallInstructions(): string {
    return 'Go pprof is built-in. Install Go from https://golang.org/dl/';
  }

  async profile(
    command: string,
    duration: number,
    options?: Record<string, any>
  ): Promise<CpuProfileResult> {
    const outputFile = this.createTempFile('go-profile', '.pprof');

    try {
      // For Go, we need to modify the command to include pprof capture
      // This is a simplified approach - in practice, the Go code needs to include pprof
      // For now, we'll assume the command is a Go program that can be run with pprof enabled
      
      // Create a wrapper script that adds pprof to the Go program
      // This is a simplified version - in practice, the Go code should have pprof built-in
      
      // Alternative: If the Go program already has pprof HTTP endpoint, we can use that
      // For now, let's use the approach of adding pprof to a running process
      
      // Start the command
      const { spawn } = await import('child_process');
      const process = spawn('sh', ['-c', command]);
      const pid = process.pid;

      if (!pid) {
        throw new Error('Failed to start process');
      }

      // Wait a bit for process to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // For Go, we need the program to have pprof HTTP endpoint or we need to use runtime/pprof
      // This is a simplified version that assumes the program has pprof available
      // In practice, users would need to add pprof code to their Go program
      
      // For now, let's try to use go tool pprof if the program has an HTTP endpoint
      // Or we can use a timeout and then parse any pprof output
      
      // Wait for duration
      await new Promise(resolve => setTimeout(resolve, duration * 1000));
      
      // Try to get pprof data (this assumes the program has pprof HTTP endpoint)
      // This is a placeholder - actual implementation would depend on how the Go program is set up
      
      // For now, return an error message suggesting the user add pprof to their code
      throw new Error(
        'Go profiling requires pprof to be added to your Go code. ' +
        'Add runtime/pprof import and HTTP endpoint, or use the provided snippet.'
      );
      
    } catch (error: any) {
      // If it's our instruction error, throw it
      if (error.message.includes('pprof to be added')) {
        throw error;
      }
      
      // Otherwise, try to parse pprof output if it exists
      try {
        if (await fs.promises.access(outputFile).then(() => true).catch(() => false)) {
          const lines = await this.parsePprofOutput(outputFile);
          await fs.promises.unlink(outputFile).catch(() => {});
          
          return this.createProfileResult(
            lines,
            1000, // Estimate
            options?.scenario
          );
        }
      } catch {
        // Ignore
      }
      
      throw new Error(`Go profiling failed: ${error.message}`);
    }
  }

  private async parsePprofOutput(pprofFile: string): Promise<CpuProfileLine[]> {
    // Use go tool pprof to get text output
    const textFile = this.createTempFile('pprof-text', '.txt');
    
    try {
      const command = `go tool pprof -top -lines ${pprofFile} > ${textFile}`;
      await this.executeCommand(command, undefined, 60);
      
      const content = await fs.promises.readFile(textFile, 'utf-8');
      const lines = this.parsePprofTextOutput(content);
      
      await fs.promises.unlink(textFile).catch(() => {});
      return lines;
    } catch (error: any) {
      await fs.promises.unlink(textFile).catch(() => {});
      throw new Error(`Failed to parse pprof output: ${error.message}`);
    }
  }

  private parsePprofTextOutput(content: string): CpuProfileLine[] {
    const lines: CpuProfileLine[] = [];
    const lineMap = new Map<string, { samples: number; percent: number; cpu_ms?: number }>();

    // Parse pprof top -lines output format:
    // flat  flat%   sum%        cum   cum%
    // 4.50s 30.0% 30.0%      4.50s 30.0%  /srv/app/internal/auth/auth.go:112
    const lineRegex = /^\s*([\d.]+)(s|ms)?\s+([\d.]+)%[^/]*?(\/.+?):(\d+)/gm;
    let match;

    while ((match = lineRegex.exec(content)) !== null) {
      const timeValue = parseFloat(match[1]);
      const timeUnit = match[2] || 's';
      const percent = parseFloat(match[3]);
      const file = this.normalizeFilePath(match[4]);
      const line = parseInt(match[5], 10);
      
      const cpuMs = timeUnit === 'ms' ? timeValue : timeValue * 1000;
      const key = `${file}:${line}`;
      
      // Estimate samples from time (rough conversion)
      const samples = Math.round(percent * 10);
      
      lineMap.set(key, { samples, percent, cpu_ms: cpuMs });
    }

    lineMap.forEach((value, key) => {
      const [file, lineStr] = key.split(':');
      const line = parseInt(lineStr, 10);

      lines.push({
        file,
        line,
        samples: value.samples,
        percent: value.percent,
        cpu_ms: value.cpu_ms
      });
    });

    return lines.sort((a, b) => b.percent - a.percent);
  }
}

