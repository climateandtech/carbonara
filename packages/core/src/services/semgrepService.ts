/**
 * Semgrep Service for Carbonara
 * Provides TypeScript interface to run Semgrep CLI directly
 * 
 * MIGRATED: This service now calls semgrep CLI directly instead of using the Python runner.
 * The Python runner (semgrep_runner.py) is kept for backward compatibility but is deprecated.
 */

import { execaCommand } from "execa";
import * as path from "path";
import * as fs from "fs";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const fsAccess = promisify(fs.access);

// ESM-compliant __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Default exclusion patterns for Semgrep analysis
 * These patterns exclude directories and file types that should not be analyzed
 */
const DEFAULT_SEMGREP_EXCLUSIONS = [
  // Build and dependency directories
  "node_modules",
  "dist",
  "build",
  "vendor",
  ".git",
  // Python virtual environments
  "__pycache__",
  ".venv",
  "venv",
  // Project-specific
  ".carbonara",
  // Documentation and non-code files
  "docs",
  "*.html",
  "*.md",
  "*.txt",
  // Config files (Semgrep can't parse these properly)
  "*.json",
  "*.yaml",
  "*.yml",
  "*.lock",
  "*.log",
  // Minified files
  "*.min.js",
];

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
 * Now uses semgrep CLI directly instead of Python runner
 */
export class SemgrepService {
  private rulesDir: string;
  private timeout: number;
  // Keep useBundledPython for backward compatibility (ignored)
  private useBundledPython: boolean;

  constructor(config: SemgrepServiceConfig = {}) {
    this.useBundledPython = config.useBundledPython ?? false; // Kept for backward compatibility
    this.timeout = config.timeout || 60000; // Default 60 seconds

    // Resolve paths relative to the core package root
    const packageRoot = path.resolve(__dirname, "..", "..");
    this.rulesDir =
      config.rulesDir || path.join(packageRoot, "semgrep", "rules");
  }

