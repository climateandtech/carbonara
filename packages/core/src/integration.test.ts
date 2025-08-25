import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupCarbonaraCore } from './index.js';
import fs from 'fs';
import path from 'path';

describe('Carbonara Core Integration', () => {
  let testDbPath: string;
  let services: Awaited<ReturnType<typeof setupCarbonaraCore>>;

  beforeEach(async () => {
    testDbPath = path.join('/tmp', `test-integration-${Date.now()}.db`);
    services = await setupCarbonaraCore({ dbPath: testDbPath });
  });

  afterEach(async () => {
    await services.dataService.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('End-to-End Data Flow', () => {
    it('should handle complete workflow: project → data → display', async () => {
      const { dataService, schemaService, vscodeProvider } = services;

      // 1. Create project
      const projectId = await dataService.createProject('E2E Test Project', '/test/e2e');
      expect(projectId).toBeGreaterThan(0);

      // 2. Store assessment data for different tools
      await dataService.storeAssessmentData(projectId, 'byte-counter', 'web-analysis', {
        url: 'https://example.com',
        results: {
          totalBytes: 524288,
          requestCount: 25,
          loadTime: 1250,
          carbonEstimate: 0.245,
          energyEstimate: 0.0012
        }
      });

      await dataService.storeAssessmentData(projectId, 'greenframe', 'web-analysis', {
        url: 'https://test-site.com',
        results: {
          carbon: { total: 1.85 },
          score: 68,
          performance: { loadTime: 2100, pageSize: 890 }
        }
      });

      await dataService.storeAssessmentData(projectId, 'co2-assessment', 'questionnaire', {
        impactScore: 75,
        projectScope: {
          estimatedUsers: 10000,
          expectedTraffic: 'high',
          projectLifespan: '3-5 years'
        },
        infrastructure: {
          hostingProvider: 'AWS',
          serverLocation: 'us-east-1'
        },
        sustainabilityGoals: {
          carbonNeutralityTarget: true
        }
      });

      // 3. Test VSCode data provider
      const groups = await vscodeProvider.createGroupedItems('/test/e2e');
      
      expect(groups).toHaveLength(3);
      
      // Check byte-counter group
      const byteCounterGroup = groups.find((g: any) => g.toolName === 'byte-counter');
      expect(byteCounterGroup).toBeDefined();
      expect(byteCounterGroup?.displayName).toBe('📊 Byte Counter Analysis');
      expect(byteCounterGroup?.entries).toHaveLength(1);
      expect(byteCounterGroup?.entries[0].label).toContain('example.com');

      // Check greenframe group
      const greenframeGroup = groups.find((g: any) => g.toolName === 'greenframe');
      expect(greenframeGroup).toBeDefined();
      expect(greenframeGroup?.displayName).toBe('🌱 GreenFrame Analysis');
      expect(greenframeGroup?.entries).toHaveLength(1);
      expect(greenframeGroup?.entries[0].label).toContain('test-site.com');

      // Check CO2 assessment group
      const co2Group = groups.find((g: any) => g.toolName === 'co2-assessment');
      expect(co2Group).toBeDefined();
      expect(co2Group?.displayName).toBe('🌍 CO2 Assessments');
      expect(co2Group?.entries).toHaveLength(1);

      // 4. Test detailed data extraction
      const assessmentData = await vscodeProvider.loadDataForProject('/test/e2e');
      const byteCounterEntry = assessmentData.find((d: any) => d.tool_name === 'byte-counter');
      
      const details = await vscodeProvider.createDataDetails(byteCounterEntry!);
      expect(details.length).toBeGreaterThan(0);
      
      // Verify schema-based formatting
      const urlDetail = details.find((d: any) => d.key === 'url');
      expect(urlDetail?.label).toBe('🌐 URL: https://example.com');
      
      const bytesDetail = details.find((d: any) => d.key === 'totalBytes');
      expect(bytesDetail?.label).toContain('📊 Data Transfer');
      expect(bytesDetail?.label).toContain('512 KB'); // Formatted bytes
      expect(bytesDetail?.label).toContain('0.50 MB'); // Formatted MB

      // 5. Test project stats
      const stats = await vscodeProvider.getProjectStats('/test/e2e');
      expect(stats.totalEntries).toBe(3);
      expect(stats.toolCounts['byte-counter']).toBe(1);
      expect(stats.toolCounts['greenframe']).toBe(1);
      expect(stats.toolCounts['co2-assessment']).toBe(1);
      expect(stats.latestEntry).toBeDefined();
    });

    it('should handle search functionality', async () => {
      const { dataService, vscodeProvider } = services;

      const projectId = await dataService.createProject('Search Test', '/test/search');
      
      // Add searchable data
      await dataService.storeAssessmentData(projectId, 'byte-counter', 'web-analysis', {
        url: 'https://example.com',
        results: { totalBytes: 524288 }
      });
      
      await dataService.storeAssessmentData(projectId, 'greenframe', 'web-analysis', {
        url: 'https://test-site.com',
        results: { carbon: { total: 1.85 } }
      });

      // Search by tool name
      const byteCounterResults = await vscodeProvider.searchData('/test/search', 'byte-counter');
      expect(byteCounterResults).toHaveLength(1);
      expect(byteCounterResults[0].tool_name).toBe('byte-counter');

      // Search by URL
      const exampleResults = await vscodeProvider.searchData('/test/search', 'example.com');
      expect(exampleResults).toHaveLength(1);
      expect(exampleResults[0].data.url).toBe('https://example.com');

      // Search by data content
      const carbonResults = await vscodeProvider.searchData('/test/search', '1.85');
      expect(carbonResults).toHaveLength(1);
      expect(carbonResults[0].tool_name).toBe('greenframe');

      // Empty search returns all
      const allResults = await vscodeProvider.searchData('/test/search', '');
      expect(allResults).toHaveLength(2);
    });

    it('should handle data export', async () => {
      const { dataService, vscodeProvider } = services;

      const projectId = await dataService.createProject('Export Test', '/test/export');
      
      await dataService.storeAssessmentData(projectId, 'byte-counter', 'web-analysis', {
        url: 'https://example.com',
        results: { totalBytes: 524288 }
      });

      // Test JSON export
      const jsonExport = await vscodeProvider.exportData('/test/export', 'json');
      const parsedJson = JSON.parse(jsonExport);
      expect(Array.isArray(parsedJson)).toBe(true);
      expect(parsedJson).toHaveLength(1);
      expect(parsedJson[0].tool_name).toBe('byte-counter');

      // Test CSV export
      const csvExport = await vscodeProvider.exportData('/test/export', 'csv');
      expect(csvExport).toContain('id,tool_name,data_type,timestamp,source');
      expect(csvExport).toContain('byte-counter');
      expect(csvExport).toContain('web-analysis');
    });

    it('should handle missing schemas gracefully', async () => {
      const { dataService, vscodeProvider } = services;

      const projectId = await dataService.createProject('Unknown Tool Test', '/test/unknown');
      
      // Add data for a tool without schema
      await dataService.storeAssessmentData(projectId, 'unknown-tool', 'test-type', {
        customField: 'test-value',
        results: { score: 85 }
      });

      const groups = await vscodeProvider.createGroupedItems('/test/unknown');
      expect(groups).toHaveLength(1);
      
      const unknownGroup = groups[0];
      expect(unknownGroup.toolName).toBe('unknown-tool');
      expect(unknownGroup.displayName).toBe('Analysis results from unknown-tool');
      expect(unknownGroup.icon).toBe('📊');
      expect(unknownGroup.entries).toHaveLength(1);

      // Test generic details
      const data = await vscodeProvider.loadDataForProject('/test/unknown');
      const details = await vscodeProvider.createDataDetails(data[0]);
      
      expect(details.length).toBeGreaterThan(0);
      const toolDetail = details.find((d: any) => d.key === 'tool');
      expect(toolDetail?.label).toBe('Tool: unknown-tool');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle non-existent projects', async () => {
      const { vscodeProvider } = services;

      const data = await vscodeProvider.loadDataForProject('/non/existent');
      expect(data).toEqual([]);

      const groups = await vscodeProvider.createGroupedItems('/non/existent');
      expect(groups).toEqual([]);

      const stats = await vscodeProvider.getProjectStats('/non/existent');
      expect(stats.totalEntries).toBe(0);
      expect(stats.toolCounts).toEqual({});
    });

    it('should handle malformed data gracefully', async () => {
      const { dataService, vscodeProvider } = services;

      const projectId = await dataService.createProject('Malformed Test', '/test/malformed');
      
      // Store data with missing expected fields
      await dataService.storeAssessmentData(projectId, 'byte-counter', 'web-analysis', {
        // Missing url and results
        someOtherField: 'value'
      });

      const groups = await vscodeProvider.createGroupedItems('/test/malformed');
      expect(groups).toHaveLength(1);
      expect(groups[0].entries).toHaveLength(1);

      // Should not throw errors
      const data = await vscodeProvider.loadDataForProject('/test/malformed');
      const details = await vscodeProvider.createDataDetails(data[0]);
      expect(details).toBeDefined();
    });

    it('should handle database connection errors', async () => {
      const { dataService, vscodeProvider } = services;

      // Close database to simulate error
      await dataService.close();

      // Should not throw, should return empty results
      const data = await vscodeProvider.loadDataForProject('/test/path');
      expect(data).toEqual([]);

      const groups = await vscodeProvider.createGroupedItems('/test/path');
      expect(groups).toEqual([]);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large datasets efficiently', async () => {
      const { dataService, vscodeProvider } = services;

      const projectId = await dataService.createProject('Performance Test', '/test/performance');
      
      // Insert 100 entries
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          dataService.storeAssessmentData(projectId, 'byte-counter', 'web-analysis', {
            url: `https://example-${i}.com`,
            results: { totalBytes: 1024 * i, requestCount: i }
          })
        );
      }
      
      await Promise.all(promises);

      // Test performance
      const startTime = Date.now();
      const groups = await vscodeProvider.createGroupedItems('/test/performance');
      const endTime = Date.now();
      
      expect(groups).toHaveLength(1);
      expect(groups[0].entries).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
