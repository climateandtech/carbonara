export interface CodeFinding {
  id: string;
  tool: string;
  file: string;
  line: number;
  column: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  rule: string;
  category: string;
  originalCategory: string;
  confidence: 'high' | 'medium' | 'low';
  fix: string;
  impact: string;
}

export interface AnalysisStats {
  totalFindings: number;
  filesScanned: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
}

export interface CodeAnalysisResult {
  tool: string;
  timestamp: string;
  projectPath: string;
  stats: AnalysisStats;
  findings: CodeFinding[];
}










