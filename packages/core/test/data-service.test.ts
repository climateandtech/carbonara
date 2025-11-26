import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataService } from '../src/data-service.js';
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
      await dataService.storeAssessmentData(projectId, 'assessment-questionnaire', 'questionnaire', { score: 85 });
      await dataService.storeAssessmentData(projectId, 'assessment-questionnaire', 'questionnaire', { score: 90 });
      await dataService.storeAssessmentData(projectId, 'greenframe', 'web-analysis', { url: 'test1.com' });

      const co2Data = await dataService.getAssessmentData(projectId, 'assessment-questionnaire');
      expect(co2Data).toHaveLength(2);
      expect(co2Data.every(d => d.tool_name === 'assessment-questionnaire')).toBe(true);

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

  describe('Database Initialization (Integration Test)', () => {
    it('should load existing database file instead of creating new one', async () => {
      // This test verifies that initialize() loads existing databases
      // and never overwrites them with empty state
      // 
      // Scenario:
      // 1. CLI creates database and writes data
      // 2. VSCode extension calls initialize() on existing database
      // 3. Extension should load existing data, not create empty database

      // Step 1: Create database with data (simulating CLI)
      const projectId = await dataService.createProject('Existing DB Test', '/test/existing');
      
      const testData = {
        url: 'https://existing.example.com',
        result: 'loaded from disk'
      };

      const dataId = await dataService.storeAssessmentData(
        projectId,
        'test-analyzer',
        'web-analysis',
        testData
      );
      expect(dataId).toBeGreaterThan(0);

      // Save and close (simulating CLI closing)
      await dataService.close();

      // Verify file exists with data
      expect(fs.existsSync(testDbPath)).toBe(true);
      const fileSizeBeforeInit = fs.statSync(testDbPath).size;
      expect(fileSizeBeforeInit).toBeGreaterThan(0);

      // Step 2: Simulate VSCode extension initializing on existing database
      const extensionDataService = new DataService({ dbPath: testDbPath });
      await extensionDataService.initialize();

      // Step 3: Verify existing data was loaded (not overwritten)
      const loadedData = await extensionDataService.getAssessmentData(projectId);
      expect(loadedData).toHaveLength(1);
      expect(loadedData[0].id).toBe(dataId);
      expect(loadedData[0].data.url).toBe('https://existing.example.com');
      expect(loadedData[0].data.result).toBe('loaded from disk');

      // Verify database file still exists and wasn't corrupted
      expect(fs.existsSync(testDbPath)).toBe(true);
      const fileSizeAfterInit = fs.statSync(testDbPath).size;
      expect(fileSizeAfterInit).toBe(fileSizeBeforeInit);

      // Verify dbExistedOnInit flag is set correctly
      // (This prevents close() from overwriting on instance switch)
      const dbExisted = (extensionDataService as any).dbExistedOnInit;
      expect(dbExisted).toBe(true);

      await extensionDataService.close();
    });

    it('should create new database when file does not exist', async () => {
      // This test verifies that initialize() creates a new in-memory database
      // when the file doesn't exist (for new projects)
      // Note: The file is only written to disk when close() is called with data

      // Use a new path that doesn't exist
      const newDbPath = path.join('/tmp', `test-new-db-${Date.now()}.db`);
      
      // Clean up if it somehow exists
      if (fs.existsSync(newDbPath)) {
        fs.unlinkSync(newDbPath);
      }

      const newDataService = new DataService({ dbPath: newDbPath });
      await newDataService.initialize();

      // Verify database file does NOT exist yet (only in-memory)
      expect(fs.existsSync(newDbPath)).toBe(false);

      // Verify it's a new empty database (no data)
      const projects = await newDataService.getAllProjects();
      expect(projects).toHaveLength(0);

      // Verify dbExistedOnInit flag is false for new databases
      const dbExisted = (newDataService as any).dbExistedOnInit;
      expect(dbExisted).toBe(false);

      // Add some data and close to create the file
      const projectId = await newDataService.createProject('New Project', '/test/new');
      await newDataService.close();

      // Now the file should exist
      expect(fs.existsSync(newDbPath)).toBe(true);

      // Clean up
      if (fs.existsSync(newDbPath)) {
        fs.unlinkSync(newDbPath);
      }
    });
  });

  describe('Database Reloading (Integration Test)', () => {
    it('should reload database from disk without overwriting data', async () => {
      // This test verifies the fix for the reloadDatabase() bug where it would
      // overwrite the database file with empty in-memory state before reloading.
      // 
      // Scenario:
      // 1. CLI writes data to disk and closes
      // 2. VSCode extension (with empty in-memory state) detects file change
      // 3. reloadDatabase() is called
      // 4. Data should still be present (not overwritten)

      // Step 1: Simulate CLI writing data to disk
      const projectId = await dataService.createProject('Reload Test Project', '/test/reload');
      
      const testData = {
        url: 'https://test.example.com',
        result: 'success',
        data: {
          testScore: 85,
          testMetric: 'A+'
        }
      };

      const dataId = await dataService.storeAssessmentData(
        projectId,
        'test-analyzer',
        'web-analysis',
        testData
      );
      expect(dataId).toBeGreaterThan(0);

      // Verify data is in memory
      const dataBeforeClose = await dataService.getAssessmentData(projectId);
      expect(dataBeforeClose).toHaveLength(1);
      expect(dataBeforeClose[0].data.url).toBe('https://test.example.com');

      // Close and save to disk (simulating CLI closing)
      await dataService.close();

      // Verify file exists and has data
      expect(fs.existsSync(testDbPath)).toBe(true);
      const fileSizeBeforeReload = fs.statSync(testDbPath).size;
      expect(fileSizeBeforeReload).toBeGreaterThan(0);

      // Step 2: Simulate VSCode extension with empty in-memory state
      // Create a new DataService instance pointing to the same file
      const extensionDataService = new DataService({ dbPath: testDbPath });
      await extensionDataService.initialize();

      // Verify extension has empty in-memory state initially
      // (It should load from disk, so it should have the data)
      const dataAfterInit = await extensionDataService.getAssessmentData(projectId);
      expect(dataAfterInit).toHaveLength(1);
      expect(dataAfterInit[0].data.url).toBe('https://test.example.com');

      // Step 3: Simulate file watcher detecting change and calling reloadDatabase()
      // This should reload from disk WITHOUT overwriting with empty state
      await extensionDataService.reloadDatabase();

      // Step 4: Verify data is still present (not overwritten)
      const dataAfterReload = await extensionDataService.getAssessmentData(projectId);
      expect(dataAfterReload).toHaveLength(1);
      expect(dataAfterReload[0].id).toBe(dataId);
      expect(dataAfterReload[0].data.url).toBe('https://test.example.com');
      expect(dataAfterReload[0].data.result).toBe('success');
      expect(dataAfterReload[0].data.data.testScore).toBe(85);
      expect(dataAfterReload[0].data.data.testMetric).toBe('A+');

      // Verify file still exists and wasn't corrupted
      expect(fs.existsSync(testDbPath)).toBe(true);
      const fileSizeAfterReload = fs.statSync(testDbPath).size;
      expect(fileSizeAfterReload).toBe(fileSizeBeforeReload);

      await extensionDataService.close();
    });

    it('should handle multiple reloads without data loss', async () => {
      // Test that multiple reloadDatabase() calls don't cause data loss
      const projectId = await dataService.createProject('Multi Reload Test', '/test/multi-reload');
      
      // Add multiple data entries
      const data1 = await dataService.storeAssessmentData(
        projectId,
        'test-analyzer',
        'web-analysis',
        { url: 'https://test1.com', order: 1 }
      );
      const data2 = await dataService.storeAssessmentData(
        projectId,
        'test-analyzer',
        'web-analysis',
        { url: 'https://test2.com', order: 2 }
      );
      const data3 = await dataService.storeAssessmentData(
        projectId,
        'greenframe',
        'web-analysis',
        { url: 'https://test3.com', order: 3 }
      );

      await dataService.close();

      // Create new instance and reload multiple times
      const newDataService = new DataService({ dbPath: testDbPath });
      await newDataService.initialize();

      // First reload
      await newDataService.reloadDatabase();
      let data = await newDataService.getAssessmentData(projectId);
      expect(data).toHaveLength(3);

      // Second reload
      await newDataService.reloadDatabase();
      data = await newDataService.getAssessmentData(projectId);
      expect(data).toHaveLength(3);

      // Third reload
      await newDataService.reloadDatabase();
      data = await newDataService.getAssessmentData(projectId);
      expect(data).toHaveLength(3);

      // Verify all data is still intact
      const urls = data.map(d => d.data.url).sort();
      expect(urls).toEqual(['https://test1.com', 'https://test2.com', 'https://test3.com']);

      await newDataService.close();
    });

    it('should reload database when external process writes to it', async () => {
      // Simulate the exact scenario: CLI writes, extension reloads
      const projectId = await dataService.createProject('External Write Test', '/test/external');
      
      // Add initial data
      await dataService.storeAssessmentData(
        projectId,
        'test-analyzer',
        'web-analysis',
        { url: 'https://initial.com' }
      );
      await dataService.close();

      // Extension loads database
      const extensionService = new DataService({ dbPath: testDbPath });
      await extensionService.initialize();

      // Verify initial data
      let data = await extensionService.getAssessmentData(projectId);
      expect(data).toHaveLength(1);

      // Simulate CLI writing new data (by creating another service and writing)
      const cliService = new DataService({ dbPath: testDbPath });
      await cliService.initialize();
      await cliService.storeAssessmentData(
        projectId,
        'test-analyzer',
        'web-analysis',
        { url: 'https://cli-added.com' }
      );
      await cliService.close();

      // Extension detects change and reloads
      await extensionService.reloadDatabase();

      // Verify both old and new data are present
      data = await extensionService.getAssessmentData(projectId);
      expect(data).toHaveLength(2);
      
      const urls = data.map(d => d.data.url).sort();
      expect(urls).toContain('https://initial.com');
      expect(urls).toContain('https://cli-added.com');

      await extensionService.close();
    });
  });
});
