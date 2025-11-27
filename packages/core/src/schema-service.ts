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

/**
 * Field name mapper to normalize field labels across different tools
 * Maps tool-specific field names to standardized display names
 */
const FIELD_NAME_MAP: Record<string, string> = {
  // Carbon/CO2 variations
  'co2 estimate': 'CO2 Emissions',
  'co2 emissions': 'CO2 Emissions',
  'carbon estimate': 'CO2 Emissions',
  'carbon emissions': 'CO2 Emissions',
  'estimated-carbon': 'CO2 Emissions',
  'operational-carbon': 'CO2 Emissions',
  'carbonEstimate': 'CO2 Emissions',
  'carbon': 'CO2 Emissions',
  
  // Energy variations
  'energy': 'Energy',
  'energy usage': 'Energy',
  'energyEstimate': 'Energy',
  
  // Data transfer variations
  'data transfer': 'Data Transfer',
  'networkBytes': 'Data Transfer',
  'network-bytes': 'Data Transfer',
  'network/data/bytes': 'Data Transfer',
  'totalBytes': 'Data Transfer',
  
  // Time variations
  'load time': 'Load Time',
  'loadTime': 'Load Time',
  'duration': 'Load Time',
  
  // Request variations
  'http requests': 'HTTP Requests',
  'requestCount': 'HTTP Requests',
  'requests': 'HTTP Requests',
};

/**
 * Normalize a field label to a standardized name across tools
 */
export function normalizeFieldLabel(label: string): string {
  if (!label) return label;
  
  // Normalize: lowercase, trim, remove extra spaces, handle camelCase
  let normalized = label.toLowerCase().trim().replace(/\s+/g, ' ');
  
  // Convert camelCase to space-separated (e.g., "carbonEstimate" -> "carbon estimate")
  normalized = normalized.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  
  // Also try without spaces (for keys like "carbonEstimate")
  const noSpaces = normalized.replace(/\s+/g, '');
  
  // Check exact match first (with spaces)
  if (FIELD_NAME_MAP[normalized]) {
    return FIELD_NAME_MAP[normalized];
  }
  
  // Check exact match (without spaces)
  if (FIELD_NAME_MAP[noSpaces]) {
    return FIELD_NAME_MAP[noSpaces];
  }
  
  // Check if any key in the map matches (handles variations)
  for (const [key, value] of Object.entries(FIELD_NAME_MAP)) {
    const keyNormalized = key.toLowerCase();
    // Check if the normalized label contains the key or vice versa
    if (normalized.includes(keyNormalized) || keyNormalized.includes(normalized) ||
        noSpaces.includes(keyNormalized) || keyNormalized.includes(noSpaces)) {
      return value;
    }
  }
  
  // No mapping found, return original
  return label;
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
      let current: any = entry;
      
      // Parse path handling both dot notation and bracket notation
      // Examples: 
      // - data.tree.children.child.outputs[0].estimated-carbon
      // - data.tree.children.child.outputs[0]['estimated-carbon']
      // - data.tree.children.child.outputs[0]["estimated-carbon"]
      const pathParts: Array<{ type: 'property' | 'array' | 'wildcard', value: string }> = [];
      let currentPart = '';
      let inBrackets = false;
      let bracketContent = '';
      
      for (let i = 0; i < singlePath.length; i++) {
        const char = singlePath[i];
        
        if (char === '[') {
          if (currentPart) {
            pathParts.push({ type: 'property', value: currentPart });
            currentPart = '';
          }
          inBrackets = true;
          bracketContent = '';
        } else if (char === ']') {
          inBrackets = false;
          // Remove quotes from bracket content
          const unquoted = bracketContent.replace(/^['"]|['"]$/g, '');
          if (unquoted === '*') {
            pathParts.push({ type: 'wildcard', value: '*' });
          } else if (!isNaN(Number(unquoted))) {
            pathParts.push({ type: 'array', value: unquoted });
          } else {
            pathParts.push({ type: 'property', value: unquoted });
          }
          bracketContent = '';
        } else if (inBrackets) {
          bracketContent += char;
        } else if (char === '.') {
          if (currentPart) {
            pathParts.push({ type: 'property', value: currentPart });
            currentPart = '';
          }
        } else {
          currentPart += char;
        }
      }
      
      // Add final part
      if (currentPart) {
        pathParts.push({ type: 'property', value: currentPart });
      }
      
      // Navigate through the path
      for (const part of pathParts) {
        if (current === null || current === undefined) {
          break;
        }
        
        if (part.type === 'wildcard') {
          // Array wildcard - get first element
          if (Array.isArray(current) && current.length > 0) {
            current = current[0];
          } else {
            current = null;
            break;
          }
        } else if (part.type === 'array') {
          // Array index access
          if (Array.isArray(current)) {
            const index = Number(part.value);
            if (index >= 0 && index < current.length) {
              current = current[index];
            } else {
              current = null;
              break;
            }
          } else {
            current = null;
            break;
          }
        } else {
          // Property access
          if (current && typeof current === 'object') {
            // Try direct property access
            if (part.value in current) {
              current = current[part.value];
            } else {
              // Try to find matching key (handles variations like estimated-carbon vs estimated_carbon)
              const keys = Object.keys(current);
              const matchingKey = keys.find(k => 
                k === part.value ||
                k.toLowerCase() === part.value.toLowerCase() ||
                k.replace(/[-_]/g, '') === part.value.replace(/[-_]/g, '')
              );
              
              if (matchingKey) {
                current = current[matchingKey];
              } else {
                current = null;
                break;
              }
            }
          } else {
            current = null;
            break;
          }
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
