import fs from 'fs';
import path from 'path';
import os from 'os';
import { execa, execaCommand } from 'execa';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AnalysisTool {
  id: string;
  name: string;
  description?: string;
  command: {
    executable: string;
    args: string[];
    outputFormat: 'json' | 'yaml' | 'text';
  };
  installation: {
    type: 'npm' | 'pip' | 'binary' | 'docker' | 'built-in';
    package: string;
    global?: boolean;
    instructions: string;
  };
  detection: {
    method: 'command' | 'npm' | 'file' | 'built-in';
    target?: string;
    commands?: string[]; // Array of detection commands (for tools with multiple checks)
    expectedOutput?: string;
  };
  options?: Array<{
    flag: string;
    description: string;
    type: 'boolean' | 'string' | 'number';
    default?: any;
  }>;
  parameters?: Array<{
    name: string; // Parameter name without curly braces (e.g., 'url', 'testCommand')
    required: boolean;
    type?: 'string' | 'number' | 'boolean';
    description?: string;
    placeholder?: string; // Placeholder name (may differ from name)
    default?: any; // Default value
  }>;
  parameterDefaults?: Record<string, any>; // Default values for parameters
  parameterMappings?: Record<string, {
    source: string; // Source parameter name
    transform?: string; // Transform expression (e.g., "1 - {source}")
    type?: 'string' | 'number' | 'boolean'; // Output type
  }>; // Parameter mappings (derived values)
  manifestTemplate?: any; // For Impact Framework tools
  display?: any; // For display configuration
  prerequisites?: Array<{
    type: string;
    name: string;
    checkCommand: string;
    expectedOutput?: string;
    errorMessage: string;
    installCommand?: string;
    setupInstructions?: string;
  }>;
}

export interface ToolRegistry {
  tools: AnalysisTool[];
}

export class AnalysisToolRegistry {
  private registry: ToolRegistry;
  private installedTools: Map<string, boolean> = new Map();
  private toolsRefreshed: boolean = false;

