/**
 * CPU Profiler Integration for VS Code
 * Loads CPU profiling results from database and displays them as diagnostics
 */

import * as vscode from "vscode";
import * as path from "path";
import { createDataLake, type CpuProfileResult, type CpuProfileLine } from "@carbonara/core";

// Diagnostics collection for CPU profiler results
let cpuProfilerDiagnostics: vscode.DiagnosticCollection;

// Track loaded profiles
const loadedProfiles = new Map<string, CpuProfileResult>();

/**
 * Initialize the CPU profiler integration
 */
export function initializeCpuProfiler(
  context: vscode.ExtensionContext
): vscode.DiagnosticCollection {
  // Create diagnostics collection for CPU profiler
  cpuProfilerDiagnostics = vscode.languages.createDiagnosticCollection("cpu-profiler");
  context.subscriptions.push(cpuProfilerDiagnostics);

  // Load profiles on activation
  loadCpuProfilesFromDatabase();

  // Reload when database changes (if watching is implemented)
  // For now, we'll reload on command

  return cpuProfilerDiagnostics;
}

/**
 * Load CPU profiles from database and apply diagnostics
 */
export async function loadCpuProfilesFromDatabase(): Promise<void> {
  try {
    const dataLake = createDataLake();
    await dataLake.initialize();

    // Get all CPU profiler assessment data
    const entries = await dataLake.getAssessmentData(undefined, "cpu-profiler");

    // Filter for cpu-profile data type
    const profiles = entries
      .filter(entry => entry.data_type === "cpu-profile")
      .map(entry => entry.data as CpuProfileResult);

    loadedProfiles.clear();
    profiles.forEach(profile => {
      const key = `${profile.timestamp}-${profile.lang}`;
      loadedProfiles.set(key, profile);
    });

    // Apply diagnostics to all open editors
    applyCpuProfilerDiagnostics();

    await dataLake.close();

    if (profiles.length > 0) {
      vscode.window.showInformationMessage(
        `Loaded ${profiles.length} CPU profile(s) from database`
      );
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Failed to load CPU profiles: ${error.message}`
    );
  }
}

/**
 * Apply CPU profiler diagnostics to open editors
 */
function applyCpuProfilerDiagnostics(): void {
  // Clear existing diagnostics
  cpuProfilerDiagnostics.clear();

  if (loadedProfiles.size === 0) {
    return;
  }

  // Group lines by file
  const linesByFile = new Map<string, CpuProfileLine[]>();

  loadedProfiles.forEach(profile => {
    profile.lines.forEach(line => {
      const file = line.file;
      if (!linesByFile.has(file)) {
        linesByFile.set(file, []);
      }
      linesByFile.get(file)!.push(line);
    });
  });

  // Apply diagnostics to each file
  linesByFile.forEach((lines, filePath) => {
    applyDiagnosticsToFile(filePath, lines);
  });
}

/**
 * Apply diagnostics to a specific file
 */
function applyDiagnosticsToFile(
  filePath: string,
  lines: CpuProfileLine[]
): void {
  // Check if file exists
  try {
    const uri = vscode.Uri.file(filePath);
    
    // Group lines by line number (in case multiple profiles have the same line)
    const linesByLineNumber = new Map<number, CpuProfileLine[]>();
    
    lines.forEach(line => {
      const lineNum = line.line;
      if (!linesByLineNumber.has(lineNum)) {
        linesByLineNumber.set(lineNum, []);
      }
      linesByLineNumber.get(lineNum)!.push(line);
    });

    // Create diagnostics
    const diagnostics: vscode.Diagnostic[] = [];

    linesByLineNumber.forEach((lineGroup, lineNum) => {
      // Aggregate percent and samples from all profiles for this line
      const totalPercent = lineGroup.reduce((sum, l) => sum + l.percent, 0);
      const totalSamples = lineGroup.reduce((sum, l) => sum + l.samples, 0);
      const avgPercent = totalPercent / lineGroup.length;

      // Determine severity based on CPU percentage
      let severity: vscode.DiagnosticSeverity;
      if (avgPercent > 10) {
        severity = vscode.DiagnosticSeverity.Warning;
      } else if (avgPercent > 5) {
        severity = vscode.DiagnosticSeverity.Information;
      } else {
        severity = vscode.DiagnosticSeverity.Hint;
      }

      // Create range for the line
      const range = new vscode.Range(
        lineNum - 1,
        0,
        lineNum - 1,
        1000 // End of line
      );

      // Create message
      const functionName = lineGroup[0].function || "";
      const message = `CPU hotspot: ${avgPercent.toFixed(1)}% CPU usage (${totalSamples} samples)${functionName ? ` in ${functionName}` : ""}`;

      const diagnostic = new vscode.Diagnostic(range, message, severity);
      diagnostic.source = "cpu-profiler";
      diagnostic.code = `cpu-${lineNum}`;
      
      // Add related information
      diagnostic.relatedInformation = lineGroup.map(line => {
        return new vscode.DiagnosticRelatedInformation(
          new vscode.Location(
            uri,
            new vscode.Range(lineNum - 1, 0, lineNum - 1, 1000)
          ),
          `Profile: ${line.percent.toFixed(1)}% (${line.samples} samples)`
        );
      });

      diagnostics.push(diagnostic);
    });

    // Apply diagnostics
    cpuProfilerDiagnostics.set(uri, diagnostics);
  } catch (error) {
    // File might not exist or not be accessible
    // Silently skip
  }
}

/**
 * Clear all CPU profiler diagnostics
 */
export function clearCpuProfiles(): void {
  cpuProfilerDiagnostics.clear();
  loadedProfiles.clear();
  vscode.window.showInformationMessage("CPU profiler diagnostics cleared");
}

/**
 * Get CPU profiler diagnostics for a specific file
 */
export function getCpuProfilerDiagnostics(
  uri: vscode.Uri
): vscode.Diagnostic[] {
  const diagnostics = cpuProfilerDiagnostics.get(uri);
  return diagnostics ? [...diagnostics] : [];
}

/**
 * Check if a file has CPU profiler diagnostics
 */
export function hasCpuProfilerDiagnostics(uri: vscode.Uri): boolean {
  const diagnostics = cpuProfilerDiagnostics.get(uri);
  return diagnostics !== undefined && diagnostics.length > 0;
}

