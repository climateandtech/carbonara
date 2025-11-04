/**
 * CPU Profiling Service - Unified profiler result format
 */

export interface CpuProfileLine {
  file: string;           // Absolute path
  function?: string;       // Function name if available
  line: number;
  samples: number;
  cpu_ms?: number;         // Optional, if available
  percent: number;         // (samples / samples_total) * 100
  note?: string;          // Optional tags: hot|io|lock|alloc
}

export interface CpuProfileResult {
  app: string;
  lang: "python" | "node" | "ruby" | "go" | "unknown";
  timestamp: string;
  samples_total: number;
  lines: CpuProfileLine[];
  scenario?: {
    type: "url" | "test" | "server";
    value: string;
  };
}

/**
 * Base interface for profiler adapters
 */
export interface ProfilerAdapter {
  /**
   * Check if the profiler tool is available
   */
  checkAvailability(): Promise<boolean>;

  /**
   * Run profiling and return normalized results
   */
  profile(
    command: string,
    duration: number,
    options?: Record<string, any>
  ): Promise<CpuProfileResult>;

  /**
   * Get installation instructions if profiler is not available
   */
  getInstallInstructions(): string;
}

