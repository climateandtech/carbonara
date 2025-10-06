import { describe, it, expect } from 'vitest';
import { parseSonarQubeResults } from '../src/parsers/sonarqube.js';

describe('EcoCode Integration', () => {
  describe('SonarQube Parser', () => {
    it('should parse SonarQube issues correctly', () => {
      const mockSonarQubeResponse = {
        issues: [
          {
            key: 'issue-1',
            rule: 'ecocode:unused-code',
            severity: 'MAJOR',
            component: '/src/main/java/Example.java',
            line: 15,
            message: 'Remove unused import to reduce bundle size',
            type: 'CODE_SMELL'
          },
          {
            key: 'issue-2',
            rule: 'ecocode:inefficient-loop',
            severity: 'CRITICAL',
            component: '/src/main/java/Example.java',
            line: 42,
            message: 'Optimize loop for better performance',
            type: 'BUG'
          }
        ],
        components: [
          {
            key: 'project:src/main/java/Example.java',
            path: 'src/main/java/Example.java',
            language: 'java'
          }
        ]
      };

      const result = parseSonarQubeResults(
        JSON.stringify(mockSonarQubeResponse),
        'ecocode-java',
        '/project'
      );

      expect(result.tool).toBe('ecocode-java');
      expect(result.findings).toHaveLength(2);
      expect(result.stats.totalFindings).toBe(2);
      expect(result.stats.criticalFindings).toBe(1);
      expect(result.stats.highFindings).toBe(1);

      // Check first finding
      const firstFinding = result.findings[0];
      expect(firstFinding.id).toBe('issue-1');
      expect(firstFinding.severity).toBe('high');
      expect(firstFinding.category).toBe('sustainability-patterns');
      expect(firstFinding.file).toBe('src/main/java/Example.java');
      expect(firstFinding.line).toBe(15);
      expect(firstFinding.fix).toContain('Remove unused code');
    });

    it('should handle empty SonarQube response', () => {
      const mockEmptyResponse = {
        issues: [],
        components: []
      };

      const result = parseSonarQubeResults(
        JSON.stringify(mockEmptyResponse),
        'ecocode-java',
        '/project'
      );

      expect(result.tool).toBe('ecocode-java');
      expect(result.findings).toHaveLength(0);
      expect(result.stats.totalFindings).toBe(0);
      expect(result.stats.filesScanned).toBe(0);
    });

    it('should map severity levels correctly', () => {
      const testCases = [
        { input: 'BLOCKER', expected: 'critical' },
        { input: 'CRITICAL', expected: 'critical' },
        { input: 'MAJOR', expected: 'high' },
        { input: 'MINOR', expected: 'medium' },
        { input: 'INFO', expected: 'low' }
      ];

      testCases.forEach(({ input, expected }) => {
        const mockResponse = {
          issues: [{
            key: 'test-issue',
            rule: 'test-rule',
            severity: input,
            component: '/test.java',
            line: 1,
            message: 'Test message',
            type: 'CODE_SMELL'
          }]
        };

        const result = parseSonarQubeResults(
          JSON.stringify(mockResponse),
          'ecocode-java',
          '/project'
        );

        expect(result.findings[0].severity).toBe(expected);
      });
    });

    it('should categorize EcoCode rules correctly', () => {
      const testCases = [
        { rule: 'ecocode:unused-code', expected: 'sustainability-patterns' },
        { rule: 'ecocode:performance-issue', expected: 'performance-critical' },
        { rule: 'ecocode:memory-leak', expected: 'resource-optimization' },
        { rule: 'ecocode:database-inefficiency', expected: 'data-efficiency' },
        { rule: 'java:S1234', expected: 'code-quality' }
      ];

      testCases.forEach(({ rule, expected }) => {
        const mockResponse = {
          issues: [{
            key: 'test-issue',
            rule,
            severity: 'MAJOR',
            component: '/test.java',
            line: 1,
            message: 'Test message',
            type: 'CODE_SMELL'
          }]
        };

        const result = parseSonarQubeResults(
          JSON.stringify(mockResponse),
          'ecocode-java',
          '/project'
        );

        expect(result.findings[0].category).toBe(expected);
      });
    });
  });
});










