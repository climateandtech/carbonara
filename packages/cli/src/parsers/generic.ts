import { CodeAnalysisResult, CodeFinding } from '../types/analysis.js';
import { AnalysisTool } from '../registry/index.js';

// Registry of custom parsers
const customParsers: Record<string, (output: string, toolId: string, projectPath: string) => CodeAnalysisResult> = {
  // Add custom parsers here as needed
};

export interface ParsingConfig {
  findingsPath: string;
  mappings: {
    id: string;
    file: string;
    line: string;
    severity: string;
    message: string;
    rule: string;
    type: string;
  };
  severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low'>;
  categoryMap: Record<string, string>;
  defaultCategory: string;
}

/**
 * Generic parser that can handle both config-driven and custom parsing
 */
export function parseToolResults(
  rawOutput: string,
  tool: AnalysisTool,
  projectPath: string
): CodeAnalysisResult {
  // Check if tool has custom parser
  if (tool.parsing?.type === 'custom' && tool.parsing.customParser) {
    const customParser = customParsers[tool.parsing.customParser];
    if (customParser) {
      return customParser(rawOutput, tool.id, projectPath);
    } else {
      throw new Error(`Custom parser '${tool.parsing.customParser}' not found`);
    }
  }

  // Use config-driven parsing
  if (tool.parsing?.type === 'config-driven' && tool.parsing.config) {
    return parseConfigDrivenResults(rawOutput, tool, projectPath);
  }

  // Fallback to simple JSON parsing
  try {
    const data = JSON.parse(rawOutput);
    return createBasicResult(data, tool.id, projectPath);
  } catch (error) {
    throw new Error(`Failed to parse tool output: ${error}`);
  }
}

/**
 * Parse results using tool configuration
 */
function parseConfigDrivenResults(
  rawOutput: string,
  tool: AnalysisTool,
  projectPath: string
): CodeAnalysisResult {
  try {
    const data = JSON.parse(rawOutput);
    const config = tool.parsing!.config as ParsingConfig;
    
    // Get findings from the configured path
    const findings = getNestedValue(data, config.findingsPath) || [];
    
    const parsedFindings: CodeFinding[] = findings.map((finding: any) => ({
      id: getNestedValue(finding, config.mappings.id) || `finding-${Date.now()}`,
      tool: tool.id,
      file: cleanFilePath(getNestedValue(finding, config.mappings.file) || '', projectPath),
      line: parseInt(getNestedValue(finding, config.mappings.line) || '0'),
      column: 0, // Default column, could be made configurable
      severity: mapSeverity(getNestedValue(finding, config.mappings.severity), config.severityMap),
      message: getNestedValue(finding, config.mappings.message) || 'No message',
      rule: getNestedValue(finding, config.mappings.rule) || 'unknown',
      category: mapCategory(getNestedValue(finding, config.mappings.rule), config.categoryMap, config.defaultCategory),
      originalCategory: getNestedValue(finding, config.mappings.type) || 'unknown',
      confidence: 'high', // Default confidence, could be made configurable
      fix: generateFixSuggestion(getNestedValue(finding, config.mappings.rule), getNestedValue(finding, config.mappings.message)),
      impact: estimateImpact(getNestedValue(finding, config.mappings.severity), getNestedValue(finding, config.mappings.type))
    }));

    return {
      tool: tool.id,
      timestamp: new Date().toISOString(),
      projectPath,
      stats: {
        totalFindings: parsedFindings.length,
        filesScanned: new Set(parsedFindings.map(f => f.file)).size,
        criticalFindings: parsedFindings.filter(f => f.severity === 'critical').length,
        highFindings: parsedFindings.filter(f => f.severity === 'high').length,
        mediumFindings: parsedFindings.filter(f => f.severity === 'medium').length,
        lowFindings: parsedFindings.filter(f => f.severity === 'low').length
      },
      findings: parsedFindings
    };
  } catch (error) {
    throw new Error(`Failed to parse config-driven results: ${error}`);
  }
}

/**
 * Create a basic result for tools without parsing config
 */
