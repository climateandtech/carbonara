import fs from 'fs';
import path from 'path';

export interface ToolStatus {
  enabled?: boolean;
  installationStatus?: {
    installed: boolean;
    installedAt: string;
  };
  lastError?: {
    message: string;
    timestamp: string;
  };
  detectionFailed?: boolean;
  detectionFailedAt?: string;
  customExecutionCommand?: string | string[]; // Custom execution command(s) to override default command - user provides this when manually installing
}

export interface ProjectConfig {
  name: string;
  description: string;
  projectType: string;
  projectId: number;
  database: {
    path: string;
  };
  tools: {
    [toolId: string]: ToolStatus;
  };
}

export async function loadProjectConfig(searchPath?: string): Promise<ProjectConfig | null> {
  const startPath = searchPath || process.cwd();
  let currentPath = startPath;

  // Search up the directory tree for .carbonara/carbonara.config.json
  while (currentPath !== path.dirname(currentPath)) {
    const configPath = path.join(currentPath, '.carbonara', 'carbonara.config.json');

    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        return config as ProjectConfig;
      } catch (error) {
        throw new Error(`Failed to parse config file: ${configPath}`);
      }
    }

    currentPath = path.dirname(currentPath);
  }

  return null;
}

export function saveProjectConfig(config: ProjectConfig, projectPath?: string): void {
  const basePath = projectPath || process.cwd();
  const carbonaraDir = path.join(basePath, '.carbonara');

  // Ensure .carbonara directory exists
  if (!fs.existsSync(carbonaraDir)) {
    fs.mkdirSync(carbonaraDir, { recursive: true });
  }

  const configPath = path.join(carbonaraDir, 'carbonara.config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function getProjectRoot(searchPath?: string): string | null {
  const startPath = searchPath || process.cwd();
  let currentPath = startPath;

  while (currentPath !== path.dirname(currentPath)) {
    const configPath = path.join(currentPath, '.carbonara', 'carbonara.config.json');

    if (fs.existsSync(configPath)) {
      return currentPath;
    }

    currentPath = path.dirname(currentPath);
  }

  return null;
}

/**
 * Mark a tool as successfully installed in the config
 */
export async function markToolInstalled(toolId: string, projectPath?: string): Promise<void> {
  const config = await loadProjectConfig(projectPath);
  if (!config) {
    return;
  }

  if (!config.tools) {
    config.tools = {};
  }

  if (!config.tools[toolId]) {
    config.tools[toolId] = {};
  }

  config.tools[toolId].installationStatus = {
    installed: true,
    installedAt: new Date().toISOString(),
  };

  saveProjectConfig(config, projectPath);
}

/**
 * Record an error for a tool in the config
 */
export async function recordToolError(toolId: string, error: Error | string, projectPath?: string): Promise<void> {
  const config = await loadProjectConfig(projectPath);
  if (!config) {
    return;
  }

  if (!config.tools) {
    config.tools = {};
  }

  if (!config.tools[toolId]) {
    config.tools[toolId] = {};
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  config.tools[toolId].lastError = {
    message: errorMessage,
    timestamp: new Date().toISOString(),
  };

  saveProjectConfig(config, projectPath);
}

/**
 * Clear the last error for a tool (called when tool runs successfully)
 */
export async function clearToolError(toolId: string, projectPath?: string): Promise<void> {
  const config = await loadProjectConfig(projectPath);
  if (!config) {
    return;
  }

  if (!config.tools || !config.tools[toolId]) {
    return;
  }

  // Clear the lastError if it exists
  if (config.tools[toolId].lastError) {
    delete config.tools[toolId].lastError;
  }

  // Also clear detectionFailed flag if it was set (tool is working now)
  if (config.tools[toolId].detectionFailed) {
    delete config.tools[toolId].detectionFailed;
    delete config.tools[toolId].detectionFailedAt;
  }

  saveProjectConfig(config, projectPath);
}

/**
 * Check if a tool is marked as installed in the config
 */
export async function isToolMarkedInstalled(toolId: string, projectPath?: string): Promise<boolean> {
  const config = await loadProjectConfig(projectPath);
  if (!config?.tools?.[toolId]?.installationStatus) {
    return false;
  }

  return config.tools[toolId].installationStatus!.installed === true;
}

/**
 * Get the last error for a tool from the config
 */
export async function getToolLastError(toolId: string, projectPath?: string): Promise<{ message: string; timestamp: string } | null> {
  const config = await loadProjectConfig(projectPath);
  if (!config?.tools?.[toolId]?.lastError) {
    return null;
  }

  return config.tools[toolId].lastError!;
}

/**
 * Check if an error message indicates "command not found" type error
 * These are the only errors that should clear installation status
 */
export function isNotFoundError(error: Error | string): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();
  
  return (
    lowerMessage.includes('not found') ||
    lowerMessage.includes('cannot find') ||
    lowerMessage.includes('is not installed') ||
    lowerMessage.includes('command not found') ||
    lowerMessage.includes('no such file or directory') ||
    lowerMessage.includes('enoent')
  );
}

/**
 * Flag that detection was incorrect - tool appeared installed but actually isn't
 * This happens when detection gives a false positive (e.g., npx downloads on-the-fly)
 * 
 * IMPORTANT: Only clears installation status for "not found" errors.
 * Runtime errors should keep the tool marked as installed.
 */
export async function flagDetectionFailed(
  toolId: string, 
  projectPath?: string,
  error?: Error | string
): Promise<void> {
  const config = await loadProjectConfig(projectPath);
  if (!config) {
    return;
  }

  if (!config.tools) {
    config.tools = {};
  }

  if (!config.tools[toolId]) {
    config.tools[toolId] = {};
  }

  // Only clear installation status if:
  // 1. Error is specifically a "not found" type error
  // 2. Tool doesn't have a custom execution command (user manually configured it)
  const hasCustomCommand = !!config.tools[toolId].customExecutionCommand;
  const isNotFound = error ? isNotFoundError(error) : true; // Default to true if no error provided (backward compat)
  
  // Mark that detection failed - tool appeared installed but isn't
  config.tools[toolId].detectionFailed = true;
  config.tools[toolId].detectionFailedAt = new Date().toISOString();
  
  // Only clear installation status if it's a "not found" error AND no custom command
  // Tools with custom commands should always stay marked as installed
  if (isNotFound && !hasCustomCommand && config.tools[toolId].installationStatus) {
    delete config.tools[toolId].installationStatus;
  }
  // If it's not a "not found" error, keep installation status (it's a runtime error, not missing tool)

  saveProjectConfig(config, projectPath);
}

/**
 * Set a custom execution command for a tool
 * This allows users to override the default execution command when they manually install a tool
 * Can be a single string command or an array of command parts
 * The tool will be marked as installed and use this command for execution
 */
export async function setCustomExecutionCommand(toolId: string, command: string | string[], projectPath?: string): Promise<void> {
  const config = await loadProjectConfig(projectPath);
  if (!config) {
    return;
  }

  if (!config.tools) {
    config.tools = {};
  }

  if (!config.tools[toolId]) {
    config.tools[toolId] = {};
  }

  config.tools[toolId].customExecutionCommand = command;
  
  // Mark as installed if custom execution command is set (user manually installed it)
  config.tools[toolId].installationStatus = {
    installed: true,
    installedAt: new Date().toISOString(),
  };

  saveProjectConfig(config, projectPath);
}

/**
 * Get the custom execution command for a tool
 * Returns a string (single command) or array of strings (command parts), or null if not set
 */
export async function getCustomExecutionCommand(toolId: string, projectPath?: string): Promise<string | string[] | null> {
  const config = await loadProjectConfig(projectPath);
  if (!config?.tools?.[toolId]?.customExecutionCommand) {
    return null;
  }

  return config.tools[toolId].customExecutionCommand!;
}

/**
 * Clear the custom execution command for a tool
 */
export async function clearCustomExecutionCommand(toolId: string, projectPath?: string): Promise<void> {
  const config = await loadProjectConfig(projectPath);
  if (!config?.tools?.[toolId]) {
    return;
  }

  delete config.tools[toolId].customExecutionCommand;
  saveProjectConfig(config, projectPath);
} 