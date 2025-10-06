import { describe, it, expect } from 'vitest';
import { parseToolResults } from '../src/parsers/generic.js';
import { AnalysisTool } from '../src/registry/index.js';

describe('Generic Parser', () => {
  describe('Config-driven parsing', () => {
    it('should parse results using tool configuration', () => {
      const mockTool: AnalysisTool = {
        id: 'ecocode-java',
        name: 'EcoCode Java',
        description: 'Test tool',
        command: {
          executable: 'test',
          args: [],
          outputFormat: 'json'
        },
        installation: {
          type: 'built-in',
          package: 'test',
          global: false,
          instructions: 'test'
        },
        detection: {
          method: 'built-in',
          target: 'test'
        },
        parsing: {
          type: 'config-driven',
          config: {
            findingsPath: 'issues',
            mappings: {
              id: 'key',
              file: 'component',
              line: 'line',
              severity: 'severity',
              message: 'message',
              rule: 'rule',
              type: 'type'
            },
            severityMap: {
              'MAJOR': 'high',
              'CRITICAL': 'critical'
            },
            categoryMap: {
              'ecocode:performance': 'performance-critical',
              'ecocode:': 'sustainability-patterns'
            },
            defaultCategory: 'sustainability-patterns'
          }
        }
      };

      const mockOutput = JSON.stringify({
        issues: [
          {
            key: 'issue-1',
            component: '/src/Example.java',
            line: 15,
            severity: 'MAJOR',
            message: 'Remove unused import',
            rule: 'ecocode:unused-code',
            type: 'CODE_SMELL'
          },
          {
            key: 'issue-2',
            component: '/src/Example.java',
            line: 42,
            severity: 'CRITICAL',
            message: 'Optimize loop performance',
            rule: 'ecocode:performance-issue',
            type: 'BUG'
          }
        ]
      });

      const result = parseToolResults(mockOutput, mockTool, '/project');

      expect(result.tool).toBe('ecocode-java');
      expect(result.findings).toHaveLength(2);
      expect(result.stats.totalFindings).toBe(2);
      expect(result.stats.highFindings).toBe(1);
      expect(result.stats.criticalFindings).toBe(1);

      // Check first finding
      const firstFinding = result.findings[0];
      expect(firstFinding.id).toBe('issue-1');
      expect(firstFinding.severity).toBe('high');
      expect(firstFinding.category).toBe('sustainability-patterns');
      expect(firstFinding.file).toBe('src/Example.java');
      expect(firstFinding.line).toBe(15);

      // Check second finding
      const secondFinding = result.findings[1];
      expect(secondFinding.id).toBe('issue-2');
      expect(secondFinding.severity).toBe('critical');
      expect(secondFinding.category).toBe('performance-critical');
    });

    it('should handle empty results', () => {
      const mockTool: AnalysisTool = {
        id: 'test-tool',
        name: 'Test Tool',
        description: 'Test tool',
        command: {
          executable: 'test',
          args: [],
          outputFormat: 'json'
        },
        installation: {
          type: 'built-in',
          package: 'test',
          global: false,
          instructions: 'test'
        },
        detection: {
          method: 'built-in',
          target: 'test'
        },
        parsing: {
          type: 'config-driven',
          config: {
            findingsPath: 'issues',
            mappings: {
              id: 'key',
              file: 'component',
              line: 'line',
              severity: 'severity',
              message: 'message',
              rule: 'rule',
              type: 'type'
            },
            severityMap: {},
            categoryMap: {},
            defaultCategory: 'code-quality'
          }
        }
      };

      const mockOutput = JSON.stringify({
        issues: []
      });

      const result = parseToolResults(mockOutput, mockTool, '/project');

      expect(result.tool).toBe('test-tool');
      expect(result.findings).toHaveLength(0);
      expect(result.stats.totalFindings).toBe(0);
      expect(result.stats.filesScanned).toBe(0);
    });

    it('should handle tools without parsing config', () => {
      const mockTool: AnalysisTool = {
        id: 'simple-tool',
        name: 'Simple Tool',
        description: 'Test tool',
        command: {
          executable: 'test',
          args: [],
          outputFormat: 'json'
        },
        installation: {
          type: 'built-in',
          package: 'test',
          global: false,
          instructions: 'test'
        },
        detection: {
          method: 'built-in',
          target: 'test'
        }
        // No parsing config
      };

      const mockOutput = JSON.stringify([
        {
          id: 'finding-1',
          file: 'test.js',
          line: 10,
          message: 'Test issue',
          severity: 'high'
        }
      ]);

      const result = parseToolResults(mockOutput, mockTool, '/project');

      expect(result.tool).toBe('simple-tool');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].id).toBe('finding-1');
      expect(result.findings[0].severity).toBe('high');
      expect(result.findings[0].category).toBe('code-quality');
    });
  });

  describe('Custom parser override', () => {
    it('should use custom parser when specified', () => {
      const mockTool: AnalysisTool = {
        id: 'custom-tool',
        name: 'Custom Tool',
        description: 'Test tool',
        command: {
          executable: 'test',
          args: [],
          outputFormat: 'json'
        },
        installation: {
          type: 'built-in',
          package: 'test',
          global: false,
          instructions: 'test'
        },
        detection: {
          method: 'built-in',
          target: 'test'
        },
        parsing: {
          type: 'custom',
          customParser: 'sonarqube'
        }
      };

      const mockSonarQubeOutput = JSON.stringify({
        issues: [
          {
            key: 'sonar-issue-1',
            rule: 'ecocode:unused-code',
            severity: 'MAJOR',
            component: '/src/Example.java',
            line: 15,
            message: 'Remove unused import',
            type: 'CODE_SMELL'
          }
        ]
      });

      const result = parseToolResults(mockSonarQubeOutput, mockTool, '/project');

      expect(result.tool).toBe('custom-tool');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].id).toBe('sonar-issue-1');
      expect(result.findings[0].severity).toBe('high');
      expect(result.findings[0].category).toBe('sustainability-patterns');
    });
  });
});










