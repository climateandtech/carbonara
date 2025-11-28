import fs from 'fs';
import path from 'path';
import { getProjectRoot } from './config.js';

export interface ToolLogEntry {
  timestamp: string;
  toolId: string;
  action: 'install' | 'run' | 'error';
  command?: string;
  output?: string;
  error?: string;
  exitCode?: number;
}

/**
 * Get the logs directory path for the current project
 */
function getLogsDirectory(projectPath?: string): string | null {
  const root = projectPath || getProjectRoot();
  if (!root) {
    return null;
  }
  
  const logsDir = path.join(root, '.carbonara', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  return logsDir;
}

/**
 * Get the log file path for a specific tool
 */
function getToolLogPath(toolId: string, projectPath?: string): string | null {
  const logsDir = getLogsDirectory(projectPath);
  if (!logsDir) {
    return null;
  }
  
  // Sanitize toolId for filename
  const sanitizedToolId = toolId.replace(/[^a-zA-Z0-9-_]/g, '_');
  return path.join(logsDir, `${sanitizedToolId}.log`);
}

/**
 * Write a log entry to the tool's log file
 */
export async function logToolAction(entry: ToolLogEntry, projectPath?: string): Promise<void> {
  const logPath = getToolLogPath(entry.toolId, projectPath);
  if (!logPath) {
    // No project root found, skip logging
    return;
  }
  
  try {
    const logLine = JSON.stringify(entry) + '\n';
    fs.appendFileSync(logPath, logLine, 'utf-8');
  } catch (error) {
    // Silently fail - logging is optional
    console.error(`Failed to write tool log:`, error);
  }
}

/**
 * Get recent log entries for a tool
 */
export async function getToolLogs(toolId: string, limit: number = 50, projectPath?: string): Promise<ToolLogEntry[]> {
  const logPath = getToolLogPath(toolId, projectPath);
  if (!logPath || !fs.existsSync(logPath)) {
    return [];
  }
  
  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    const entries: ToolLogEntry[] = lines
      .map(line => {
        try {
          return JSON.parse(line) as ToolLogEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is ToolLogEntry => entry !== null)
      .slice(-limit); // Get last N entries
    
    return entries;
  } catch (error) {
    console.error(`Failed to read tool log:`, error);
    return [];
  }
}

/**
 * Clear logs for a tool
 */
export async function clearToolLogs(toolId: string, projectPath?: string): Promise<void> {
  const logPath = getToolLogPath(toolId, projectPath);
  if (!logPath || !fs.existsSync(logPath)) {
    return;
  }
  
  try {
    fs.unlinkSync(logPath);
  } catch (error) {
    console.error(`Failed to clear tool log:`, error);
  }
}

/**
 * Get a human-readable log summary for a tool
 */
export async function getToolLogSummary(toolId: string, projectPath?: string): Promise<string> {
  const logs = await getToolLogs(toolId, 100, projectPath);
  if (logs.length === 0) {
    return `No logs found for tool: ${toolId}`;
  }
  
  const lines: string[] = [];
  lines.push(`# Tool Logs: ${toolId}`);
  lines.push(`\nTotal entries: ${logs.length}\n`);
  
  // Group by action
  const installs = logs.filter(l => l.action === 'install');
  const runs = logs.filter(l => l.action === 'run');
  const errors = logs.filter(l => l.action === 'error');
  
  if (installs.length > 0) {
    lines.push(`## Installation Logs (${installs.length})`);
    lines.push('');
    installs.slice(-10).forEach(entry => {
      const date = new Date(entry.timestamp).toLocaleString();
      lines.push(`### ${date}`);
      if (entry.command) {
        lines.push(`**Command:** \`${entry.command}\``);
      }
      if (entry.output) {
        lines.push(`**Output:**`);
        lines.push('```');
        lines.push(entry.output);
        lines.push('```');
      }
      if (entry.error) {
        lines.push(`**Error:** ${entry.error}`);
      }
      if (entry.exitCode !== undefined) {
        lines.push(`**Exit Code:** ${entry.exitCode}`);
      }
      lines.push('');
    });
  }
  
  if (runs.length > 0) {
    lines.push(`## Execution Logs (${runs.length})`);
    lines.push('');
    runs.slice(-10).forEach(entry => {
      const date = new Date(entry.timestamp).toLocaleString();
      lines.push(`### ${date}`);
      if (entry.command) {
        lines.push(`**Command:** \`${entry.command}\``);
      }
      if (entry.output) {
        lines.push(`**Output:**`);
        lines.push('```');
        lines.push(entry.output.substring(0, 500)); // Limit output length
        if (entry.output.length > 500) {
          lines.push('... (truncated)');
        }
        lines.push('```');
      }
      if (entry.exitCode !== undefined) {
        lines.push(`**Exit Code:** ${entry.exitCode}`);
      }
      lines.push('');
    });
  }
  
  if (errors.length > 0) {
    lines.push(`## Error Logs (${errors.length})`);
    lines.push('');
    errors.slice(-10).forEach(entry => {
      const date = new Date(entry.timestamp).toLocaleString();
      lines.push(`### ${date}`);
      if (entry.error) {
        lines.push(`**Error:**`);
        lines.push('```');
        lines.push(entry.error);
        lines.push('```');
      }
      if (entry.command) {
        lines.push(`**Command:** \`${entry.command}\``);
      }
      lines.push('');
    });
  }
  
  return lines.join('\n');
}



