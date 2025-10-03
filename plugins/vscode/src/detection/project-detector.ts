import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ProjectInfo {
  languages: Record<string, number>; // language -> file count
  primaryLanguage: string;
  supportedLanguages: string[];
  projectType: string;
  workspacePath: string;
}

export class ProjectDetector {
  /**
   * Detect project languages using VSCode's built-in language detection
   */
  async detectProject(workspacePath?: string): Promise<ProjectInfo> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }

    const projectPath = workspacePath || workspaceFolder.uri.fsPath;
    
    // Get all text documents in the workspace
    const documents = vscode.workspace.textDocuments;
    const languageCounts: Record<string, number> = {};
    
    // Count files by language
    for (const doc of documents) {
      if (doc.uri.fsPath.startsWith(projectPath)) {
        const language = doc.languageId;
        languageCounts[language] = (languageCounts[language] || 0) + 1;
      }
    }
    
    // Also scan for project files to detect project type
    const projectFiles = await this.detectProjectFiles(projectPath);
    
    // Determine primary language
    const primaryLanguage = Object.entries(languageCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown';
    
    // Get supported languages (languages with > 1 file)
    const supportedLanguages = Object.entries(languageCounts)
      .filter(([_, count]) => count > 0)
      .map(([language, _]) => language);
    
    // Determine project type
    const projectType = this.determineProjectType(primaryLanguage, projectFiles, languageCounts);
    
    return {
      languages: languageCounts,
      primaryLanguage,
      supportedLanguages,
      projectType,
      workspacePath: projectPath
    };
  }

  /**
   * Detect project files that indicate project type
   */
  private async detectProjectFiles(projectPath: string): Promise<string[]> {
    const projectFiles: string[] = [];
    
    const patterns = [
      '**/package.json',
      '**/pom.xml',
      '**/build.gradle',
      '**/*.csproj',
      '**/requirements.txt',
      '**/composer.json',
      '**/Cargo.toml',
      '**/tsconfig.json',
      '**/webpack.config.js',
      '**/Dockerfile',
      '**/docker-compose.yml'
    ];

    for (const pattern of patterns) {
      try {
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
        projectFiles.push(...files.map(f => path.basename(f.fsPath)));
      } catch (error) {
        // Ignore errors for individual patterns
      }
    }

    return projectFiles;
  }

  /**
   * Determine project type based on languages and project files
   */
  private determineProjectType(
    primaryLanguage: string, 
    projectFiles: string[], 
    languageCounts: Record<string, number>
  ): string {
    // Check for specific project types based on files
    if (projectFiles.includes('package.json')) {
      if (projectFiles.includes('tsconfig.json')) {
        return 'typescript';
      }
      return 'javascript';
    }
    
    if (projectFiles.includes('pom.xml') || projectFiles.includes('build.gradle')) {
      return 'java';
    }
    
    if (projectFiles.some(f => f.endsWith('.csproj'))) {
      return 'csharp';
    }
    
    if (projectFiles.includes('requirements.txt')) {
      return 'python';
    }
    
    if (projectFiles.includes('composer.json')) {
      return 'php';
    }
    
    if (projectFiles.includes('Cargo.toml')) {
      return 'rust';
    }
    
    // Check for web projects
    if (languageCounts['html'] && languageCounts['css'] && languageCounts['javascript']) {
      return 'web';
    }
    
    // Map languages to project types
    const languageToType: Record<string, string> = {
      'javascript': 'javascript',
      'typescript': 'typescript',
      'java': 'java',
      'csharp': 'csharp',
      'python': 'python',
      'php': 'php',
      'rust': 'rust',
      'go': 'go',
      'cpp': 'cpp',
      'c': 'c',
      'ruby': 'ruby',
      'swift': 'swift',
      'kotlin': 'android',
      'dart': 'flutter'
    };

    return languageToType[primaryLanguage] || 'unknown';
  }

  /**
   * Get project info as JSON for CLI consumption
   */
  async getProjectInfoAsJson(workspacePath?: string): Promise<string> {
    const projectInfo = await this.detectProject(workspacePath);
    return JSON.stringify(projectInfo, null, 2);
  }
}
