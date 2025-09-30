import { describe, test, expect } from 'vitest';
import { parseToolResults } from '../src/parsers/index.js';
import { mapFindingToCategory, getCategoryInfo, filterFindingsByImpact, CARBONARA_CATEGORIES } from '../src/parsers/category-mapping.js';

describe('Highlighting Integration Tests', () => {
  test('should parse Semgrep results correctly', () => {
    const mockSemgrepResult = {
      success: true,
      matches: [
        {
          rule_id: 'test-rule',
          path: 'src/test.js',
          start_line: 10,
          end_line: 10,
          start_column: 5,
          end_column: 15,
          message: 'Test finding',
          severity: 'ERROR',
          code_snippet: 'console.log("test");',
          fix: 'Remove console.log',
          metadata: { confidence: 'high' }
        }
      ],
      errors: [],
      stats: {
        total_matches: 1,
        error_count: 1,
        warning_count: 0,
        info_count: 0,
        files_scanned: 1
      }
    };

    const result = parseToolResults('semgrep', mockSemgrepResult, 'src/');
    
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].filePath).toBe('src/test.js');
    expect(result.findings[0].severity).toBe('error');
    expect(result.findings[0].message).toBe('Test finding');
    expect(result.findings[0].category).toBe('code-quality');
    expect(result.findings[0].ruleId).toBe('test-rule');
    expect(result.findings[0].fix?.description).toBe('Remove console.log');
    expect(result.findings[0].metadata?.confidence).toBe('high');
    expect(result.stats.totalMatches).toBe(1);
    expect(result.stats.errorCount).toBe(1);
    expect(result.metadata.toolId).toBe('semgrep');
    expect(result.metadata.target).toBe('src/');
  });

  test('should parse Semgrep results with multiple findings', () => {
    const mockSemgrepResult = {
      success: true,
      matches: [
        {
          rule_id: 'error-rule',
          path: 'src/file1.js',
          start_line: 5,
          end_line: 5,
          start_column: 1,
          end_column: 10,
          message: 'Error finding',
          severity: 'ERROR',
          code_snippet: 'badCode();',
          metadata: {}
        },
        {
          rule_id: 'warning-rule',
          path: 'src/file2.js',
          start_line: 10,
          end_line: 10,
          start_column: 1,
          end_column: 15,
          message: 'Warning finding',
          severity: 'WARNING',
          code_snippet: 'suspiciousCode();',
          metadata: {}
        }
      ],
      errors: [],
      stats: {
        total_matches: 2,
        error_count: 1,
        warning_count: 1,
        info_count: 0,
        files_scanned: 2
      }
    };

    const result = parseToolResults('semgrep', mockSemgrepResult, 'src/');
    
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].severity).toBe('error');
    expect(result.findings[1].severity).toBe('warning');
    expect(result.stats.totalMatches).toBe(2);
    expect(result.stats.errorCount).toBe(1);
    expect(result.stats.warningCount).toBe(1);
    expect(result.stats.filesScanned).toBe(2);
  });

  test('should parse MegaLinter results correctly', () => {
    const mockMegalinterResult = {
      results: [
        {
          file: 'src/test.js',
          violations: [
            {
              linter: 'eslint',
              line: 5,
              column: 1,
              endLine: 5,
              endColumn: 10,
              severity: 'warning',
              message: 'Unused variable',
              ruleId: 'no-unused-vars',
              category: 'code-quality'
            }
          ]
        }
      ]
    };

    const result = parseToolResults('megalinter', mockMegalinterResult, 'src/');
    
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].filePath).toBe('src/test.js');
    expect(result.findings[0].severity).toBe('warning');
    expect(result.findings[0].message).toBe('Unused variable');
    expect(result.findings[0].category).toBe('resource-optimization');
    expect(result.findings[0].ruleId).toBe('no-unused-vars');
    expect(result.findings[0].location.startLine).toBe(5);
    expect(result.findings[0].location.startColumn).toBe(1);
    expect(result.findings[0].location.endLine).toBe(5);
    expect(result.findings[0].location.endColumn).toBe(10);
    expect(result.stats.totalMatches).toBe(1);
    expect(result.stats.warningCount).toBe(1);
    expect(result.metadata.toolId).toBe('megalinter');
  });

  test('should parse ESLint results correctly', () => {
    const mockESLintResult = [
      {
        filePath: 'src/test.js',
        messages: [
          {
            ruleId: 'no-console',
            severity: 2,
            message: 'Unexpected console statement',
            line: 10,
            column: 1,
            endLine: 10,
            endColumn: 15,
            fix: { text: '// console.log("test");' }
          },
          {
            ruleId: 'no-unused-vars',
            severity: 1,
            message: 'Unused variable',
            line: 5,
            column: 1,
            endLine: 5,
            endColumn: 10
          }
        ]
      }
    ];

    const result = parseToolResults('eslint', mockESLintResult, 'src/');
    
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].severity).toBe('error'); // severity 2 = error
    expect(result.findings[1].severity).toBe('warning'); // severity 1 = warning
    expect(result.findings[0].fix?.description).toBe('ESLint auto-fix available');
    expect(result.stats.totalMatches).toBe(2);
    expect(result.stats.errorCount).toBe(1);
    expect(result.stats.warningCount).toBe(1);
    expect(result.metadata.toolId).toBe('eslint');
  });

  test('should handle unknown tools gracefully', () => {
    const result = parseToolResults('unknown-tool', {}, 'src/');
    
    expect(result.findings).toHaveLength(0);
    expect(result.stats.totalMatches).toBe(0);
    expect(result.stats.errorCount).toBe(0);
    expect(result.stats.warningCount).toBe(0);
    expect(result.stats.infoCount).toBe(0);
    expect(result.stats.filesScanned).toBe(0);
    expect(result.metadata.toolId).toBe('unknown-tool');
    expect(result.metadata.target).toBe('src/');
  });

  test('should handle empty results gracefully', () => {
    const emptySemgrepResult = {
      success: true,
      matches: [],
      errors: [],
      stats: {
        total_matches: 0,
        error_count: 0,
        warning_count: 0,
        info_count: 0,
        files_scanned: 0
      }
    };

    const result = parseToolResults('semgrep', emptySemgrepResult, 'src/');
    
    expect(result.findings).toHaveLength(0);
    expect(result.stats.totalMatches).toBe(0);
    expect(result.stats.filesScanned).toBe(0);
  });

  test('should handle malformed data gracefully', () => {
    const malformedResult = {
      // Missing required fields
      matches: [
        {
          // Missing rule_id, path, etc.
          severity: 'ERROR'
        }
      ]
      // Missing stats object
    };

    const result = parseToolResults('semgrep', malformedResult, 'src/');
    
    // Should not crash and should handle missing fields
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].filePath).toBe(''); // Should default to empty string
    expect(result.findings[0].severity).toBe('error');
    expect(result.findings[0].message).toBe(''); // Should default to empty string
    expect(result.findings[0].ruleId).toBe(''); // Should default to empty string
    
    // Should calculate stats from findings when stats object is missing
    expect(result.stats.totalMatches).toBe(1);
    expect(result.stats.errorCount).toBe(1);
    expect(result.stats.warningCount).toBe(0);
    expect(result.stats.infoCount).toBe(0);
    expect(result.stats.filesScanned).toBe(1); // Empty file path still counts as 1 file
  });

  test('should map severities correctly for all tools', () => {
    // Test Semgrep severity mapping
    const semgrepResult = {
      matches: [
        { rule_id: 'error-rule', path: 'test.js', start_line: 1, end_line: 1, start_column: 1, end_column: 10, message: 'Error', severity: 'ERROR', code_snippet: '', metadata: {} },
        { rule_id: 'warning-rule', path: 'test.js', start_line: 2, end_line: 2, start_column: 1, end_column: 10, message: 'Warning', severity: 'WARNING', code_snippet: '', metadata: {} },
        { rule_id: 'info-rule', path: 'test.js', start_line: 3, end_line: 3, start_column: 1, end_column: 10, message: 'Info', severity: 'INFO', code_snippet: '', metadata: {} },
        { rule_id: 'unknown-rule', path: 'test.js', start_line: 4, end_line: 4, start_column: 1, end_column: 10, message: 'Unknown', severity: 'UNKNOWN', code_snippet: '', metadata: {} }
      ],
      errors: [],
      stats: { total_matches: 4, error_count: 1, warning_count: 1, info_count: 2, files_scanned: 1 }
    };

    const semgrepParsed = parseToolResults('semgrep', semgrepResult, 'test.js');
    expect(semgrepParsed.findings[0].severity).toBe('error');
    expect(semgrepParsed.findings[1].severity).toBe('warning');
    expect(semgrepParsed.findings[2].severity).toBe('info');
    expect(semgrepParsed.findings[3].severity).toBe('info'); // Unknown defaults to info

    // Test MegaLinter severity mapping
    const megalinterResult = {
      results: [{
        file: 'test.js',
        violations: [
          { linter: 'eslint', line: 1, column: 1, severity: 'error', message: 'Error', ruleId: 'error-rule' },
          { linter: 'eslint', line: 2, column: 1, severity: 'fatal', message: 'Fatal', ruleId: 'fatal-rule' },
          { linter: 'eslint', line: 3, column: 1, severity: 'warning', message: 'Warning', ruleId: 'warning-rule' },
          { linter: 'eslint', line: 4, column: 1, severity: 'warn', message: 'Warn', ruleId: 'warn-rule' },
          { linter: 'eslint', line: 5, column: 1, severity: 'info', message: 'Info', ruleId: 'info-rule' },
          { linter: 'eslint', line: 6, column: 1, severity: 'information', message: 'Information', ruleId: 'information-rule' },
          { linter: 'eslint', line: 7, column: 1, severity: 'hint', message: 'Hint', ruleId: 'hint-rule' },
          { linter: 'eslint', line: 8, column: 1, severity: 'unknown', message: 'Unknown', ruleId: 'unknown-rule' }
        ]
      }]
    };

    const megalinterParsed = parseToolResults('megalinter', megalinterResult, 'test.js');
    expect(megalinterParsed.findings[0].severity).toBe('error');
    expect(megalinterParsed.findings[1].severity).toBe('error'); // fatal maps to error
    expect(megalinterParsed.findings[2].severity).toBe('warning');
    expect(megalinterParsed.findings[3].severity).toBe('warning'); // warn maps to warning
    expect(megalinterParsed.findings[4].severity).toBe('info');
    expect(megalinterParsed.findings[5].severity).toBe('info'); // information maps to info
    expect(megalinterParsed.findings[6].severity).toBe('hint');
    expect(megalinterParsed.findings[7].severity).toBe('info'); // unknown defaults to info

    // Test ESLint severity mapping
    const eslintResult = [{
      filePath: 'test.js',
      messages: [
        { ruleId: 'error-rule', severity: 2, message: 'Error', line: 1, column: 1, endLine: 1, endColumn: 10 },
        { ruleId: 'warning-rule', severity: 1, message: 'Warning', line: 2, column: 1, endLine: 2, endColumn: 10 },
        { ruleId: 'info-rule', severity: 0, message: 'Info', line: 3, column: 1, endLine: 3, endColumn: 10 },
        { ruleId: 'unknown-rule', severity: 99, message: 'Unknown', line: 4, column: 1, endLine: 4, endColumn: 10 }
      ]
    }];

    const eslintParsed = parseToolResults('eslint', eslintResult, 'test.js');
    expect(eslintParsed.findings[0].severity).toBe('error'); // 2 = error
    expect(eslintParsed.findings[1].severity).toBe('warning'); // 1 = warning
    expect(eslintParsed.findings[2].severity).toBe('info'); // 0 = info
    expect(eslintParsed.findings[3].severity).toBe('info'); // unknown defaults to info
  });

  test('should handle special characters and edge cases', () => {
    const specialCharsResult = {
      matches: [
        {
          rule_id: 'special-rule',
          path: 'src/file with spaces.js',
          start_line: 1,
          end_line: 1,
          start_column: 1,
          end_column: 10,
          message: 'Message with "quotes" and \'apostrophes\' and newlines\nand tabs\t',
          severity: 'ERROR',
          code_snippet: 'console.log("test with special chars: @#$%^&*()");',
          metadata: { special: 'value with spaces' }
        }
      ],
      errors: [],
      stats: { total_matches: 1, error_count: 1, warning_count: 0, info_count: 0, files_scanned: 1 }
    };

    const result = parseToolResults('semgrep', specialCharsResult, 'src/');
    
    expect(result.findings[0].filePath).toBe('src/file with spaces.js');
    expect(result.findings[0].message).toContain('quotes');
    expect(result.findings[0].message).toContain('apostrophes');
    expect(result.findings[0].message).toContain('newlines');
    expect(result.findings[0].message).toContain('tabs');
    expect(result.findings[0].metadata?.special).toBe('value with spaces');
  });

  test('should map findings to appropriate Carbonara categories', () => {
    // Test tool-specific mappings
    expect(mapFindingToCategory('semgrep', 'no-infinite-loop', 'performance', 'Infinite loop detected')).toBe('performance-critical');
    expect(mapFindingToCategory('eslint', 'no-unused-vars', 'quality', 'Unused variable')).toBe('resource-optimization');
    expect(mapFindingToCategory('megalinter', 'no-excessive-api-calls', 'network', 'Too many API calls')).toBe('network-efficiency');
    expect(mapFindingToCategory('semgrep', 'sql-injection', 'security', 'SQL injection vulnerability')).toBe('code-quality');
    
    // Test ESLint-specific rule mappings
    expect(mapFindingToCategory('eslint', 'no-console', 'quality', 'Console statement')).toBe('code-quality');
    expect(mapFindingToCategory('eslint', 'no-eval', 'quality', 'Eval usage')).toBe('performance-critical');
    expect(mapFindingToCategory('eslint', 'no-unused-vars', 'quality', 'Unused variable')).toBe('resource-optimization');
    
    // Test fallback to message content
    expect(mapFindingToCategory('unknown-tool', 'unknown-rule', 'unknown', 'Memory leak detected')).toBe('performance-critical');
    expect(mapFindingToCategory('unknown-tool', 'unknown-rule', 'unknown', 'Unused variable found')).toBe('resource-optimization');
    expect(mapFindingToCategory('unknown-tool', 'unknown-rule', 'unknown', 'XSS vulnerability')).toBe('code-quality');
    
    // Test default fallback
    expect(mapFindingToCategory('unknown-tool', 'unknown-rule', 'unknown', 'Code style issue')).toBe('code-quality');
  });

  test('should provide category information', () => {
    const performanceCategory = getCategoryInfo('performance-critical');
    expect(performanceCategory).toBeDefined();
    expect(performanceCategory?.name).toBe('Performance Critical');
    expect(performanceCategory?.environmentalImpact).toBe('high');
    expect(performanceCategory?.performanceImpact).toBe('high');
    expect(performanceCategory?.priority).toBe('critical');
    expect(performanceCategory?.tags).toContain('performance');
    expect(performanceCategory?.tags).toContain('energy');
  });

  test('should filter findings by environmental impact and priority', () => {
    const mockFindings = [
      { category: 'performance-critical', message: 'Infinite loop' },
      { category: 'resource-optimization', message: 'Unused variable' },
      { category: 'code-quality', message: 'Style issue' },
      { category: 'security-vulnerability', message: 'SQL injection' }
    ];

    // Filter for high environmental impact
    const highImpactFindings = filterFindingsByImpact(mockFindings, 'high', 'low');
    expect(highImpactFindings).toHaveLength(2);
    expect(highImpactFindings.map(f => f.category)).toContain('performance-critical');
    expect(highImpactFindings.map(f => f.category)).toContain('security-vulnerability');

    // Filter for critical priority
    const criticalFindings = filterFindingsByImpact(mockFindings, 'low', 'critical');
    expect(criticalFindings).toHaveLength(2);
    expect(criticalFindings.map(f => f.category)).toContain('performance-critical');
    expect(criticalFindings.map(f => f.category)).toContain('security-vulnerability');

    // Filter for medium impact and above
    const mediumImpactFindings = filterFindingsByImpact(mockFindings, 'medium', 'low');
    expect(mediumImpactFindings).toHaveLength(3);
    expect(mediumImpactFindings.map(f => f.category)).toContain('performance-critical');
    expect(mediumImpactFindings.map(f => f.category)).toContain('resource-optimization');
    expect(mediumImpactFindings.map(f => f.category)).toContain('security-vulnerability');
  });

  test('should have all required Carbonara categories', () => {
    const expectedCategories = [
      'performance-critical',
      'resource-optimization', 
      'network-efficiency',
      'data-efficiency',
      'security-vulnerability',
      'code-quality',
      'accessibility',
      'sustainability-patterns'
    ];

    const actualCategories = CARBONARA_CATEGORIES.map(cat => cat.id);
    expect(actualCategories).toEqual(expect.arrayContaining(expectedCategories));
    expect(actualCategories).toHaveLength(expectedCategories.length);
  });

  test('should categorize real-world examples correctly', () => {
    // Test with actual Semgrep results
    const semgrepResult = {
      success: true,
      matches: [
        {
          rule_id: 'no-console',
          path: 'src/app.js',
          start_line: 10,
          end_line: 10,
          start_column: 1,
          end_column: 15,
          message: 'Console statement should be removed in production',
          severity: 'WARNING',
          code_snippet: 'console.log("debug");',
          metadata: {}
        },
        {
          rule_id: 'sql-injection',
          path: 'src/database.js',
          start_line: 25,
          end_line: 25,
          start_column: 1,
          end_column: 20,
          message: 'SQL injection vulnerability detected',
          severity: 'ERROR',
          code_snippet: 'query = "SELECT * FROM users WHERE id = " + userId;',
          metadata: {}
        }
      ],
      errors: [],
      stats: { total_matches: 2, error_count: 1, warning_count: 1, info_count: 0, files_scanned: 2 }
    };

    const result = parseToolResults('semgrep', semgrepResult, 'src/');
    
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].category).toBe('code-quality'); // console.log is code quality
    expect(result.findings[1].category).toBe('code-quality'); // SQL injection is code quality (not carbon-focused)
  });
});
