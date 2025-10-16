/**
 * Category mapping system for code analysis findings
 * Maps linter findings to Carbonara-relevant categories based on environmental impact and performance
 */

export interface CategoryMapping {
  category: string;
  description: string;
  environmentalImpact: 'high' | 'medium' | 'low' | 'none';
  performanceImpact: 'high' | 'medium' | 'low' | 'none';
  priority: 'critical' | 'high' | 'medium' | 'low';
  tags: string[];
}

export interface FindingCategory {
  id: string;
  name: string;
  description: string;
  environmentalImpact: 'high' | 'medium' | 'low' | 'none';
  performanceImpact: 'high' | 'medium' | 'low' | 'none';
  priority: 'critical' | 'high' | 'medium' | 'low';
  tags: string[];
  examples: string[];
}

/**
 * Carbonara-relevant categories for code analysis findings
 */
export const CARBONARA_CATEGORIES: FindingCategory[] = [
  {
    id: 'performance-critical',
    name: 'Performance Critical',
    description: 'Issues that directly impact performance and energy consumption',
    environmentalImpact: 'high',
    performanceImpact: 'high',
    priority: 'critical',
    tags: ['performance', 'energy', 'cpu', 'memory', 'bottleneck'],
    examples: [
      'Infinite loops',
      'Memory leaks',
      'Excessive CPU usage',
      'Blocking operations',
      'Inefficient algorithms'
    ]
  },
  {
    id: 'resource-optimization',
    name: 'Resource Optimization',
    description: 'Code that can be optimized to reduce resource usage',
    environmentalImpact: 'medium',
    performanceImpact: 'medium',
    priority: 'high',
    tags: ['optimization', 'efficiency', 'resources', 'waste'],
    examples: [
      'Unused variables',
      'Dead code',
      'Inefficient data structures',
      'Redundant operations',
      'Unnecessary computations'
    ]
  },
  {
    id: 'network-efficiency',
    name: 'Network Efficiency',
    description: 'Issues affecting network usage and data transfer',
    environmentalImpact: 'medium',
    performanceImpact: 'medium',
    priority: 'high',
    tags: ['network', 'bandwidth', 'data-transfer', 'api', 'http'],
    examples: [
      'Excessive API calls',
      'Large payload sizes',
      'Inefficient caching',
      'Unnecessary network requests',
      'Poor compression'
    ]
  },
  {
    id: 'data-efficiency',
    name: 'Data Efficiency',
    description: 'Issues with data handling and storage efficiency',
    environmentalImpact: 'medium',
    performanceImpact: 'medium',
    priority: 'medium',
    tags: ['data', 'storage', 'database', 'serialization', 'compression'],
    examples: [
      'Inefficient database queries',
      'Large data structures',
      'Poor data serialization',
      'Unnecessary data copying',
      'Inefficient data formats'
    ]
  },
  {
    id: 'security-vulnerability',
    name: 'Security Vulnerability',
    description: 'Security issues that could lead to system compromise',
    environmentalImpact: 'high',
    performanceImpact: 'none',
    priority: 'critical',
    tags: ['security', 'vulnerability', 'exploit', 'injection', 'xss'],
    examples: [
      'SQL injection',
      'XSS vulnerabilities',
      'Authentication bypass',
      'Insecure data handling',
      'Privilege escalation'
    ]
  },
  {
    id: 'code-quality',
    name: 'Code Quality',
    description: 'General code quality issues that may impact maintainability',
    environmentalImpact: 'low',
    performanceImpact: 'low',
    priority: 'low',
    tags: ['quality', 'maintainability', 'readability', 'standards'],
    examples: [
      'Code style violations',
      'Naming conventions',
      'Documentation issues',
      'Code complexity',
      'Duplicated code'
    ]
  },
  {
    id: 'accessibility',
    name: 'Accessibility',
    description: 'Issues affecting user accessibility and inclusive design',
    environmentalImpact: 'none',
    performanceImpact: 'none',
    priority: 'medium',
    tags: ['accessibility', 'a11y', 'inclusive', 'usability'],
    examples: [
      'Missing alt text',
      'Poor color contrast',
      'Keyboard navigation issues',
      'Screen reader compatibility',
      'Focus management'
    ]
  },
  {
    id: 'sustainability-patterns',
    name: 'Sustainability Patterns',
    description: 'Code patterns that promote sustainable development practices',
    environmentalImpact: 'medium',
    performanceImpact: 'medium',
    priority: 'medium',
    tags: ['sustainability', 'green-coding', 'eco-friendly', 'patterns'],
    examples: [
      'Efficient caching strategies',
      'Lazy loading implementations',
      'Resource pooling',
      'Energy-efficient algorithms',
      'Sustainable architecture patterns'
    ]
  }
];