function createBasicResult(data: any, toolId: string, projectPath: string): CodeAnalysisResult {
  // Try to extract basic information from common patterns
  const findings: CodeFinding[] = [];
  
  // Look for common finding patterns
  if (Array.isArray(data)) {
    data.forEach((item, index) => {
      if (item.message || item.issue || item.finding) {
        findings.push({
          id: item.id || `finding-${index}`,
          tool: toolId,
          file: item.file || item.path || 'unknown',
          line: item.line || 0,
          column: item.column || 0,
          severity: mapBasicSeverity(item.severity || item.level),
          message: item.message || item.issue || item.finding || 'No message',
          rule: item.rule || item.type || 'unknown',
          category: 'code-quality',
          originalCategory: item.type || 'unknown',
          confidence: 'medium',
          fix: 'Review and optimize code',
          impact: 'Medium - Review recommended'
        });
      }
    });
  }

  return {
    tool: toolId,
    timestamp: new Date().toISOString(),
    projectPath,
    stats: {
      totalFindings: findings.length,
      filesScanned: new Set(findings.map(f => f.file)).size,
      criticalFindings: findings.filter(f => f.severity === 'critical').length,
      highFindings: findings.filter(f => f.severity === 'high').length,
      mediumFindings: findings.filter(f => f.severity === 'medium').length,
      lowFindings: findings.filter(f => f.severity === 'low').length
    },
    findings
  };
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Clean file path by removing project path prefix
 */
function cleanFilePath(filePath: string, projectPath: string): string {
  return filePath.replace(projectPath, '').replace(/^\//, '');
}

/**
 * Map severity using configuration
 */
function mapSeverity(severity: string, severityMap: Record<string, string>): 'critical' | 'high' | 'medium' | 'low' {
  const mapped = severityMap[severity?.toUpperCase()];
  if (mapped) {
    return mapped as 'critical' | 'high' | 'medium' | 'low';
  }
  return mapBasicSeverity(severity);
}

/**
 * Map basic severity without configuration
 */
function mapBasicSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' {
  const severityUpper = severity?.toUpperCase() || '';
  if (severityUpper.includes('CRITICAL') || severityUpper.includes('BLOCKER')) {
    return 'critical';
  }
  if (severityUpper.includes('MAJOR') || severityUpper.includes('HIGH')) {
    return 'high';
  }
  if (severityUpper.includes('MINOR') || severityUpper.includes('MEDIUM')) {
    return 'medium';
  }
  return 'low';
}

/**
 * Map category using configuration
 */
function mapCategory(rule: string, categoryMap: Record<string, string>, defaultCategory: string): string {
  if (!rule) return defaultCategory;
  
  const ruleLower = rule.toLowerCase();
  
  // Check for exact matches first
  for (const [pattern, category] of Object.entries(categoryMap)) {
    if (ruleLower.includes(pattern.toLowerCase())) {
      return category;
    }
  }
  
  return defaultCategory;
}

/**
 * Generate fix suggestion based on rule
 */
function generateFixSuggestion(rule: string, message: string): string {
  if (!rule) return `Review and optimize: ${message}`;
  
  const ruleLower = rule.toLowerCase();
  
  if (ruleLower.includes('unused')) {
    return 'Remove unused code to reduce bundle size and improve performance';
  }
  
  if (ruleLower.includes('loop') || ruleLower.includes('performance')) {
    return 'Optimize for better performance and resource efficiency';
  }
  
  if (ruleLower.includes('memory') || ruleLower.includes('resource')) {
    return 'Optimize memory usage and resource consumption';
  }
  
  if (ruleLower.includes('database') || ruleLower.includes('query')) {
    return 'Optimize database queries to reduce resource consumption';
  }
  
  return `Review and optimize code for better sustainability: ${message}`;
}

/**
 * Estimate environmental impact
 */
function estimateImpact(severity: string, type: string): string {
  const severityWeight = {
    'CRITICAL': 4,
    'BLOCKER': 4,
    'MAJOR': 3,
    'HIGH': 3,
    'MINOR': 2,
    'MEDIUM': 2,
    'INFO': 1,
    'LOW': 1
  }[severity?.toUpperCase() || ''] || 1;
  
  const typeWeight = {
    'BUG': 2,
    'VULNERABILITY': 3,
    'CODE_SMELL': 1
  }[type?.toUpperCase() || ''] || 1;
  
  const impact = severityWeight * typeWeight;
  
  if (impact >= 6) {
    return 'High - Significant impact on performance and resource usage';
  } else if (impact >= 3) {
    return 'Medium - Moderate impact on efficiency';
  } else {
    return 'Low - Minor optimization opportunity';
  }
}

/**
 * Register a custom parser
 */
export function registerCustomParser(name: string, parser: (output: string, toolId: string, projectPath: string) => CodeAnalysisResult): void {
  customParsers[name] = parser;
}

/**
 * Get list of available custom parsers
 */
export function getAvailableCustomParsers(): string[] {
  return Object.keys(customParsers);
}











