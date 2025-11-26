import { DataService, AssessmentDataEntry } from './data-service.js';
import { SchemaService, AnalysisToolSchema } from './schema-service.js';

export interface DataGroup {
  toolName: string;
  displayName: string;
  icon: string;
  entries: DataEntry[];
}

export interface DataEntry {
  id: number;
  label: string;
  description: string;
  toolName: string;
  timestamp: string;
  data: any;
}

export interface DataDetail {
  key: string;
  label: string;
  value: any;
  formattedValue: string;
  type: string;
}

export class VSCodeDataProvider {
  private dataService: DataService;
  private schemaService: SchemaService;

  constructor(dataService: DataService, schemaService: SchemaService) {
    this.dataService = dataService;
    this.schemaService = schemaService;
  }

  /**
   * Load assessment data for a project
   *
   * CRITICAL: Data loading behavior
   * - Loads ALL assessment_data entries from the database, regardless of project_id
   * - Assessment data can exist without a project record (project_id can be NULL)
   * - However, for data to display correctly in the extension, a project record
   *   should exist in the projects table with matching project_id
   *
   * Data flow:
   * 1. Look up project by path (optional, for logging)
   * 2. Load all assessment_data entries (no filtering by project_id)
   * 3. Return entries for display in tree view
   *
   * Note: If data exists but project doesn't, data won't display. Ensure projects
   * table has a record matching the project_id in assessment_data entries.
   */
  async loadDataForProject(projectPath: string): Promise<AssessmentDataEntry[]> {
    try {
      // Try to find project, but don't require it to exist
      const project = await this.dataService.getProject(projectPath);
      console.log(`[VSCodeDataProvider] Project lookup for path "${projectPath}":`, project ? `Found (ID: ${project.id})` : 'Not found');
      
      // Load all assessment data regardless of whether project exists
      // Assessment data can exist without a project record (project_id can be NULL)
      const allData = await this.dataService.getAssessmentData();
      console.log(`[VSCodeDataProvider] Loaded ${allData.length} assessment data entries`);
      if (allData.length > 0) {
        console.log(`[VSCodeDataProvider] Tool names:`, allData.map(d => d.tool_name).join(', '));
      }
      return allData;
    } catch (error) {
      console.error('[VSCodeDataProvider] Failed to load data for project:', error);
      return [];
    }
  }

  async createGroupedItems(projectPath: string): Promise<DataGroup[]> {
    const assessmentData = await this.loadDataForProject(projectPath);
    
    if (assessmentData.length === 0) {
      return [];
    }

    // Group by tool name
    const groups: { [key: string]: AssessmentDataEntry[] } = {};
    assessmentData.forEach(entry => {
      if (!groups[entry.tool_name]) {
        groups[entry.tool_name] = [];
      }
      groups[entry.tool_name].push(entry);
    });

    const dataGroups: DataGroup[] = [];

    // Create groups with schema-based display
    Object.keys(groups).forEach(toolName => {
      const toolSchema = this.schemaService.getToolSchema(toolName);
      const entries = groups[toolName];

      if (toolSchema && toolSchema.display) {
        // Schema-based group
        dataGroups.push({
          toolName,
          displayName: `${toolSchema.display.icon} ${toolSchema.display.groupName}`,
          icon: toolSchema.display.icon,
          entries: entries.map(entry => this.createSchemaBasedEntry(entry, toolSchema))
        });
      } else {
        // Fallback group
        dataGroups.push({
          toolName,
          displayName: `Analysis results from ${toolName}`,
          icon: '📊',
          entries: entries.map(entry => this.createGenericEntry(entry))
        });
      }
    });

    return dataGroups;
  }

  private createSchemaBasedEntry(entry: AssessmentDataEntry, schema: AnalysisToolSchema): DataEntry {
    if (!schema.display) {
      return this.createGenericEntry(entry);
    }

    const display = schema.display;
    let label = display.entryTemplate;
    let description = display.descriptionTemplate;

    // Replace template variables
    const date = new Date(entry.timestamp).toLocaleDateString();
    label = label.replace('{date}', date);
    description = description.replace('{date}', date);

    // Replace field values in templates
    display.fields.forEach(field => {
      const value = this.schemaService.extractValue(entry, field.path);
      if (value !== null && value !== undefined) {
        const placeholder = `{${field.key}}`;
        const formattedValue = this.schemaService.formatValue(value, field.type, field.format);
        
        label = label.replace(placeholder, formattedValue);
        description = description.replace(placeholder, formattedValue);
        
        // Special handling for common fields
        if (field.key === 'totalKB' && field.type === 'bytes') {
          const kb = Math.round(Number(value) / 1024);
          label = label.replace('{totalKB}', kb.toString());
          description = description.replace('{totalKB}', kb.toString());
        }
      }
    });

    return {
      id: entry.id,
      label,
      description,
      toolName: entry.tool_name,
      timestamp: entry.timestamp,
      data: entry.data
    };
  }

