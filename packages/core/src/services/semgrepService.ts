/**
 * Semgrep Service for Carbonara
 * Provides TypeScript interface to the Python Semgrep runner
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { promisify } from "util";
import { fileURLToPath } from "url";

const fsAccess = promisify(fs.access);

// ESM-compliant __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Represents severity levels for Semgrep findings
 */
export enum SemgrepSeverity {
  ERROR = "ERROR",
  WARNING = "WARNING",
  INFO = "INFO",
}

/**
 * Represents a single Semgrep match/finding
 */
export interface SemgrepMatch {
  rule_id: string;
  path: string;
  start_line: number;
  end_line: number;
  start_column: number;
  end_column: number;
  message: string;
  severity: string;
  code_snippet: string;
  fix?: string;
  metadata?: Record<string, any>;
}

/**
 * Container for Semgrep analysis results
 */
export interface SemgrepResult {
  success: boolean;
  matches: SemgrepMatch[];
  errors: string[];
  stats: {
    total_matches: number;
    error_count: number;
    warning_count: number;
    info_count: number;
    files_scanned: number;
  };
}

/**
 * Configuration options for the Semgrep service
 */
export interface SemgrepServiceConfig {
  pythonPath?: string;
  rulesDir?: string;
  useBundledPython?: boolean;
  timeout?: number;
}

/**
 * Service for running Semgrep analysis
 */
export class SemgrepService {
  private pythonPath: string;
  private runnerPath: string;
  private rulesDir: string;
  private useBundledPython: boolean;
  private timeout: number;

  constructor(config: SemgrepServiceConfig = {}) {
    this.pythonPath = config.pythonPath || "python3";
    this.useBundledPython = config.useBundledPython ?? false;
    this.timeout = config.timeout || 60000; // Default 60 seconds

    // Resolve paths relative to the core package root
    const packageRoot = path.resolve(__dirname, "..", "..");
    this.runnerPath = path.join(packageRoot, "python", "semgrep_runner.py");
    this.rulesDir =
      config.rulesDir || path.join(packageRoot, "semgrep", "rules");

    // If using bundled Python, update the path
    if (this.useBundledPython) {
      const platform = process.platform;
      if (platform === "win32") {
        this.pythonPath = path.join(
          packageRoot,
          "python-dist",
          "venv",
          "Scripts",
          "python.exe"
        );
      } else {
        this.pythonPath = path.join(
          packageRoot,
          "python-dist",
          "venv",
          "bin",
          "python"
        );
      }
    }
  }

