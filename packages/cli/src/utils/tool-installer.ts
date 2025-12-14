import type { AnalysisTool } from '../registry/index.js';
import { getToolRegistry } from '../registry/index.js';
import { logToolAction } from './tool-logger.js';
import { markToolInstalled } from './config.js';

export interface InstallToolResult {
  success: boolean;
  tool: AnalysisTool;
  error?: string;
}

/**
 * Install a tool with logging and config marking.
 * This is the shared installation logic used by both CLI and VSCode extension.
 * 
 * @param toolId - The ID of the tool to install
 * @param projectPath - Optional project path for config/logging
 * @returns Result object with success status and tool info
 */
export async function installToolWithLogging(
  toolId: string,
  projectPath?: string
): Promise<InstallToolResult> {
  const registry = getToolRegistry();
  const tool = registry.getTool(toolId);
  
  if (!tool) {
    throw new Error(`Tool '${toolId}' not found in registry`);
  }

  // Check if already installed
  if (await registry.isToolInstalled(toolId)) {
    return {
      success: true,
      tool,
    };
  }

  let success = false;
  let error: string | undefined;

  try {
    // Perform the actual installation
    success = await registry.installTool(toolId);
    
    // Build install command string for logging
    const installCommand = tool.installation?.type === 'npm' 
      ? `npm install ${tool.installation.global ? '-g' : ''} ${tool.installation.package}`
      : tool.installation?.type === 'pip'
      ? `pip install ${tool.installation.package}`
      : tool.installation?.instructions || 'Unknown';
    
    // Log installation attempt
    try {
      await logToolAction({
        timestamp: new Date().toISOString(),
        toolId,
        action: success ? 'install' : 'error',
        command: installCommand,
        exitCode: success ? 0 : 1,
        error: success ? undefined : 'Installation failed',
      }, projectPath);
    } catch (logError) {
      // Silently fail - logging is optional
      console.error('Failed to log tool installation:', logError);
    }
    
    // Mark as installed in config if successful (even if detection fails later)
    if (success) {
      try {
        await markToolInstalled(toolId, projectPath);
      } catch (configError) {
        // Silently fail - config recording is optional
        console.error('Failed to mark tool as installed in config:', configError);
      }
    }
  } catch (installError: any) {
    success = false;
    error = installError.message || String(installError);
    
    // Log installation error
    try {
      await logToolAction({
        timestamp: new Date().toISOString(),
        toolId,
        action: 'error',
        error: error,
      }, projectPath);
    } catch (logError) {
      // Silently fail - logging is optional
      console.error('Failed to log tool installation error:', logError);
    }
  }

  return {
    success,
    tool,
    error,
  };
}


