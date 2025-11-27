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
        // VSCode extension bundled paths
        path.join(currentDir, '..', '..', '..', 'registry', 'tools.json'),
        path.join(currentDir, '..', '..', 'cli', 'dist', 'registry', 'tools.json'),
        path.join(currentDir, '..', '..', '..', 'cli', 'dist', 'registry', 'tools.json'),
        path.join(currentDir, '..', '..', '..', 'node_modules', '@carbonara', 'cli', 'dist', 'registry', 'tools.json'),
        // Development paths
        path.join(currentDir, '..', '..', 'cli', 'src', 'registry', 'tools.json'),
        path.join(currentDir, '..', '..', '..', 'cli', 'src', 'registry', 'tools.json'),
        path.join(currentDir, '..', '..', '..', 'packages', 'cli', 'src', 'registry', 'tools.json'),
        path.join(process.cwd(), 'packages', 'cli', 'src', 'registry', 'tools.json'),
        path.join(process.cwd(), 'packages', 'cli', 'dist', 'registry', 'tools.json'),
        path.join(process.cwd(), 'src', 'registry', 'tools.json'),
        path.join(currentDir, 'registry', 'tools.json')
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
        console.log(`📋 Found tools.json at: ${registryPath}`);
        const registryContent = fs.readFileSync(registryPath, 'utf8');
        const registry = JSON.parse(registryContent);
        
        if (registry.tools && Array.isArray(registry.tools)) {
          registry.tools.forEach((tool: AnalysisToolSchema) => {
            this.toolSchemas.set(tool.id, tool);
            console.log(`📋 Loaded schema for tool: ${tool.id} (${tool.name})`);
          });
          console.log(`📋 Loaded ${this.toolSchemas.size} tool schemas`);
        } else {
          console.warn('📋 tools.json found but has no tools array');
        }
      } else {
        console.warn('📋 tools.json not found in any of the expected locations');
        console.warn(`📋 Current directory: ${currentDir}`);
        console.warn(`📋 Process CWD: ${process.cwd()}`);
      }
    } catch (error) {
      console.warn('Failed to load tool schemas:', error);
    }
    
    return this.toolSchemas;
  }
  getToolSchema(toolId: string): AnalysisToolSchema | null {
    return this.toolSchemas.get(toolId) || null;
  }

  extractValue(entry: any, path: string): any {
    const paths = path.split(',').map(p => p.trim());
    
    for (const singlePath of paths) {
      const parts = singlePath.split('.');
      let current: any = entry;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        // Handle array wildcard: deployments[*].provider
        if (part.endsWith('[*]')) {
          const arrayKey = part.slice(0, -3);
          if (current && typeof current === 'object' && arrayKey in current) {
            const array = current[arrayKey];
            if (Array.isArray(array) && array.length > 0) {
              // For array wildcards, return the first value or aggregate
              // If there's a next part, extract from first item
              if (i + 1 < parts.length) {
                const nextPart = parts[i + 1];
                const values = array.map((item: any) => {
                  if (item && typeof item === 'object' && nextPart in item) {
                    return item[nextPart];
                  }
                  return null;
                }).filter((v: any) => v !== null && v !== undefined);
                
                if (values.length > 0) {
                  // Return first value (or could aggregate)
                  current = values[0];
                  i++; // Skip next part since we already processed it
                  continue;
                }
              } else {
                // No next part, return the array itself
                current = array;
                continue;
              }
            }
            current = null;
            break;
          } else {
            current = null;
            break;
          }
        } else if (current && typeof current === 'object' && part in current) {
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
        if (typeof value === 'number') {
          // Round to 3 decimal places for display
          const rounded = Number(value.toFixed(3));
          if (format) {
            return format.replace('{value}', rounded.toString());
          }
          return `${rounded}g`;
        }
        if (format) {
          return format.replace('{value}', value.toString());
        }
        return `${value}g`;
      
      case 'energy':
        if (typeof value === 'number') {
          // Round to 3 decimal places for display
          const rounded = Number(value.toFixed(3));
          if (format) {
            return format.replace('{value}', rounded.toString());
          }
          return `${rounded} kWh`;
        }
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
