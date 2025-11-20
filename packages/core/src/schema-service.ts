import fs from 'fs';
import path from 'path';

export interface ToolDisplayField {
  key: string;
  label: string;
  path: string;
  type: 'url' | 'bytes' | 'number' | 'time' | 'carbon' | 'energy' | 'string';
  format?: string;
}

export interface ToolDisplaySchema {
  category: string;
  icon: string;
  groupName: string;
  entryTemplate: string;
  descriptionTemplate: string;
  fields: ToolDisplayField[];
}

export interface AnalysisToolSchema {
  id: string;
  name: string;
  description?: string;
  display?: ToolDisplaySchema;
}

export class SchemaService {
  private toolSchemas: Map<string, AnalysisToolSchema> = new Map();

  async loadToolSchemas(): Promise<Map<string, AnalysisToolSchema>> {
    try {
      // Try to find the tools.json file from different possible locations
      // Use import.meta.url to get current module path in ES modules
      const currentDir = import.meta.url ? path.dirname(new URL(import.meta.url).pathname) : process.cwd();
      
      const possiblePaths = [
        // VSCode extension bundled registry (dist/registry/tools.json) - check first
        path.join(currentDir, 'registry', 'tools.json'),
        // CLI package paths (for development)
        path.join(currentDir, '..', '..', 'cli', 'src', 'registry', 'tools.json'),
        path.join(currentDir, '..', '..', '..', 'cli', 'src', 'registry', 'tools.json'),
        path.join(currentDir, '..', '..', '..', 'packages', 'cli', 'src', 'registry', 'tools.json'),
        path.join(process.cwd(), 'packages', 'cli', 'src', 'registry', 'tools.json'),
        path.join(process.cwd(), 'src', 'registry', 'tools.json'),
        // VSCode extension dist path (alternative)
        path.join(currentDir, '..', '..', '..', 'plugins', 'vscode', 'dist', 'registry', 'tools.json'),
        path.join(currentDir, '..', '..', '..', '..', 'plugins', 'vscode', 'dist', 'registry', 'tools.json')
      ];
      
      let registryPath: string | null = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          registryPath = p;
          break;
        }
      }
      
      // Load tool schemas from registry
      console.log('📋 Loading tool schemas');
      if (registryPath) {
        console.log(`[SchemaService] Loading schemas from: ${registryPath}`);
        const registryContent = fs.readFileSync(registryPath, 'utf8');
        const registry = JSON.parse(registryContent);
        
        if (registry.tools && Array.isArray(registry.tools)) {
          console.log(`[SchemaService] Found ${registry.tools.length} tools in registry`);
          registry.tools.forEach((tool: AnalysisToolSchema) => {
            this.toolSchemas.set(tool.id, tool);
            console.log(`[SchemaService] Loaded schema for tool: ${tool.id}`);
          });
          console.log(`[SchemaService] Total schemas loaded: ${this.toolSchemas.size}`);
        } else {
          console.warn(`[SchemaService] No tools array found in registry`);
        }
      } else {
        console.warn(`[SchemaService] Could not find tools.json registry file`);
      }
    } catch (error) {
      console.warn('Failed to load tool schemas:', error);
    }
    
    return this.toolSchemas;
  }
  getToolSchema(toolId: string): AnalysisToolSchema | null {
    const schema = this.toolSchemas.get(toolId);
    if (!schema) {
      console.log(`[SchemaService] No schema found for tool ID: ${toolId}`);
      console.log(`[SchemaService] Available tool IDs: ${Array.from(this.toolSchemas.keys()).join(', ')}`);
    } else {
      console.log(`[SchemaService] Found schema for tool ID: ${toolId}`);
    }
    return schema || null;
  }

  extractValue(entry: any, path: string): any {
    const paths = path.split(',').map(p => p.trim());
    
    for (const singlePath of paths) {
      const parts = singlePath.split('.');
      let current: any = entry;
      
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          current = null;
          break;
        }
      }
      
      if (current !== null && current !== undefined) {
        return current;
      }
    }
    
    return null;
  }

  formatValue(value: any, type: string, format?: string): string {
    if (value === null || value === undefined) {
      return '';
    }

    switch (type) {
      case 'bytes':
        if (typeof value === 'number') {
          const kb = Math.round(value / 1024);
          const mb = (value / (1024 * 1024)).toFixed(2);
          if (format) {
            return format.replace('{value}', kb.toString()).replace('{valueMB}', mb);
          }
          return `${kb} KB`;
        }
        break;
      
      case 'time':
        if (format) {
          return format.replace('{value}', value.toString());
        }
        return `${value}ms`;
      
      case 'carbon':
        if (format) {
          return format.replace('{value}', value.toString());
        }
        return `${value}g`;
      
      case 'energy':
        if (format) {
          return format.replace('{value}', value.toString());
        }
        return `${value} kWh`;
      
      case 'url':
        if (format === 'domain-only') {
          try {
            const url = new URL(value);
            // Return hostname + pathname, removing protocol
            return url.hostname + url.pathname;
          } catch {
            // If URL parsing fails, try to strip protocol manually
            const cleaned = String(value).replace(/^https?:\/\//, '');
            return cleaned;
          }
        }
        if (format) {
          return format.replace('{value}', value.toString());
        }
        return String(value);
    }

    return String(value);
  }
}
