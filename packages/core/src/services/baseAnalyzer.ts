/**
 * Base class for analysis services that take input and return structured results
 * 
 * Simple base class to ensure consistent interface for analyzers.
 * Services can extend this if they follow the analyze() pattern.
 */
export abstract class BaseAnalyzer<TInput = string, TResult = any> {
  /**
   * Analyze the given input and return structured results
   * @param input The input to analyze (URL, path, etc.)
   * @param options Optional configuration options
   * @returns Structured analysis results
   */
  abstract analyze(input: TInput, options?: any): Promise<TResult>;
}

