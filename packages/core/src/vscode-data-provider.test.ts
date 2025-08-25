import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VSCodeDataProvider } from './vscode-data-provider.js';
import { DataService } from './data-service.js';
import { SchemaService } from './schema-service.js';
import fs from 'fs';
import path from 'path';

describe('VSCodeDataProvider', () => {
  let dataProvider: VSCodeDataProvider;
  let dataService: DataService;
  let schemaService: SchemaService;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = path.join('/tmp', `test-vscode-${Date.now()}.db`);
    dataService = new DataService({ dbPath: testDbPath });
    schemaService = new SchemaService();
    dataProvider = new VSCodeDataProvider(dataService, schemaService);
    
    await dataService.initialize();
    await schemaService.loadToolSchemas();
  });

  afterEach(async () => {
    await dataService.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Data Loading', () => {
    it('should load assessment data for a project', async () => {
      const projectId = await dataService.createProject('Test Project', '/test/path');
      
      await dataService.storeAssessmentData(projectId, 'byte-counter', 'web-analysis', {
        url: 'https://example.com',
        results: { totalBytes: 524288, requestCount: 25 }
      });

      const data = await dataProvider.loadDataForProject('/test/path');
      
      expect(data).toHaveLength(1);
      expect(data[0].tool_name).toBe('byte-counter');
      expect(data[0].data.url).toBe('https://example.com');
    });

    it('should return empty array for non-existent project', async () => {
      const data = await dataProvider.loadDataForProject('/non/existent');
      expect(data).toEqual([]);
    });
  });

  describe('Schema-based Data Grouping', () => {
    let projectId: number;

    beforeEach(async () => {
      projectId = await dataService.createProject('Test Project', '/test/path');
      
      // Add test data for different tools
      await dataService.storeAssessmentData(projectId, 'byte-counter', 'web-analysis', {
        url: 'https://example.com',
        results: { totalBytes: 524288, requestCount: 25, loadTime: 1250, carbonEstimate: 0.245 }
      });
      
      await dataService.storeAssessmentData(projectId, 'greenframe', 'web-analysis', {
        url: 'https://test-site.com',
        results: { carbon: { total: 1.85 }, score: 68, performance: { loadTime: 2100, pageSize: 890 } }
      });
      
      await dataService.storeAssessmentData(projectId, 'co2-assessment', 'questionnaire', {
        impactScore: 75,
        projectScope: { estimatedUsers: 10000, expectedTraffic: 'high' },
        infrastructure: { hostingProvider: 'AWS' }
      });
    });

    it('should group data by tool with schema-based display', async () => {
      const groups = await dataProvider.createGroupedItems('/test/path');
      
      expect(groups).toHaveLength(3); // 3 different tools
      
      // Find byte-counter group
      const byteCounterGroup = groups.find(g => g.toolName === 'byte-counter');
      expect(byteCounterGroup).toBeDefined();
      expect(byteCounterGroup?.displayName).toBe('📊 Byte Counter Analysis');
      expect(byteCounterGroup?.entries).toHaveLength(1);
    });

    it('should create schema-based entry labels', async () => {
      const groups = await dataProvider.createGroupedItems('/test/path');
      
      const byteCounterGroup = groups.find(g => g.toolName === 'byte-counter');
      const entry = byteCounterGroup?.entries[0];
      
      expect(entry?.label).toContain('example.com');
      expect(entry?.label).toContain('🔍'); // Icon from schema
    });

    it('should create detailed field items from schema', async () => {
      const data = await dataProvider.loadDataForProject('/test/path');
      const byteCounterEntry = data.find(d => d.tool_name === 'byte-counter');
      
      const details = await dataProvider.createDataDetails(byteCounterEntry!);
      
      expect(details.length).toBeGreaterThan(0);
      
      // Check for expected fields based on schema
      const urlField = details.find(d => d.key === 'url');
      expect(urlField?.label).toBe('🌐 URL: https://example.com');
      
      const bytesField = details.find(d => d.key === 'totalBytes');
      expect(bytesField?.label).toContain('📊 Data Transfer');
      expect(bytesField?.label).toContain('512 KB'); // Formatted bytes
    });

    it('should handle missing schema gracefully', async () => {
      // Add data for a tool without schema
      await dataService.storeAssessmentData(projectId, 'unknown-tool', 'test-type', {
        someData: 'test'
      });

      const groups = await dataProvider.createGroupedItems('/test/path');
      
      const unknownGroup = groups.find(g => g.toolName === 'unknown-tool');
      expect(unknownGroup).toBeDefined();
      expect(unknownGroup?.displayName).toBe('Analysis results from unknown-tool'); // Fallback
    });
  });

  describe('Data Refresh', () => {
    it('should refresh data when called', async () => {
      const projectId = await dataService.createProject('Test Project', '/test/path');
      
      // Initial load - empty
      let data = await dataProvider.loadDataForProject('/test/path');
      expect(data).toHaveLength(0);
      
      // Add data
      await dataService.storeAssessmentData(projectId, 'byte-counter', 'web-analysis', {
        url: 'https://example.com'
      });
      
      // Refresh and verify data is loaded
      await dataProvider.refresh('/test/path');
      data = await dataProvider.loadDataForProject('/test/path');
      expect(data).toHaveLength(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close the database to simulate error
      await dataService.close();
      
      const data = await dataProvider.loadDataForProject('/test/path');
      expect(data).toEqual([]); // Should return empty array, not throw
    });

    it('should handle malformed data gracefully', async () => {
      const projectId = await dataService.createProject('Test Project', '/test/path');
      
      // Store valid data
      await dataService.storeAssessmentData(projectId, 'byte-counter', 'web-analysis', {
        url: 'https://example.com',
        results: { totalBytes: 524288 }
      });
      
      const groups = await dataProvider.createGroupedItems('/test/path');
      expect(groups).toHaveLength(1);
      expect(groups[0].entries).toHaveLength(1);
    });
  });
});
