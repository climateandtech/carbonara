import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectDetector } from '../detection/project-detector.js';

export async function exportProjectInfoCommand(): Promise<void> {
  try {
    const detector = new ProjectDetector();
    const projectInfo = await detector.detectProject();
    
    // Write project info to a temporary file for CLI consumption
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }
    
    const tempFile = path.join(workspaceFolder.uri.fsPath, '.carbonara-project-info.json');
    fs.writeFileSync(tempFile, JSON.stringify(projectInfo, null, 2));
    
    // Show success message
    vscode.window.showInformationMessage(
      `Project info exported: ${projectInfo.primaryLanguage} project with ${projectInfo.supportedLanguages.length} languages`
    );
    
    // Clean up the temp file after 30 seconds
    setTimeout(() => {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }, 30000);
    
  } catch (error) {
    console.error('Failed to export project info:', error);
    vscode.window.showErrorMessage(`Failed to export project info: ${error}`);
  }
}
