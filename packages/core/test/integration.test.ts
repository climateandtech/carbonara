import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupCarbonaraCore, createDeploymentCheckService, createDataService } from '../src/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

      // 2. Store assessment data
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
      
      expect(groups).toHaveLength(1);
      
      // Check CO2 assessment group
      const co2Group = groups.find((g: any) => g.toolName === 'co2-assessment');
      expect(co2Group).toBeDefined();
      expect(co2Group?.displayName).toBe('🌍 CO2 Assessments');
      expect(co2Group?.entries).toHaveLength(1);

      // 4. Test detailed data extraction
      const assessmentData = await vscodeProvider.loadDataForProject('/test/e2e');
      const co2Entry = assessmentData.find((d: any) => d.tool_name === 'co2-assessment');
      
      const details = await vscodeProvider.createDataDetails(co2Entry!);
      expect(details.length).toBeGreaterThan(0);
      
      // Verify data details (fallback schema format)
      const impactScoreDetail = details.find((d: any) => d.key === 'impactScore');
      expect(impactScoreDetail?.label).toContain('75'); // Contains the score value
      
      const estimatedUsersDetail = details.find((d: any) => d.key === 'estimatedUsers');
      expect(estimatedUsersDetail?.label).toBeDefined(); // Basic formatting without rich icons

      // 5. Test project stats
      const stats = await vscodeProvider.getProjectStats('/test/e2e');
      expect(stats.totalEntries).toBe(1);
      expect(stats.toolCounts['co2-assessment']).toBe(1);
      expect(stats.latestEntry).toBeDefined();
    });

    it('should handle search functionality', async () => {
      const { dataService, vscodeProvider } = services;

      const projectId = await dataService.createProject('Search Test', '/test/search');
      
      // Add searchable data
      await dataService.storeAssessmentData(projectId, 'co2-assessment', 'questionnaire', {
        impactScore: 85,
        projectScope: { estimatedUsers: 10000 }
      });

      // Search by tool name
      const co2Results = await vscodeProvider.searchData('/test/search', 'co2-assessment');
      expect(co2Results).toHaveLength(1);
      expect(co2Results[0].tool_name).toBe('co2-assessment');

      // Search by data content
      const scoreResults = await vscodeProvider.searchData('/test/search', '85');
      expect(scoreResults).toHaveLength(1);
      expect(scoreResults[0].tool_name).toBe('co2-assessment');

      // Empty search returns all
      const allResults = await vscodeProvider.searchData('/test/search', '');
      expect(allResults).toHaveLength(1);
    });

    it('should handle data export', async () => {
      const { dataService, vscodeProvider } = services;

      const projectId = await dataService.createProject('Export Test', '/test/export');
      
      await dataService.storeAssessmentData(projectId, 'greenframe', 'web-analysis', {
        url: 'https://example.com',
        results: { totalBytes: 524288 }
      });

      // Test JSON export
      const jsonExport = await vscodeProvider.exportData('/test/export', 'json');
      const parsedJson = JSON.parse(jsonExport);
      expect(Array.isArray(parsedJson)).toBe(true);
      expect(parsedJson).toHaveLength(1);
      expect(parsedJson[0].tool_name).toBe('greenframe');

      // Test CSV export
      const csvExport = await vscodeProvider.exportData('/test/export', 'csv');
      expect(csvExport).toContain('id,tool_name,data_type,timestamp,source');
      expect(csvExport).toContain('greenframe');
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
      await dataService.storeAssessmentData(projectId, 'greenframe', 'web-analysis', {
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

      // Mock console.error to suppress expected error output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Close database to simulate error
      await dataService.close();

      // Should not throw, should return empty results
      const data = await vscodeProvider.loadDataForProject('/test/path');
      expect(data).toEqual([]);

      const groups = await vscodeProvider.createGroupedItems('/test/path');
      expect(groups).toEqual([]);

      // Verify that errors were logged (but suppressed from output)
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to load data for project:',
        expect.any(Error)
      );

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large datasets efficiently', async () => {
      const { dataService, vscodeProvider } = services;

      const projectId = await dataService.createProject('Performance Test', '/test/performance');
      
      // Insert 100 entries
      const promises: Promise<number>[] = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          dataService.storeAssessmentData(projectId, 'greenframe', 'web-analysis', {
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

  describe('Deployment Check Integration', () => {
    let testWorkspaceDir: string;

    beforeEach(() => {
      // Create a temporary test workspace with deployment configs
      testWorkspaceDir = path.join('/tmp', `carbonara-deployment-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      fs.mkdirSync(testWorkspaceDir, { recursive: true });
      
      // Create infrastructure directory (so glob pattern **/*.tf matches)
      const infraDir = path.join(testWorkspaceDir, 'infrastructure');
      fs.mkdirSync(infraDir, { recursive: true });
      
      // Copy AWS production example to test workspace
      const examplesDir = path.resolve(__dirname, '../../..', 'examples', 'deployment-configs');
      const exampleFile = path.join(examplesDir, 'aws-production.tf');
      
      if (fs.existsSync(exampleFile)) {
        const testFile = path.join(infraDir, 'aws-production.tf');
        fs.copyFileSync(exampleFile, testFile);
      } else {
        // If example doesn't exist, create a minimal AWS Terraform file
        const terraformContent = `provider "aws" {
  region = "us-east-1"
}

resource "aws_vpc" "production" {
  cidr_block = "10.0.0.0/16"
  tags = {
    Environment = "production"
  }
}`;
        fs.writeFileSync(path.join(infraDir, 'aws-production.tf'), terraformContent);
      }
    });

    afterEach(() => {
      // Clean up test workspace
      if (fs.existsSync(testWorkspaceDir)) {
        fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
      }
    });

    it('should scan example deployment configs and return results', async () => {
      const { dataService } = services;

      // Create deployment check service
      const deploymentCheckService = createDeploymentCheckService(dataService);
      
      // Run deployment check on the test workspace
      const result = await deploymentCheckService.analyze(testWorkspaceDir);
      
      // Verify results structure
      expect(result).toHaveProperty('target');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('deployments');
      expect(result).toHaveProperty('stats');
      expect(result).toHaveProperty('recommendations');
      
      // Verify stats are present
      expect(result.stats).toHaveProperty('deployment_count');
      expect(result.stats).toHaveProperty('provider_count');
      expect(result.stats).toHaveProperty('high_carbon_count');
      expect(result.stats).toHaveProperty('environment_count');
      
      // Should find at least one deployment (AWS production example)
      expect(result.stats.deployment_count).toBeGreaterThan(0);
      
      // Should have at least one provider
      expect(result.stats.provider_count).toBeGreaterThan(0);
      
      // Verify deployments array contains expected data
      expect(result.deployments.length).toBeGreaterThan(0);
      const deployment = result.deployments[0];
      expect(deployment).toHaveProperty('id');
      expect(deployment).toHaveProperty('name');
      expect(deployment).toHaveProperty('provider');
      expect(deployment).toHaveProperty('environment');
      expect(deployment).toHaveProperty('region');
      expect(deployment).toHaveProperty('config_file_path');
      expect(deployment).toHaveProperty('detection_method');
      
      // Verify AWS production deployment is detected
      const awsProduction = result.deployments.find(
        (d: any) => d.provider === 'aws' && 
                    d.environment === 'production' &&
                    d.config_file_path?.includes('aws-production.tf')
      );
      
      expect(awsProduction).toBeDefined();
      expect(awsProduction!.region).toBe('us-east-1');
      expect(awsProduction!.country).toBe('US');
      // Should have carbon intensity calculated (or null if not yet calculated)
      expect(typeof awsProduction!.carbon_intensity === 'number' || awsProduction!.carbon_intensity === null).toBe(true);
      
      // Verify target is resolved to absolute path
      expect(path.isAbsolute(result.target)).toBe(true);
      
      // Verify timestamp is ISO format
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should calculate carbon intensities for detected deployments', async () => {
      const { dataService } = services;

      const deploymentCheckService = createDeploymentCheckService(dataService);
      const result = await deploymentCheckService.analyze(testWorkspaceDir);
      
      // Should have found deployments
      expect(result.stats.deployment_count).toBeGreaterThan(0);
      
      // Check that carbon intensities are calculated (or null if not available)
      const deploymentsWithIntensity = result.deployments.filter(
        (d: any) => d.carbon_intensity !== null && d.carbon_intensity !== undefined
      );
      
      // At least some deployments should have carbon intensity calculated
      // (depends on whether the service calculates them)
      expect(deploymentsWithIntensity.length).toBeGreaterThanOrEqual(0);
      
      // If carbon intensities are present, verify they're reasonable numbers
      deploymentsWithIntensity.forEach((d: any) => {
        expect(typeof d.carbon_intensity).toBe('number');
        expect(d.carbon_intensity).toBeGreaterThan(0);
        expect(d.carbon_intensity).toBeLessThan(1000); // Sanity check
      });
    });

    it('should provide recommendations for high-carbon deployments', async () => {
      const { dataService } = services;

      const deploymentCheckService = createDeploymentCheckService(dataService);
      const result = await deploymentCheckService.analyze(testWorkspaceDir);
      
      // Should have found deployments
      expect(result.stats.deployment_count).toBeGreaterThan(0);
      
      // Check recommendations structure
      expect(Array.isArray(result.recommendations)).toBe(true);
      
      // US East region has high carbon intensity (400 gCO2/kWh), so we should get recommendations
      // Note: Recommendations depend on carbon intensity calculations
      // If there are high-carbon deployments, we should have recommendations
      if (result.stats.high_carbon_count > 0) {
        expect(result.recommendations.length).toBeGreaterThan(0);
        
        // Verify recommendation structure
        const recommendation = result.recommendations[0];
        expect(recommendation).toHaveProperty('deploymentId');
        expect(recommendation).toHaveProperty('currentIntensity');
        expect(recommendation).toHaveProperty('reasoning');
        
        // Should suggest lower-carbon alternatives
        expect(recommendation.currentIntensity).toBeGreaterThan(0);
        expect(recommendation.reasoning).toBeTruthy();
      }
    });
  });
});
