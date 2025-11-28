import { DataService, AssessmentDataEntry } from './data-service.js';
import { SchemaService, AnalysisToolSchema } from './schema-service.js';
import { ThresholdService, BadgeColor } from './threshold-service.js';

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
  badgeColor?: BadgeColor;
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
  private thresholdService: ThresholdService;

  constructor(dataService: DataService, schemaService: SchemaService) {
    this.dataService = dataService;
    this.schemaService = schemaService;
    this.thresholdService = new ThresholdService();
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

      // Calculate badges with relative comparison
      const entriesWithBadges = entries.map(entry => {
        const dataEntry = toolSchema && toolSchema.display
          ? this.createSchemaBasedEntry(entry, toolSchema)
          : this.createGenericEntry(entry);
        
        // Calculate badge color based on entry data
        const badgeColor = this.calculateBadgeColor(entry, toolName, entries);
        return { ...dataEntry, badgeColor };
      });

      if (toolSchema && toolSchema.display) {
        // Schema-based group
        const icon = toolSchema.display.icon || '';
        const displayName = icon ? `${icon} ${toolSchema.display.groupName}` : toolSchema.display.groupName;
        dataGroups.push({
          toolName,
          displayName,
          icon,
          entries: entriesWithBadges
        });
      } else {
        // Fallback group
        dataGroups.push({
          toolName,
          displayName: `Analysis results from ${toolName}`,
          icon: '',
          entries: entriesWithBadges
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

    // Special handling for computed values that don't have direct fields
    // totalKB: computed from totalBytes (for carbonara-swd)
    if (label.includes('{totalKB}') || description.includes('{totalKB}')) {
      const totalBytes = this.schemaService.extractValue(entry, 'data.totalBytes');
      if (totalBytes !== null && totalBytes !== undefined) {
        const totalKB = Math.round(Number(totalBytes) / 1024);
        label = label.replace('{totalKB}', totalKB.toString());
        description = description.replace('{totalKB}', totalKB.toString());
      }
    }
    
    // count: computed from deployments array length (for deployment-scan)
    if (label.includes('{count}') || description.includes('{count}')) {
      const deployments = this.schemaService.extractValue(entry, 'data.deployments');
      let count = 0;
      if (Array.isArray(deployments)) {
        count = deployments.length;
      } else if (deployments === null || deployments === undefined) {
        // Try total_count as fallback
        const totalCount = this.schemaService.extractValue(entry, 'data.total_count');
        if (totalCount !== null && totalCount !== undefined) {
          count = Number(totalCount);
        }
      }
      label = label.replace('{count}', count.toString());
      description = description.replace('{count}', count.toString());
    }

    // Replace field values in templates
    display.fields.forEach(field => {
      const value = this.schemaService.extractValue(entry, field.path);
      if (value !== null && value !== undefined) {
        const placeholder = `{${field.key}}`;
        const formattedValue = this.schemaService.formatValue(value, field.type, field.format);
        
        label = label.replace(placeholder, formattedValue);
        description = description.replace(placeholder, formattedValue);
      }
    });

    // Remove any unreplaced placeholders (e.g., {variable} that wasn't found)
    // This prevents showing template variables in the UI
    label = label.replace(/\{[^}]+\}/g, '').trim();
    description = description.replace(/\{[^}]+\}/g, '').trim();

    // If label is empty after removing placeholders, fall back to simple format
    if (!label || label.length === 0) {
      label = `${entry.tool_name} - ${date}`;
    }
    
    // If description is empty, use just the date
    if (!description || description.length === 0) {
      description = date;
    }

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

  /**
   * Calculate badge color for an entry based on metrics and thresholds
   * Uses dual system: fixed thresholds + relative comparison within project
   * Uses schema-based field discovery to find CO2 emissions field across all tools
   */
  calculateBadgeColor(
    entry: AssessmentDataEntry,
    toolName: string,
    allEntriesForTool: AssessmentDataEntry[]
  ): BadgeColor {
    // Determine which metric to use based on tool type
    let metricType: keyof import('./threshold-service.js').MetricThresholds = 'co2Emissions';
    let value: number | null = null;

      // Special case: deployment-scan uses carbon intensity, not CO2 emissions
      if (toolName === 'deployment-scan') {
        const intensity = this.schemaService.extractValue(entry, 'data.deployments[*].carbon_intensity');
        if (intensity !== null && intensity !== undefined) {
          metricType = 'carbonIntensity';
          value = Number(intensity);
        }
      } else {
      // Use schema-based discovery to find CO2 emissions field
      const toolSchema = this.schemaService.getToolSchema(toolName);
      
      if (toolSchema?.display?.fields) {
        // Find first field with type 'carbon' in the schema
        const carbonField = toolSchema.display.fields.find(f => f.type === 'carbon');
        if (carbonField) {
          const co2 = this.schemaService.extractValue(entry, carbonField.path);
          if (co2 !== null && co2 !== undefined) {
            metricType = 'co2Emissions';
            value = Number(co2);
          }
        }
      }
      
      // Fallback to hardcoded paths for backwards compatibility if schema doesn't have carbon field
      if (value === null || isNaN(value)) {
        const co2 = this.schemaService.extractValue(entry, 'data.carbonEmissions.total,data.results.carbonEstimate');
        if (co2 !== null && co2 !== undefined) {
          metricType = 'co2Emissions';
          value = Number(co2);
        }
      }
    }

    if (value === null || isNaN(value)) {
      return 'none';
    }

    // Calculate project average for relative comparison
    // Use schema-based discovery for all entries to ensure consistency
    const projectAverage = this.thresholdService.calculateProjectAverage(
      allEntriesForTool,
      metricType,
      (e) => {
        if (toolName === 'deployment-scan') {
          return this.schemaService.extractValue(e, 'data.deployments[*].carbon_intensity');
        }
        
        // Use schema-based discovery (same logic as above)
        const toolSchema = this.schemaService.getToolSchema(toolName);
        if (toolSchema?.display?.fields) {
          const carbonField = toolSchema.display.fields.find(f => f.type === 'carbon');
          if (carbonField) {
            const co2 = this.schemaService.extractValue(e, carbonField.path);
            if (co2 !== null && co2 !== undefined) {
              return Number(co2);
            }
          }
        }
        
        // Fallback to hardcoded paths
        return this.schemaService.extractValue(e, 'data.carbonEmissions.total,data.results.carbonEstimate');
      }
    );

    // Get badge color with relative comparison
    return this.thresholdService.getBadgeColorWithRelative(metricType, value, projectAverage);
  }

  async createDataDetails(entry: AssessmentDataEntry): Promise<DataDetail[]> {
    const toolSchema = this.schemaService.getToolSchema(entry.tool_name);
    const details: DataDetail[] = [];

    if (toolSchema && toolSchema.display && toolSchema.display.fields && toolSchema.display.fields.length > 0) {
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
        } else {
          // Debug: log when a field value is not found
          console.warn(`[VSCodeDataProvider] Field "${field.key}" (path: "${field.path}") not found for tool "${entry.tool_name}". Entry data keys: ${Object.keys(entry.data || {}).join(', ')}`);
        }
      });
      
      // If schema exists but no fields were extracted, fall back to generic display
      if (details.length === 0) {
        console.warn(`[VSCodeDataProvider] Schema found for "${entry.tool_name}" but no fields could be extracted. Falling back to generic display.`);
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
    } else {
      // Debug: log when schema is not found or has no fields
      if (!toolSchema) {
        console.warn(`[VSCodeDataProvider] No schema found for tool "${entry.tool_name}"`);
      } else if (!toolSchema.display) {
        console.warn(`[VSCodeDataProvider] Schema for tool "${entry.tool_name}" has no display configuration`);
      } else if (!toolSchema.display.fields || toolSchema.display.fields.length === 0) {
        console.warn(`[VSCodeDataProvider] Schema for tool "${entry.tool_name}" has no fields defined`);
      }
      
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
