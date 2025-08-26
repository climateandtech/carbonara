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
      
      // Skip registry loading - use fallback schemas only
      console.log('📋 Using fallback tool schemas (no registry system)');
      this.loadFallbackSchemas();
    } catch (error) {
      console.warn('Failed to load tool schemas:', error);
      this.loadFallbackSchemas();
    }
    
    return this.toolSchemas;
  }

  private loadFallbackSchemas(): void {
    // Basic fallback schemas for common tools (no registry dependency)
    const fallbackSchemas: AnalysisToolSchema[] = [
      {
        id: 'co2-assessment',
        name: 'CO2 Assessment',
        description: 'Interactive CO2 sustainability assessment questionnaire'
      },
      {
        id: 'greenframe',
        name: 'GreenFrame',
        description: 'Website carbon footprint analysis'
      }
    ];
    
    fallbackSchemas.forEach(schema => {
      this.toolSchemas.set(schema.id, schema);
    });
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
