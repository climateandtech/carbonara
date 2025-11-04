import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupCarbonaraCore } from '../src/index.js';
import {
  PythonProfilerAdapter,
  NodeProfilerAdapter,
  type CpuProfileResult
} from '../src/index.js';
import fs from 'fs';
import path from 'path';

describe('CPU Profiler Integration Tests', () => {
  let testDbPath: string;
  let services: Awaited<ReturnType<typeof setupCarbonaraCore>>;

  beforeEach(async () => {
    testDbPath = path.join('/tmp', `test-cpu-profiler-${Date.now()}.db`);
    services = await setupCarbonaraCore({ dbPath: testDbPath });
  });

  afterEach(async () => {
    await services.dataService.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Database Storage and Retrieval', () => {
    it('should store and retrieve CPU profile results', async () => {
      const { dataService } = services;

      // Create project
      const projectId = await dataService.createProject('CPU Profile Test', '/test/cpu-profile');
      expect(projectId).toBeGreaterThan(0);

      // Create a mock CPU profile result
      const profileResult: CpuProfileResult = {
        app: 'test-app',
        lang: 'python',
        timestamp: new Date().toISOString(),
        samples_total: 1000,
        lines: [
          {
            file: '/test/cpu-profile/main.py',
            function: 'slow_function',
            line: 42,
            samples: 350,
            percent: 35.0
          },
          {
            file: '/test/cpu-profile/main.py',
            function: 'another_function',
            line: 88,
            samples: 200,
            percent: 20.0
          }
        ],
        scenario: {
          type: 'test',
          value: 'python -m pytest'
        }
      };

      // Store profile
      const entryId = await dataService.storeAssessmentData(
        projectId,
        'cpu-profiler',
        'cpu-profile',
        profileResult,
        'test-scenario'
      );

      expect(entryId).toBeGreaterThan(0);

      // Retrieve profile
      const entries = await dataService.getAssessmentData(projectId, 'cpu-profiler');
      expect(entries).toHaveLength(1);
      expect(entries[0].data_type).toBe('cpu-profile');
      expect(entries[0].tool_name).toBe('cpu-profiler');

      const retrievedProfile = entries[0].data as CpuProfileResult;
      expect(retrievedProfile.app).toBe('test-app');
      expect(retrievedProfile.lang).toBe('python');
      expect(retrievedProfile.lines).toHaveLength(2);
      expect(retrievedProfile.lines[0].percent).toBe(35.0);
      expect(retrievedProfile.scenario?.type).toBe('test');
    });

    it('should store multiple CPU profiles for the same project', async () => {
      const { dataService } = services;

      const projectId = await dataService.createProject('Multi Profile Test', '/test/multi');

      // Store Python profile
      const pythonProfile: CpuProfileResult = {
        app: 'python-app',
        lang: 'python',
        timestamp: new Date().toISOString(),
        samples_total: 1000,
        lines: [{ file: '/test/main.py', line: 10, samples: 100, percent: 10.0 }]
      };

      await dataService.storeAssessmentData(
        projectId,
        'cpu-profiler',
        'cpu-profile',
        pythonProfile
      );

      // Store Node.js profile
      const nodeProfile: CpuProfileResult = {
        app: 'node-app',
        lang: 'node',
        timestamp: new Date().toISOString(),
        samples_total: 2000,
        lines: [{ file: '/test/app.js', line: 20, samples: 200, percent: 10.0 }]
      };

      await dataService.storeAssessmentData(
        projectId,
        'cpu-profiler',
        'cpu-profile',
        nodeProfile
      );

      // Retrieve all profiles
      const entries = await dataService.getAssessmentData(projectId, 'cpu-profiler');
      expect(entries).toHaveLength(2);

      const profiles = entries.map(e => e.data as CpuProfileResult);
      const langs = profiles.map(p => p.lang).sort();
      expect(langs).toEqual(['node', 'python']);
    });

    it('should filter CPU profiles by tool name', async () => {
      const { dataService } = services;

      const projectId = await dataService.createProject('Filter Test', '/test/filter');

      // Store CPU profile
      const cpuProfile: CpuProfileResult = {
        app: 'test-app',
        lang: 'python',
        timestamp: new Date().toISOString(),
        samples_total: 1000,
        lines: []
      };

      await dataService.storeAssessmentData(
        projectId,
        'cpu-profiler',
        'cpu-profile',
        cpuProfile
      );

      // Store other assessment data
      await dataService.storeAssessmentData(
        projectId,
        'greenframe',
        'web-analysis',
        { url: 'https://example.com' }
      );

      // Filter by tool name
      const cpuEntries = await dataService.getAssessmentData(projectId, 'cpu-profiler');
      expect(cpuEntries).toHaveLength(1);
      expect(cpuEntries[0].tool_name).toBe('cpu-profiler');
      expect(cpuEntries[0].data_type).toBe('cpu-profile');

      // All entries should include both
      const allEntries = await dataService.getAssessmentData(projectId);
      expect(allEntries.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Profile Result Structure', () => {
    it('should handle profiles with different scenario types', async () => {
      const { dataService } = services;

      const projectId = await dataService.createProject('Scenario Test', '/test/scenario');

      const scenarios = [
        { type: 'url' as const, value: 'https://example.com' },
        { type: 'test' as const, value: 'npm test' },
        { type: 'server' as const, value: 'npm start' }
      ];

      for (const scenario of scenarios) {
        const profile: CpuProfileResult = {
          app: 'test-app',
          lang: 'node',
          timestamp: new Date().toISOString(),
          samples_total: 1000,
          lines: [],
          scenario
        };

        await dataService.storeAssessmentData(
          projectId,
          'cpu-profiler',
          'cpu-profile',
          profile
        );
      }

      const entries = await dataService.getAssessmentData(projectId, 'cpu-profiler');
      expect(entries).toHaveLength(3);

      const retrievedScenarios = entries.map(e => (e.data as CpuProfileResult).scenario?.type);
      expect(retrievedScenarios.sort()).toEqual(['server', 'test', 'url']);
    });

    it('should handle profiles without scenario information', async () => {
      const { dataService } = services;

      const projectId = await dataService.createProject('No Scenario Test', '/test/no-scenario');

      const profile: CpuProfileResult = {
        app: 'test-app',
        lang: 'python',
        timestamp: new Date().toISOString(),
        samples_total: 1000,
        lines: [
          { file: '/test/main.py', line: 10, samples: 50, percent: 5.0 }
        ]
        // No scenario field
      };

      await dataService.storeAssessmentData(
        projectId,
        'cpu-profiler',
        'cpu-profile',
        profile
      );

      const entries = await dataService.getAssessmentData(projectId, 'cpu-profiler');
      expect(entries).toHaveLength(1);

      const retrievedProfile = entries[0].data as CpuProfileResult;
      expect(retrievedProfile.scenario).toBeUndefined();
      expect(retrievedProfile.lines).toHaveLength(1);
    });
  });

  describe('Profile Line Data', () => {
    it('should handle profiles with multiple lines per file', async () => {
      const { dataService } = services;

      const projectId = await dataService.createProject('Multi Line Test', '/test/multi-line');

      const profile: CpuProfileResult = {
        app: 'test-app',
        lang: 'node',
        timestamp: new Date().toISOString(),
        samples_total: 1000,
        lines: [
          { file: '/test/app.js', line: 10, samples: 100, percent: 10.0, function: 'func1' },
          { file: '/test/app.js', line: 20, samples: 200, percent: 20.0, function: 'func2' },
          { file: '/test/app.js', line: 30, samples: 50, percent: 5.0 },
          { file: '/test/utils.js', line: 5, samples: 150, percent: 15.0, function: 'helper' }
        ]
      };

      await dataService.storeAssessmentData(
        projectId,
        'cpu-profiler',
        'cpu-profile',
        profile
      );

      const entries = await dataService.getAssessmentData(projectId, 'cpu-profiler');
      const retrievedProfile = entries[0].data as CpuProfileResult;

      expect(retrievedProfile.lines).toHaveLength(4);
      
      // Check file grouping
      const appJsLines = retrievedProfile.lines.filter(l => l.file.includes('app.js'));
      expect(appJsLines).toHaveLength(3);

      // Check function names
      const withFunctions = retrievedProfile.lines.filter(l => l.function);
      expect(withFunctions).toHaveLength(3);
    });

    it('should handle profiles with optional fields', async () => {
      const { dataService } = services;

      const projectId = await dataService.createProject('Optional Fields Test', '/test/optional');

      const profile: CpuProfileResult = {
        app: 'test-app',
        lang: 'go',
        timestamp: new Date().toISOString(),
        samples_total: 1000,
        lines: [
          {
            file: '/test/main.go',
            line: 10,
            samples: 100,
            percent: 10.0,
            cpu_ms: 1000,
            function: 'main',
            note: 'hot'
          },
          {
            file: '/test/main.go',
            line: 20,
            samples: 50,
            percent: 5.0
            // No optional fields
          }
        ]
      };

      await dataService.storeAssessmentData(
        projectId,
        'cpu-profiler',
        'cpu-profile',
        profile
      );

      const entries = await dataService.getAssessmentData(projectId, 'cpu-profiler');
      const retrievedProfile = entries[0].data as CpuProfileResult;

      expect(retrievedProfile.lines[0].cpu_ms).toBe(1000);
      expect(retrievedProfile.lines[0].note).toBe('hot');
      expect(retrievedProfile.lines[1].cpu_ms).toBeUndefined();
      expect(retrievedProfile.lines[1].note).toBeUndefined();
    });
  });
});