/**
 * Generic rule pattern mappings to Carbonara categories
 * These patterns work across all tools
 */
export const RULE_PATTERN_MAPPING: Record<string, string> = {
  // Performance Critical patterns
  'infinite-loop': 'performance-critical',
  'memory-leak': 'performance-critical',
  'blocking-call': 'performance-critical',
  'sync-operation': 'performance-critical',
  'excessive-cpu': 'performance-critical',
  'cpu-intensive': 'performance-critical',
  
  // Resource Optimization patterns
  'unused-var': 'resource-optimization',
  'unused-import': 'resource-optimization',
  'dead-code': 'resource-optimization',
  'redundant-code': 'resource-optimization',
  'inefficient-algorithm': 'resource-optimization',
  'waste': 'resource-optimization',
  
  // Network Efficiency patterns
  'excessive-api': 'network-efficiency',
  'large-payload': 'network-efficiency',
  'inefficient-caching': 'network-efficiency',
  'unnecessary-request': 'network-efficiency',
  'poor-compression': 'network-efficiency',
  'bandwidth': 'network-efficiency',
  
  // Data Efficiency patterns
  'inefficient-query': 'data-efficiency',
  'large-data-structure': 'data-efficiency',
  'poor-serialization': 'data-efficiency',
  'unnecessary-copying': 'data-efficiency',
  'inefficient-format': 'data-efficiency',
  'database': 'data-efficiency',
  
  // Security patterns (minimal - focus on performance/carbon)
  'sql-injection': 'data-efficiency', // SQL injection can impact database performance
  'xss': 'code-quality', // XSS is more about code quality than carbon
  'auth-bypass': 'code-quality',
  'insecure-handling': 'code-quality',
  'privilege-escalation': 'code-quality',
  'vulnerability': 'code-quality',
  
  // Code Quality patterns
  'console': 'code-quality',
  'debugger': 'code-quality',
  'alert': 'code-quality',
  'style': 'code-quality',
  'naming': 'code-quality',
  'convention': 'code-quality',
  
  // Accessibility patterns
  'missing-alt': 'accessibility',
  'poor-contrast': 'accessibility',
  'keyboard-issue': 'accessibility',
  'screen-reader': 'accessibility',
  'focus-issue': 'accessibility',
  'a11y': 'accessibility',
  
  // Sustainability patterns
  'caching': 'sustainability-patterns',
  'lazy-loading': 'sustainability-patterns',
  'resource-pooling': 'sustainability-patterns',
  'efficient-algorithm': 'sustainability-patterns',
  'sustainable-architecture': 'sustainability-patterns',
  'green-coding': 'sustainability-patterns'
};

/**
 * Tool-specific category mapping interface
 * Each tool should implement this to map their findings to Carbonara categories
 */
export interface ToolCategoryMapper {
  mapToCategory(ruleId: string, originalCategory: string, message: string, metadata?: any): string;
}

/**
 * Default category mapper that uses pattern matching and content analysis
 */
