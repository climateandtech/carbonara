/**
 * Node.js profiler adapter using V8 CPU profiler
 */

import { BaseProfilerAdapter } from './base-adapter.js';
import type { CpuProfileResult, CpuProfileLine } from '../cpu-profiler-service.js';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';

export class NodeProfilerAdapter extends BaseProfilerAdapter {
  constructor(appName?: string) {
    super('node', appName || 'node-app');
  }

  async checkAvailability(): Promise<boolean> {
    // V8 profiler is built-in to Node.js, so always available if Node.js is available
    return await this.commandExists('node');
  }

  getInstallInstructions(): string {
    return 'Node.js CPU profiler is built-in. No installation required.';
  }

  async profile(
    command: string,
    duration: number,
    options?: Record<string, any>
  ): Promise<CpuProfileResult> {
    const outputDir = path.join(tmpdir(), `cpu-profile-${Date.now()}`);
    await fs.promises.mkdir(outputDir, { recursive: true });

    const cpuProfileFile = path.join(outputDir, 'cpuprofile.json');

    try {
      // Run Node with CPU profiler
      // The --cpu-prof flag creates a .cpuprofile file
      const nodeCommand = `node --cpu-prof --cpu-prof-dir="${outputDir}" ${command}`;
      
      // We need to run this in a way that we can control the duration
      // For now, we'll use a timeout wrapper
      const timeoutCommand = `timeout ${duration} ${nodeCommand} || true`;
      
      // Note: This is a simplified approach. In practice, we'd need to:
      // 1. Start the process
      // 2. Wait for duration
      // 3. Signal it to stop (SIGUSR2 for Node.js to stop profiling)
      // 4. Parse the .cpuprofile file
      
      // For now, let's assume the command will run for the duration
      await this.executeCommand(timeoutCommand, options?.cwd, duration + 10);

      // Find the generated .cpuprofile file
      const files = await fs.promises.readdir(outputDir);
      const cpuProfilePath = files.find(f => f.endsWith('.cpuprofile'));
      
      if (!cpuProfilePath) {
        throw new Error('No CPU profile file generated');
      }

      const fullPath = path.join(outputDir, cpuProfilePath);
      const profileData = await this.readJsonFile(fullPath);
      
      const lines = this.parseCpuProfile(profileData);

      // Cleanup
      await fs.promises.rm(outputDir, { recursive: true, force: true }).catch(() => {});

      return this.createProfileResult(
        lines,
        profileData.samples?.length || 0,
        options?.scenario
      );
    } catch (error: any) {
      // Cleanup on error
      await fs.promises.rm(outputDir, { recursive: true, force: true }).catch(() => {});
      throw new Error(`Node.js profiling failed: ${error.message}`);
    }
  }

  private parseCpuProfile(data: any): CpuProfileLine[] {
    const lines: CpuProfileLine[] = [];
    const lineMap = new Map<string, { samples: number; function?: string }>();

    if (!data.nodes || !data.samples) {
      return lines;
    }

    const nodes = data.nodes || [];
    const samples = data.samples || [];
    const timeDeltas = data.timeDeltas || [];

    // Build a map of node IDs to their information
    const nodeInfo = new Map<number, { file?: string; line?: number; function?: string }>();
    
    nodes.forEach((node: any, idx: number) => {
      if (node.callFrame) {
        const url = node.callFrame.url || '';
        const lineNumber = node.callFrame.lineNumber || 0;
        const functionName = node.callFrame.functionName || '';
        
        // Only process file:// URLs (source code files)
        if (url.startsWith('file://')) {
          const file = this.normalizeFilePath(url.replace('file://', ''));
          nodeInfo.set(idx, { file, line: lineNumber + 1, function: functionName });
        }
      }
    });

    // Aggregate samples by file and line
    samples.forEach((nodeId: number) => {
      const info = nodeInfo.get(nodeId);
      if (!info || !info.file) return;

      const key = `${info.file}:${info.line}`;
      const existing = lineMap.get(key) || { samples: 0 };
      existing.samples++;
      if (info.function && !existing.function) {
        existing.function = info.function;
      }
      lineMap.set(key, existing);
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
        function: value.function
      });
    });

    // Sort by samples descending
    return lines.sort((a, b) => b.samples - a.samples);
  }
}

