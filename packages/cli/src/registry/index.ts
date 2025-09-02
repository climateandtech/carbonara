import fs from 'fs';
import path from 'path';
import execa from 'execa';
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
    target: string;
    expectedOutput?: string;
  };
  options?: Array<{
    flag: string;
    description: string;
    type: 'boolean' | 'string' | 'number';
    default?: any;
  }>;
}

export interface ToolRegistry {
  tools: AnalysisTool[];
}

export class AnalysisToolRegistry {
  private registry: ToolRegistry;
  private installedTools: Map<string, boolean> = new Map();

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
    this.refreshInstalledTools();
  }

  async refreshInstalledTools(): Promise<void> {
    this.installedTools.clear();
    
    for (const tool of this.registry.tools) {
      const isInstalled = await this.checkToolInstallation(tool);
      this.installedTools.set(tool.id, isInstalled);
    }
  }

  private async checkToolInstallation(tool: AnalysisTool): Promise<boolean> {
    try {
      switch (tool.detection.method) {
        case 'built-in':
          return true; // Built-in tools are always available
        case 'command':
          // For commands, we just need to check if they exist, not necessarily succeed
          try {
            await execa.command(tool.detection.target, { stdio: 'pipe', timeout: 5000 });
            return true;
          } catch (error: any) {
            // If the command exists but fails (like help commands), that's still installed
            return error.exitCode !== 127 && !error.message.includes('command not found');
          }
        case 'npm':
          // Check if npm package is globally installed
          const result = await execa('npm', ['list', '-g', tool.detection.target], { stdio: 'pipe' });
          return !result.stdout.includes('(empty)');
        case 'file':
          return fs.existsSync(tool.detection.target);
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

  getInstalledTools(): AnalysisTool[] {
    return this.registry.tools.filter(tool => this.installedTools.get(tool.id) === true);
  }

  getTool(id: string): AnalysisTool | undefined {
    return this.registry.tools.find(tool => tool.id === id);
  }

  isToolInstalled(id: string): boolean {
    return this.installedTools.get(id) === true;
  }

  getInstallationInstructions(id: string): string | undefined {
    const tool = this.getTool(id);
    return tool?.installation.instructions;
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