export class DefaultCategoryMapper implements ToolCategoryMapper {
  mapToCategory(ruleId: string, originalCategory: string, message: string, metadata?: any): string {
    const searchText = `${ruleId} ${originalCategory} ${message}`.toLowerCase();
    
    // Try to match against known patterns
    for (const [pattern, category] of Object.entries(RULE_PATTERN_MAPPING)) {
      if (searchText.includes(pattern)) {
        return category;
      }
    }
    
    // Fallback to message content analysis
    const messageLower = message.toLowerCase();
    
    // Performance critical keywords
    if (messageLower.includes('infinite loop') || 
        messageLower.includes('memory leak') || 
        messageLower.includes('blocking') ||
        messageLower.includes('cpu intensive') ||
        messageLower.includes('bottleneck')) {
      return 'performance-critical';
    }
    
    // Resource optimization keywords
    if (messageLower.includes('unused') || 
        messageLower.includes('dead code') || 
        messageLower.includes('redundant') ||
        messageLower.includes('inefficient') ||
        messageLower.includes('waste')) {
      return 'resource-optimization';
    }
    
    // Network efficiency keywords
    if (messageLower.includes('api call') || 
        messageLower.includes('network') || 
        messageLower.includes('request') ||
        messageLower.includes('bandwidth') ||
        messageLower.includes('payload')) {
      return 'network-efficiency';
    }
    
    // Data efficiency keywords
    if (messageLower.includes('database') || 
        messageLower.includes('query') || 
        messageLower.includes('serialization') ||
        messageLower.includes('data structure') ||
        messageLower.includes('storage')) {
      return 'data-efficiency';
    }
    
    // Security keywords (minimal - focus on performance/carbon)
    if (messageLower.includes('injection') && messageLower.includes('sql')) {
      return 'data-efficiency'; // SQL injection can impact database performance
    }
    
    // Accessibility keywords
    if (messageLower.includes('accessibility') || 
        messageLower.includes('a11y') || 
        messageLower.includes('alt text') ||
        messageLower.includes('contrast') ||
        messageLower.includes('keyboard')) {
      return 'accessibility';
    }
    
    // Sustainability keywords
    if (messageLower.includes('caching') || 
        messageLower.includes('lazy loading') || 
        messageLower.includes('resource pooling') ||
        messageLower.includes('green coding') ||
        messageLower.includes('sustainable')) {
      return 'sustainability-patterns';
    }
    
    // Default to code quality
    return 'code-quality';
  }
}

/**
 * Semgrep-specific category mapper
 */
export class SemgrepCategoryMapper implements ToolCategoryMapper {
  private defaultMapper = new DefaultCategoryMapper();
  
  mapToCategory(ruleId: string, originalCategory: string, message: string, metadata?: any): string {
    // Semgrep-specific mappings (focused on performance/carbon)
    const semgrepMappings: Record<string, string> = {
      'security': 'code-quality', // Security issues are code quality, not carbon-focused
      'performance': 'performance-critical',
      'efficiency': 'resource-optimization',
      'network': 'network-efficiency',
      'data': 'data-efficiency',
      'quality': 'code-quality',
      'accessibility': 'accessibility',
      'sustainability': 'sustainability-patterns'
    };
    
    // First try Semgrep-specific category mapping
    if (semgrepMappings[originalCategory]) {
      return semgrepMappings[originalCategory];
    }
    
    // Then fall back to default mapper
    return this.defaultMapper.mapToCategory(ruleId, originalCategory, message, metadata);
  }
}

/**
 * MegaLinter-specific category mapper
 */
export class MegaLinterCategoryMapper implements ToolCategoryMapper {
  private defaultMapper = new DefaultCategoryMapper();
  