  /**
   * Check if Semgrep CLI and rules directory are properly set up
   */
  async checkSetup(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check if rules directory exists
    try {
      await fsAccess(this.rulesDir, fs.constants.R_OK);
    } catch {
      errors.push(`Rules directory not found at: ${this.rulesDir}`);
    }

    // Check if Semgrep CLI is available
    try {
      const result = await execaCommand("semgrep --version", {
        stdio: "pipe",
        timeout: 5000,
        reject: false,
        shell: true,
      });

      if (result.exitCode !== 0) {
        errors.push("Semgrep CLI is not available. Please install it with: pip install semgrep");
      }
    } catch (error: any) {
      errors.push("Semgrep CLI is not available. Please install it with: pip install semgrep");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Run Semgrep analysis on a single file
   */
  async analyzeFile(filePath: string): Promise<SemgrepResult> {
    return this.runSemgrepAnalysis([filePath]);
  }

  /**
   * Run Semgrep analysis on a directory
   */
  async analyzeDirectory(dirPath: string): Promise<SemgrepResult> {
    return this.runSemgrepAnalysis([dirPath]);
  }

  /**
   * Run Semgrep analysis on multiple targets
   */
  async analyze(targets: string[]): Promise<SemgrepResult> {
    return this.runSemgrepAnalysis(targets);
  }

  /**
   * Core method to run Semgrep CLI analysis
   * Builds the command and parses JSON output
   */
  private async runSemgrepAnalysis(targets: string[]): Promise<SemgrepResult> {
    // Validate targets exist
    for (const target of targets) {
      try {
        await fsAccess(target, fs.constants.R_OK);
      } catch {
        return {
          success: false,
          matches: [],
          errors: [`Target path not found: ${target}`],
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

    // Build semgrep command
    // Same structure as Python runner: semgrep --config <rulesDir> --json --metrics=off --exclude ... <targets>
    const cmdParts = [
      "semgrep",
      "--config",
      this.rulesDir,
      "--json",
      "--metrics=off",
      ...DEFAULT_SEMGREP_EXCLUSIONS.flatMap((pattern) => ["--exclude", pattern]),
      ...targets,
    ];

    const command = cmdParts.join(" ");

    try {
      // Use longer timeout for directory scans (5 minutes)
      const timeout = targets.some((t) => {
        try {
          const stat = fs.statSync(t);
          return stat.isDirectory();
        } catch {
          return false;
        }
      })
        ? 300000
        : 60000;

      const result = await execaCommand(command, {
        stdio: "pipe",
        timeout,
        reject: false,
        shell: true,
      });

      // Semgrep exit codes: 0 = success, 1 = findings found (still success)
      // Exit codes 2+ might indicate errors, but we should still try to parse JSON output
      // as Semgrep may return valid results even with some parsing errors
      if (result.stdout) {
        try {
          const data = JSON.parse(result.stdout);
          const parsed = this.parseSemgrepOutput(data);
          
          // If we have matches, it's a success even if there were parsing errors
          // Only fail if exit code is clearly an error AND we have no matches AND no critical errors
          if (parsed.matches.length > 0) {
            // We have results - treat as success even if exit code suggests errors
            return {
              ...parsed,
              success: true,
            };
          }
          
          // No matches - check if exit code indicates success (0 or 1)
          if (result.exitCode === 0 || result.exitCode === 1) {
            return parsed;
          }
          
          // Exit code suggests error, but check if errors are just parsing issues
          const hasOnlyParsingErrors = parsed.errors.every((e) => 
            e.includes("PartialParsing") || 
            e.includes("Syntax error") ||
            e.includes("Unknown language")
          );
          
          if (hasOnlyParsingErrors) {
            // Only parsing errors - treat as success (no code issues found)
            return {
              ...parsed,
              success: true,
            };
          }
          
          // Real errors - return as failure
          return parsed;
        } catch (e) {
          // Failed to parse JSON - this is a real error
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
      } else {
        // No output - check exit code
        if (result.exitCode === 0 || result.exitCode === 1) {
          // No output but exit code indicates success - no findings
          return {
            success: true,
            matches: [],
            errors: [],
            stats: {
              total_matches: 0,
              error_count: 0,
              warning_count: 0,
              info_count: 0,
              files_scanned: 0,
            },
          };
        } else {
          // Error exit code with no output - real error
          const errorMsg =
            result.stderr || "Unknown error running Semgrep";
          return {
            success: false,
            matches: [],
            errors: [errorMsg],
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
    } catch (error: any) {
      if (error.isCanceled || error.timedOut) {
        return {
          success: false,
          matches: [],
          errors: [
            `Semgrep execution timed out after ${this.timeout}ms`,
          ],
          stats: {
            total_matches: 0,
            error_count: 0,
            warning_count: 0,
            info_count: 0,
            files_scanned: 0,
          },
        };
      }

      return {
        success: false,
        matches: [],
        errors: [`Unexpected error running Semgrep: ${error.message}`],
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

  /**
   * Parse Semgrep JSON output into structured result
   * Same structure as Python runner's _parse_semgrep_output()
   */
  private parseSemgrepOutput(data: any): SemgrepResult {
    const matches: SemgrepMatch[] = [];
    const errors: string[] = [];

    // Extract results
    for (const result of data.results || []) {
      const match: SemgrepMatch = {
        rule_id: result.check_id || "",
        path: result.path || "",
        start_line: result.start?.line || 0,
        end_line: result.end?.line || 0,
        start_column: result.start?.col || 0,
        end_column: result.end?.col || 0,
        message: result.extra?.message || "",
        severity: result.extra?.severity || "WARNING",
        code_snippet: result.extra?.lines || "",
        fix: result.extra?.fix,
        metadata: result.extra?.metadata || {},
      };
      matches.push(match);
    }

    // Extract errors if any
    for (const error of data.errors || []) {
      errors.push(
        `${error.type || "Error"}: ${error.message || "Unknown error"}`
      );
    }

    // Calculate statistics
    const stats = {
      total_matches: matches.length,
      error_count: matches.filter((m) => m.severity === "ERROR").length,
      warning_count: matches.filter((m) => m.severity === "WARNING").length,
      info_count: matches.filter((m) => m.severity === "INFO").length,
      files_scanned:
        matches.length > 0
          ? new Set(matches.map((m) => m.path)).size
          : 0,
    };

    // Success if we have matches OR if there are no critical errors
    // Partial parsing errors (like HTML files) are non-fatal - we still return results
    // Only fail if there are no matches AND there are critical errors
    const hasCriticalErrors = errors.some((e) => 
      !e.includes("PartialParsing") && 
      !e.includes("Syntax error")
    );
    const success = matches.length > 0 || !hasCriticalErrors;

    return {
      matches,
      errors,
      stats,
      success,
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
    child.on("close", (code: number | null) => resolve(code === 0));
  });
}
