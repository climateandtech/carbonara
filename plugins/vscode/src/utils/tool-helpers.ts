/**
 * Common utility functions for tool operations
 * Shared between semgrep-integration.ts and tools-tree-provider.ts
 */

import * as vscode from "vscode";
import { getToolRegistry } from "@carbonara/cli/dist/registry/index.js";
import { recordToolError, clearToolError } from "@carbonara/cli/dist/utils/config.js";

export interface PrerequisiteCheckResult {
  allAvailable: boolean;
  missing: Array<{ prerequisite: any }>;
}

/**
 * Get the current workspace folder path
 */
export function getWorkspacePath(): string | null {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  return workspaceFolder ? workspaceFolder.uri.fsPath : null;
}

/**
 * Check tool prerequisites and handle errors consistently
 * @param toolId The tool ID to check prerequisites for
 * @param toolName Optional tool name for error messages (defaults to toolId)
 * @param showUI Whether to show UI error messages
 * @param outputChannel Optional output channel to append error details
 * @returns Prerequisite check result, or null if prerequisites are missing
 */
export async function checkToolPrerequisitesWithErrorHandling(
  toolId: string,
  toolName?: string,
  showUI: boolean = true,
  outputChannel?: vscode.OutputChannel | null
): Promise<PrerequisiteCheckResult | null> {
  const registry = getToolRegistry();
  const prereqCheck = await registry.checkToolPrerequisites(toolId);

  if (!prereqCheck.allAvailable) {
    const displayName = toolName || toolId;
    const missingPrereqs = prereqCheck.missing
      .map(({ prerequisite }) => prerequisite.name)
      .join(", ");
    const setupInstructions = prereqCheck.missing
      .map(({ prerequisite }) => prerequisite.setupInstructions || prerequisite.errorMessage)
      .join("\n");

    if (showUI && outputChannel) {
      outputChannel.appendLine("Prerequisites missing:");
      prereqCheck.missing.forEach(({ prerequisite }) => {
        outputChannel.appendLine(`  • ${prerequisite.name}: ${prerequisite.errorMessage}`);
      });
      if (setupInstructions) {
        outputChannel.appendLine(`\nSetup instructions:\n${setupInstructions}`);
      }
      outputChannel.show();
      vscode.window
        .showErrorMessage(
          `${displayName} prerequisites missing: ${missingPrereqs}. Check Output for installation instructions.`,
          "View Output"
        )
        .then((selection) => {
          if (selection === "View Output") {
            outputChannel.show();
          }
        });
    } else {
      console.log(`${displayName} prerequisites missing: ${missingPrereqs}`);
    }

    // Record error in config for UI status display
    const workspacePath = getWorkspacePath();
    if (workspacePath) {
      try {
        await recordToolError(
          toolId,
          `Prerequisites missing: ${missingPrereqs}`,
          workspacePath
        );
      } catch (configError) {
        console.error(`Failed to record ${toolId} error in config:`, configError);
      }
    }

    return null;
  }

  return prereqCheck;
}

/**
 * Record a tool error in the config and optionally show UI
 * @param toolId The tool ID
 * @param errorMessage The error message
 * @param showUI Whether to show UI error messages
 * @param outputChannel Optional output channel to append error details
 */
export async function recordToolErrorWithUI(
  toolId: string,
  errorMessage: string,
  showUI: boolean = true,
  outputChannel?: vscode.OutputChannel | null
): Promise<void> {
  const workspacePath = getWorkspacePath();
  if (workspacePath) {
    try {
      await recordToolError(toolId, errorMessage, workspacePath);
    } catch (configError) {
      console.error(`Failed to record ${toolId} error in config:`, configError);
    }
  }

  if (showUI && outputChannel) {
    outputChannel.appendLine(`Error: ${errorMessage}`);
    outputChannel.show();
    vscode.window.showErrorMessage(
      `${toolId} failed. Check Output for details.`
    );
  }
}

/**
 * Clear a tool error from the config (called when tool succeeds)
 * @param toolId The tool ID
 */
export async function clearToolErrorSilently(toolId: string): Promise<void> {
  const workspacePath = getWorkspacePath();
  if (workspacePath) {
    try {
      await clearToolError(toolId, workspacePath);
    } catch (configError) {
      console.error(`Failed to clear ${toolId} error in config:`, configError);
    }
  }
}

