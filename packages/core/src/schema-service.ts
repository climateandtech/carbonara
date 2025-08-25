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
        path.join(currentDir, '..', '..', 'cli', 'src', 'registry', 'tools.json'),
        path.join(currentDir, '..', '..', '..', 'cli', 'src', 'registry', 'tools.json'),
        path.join(currentDir, '..', '..', '..', 'packages', 'cli', 'src', 'registry', 'tools.json'),
        path.join(process.cwd(), 'packages', 'cli', 'src', 'registry', 'tools.json'),
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
      
      if (registryPath) {
        const registryContent = fs.readFileSync(registryPath, 'utf8');
        const registry = JSON.parse(registryContent);
        
        if (registry.tools && Array.isArray(registry.tools)) {
          registry.tools.forEach((tool: AnalysisToolSchema) => {
            this.toolSchemas.set(tool.id, tool);
          });
        }
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
    }

    return String(value);
  }
}
