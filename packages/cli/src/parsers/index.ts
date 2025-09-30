// Tool-specific parsers for converting tool outputs to standardized format
import type { SemgrepResult, SemgrepMatch } from '@carbonara/core';
import { mapFindingToCategory, getCategoryInfo } from './category-mapping.js';

export interface StandardizedFinding {
  id: string;
  filePath: string;
  location: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  category: string;
  ruleId?: string;
  fix?: {
    description: string;
    replacement?: string;
  };
  metadata?: Record<string, any>;
}

export interface StandardizedResult {
  findings: StandardizedFinding[];
  stats: {
    totalMatches: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    filesScanned: number;
  };
  metadata: {
    toolId: string;
    target: string;
    analyzedAt: string;
  };
}

/**
 * Parse Semgrep results into standardized format
 */
export function parseSemgrepResults(result: SemgrepResult, target: string): StandardizedResult {
  const findings: StandardizedFinding[] = result.matches.map((match: SemgrepMatch) => ({
    id: `${match.rule_id || 'unknown'}-${match.path || 'unknown'}-${match.start_line || 0}-${match.start_column || 0}`,
    filePath: match.path || '',
    location: {
      startLine: match.start_line || 1,
      startColumn: match.start_column || 1,
      endLine: match.end_line || match.start_line || 1,
      endColumn: match.end_column || match.start_column || 1
    },
    severity: mapSemgrepSeverity(match.severity || 'INFO'),
    message: match.message || '',
    category: mapFindingToCategory('semgrep', match.rule_id || '', 'quality', match.message || '', match.metadata),
    ruleId: match.rule_id || '',
    fix: match.fix ? {
      description: match.fix,
      replacement: match.fix
    } : undefined,
    metadata: {
      codeSnippet: match.code_snippet || '',
      ...match.metadata
    }
  }));

  return {
    findings,
    stats: {
      totalMatches: result.stats?.total_matches || findings.length,
      errorCount: result.stats?.error_count || findings.filter(f => f.severity === 'error').length,
      warningCount: result.stats?.warning_count || findings.filter(f => f.severity === 'warning').length,
      infoCount: result.stats?.info_count || findings.filter(f => f.severity === 'info').length,
      filesScanned: result.stats?.files_scanned || new Set(findings.map(f => f.filePath)).size
    },
    metadata: {
      toolId: 'semgrep',
      target,
      analyzedAt: new Date().toISOString()
    }
  };
}

/**
 * Parse MegaLinter results into standardized format
 */
export function parseMegalinterResults(result: any, target: string): StandardizedResult {
  // Extract findings from MegaLinter JSON output
  const findings: StandardizedFinding[] = [];
  
  if (result.results) {
    for (const fileResult of result.results) {
      if (fileResult.violations) {
        for (const violation of fileResult.violations) {
          findings.push({
            id: `${violation.linter}-${fileResult.file}-${violation.line}`,
            filePath: fileResult.file,
            location: {
              startLine: violation.line || 1,
              startColumn: violation.column || 1,
              endLine: violation.endLine || violation.line || 1,
              endColumn: violation.endColumn || violation.column || 1
            },
            severity: mapMegalinterSeverity(violation.severity),
            message: violation.message || violation.description || 'MegaLinter finding',
            category: mapFindingToCategory('megalinter', violation.ruleId || '', violation.category || 'quality', violation.message || '', violation),
            ruleId: violation.ruleId || violation.linter,
            metadata: {
              linter: violation.linter,
              ...violation
            }
          });
        }
      }
    }
  }

  return {
    findings,
    stats: {
      totalMatches: findings.length,
      errorCount: findings.filter(f => f.severity === 'error').length,
      warningCount: findings.filter(f => f.severity === 'warning').length,
      infoCount: findings.filter(f => f.severity === 'info').length,
      filesScanned: new Set(findings.map(f => f.filePath)).size
    },
    metadata: {
      toolId: 'megalinter',
      target,
      analyzedAt: new Date().toISOString()
    }
  };
}

/**
 * Parse ESLint results into standardized format
 */
export function parseESLintResults(result: any, target: string): StandardizedResult {
  const findings: StandardizedFinding[] = [];
  
  for (const fileResult of result) {
    if (fileResult.messages) {
      for (const message of fileResult.messages) {
        findings.push({
          id: `${message.ruleId}-${fileResult.filePath}-${message.line}-${message.column}`,
          filePath: fileResult.filePath,
          location: {
            startLine: message.line || 1,
            startColumn: message.column || 1,
            endLine: message.endLine || message.line || 1,
            endColumn: message.endColumn || message.column || 1
          },
          severity: mapESLintSeverity(message.severity),
          message: message.message,
          category: mapFindingToCategory('eslint', message.ruleId || '', 'quality', message.message || '', message),
          ruleId: message.ruleId,
          fix: message.fix ? {
            description: 'ESLint auto-fix available',
            replacement: message.fix.text
          } : undefined,
          metadata: {
            ...message
          }
        });
      }
    }
  }

  return {
    findings,
    stats: {
      totalMatches: findings.length,
      errorCount: findings.filter(f => f.severity === 'error').length,
      warningCount: findings.filter(f => f.severity === 'warning').length,
      infoCount: findings.filter(f => f.severity === 'info').length,
      filesScanned: new Set(findings.map(f => f.filePath)).size
    },
    metadata: {
      toolId: 'eslint',
      target,
      analyzedAt: new Date().toISOString()
    }
  };
}

/**
 * Map Semgrep severity to standardized severity
 */
function mapSemgrepSeverity(severity: string): 'error' | 'warning' | 'info' | 'hint' {
  switch (severity.toUpperCase()) {
    case 'ERROR':
      return 'error';
    case 'WARNING':
      return 'warning';
    case 'INFO':
      return 'info';
    default:
      return 'info';
  }
}

/**
 * Map MegaLinter severity to standardized severity
 */
function mapMegalinterSeverity(severity: string): 'error' | 'warning' | 'info' | 'hint' {
  switch (severity?.toLowerCase()) {
    case 'error':
    case 'fatal':
      return 'error';
    case 'warning':
    case 'warn':
      return 'warning';
    case 'info':
    case 'information':
      return 'info';
    case 'hint':
    case 'suggestion':
      return 'hint';
    default:
      return 'info';
  }
}

/**
 * Map ESLint severity to standardized severity
 */
function mapESLintSeverity(severity: number): 'error' | 'warning' | 'info' | 'hint' {
  switch (severity) {
    case 2:
      return 'error';
    case 1:
      return 'warning';
    case 0:
      return 'info';
    default:
      return 'info';
  }
}

/**
 * Main parser function that routes to tool-specific parsers
 */
export function parseToolResults(toolId: string, result: any, target: string): StandardizedResult {
  switch (toolId) {
    case 'semgrep':
      return parseSemgrepResults(result, target);
    case 'megalinter':
      return parseMegalinterResults(result, target);
    case 'eslint':
      return parseESLintResults(result, target);
    default:
      // Fallback for unknown tools
      return {
        findings: [],
        stats: {
          totalMatches: 0,
          errorCount: 0,
          warningCount: 0,
          infoCount: 0,
          filesScanned: 0
        },
        metadata: {
          toolId,
          target,
          analyzedAt: new Date().toISOString()
        }
      };
  }
}
