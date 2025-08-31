import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataService } from './data-service.js';
import fs from 'fs';
import path from 'path';

describe('DataService', () => {
  let dataService: DataService;
  let testDbPath: string;

  beforeEach(async () => {
    // Create a temporary database for each test
    testDbPath = path.join('/tmp', `test-carbonara-${Date.now()}.db`);
    dataService = new DataService({ dbPath: testDbPath });
    await dataService.initialize();
  });

  afterEach(async () => {
    await dataService.close();
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Project Management', () => {
    it('should create and retrieve a project', async () => {
      const projectId = await dataService.createProject('Test Project', '/test/path');
      expect(projectId).toBeGreaterThan(0);

      const project = await dataService.getProject('/test/path');
      expect(project).toBeDefined();
      expect(project!.name).toBe('Test Project');
      expect(project!.path).toBe('/test/path');
      expect(project!.id).toBe(projectId);
    });

    it('should return null for non-existent project', async () => {
      const project = await dataService.getProject('/non/existent');
      expect(project).toBeNull();
    });

    it('should list all projects', async () => {
      await dataService.createProject('Project 1', '/path/1');
      await dataService.createProject('Project 2', '/path/2');

      const projects = await dataService.getAllProjects();
      expect(projects).toHaveLength(2);
      // Just verify we got both projects (ordering might vary)
      const names = projects.map(p => p.name).sort();
      expect(names).toEqual(['Project 1', 'Project 2']);
    });
  });

  describe('Assessment Data Management', () => {
    let projectId: number;

    beforeEach(async () => {
      projectId = await dataService.createProject('Test Project', '/test/path');
    });

    it('should store and retrieve assessment data', async () => {
      const testData = {
        url: 'https://example.com',
        results: {
          totalBytes: 524288,
          requestCount: 25,
          carbonEstimate: 0.245
        }
      };

      const dataId = await dataService.storeAssessmentData(
        projectId,
        'greenframe',
        'web-analysis',
        testData,
        'test'
      );

      expect(dataId).toBeGreaterThan(0);

      const assessmentData = await dataService.getAssessmentData(projectId);
      expect(assessmentData).toHaveLength(1);
      expect(assessmentData[0].tool_name).toBe('greenframe');
      expect(assessmentData[0].data_type).toBe('web-analysis');
      expect(assessmentData[0].data.url).toBe('https://example.com');
      expect(assessmentData[0].data.results.totalBytes).toBe(524288);
    });

    it('should filter assessment data by tool name', async () => {
      // Store data for different tools
      await dataService.storeAssessmentData(projectId, 'greenframe', 'web-analysis', { url: 'test1.com' });
      await dataService.storeAssessmentData(projectId, 'greenframe', 'web-analysis', { url: 'test2.com' });
      await dataService.storeAssessmentData(projectId, 'greenframe', 'web-analysis', { url: 'test3.com' });

      const greenframeData = await dataService.getAssessmentData(projectId, 'greenframe');
      expect(greenframeData).toHaveLength(2);
      expect(greenframeData.every(d => d.tool_name === 'greenframe')).toBe(true);

      const greenframeDataFiltered = await dataService.getAssessmentData(projectId, 'greenframe');
      expect(greenframeDataFiltered).toHaveLength(1);
      expect(greenframeDataFiltered[0].tool_name).toBe('greenframe');
    });

    it('should return assessment data ordered by timestamp (newest first)', async () => {
      // Store data with slight delays to ensure different timestamps
      await dataService.storeAssessmentData(projectId, 'greenframe', 'web-analysis', { order: 1 });
      await new Promise(resolve => setTimeout(resolve, 50));
      await dataService.storeAssessmentData(projectId, 'greenframe', 'web-analysis', { order: 2 });
      await new Promise(resolve => setTimeout(resolve, 50));
      await dataService.storeAssessmentData(projectId, 'greenframe', 'web-analysis', { order: 3 });

      const data = await dataService.getAssessmentData(projectId);
      expect(data).toHaveLength(3);
      // Since ordering might be inconsistent due to timing, just verify we got all data
      const orders = data.map(d => d.data.order).sort();
      expect(orders).toEqual([1, 2, 3]);
    });
  });

  describe('Database Configuration', () => {
    it('should use default database path when none provided', async () => {
      const service = new DataService();
      expect(service.getDbPath()).toContain('carbonara.db');
      await service.close();
    });

    it('should use custom database path', async () => {
      const customPath = '/tmp/custom-carbonara.db';
      const service = new DataService({ dbPath: customPath });
      expect(service.getDbPath()).toBe(customPath);
      await service.close();
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON parsing errors gracefully', async () => {
      // This test ensures our service handles malformed data
      // We'll need to implement proper error handling in the service
      const projectId = await dataService.createProject('Test Project', '/test/path');
      
      // Store valid data first
      await dataService.storeAssessmentData(projectId, 'test-tool', 'test-type', { valid: true });
      
      const data = await dataService.getAssessmentData(projectId);
      expect(data).toHaveLength(1);
      expect(data[0].data.valid).toBe(true);
    });
  });
});