  private createGenericEntry(entry: AssessmentDataEntry): DataEntry {
    const date = new Date(entry.timestamp).toLocaleDateString();
    const url = entry.data.url || 'Analysis';
    
    return {
      id: entry.id,
      label: `🔍 ${url} - ${date}`,
      description: `${entry.tool_name} analysis`,
      toolName: entry.tool_name,
      timestamp: entry.timestamp,
      data: entry.data
    };
  }

  async createDataDetails(entry: AssessmentDataEntry): Promise<DataDetail[]> {
    const toolSchema = this.schemaService.getToolSchema(entry.tool_name);
    const details: DataDetail[] = [];

    if (toolSchema && toolSchema.display && toolSchema.display.fields.length > 0) {
      // Schema-based details - use schema paths to extract nested values from any depth
      // The schema defines which fields to extract using paths like "data.results.totalBytes"
      // This allows tool maintainers to specify exactly what nested data to display
      toolSchema.display.fields.forEach(field => {
        // extractValue navigates the nested structure using the path (e.g., "data.results.totalBytes")
        // It handles paths like "data.results.carbonEstimate,data.results.co2Estimate" (fallback paths)
        const value = this.schemaService.extractValue(entry, field.path);
        if (value !== null && value !== undefined) {
          const formattedValue = this.schemaService.formatValue(value, field.type, field.format);
          
          details.push({
            key: field.key,
            label: `${field.label}: ${formattedValue}`,
            value,
            formattedValue,
            type: field.type
          });
        }
      });
    } else {
      // Generic fallback - only show basic metadata, not raw data fields
      // Tool maintainers should define schemas to extract nested data properly
      details.push({
        key: 'tool',
        label: `Tool: ${entry.tool_name}`,
        value: entry.tool_name,
        formattedValue: entry.tool_name,
        type: 'string'
      });

      details.push({
        key: 'timestamp',
        label: `Date: ${new Date(entry.timestamp).toLocaleString()}`,
        value: entry.timestamp,
        formattedValue: new Date(entry.timestamp).toLocaleString(),
        type: 'string'
      });
    }

    return details;
  }

  async refresh(projectPath: string): Promise<void> {
    // This method can be called to trigger a refresh
    // In a real implementation, this might clear caches or trigger events
    await this.loadDataForProject(projectPath);
  }

  async getProjectStats(projectPath: string): Promise<{
    totalEntries: number;
    toolCounts: { [toolName: string]: number };
    latestEntry?: AssessmentDataEntry;
  }> {
    const data = await this.loadDataForProject(projectPath);
    
    const toolCounts: { [toolName: string]: number } = {};
    data.forEach(entry => {
      toolCounts[entry.tool_name] = (toolCounts[entry.tool_name] || 0) + 1;
    });

    return {
      totalEntries: data.length,
      toolCounts,
      latestEntry: data[0] // Already sorted by timestamp DESC
    };
  }

  async searchData(projectPath: string, query: string): Promise<AssessmentDataEntry[]> {
    const data = await this.loadDataForProject(projectPath);
    
    if (!query.trim()) {
      return data;
    }

    const lowerQuery = query.toLowerCase();
    
    return data.filter(entry => {
      // Search in tool name
      if (entry.tool_name.toLowerCase().includes(lowerQuery)) {
        return true;
      }
      
      // Search in data fields
      const dataStr = JSON.stringify(entry.data).toLowerCase();
      if (dataStr.includes(lowerQuery)) {
        return true;
      }
      
      // Search in formatted display values
      const toolSchema = this.schemaService.getToolSchema(entry.tool_name);
      if (toolSchema && toolSchema.display) {
        for (const field of toolSchema.display.fields) {
          const value = this.schemaService.extractValue(entry, field.path);
          if (value !== null && value !== undefined) {
            const formatted = this.schemaService.formatValue(value, field.type, field.format);
            if (formatted.toLowerCase().includes(lowerQuery)) {
              return true;
            }
          }
        }
      }
      
      return false;
    });
  }

  async exportData(projectPath: string, format: 'json' | 'csv' = 'json'): Promise<string> {
    const data = await this.loadDataForProject(projectPath);
    
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }
    
    if (format === 'csv') {
      if (data.length === 0) {
        return '';
      }
      
      // Create CSV headers
      const headers = ['id', 'tool_name', 'data_type', 'timestamp', 'source'];
      
      // Add dynamic headers from data fields
      const allKeys = new Set<string>();
      data.forEach(entry => {
        if (entry.data && typeof entry.data === 'object') {
          Object.keys(entry.data).forEach(key => allKeys.add(`data_${key}`));
        }
      });
      
      headers.push(...Array.from(allKeys));
      
      // Create CSV rows
      const csvRows = [headers.join(',')];
      
      data.forEach(entry => {
        const row = [
          entry.id,
          entry.tool_name,
          entry.data_type,
          entry.timestamp,
          entry.source || ''
        ];
        
        // Add data fields
        allKeys.forEach(key => {
          const dataKey = key.replace('data_', '');
          const value = entry.data && entry.data[dataKey];
          row.push(value !== undefined ? JSON.stringify(value) : '');
        });
        
        csvRows.push(row.join(','));
      });
      
      return csvRows.join('\n');
    }
    
    return '';
  }
}