  mapToCategory(ruleId: string, originalCategory: string, message: string, metadata?: any): string {
    // MegaLinter-specific mappings (focused on performance/carbon)
    const megalinterMappings: Record<string, string> = {
      'security': 'code-quality', // Security issues are code quality, not carbon-focused
      'performance': 'performance-critical',
      'efficiency': 'resource-optimization',
      'network': 'network-efficiency',
      'data': 'data-efficiency',
      'quality': 'code-quality',
      'accessibility': 'accessibility',
      'sustainability': 'sustainability-patterns'
    };
    
    // First try MegaLinter-specific category mapping
    if (megalinterMappings[originalCategory]) {
      return megalinterMappings[originalCategory];
    }
    
    // Then fall back to default mapper
    return this.defaultMapper.mapToCategory(ruleId, originalCategory, message, metadata);
  }
}

/**
 * ESLint-specific category mapper
 */
export class ESLintCategoryMapper implements ToolCategoryMapper {
  private defaultMapper = new DefaultCategoryMapper();
  
  mapToCategory(ruleId: string, originalCategory: string, message: string, metadata?: any): string {
    // ESLint-specific rule mappings (focused on performance/carbon)
    const eslintRuleMappings: Record<string, string> = {
      'no-console': 'code-quality',
      'no-debugger': 'code-quality',
      'no-alert': 'code-quality',
      'no-unused-vars': 'resource-optimization',
      'no-unreachable': 'resource-optimization',
      'no-duplicate-imports': 'resource-optimization',
      'prefer-const': 'code-quality',
      'no-var': 'code-quality',
      'no-eval': 'performance-critical', // eval can be performance-critical
      'no-implied-eval': 'performance-critical',
      'no-new-func': 'performance-critical'
    };
    
    // First try ESLint-specific rule mapping
    if (eslintRuleMappings[ruleId]) {
      return eslintRuleMappings[ruleId];
    }
    
    // Then fall back to default mapper
    return this.defaultMapper.mapToCategory(ruleId, originalCategory, message, metadata);
  }
}

/**
 * Registry of tool-specific mappers
 */
export const TOOL_MAPPERS: Record<string, ToolCategoryMapper> = {
  'semgrep': new SemgrepCategoryMapper(),
  'megalinter': new MegaLinterCategoryMapper(),
  'eslint': new ESLintCategoryMapper(),
  'default': new DefaultCategoryMapper()
};

/**
 * Maps a finding to the appropriate Carbonara category using tool-specific logic
 */
export function mapFindingToCategory(
  toolId: string,
  ruleId: string,
  originalCategory: string,
  message: string,
  metadata?: any
): string {
  const mapper = TOOL_MAPPERS[toolId] || TOOL_MAPPERS['default'];
  return mapper.mapToCategory(ruleId, originalCategory, message, metadata);
}

/**
 * Gets category information by ID
 */
export function getCategoryInfo(categoryId: string): FindingCategory | undefined {
  return CARBONARA_CATEGORIES.find(cat => cat.id === categoryId);
}

/**
 * Filters findings based on environmental impact and priority
 */
export function filterFindingsByImpact(
  findings: any[],
  minEnvironmentalImpact: 'high' | 'medium' | 'low' | 'none' = 'low',
  minPriority: 'critical' | 'high' | 'medium' | 'low' = 'low'
): any[] {
  const impactLevels = { 'none': 0, 'low': 1, 'medium': 2, 'high': 3 };
  const priorityLevels = { 'low': 0, 'medium': 1, 'high': 2, 'critical': 3 };
  
  const minImpactLevel = impactLevels[minEnvironmentalImpact];
  const minPriorityLevel = priorityLevels[minPriority];
  
  return findings.filter(finding => {
    const categoryInfo = getCategoryInfo(finding.category);
    if (!categoryInfo) return false;
    
    const impactLevel = impactLevels[categoryInfo.environmentalImpact];
    const priorityLevel = priorityLevels[categoryInfo.priority];
    
    return impactLevel >= minImpactLevel && priorityLevel >= minPriorityLevel;
  });
}