  constructor() {
    // Try multiple paths to find the registry file
    const possiblePaths = [
      path.join(__dirname, 'tools.json'),
      path.join(__dirname, '../registry/tools.json'),
      path.join(process.cwd(), 'src/registry/tools.json'),
      path.join(process.cwd(), 'packages/cli/src/registry/tools.json')
    ];
    
    let registryPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        registryPath = p;
        break;
      }
    }
    
    if (!registryPath) {
      throw new Error(`Could not find tools registry file. Tried: ${possiblePaths.join(', ')}`);
    }
    
    this.registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

  }

  async refreshInstalledTools(): Promise<void> {
    this.installedTools.clear();
    
    // Check for config flags that override detection
    const { loadProjectConfig } = await import('../utils/config.js');
    const config = await loadProjectConfig();
    
    // Run all tool checks in parallel with a global timeout
    type ToolCheckResult = { tool: AnalysisTool; isInstalled: boolean };
    
    const checks = this.registry.tools.map(tool => 
      Promise.race<ToolCheckResult>([
        this.checkToolInstallation(tool).then(isInstalled => ({ tool, isInstalled })),
        new Promise<ToolCheckResult>(resolve => 
          setTimeout(() => resolve({ tool, isInstalled: false }), 3000) // Increased timeout for CI
        )
      ])
    );
    
    const results = await Promise.all(checks);
    results.forEach((result: ToolCheckResult) => {
      let isInstalled = result.isInstalled;
      
      // Check config flags that override detection
      if (config?.tools?.[result.tool.id]) {
        const toolConfig = config.tools[result.tool.id];
        
        // If custom execution command is set, mark as installed (user manually installed it)
        if (toolConfig.customExecutionCommand) {
          isInstalled = true;
        }
        
        // If detection was previously flagged as failed, don't trust detection
        // (but custom execution command takes precedence)
        if (toolConfig.detectionFailed && !toolConfig.customExecutionCommand) {
          isInstalled = false;
        }
      }
      
      this.installedTools.set(result.tool.id, isInstalled);
    });
    
    this.toolsRefreshed = true;
  }

  private async checkToolInstallation(tool: AnalysisTool): Promise<boolean> {
    try {
      switch (tool.detection.method) {
        case 'built-in':
          return true; // Built-in tools are always available
        case 'command':
          // Check if tool has commands array (new approach) or target (old approach)
          const detection = tool.detection as any;
          if (detection.commands && Array.isArray(detection.commands)) {
            // New approach: check all commands, ALL must pass
            const commands: string[] = detection.commands;
            const failedCommands: Array<{ command: string; error: string }> = [];
            
            for (const command of commands) {
              try {
                // Use a safe working directory
                let safeCwd = process.cwd();
                try {
                  fs.accessSync(safeCwd, fs.constants.F_OK);
                } catch {
                  safeCwd = os.homedir() || os.tmpdir();
                }
                
                const result = await execaCommand(command, { 
                  stdio: 'pipe', 
                  timeout: 5000,
                  reject: false,
                  cwd: safeCwd
                });
                
                // For npm list commands, check if package is in output
                if (command.startsWith('npm list')) {
                  const packageMatch = command.match(/npm list\s+([^\s|]+)/);
                  const packageName = packageMatch ? packageMatch[1] : null;
                  if (packageName) {
                    const hasPackage = result.stdout.includes(packageName) || 
                                      result.stdout.includes(packageName.split('/').pop() || '') ||
                                      result.stdout.includes(packageName.replace('@', ''));
                    const isEmpty = result.stdout.includes('(empty)') || 
                                   result.stdout.includes('(no packages)');
                    
                    if (!hasPackage && isEmpty) {
                      failedCommands.push({
                        command,
                        error: 'Package not found in npm list'
                      });
                      continue;
                    }
                  }
                }
                
                // Command succeeded - continue to next command
              } catch (error: any) {
                // Check if it's a "command not found" error
                const errorMessage = error.message || String(error);
                const isCommandNotFound = 
                  error.exitCode === 127 ||
                  errorMessage.includes("command not found") ||
                  errorMessage.includes("Command not found") ||
                  errorMessage.includes("ENOENT") ||
                  errorMessage.includes("spawn") ||
                  errorMessage.includes("uv_cwd");
                
                if (isCommandNotFound) {
                  failedCommands.push({
                    command,
                    error: errorMessage || "Command not found"
                  });
                } else if (command.startsWith("npm list")) {
                  // For npm list, check if package is in output even if command failed
                  const packageMatch = command.match(/npm list\s+([^\s|]+)/);
                  const packageName = packageMatch ? packageMatch[1] : null;
                  const output = (error as any).stdout || (error as any).stderr || errorMessage || "";
                  const hasPackage = packageName ? 
                    (output.includes(packageName) || 
                     output.includes(packageName.split('/').pop() || '') ||
                     output.includes(packageName.replace('@', ''))) :
                    false;
                  
                  if (!hasPackage || output.includes('(empty)') || output.includes('(no packages)')) {
                    failedCommands.push({
                      command,
                      error: "Package not found in npm list"
                    });
                  }
                } else {
                  // Other error - tool might be installed but command failed for other reasons
                  // Consider this as a pass (tool exists, just had an error)
                }
              }
            }
            
            // If any command failed, tool is not installed
            return failedCommands.length === 0;
          } else if (tool.detection.target) {
            // Old approach: single target command
            try {
              await execaCommand(tool.detection.target, { stdio: 'pipe', timeout: 5000 });
              return true;
            } catch (error: any) {
              // If the command exists but fails (like help commands), that's still installed
              return error.exitCode !== 127 && !error.message.includes('command not found');
            }
          } else {
            return false;
          }
        case 'npm':
          // Check if npm package is globally installed
          const result = await execa('npm', ['list', '-g', tool.detection.target!], { stdio: 'pipe' });
          return !result.stdout.includes('(empty)');
        case 'file':
          return fs.existsSync(tool.detection.target!);
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  getAllTools(): AnalysisTool[] {
    return this.registry.tools;
  }

  async getInstalledTools(): Promise<AnalysisTool[]> {
    if (!this.toolsRefreshed) {
      await this.refreshInstalledTools();
    }
    return this.registry.tools.filter(tool => this.installedTools.get(tool.id) === true);
  }

  getTool(id: string): AnalysisTool | undefined {
    return this.registry.tools.find(tool => tool.id === id);
  }

  async isToolInstalled(id: string): Promise<boolean> {
    if (!this.toolsRefreshed) {
      await this.refreshInstalledTools();
    }
    return this.installedTools.get(id) === true;
  }

  getInstallationInstructions(id: string): string | undefined {
    const tool = this.getTool(id);
    return tool?.installation.instructions;
  }

  async checkToolPrerequisites(toolId: string): Promise<{
    allAvailable: boolean;
    missing: Array<{ prerequisite: any; reason: string }>;
  }> {
    const tool = this.getTool(toolId);
    if (!tool || !tool.prerequisites || tool.prerequisites.length === 0) {
      return { allAvailable: true, missing: [] };
    }

    // Use the core package's checkPrerequisites function
    const { checkPrerequisites } = await import('@carbonara/core');
    const prerequisites = tool.prerequisites.map((p: any) => ({
      type: p.type,
      name: p.name,
      checkCommand: p.checkCommand,
      expectedOutput: p.expectedOutput,
      errorMessage: p.errorMessage,
      installCommand: p.installCommand,
      setupInstructions: p.setupInstructions,
    }));

    const result = await checkPrerequisites(prerequisites);
    
    // Map the result to match the expected format
    return {
      allAvailable: result.allAvailable,
      missing: result.missing.map(({ prerequisite, error }) => ({
        prerequisite,
        reason: error
      }))
    };
  }

  async installTool(id: string): Promise<boolean> {
    const tool = this.getTool(id);
    if (!tool) {
      throw new Error(`Tool ${id} not found in registry`);
    }

    try {
      switch (tool.installation.type) {
        case 'npm':
          const npmArgs = ['install'];
          if (tool.installation.global) {
            npmArgs.push('-g');
          }
          npmArgs.push(...tool.installation.package.split(' '));
          
          await execa('npm', npmArgs, { stdio: 'inherit' });
          break;
        case 'pip':
          const pipArgs = ['install'];
          if (tool.installation.global) {
            pipArgs.push('--user');
          }
          pipArgs.push(tool.installation.package);
          
          await execa('pip', pipArgs, { stdio: 'inherit' });
          break;
        default:
          throw new Error(`Installation type ${tool.installation.type} not supported yet`);
      }

      // Refresh installation status
      await this.refreshInstalledTools();
      return this.isToolInstalled(id);
    } catch (error) {
      console.error(`Failed to install ${tool.name}:`, error);
      return false;
    }
  }

  addTool(tool: AnalysisTool): void {
    // Check if tool already exists
    const existingIndex = this.registry.tools.findIndex(t => t.id === tool.id);
    if (existingIndex >= 0) {
      this.registry.tools[existingIndex] = tool;
    } else {
      this.registry.tools.push(tool);
    }
    
    // Save updated registry
    this.saveRegistry();
    
    // Refresh installation status
    this.refreshInstalledTools();
  }

  removeTool(id: string): boolean {
    const initialLength = this.registry.tools.length;
    this.registry.tools = this.registry.tools.filter(tool => tool.id !== id);
    
    if (this.registry.tools.length < initialLength) {
      this.saveRegistry();
      this.installedTools.delete(id);
      return true;
    }
    
    return false;
  }

  private saveRegistry(): void {
    const registryPath = path.join(__dirname, 'tools.json');
    fs.writeFileSync(registryPath, JSON.stringify(this.registry, null, 2));
  }
}

// Singleton instance
let registryInstance: AnalysisToolRegistry | null = null;

export function getToolRegistry(): AnalysisToolRegistry {
  if (!registryInstance) {
    registryInstance = new AnalysisToolRegistry();
  }
  return registryInstance;
}