  /**
   * Check if the Python environment and Semgrep are properly set up
   */
  async checkSetup(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check if runner script exists
    try {
      await fsAccess(this.runnerPath, fs.constants.R_OK);
    } catch {
      errors.push(`Runner script not found at: ${this.runnerPath}`);
    }

    // Check if rules directory exists
    try {
      await fsAccess(this.rulesDir, fs.constants.R_OK);
    } catch {
      errors.push(`Rules directory not found at: ${this.rulesDir}`);
    }

    // Check if Python is available
    const pythonCheck = await this.runCommand([this.pythonPath, "--version"]);
    if (!pythonCheck.success) {
      errors.push(`Python not available at: ${this.pythonPath}`);
    }

    // Check if Semgrep is installed
    const semgrepCheck = await this.runCommand([
      this.pythonPath,
      this.runnerPath,
      "--help",
    ]);
    if (!semgrepCheck.success) {
      errors.push("Semgrep runner not working properly");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Install Semgrep in the Python environment
   */
  async installSemgrep(): Promise<boolean> {
    const result = await this.runCommand([
      this.pythonPath,
      "-m",
      "pip",
      "install",
      "semgrep",
    ]);
    return result.success;
  }

  /**
   * Run Semgrep analysis on a single file
   */
  async analyzeFile(filePath: string): Promise<SemgrepResult> {
    const args = [this.runnerPath, filePath, "--json"];

    args.push("--rules-dir", this.rulesDir);

    const result = await this.runCommand([this.pythonPath, ...args]);

    if (result.success && result.stdout) {
      try {
        return JSON.parse(result.stdout) as SemgrepResult;
      } catch (e) {
        return {
          success: false,
          matches: [],
          errors: [`Failed to parse Semgrep output: ${e}`],
          stats: {
            total_matches: 0,
            error_count: 0,
            warning_count: 0,
            info_count: 0,
            files_scanned: 0,
          },
        };
      }
    }

    return {
      success: false,
      matches: [],
      errors: [result.stderr || "Unknown error running Semgrep"],
      stats: {
        total_matches: 0,
        error_count: 0,
        warning_count: 0,
        info_count: 0,
        files_scanned: 0,
      },
    };
  }

  /**
   * Run Semgrep analysis on a directory
   */
  async analyzeDirectory(dirPath: string): Promise<SemgrepResult> {
    const args = [this.runnerPath, dirPath, "--json"];

    args.push("--rules-dir", this.rulesDir);

    const result = await this.runCommand([this.pythonPath, ...args]);

    if (result.success && result.stdout) {
      try {
        return JSON.parse(result.stdout) as SemgrepResult;
      } catch (e) {
        return {
          success: false,
          matches: [],
          errors: [`Failed to parse Semgrep output: ${e}`],
          stats: {
            total_matches: 0,
            error_count: 0,
            warning_count: 0,
            info_count: 0,
            files_scanned: 0,
          },
        };
      }
    }

    return {
      success: false,
      matches: [],
      errors: [result.stderr || "Unknown error running Semgrep"],
      stats: {
        total_matches: 0,
        error_count: 0,
        warning_count: 0,
        info_count: 0,
        files_scanned: 0,
      },
    };
  }

  /**
   * Run Semgrep analysis on multiple targets
   */
  async analyze(targets: string[]): Promise<SemgrepResult> {
    const args = [this.runnerPath, ...targets, "--json"];

    args.push("--rules-dir", this.rulesDir);

    const result = await this.runCommand([this.pythonPath, ...args]);

    if (result.success && result.stdout) {
      try {
        return JSON.parse(result.stdout) as SemgrepResult;
      } catch (e) {
        return {
          success: false,
          matches: [],
          errors: [`Failed to parse Semgrep output: ${e}`],
          stats: {
            total_matches: 0,
            error_count: 0,
            warning_count: 0,
            info_count: 0,
            files_scanned: 0,
          },
        };
      }
    }

    return {
      success: false,
      matches: [],
      errors: [result.stderr || "Unknown error running Semgrep"],
      stats: {
        total_matches: 0,
        error_count: 0,
        warning_count: 0,
        info_count: 0,
        files_scanned: 0,
      },
    };
  }

  /**
   * Get available Semgrep rules
   */
  async getAvailableRules(): Promise<string[]> {
    try {
      const files = await promisify(fs.readdir)(this.rulesDir);
      return files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
    } catch {
      return [];
    }
  }

  /**
   * Format Semgrep results for display
   */
  formatResults(result: SemgrepResult): string {
    if (!result.success) {
      return `Analysis failed:\n${result.errors.join("\n")}`;
    }

    const lines: string[] = [];

    // Summary
    lines.push("=== Semgrep Analysis Results ===");
    lines.push(`Total findings: ${result.stats.total_matches}`);
    lines.push(`  Errors: ${result.stats.error_count}`);
    lines.push(`  Warnings: ${result.stats.warning_count}`);
    lines.push(`  Info: ${result.stats.info_count}`);
    lines.push(`Files scanned: ${result.stats.files_scanned}`);
    lines.push("");

    // Detailed findings
    if (result.matches.length > 0) {
      lines.push("=== Findings ===");
      for (const match of result.matches) {
        lines.push(`\n[${match.severity}] ${match.rule_id}`);
        lines.push(
          `  File: ${match.path}:${match.start_line}-${match.end_line}`
        );
        lines.push(`  Message: ${match.message}`);
        if (match.code_snippet) {
          const snippet = match.code_snippet.substring(0, 200);
          lines.push(
            `  Code: ${snippet}${match.code_snippet.length > 200 ? "..." : ""}`
          );
        }
        if (match.fix) {
          lines.push(`  Fix available: ${match.fix}`);
        }
      }
    } else {
      lines.push("No issues found! ✓");
    }

    return lines.join("\n");
  }

  /**
   * Helper method to run a command with timeout
   */
  private runCommand(
    args: string[]
  ): Promise<{ success: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(args[0], args.slice(1), {
        timeout: this.timeout,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (error) => {
        resolve({
          success: false,
          stdout,
          stderr: stderr || error.message,
        });
      });

      child.on("close", (code) => {
        // Exit code 0 = success, 1 = findings exist (still success), other = error
        resolve({
          success: code === 0 || code === 1,
          stdout,
          stderr,
        });
      });
    });
  }
}

/**
 * Factory function to create a Semgrep service instance
 */
export function createSemgrepService(
  config?: SemgrepServiceConfig
): SemgrepService {
  return new SemgrepService(config);
}

/**
 * Setup bundled Python environment for Semgrep
 * This should be called during installation or first run
 */
export async function setupBundledEnvironment(): Promise<boolean> {
  const packageRoot = path.resolve(__dirname, "..", "..");
  const setupScript = path.join(packageRoot, "python", "setup.py");

  return new Promise((resolve) => {
    const child = spawn("python3", [setupScript, "--all"], {
      cwd: packageRoot,
      stdio: "inherit",
    });

    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}
