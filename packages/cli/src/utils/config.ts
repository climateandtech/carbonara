import fs from 'fs';
import path from 'path';

export interface ProjectConfig {
  name: string;
  description: string;
  projectType: string;
  projectId: number;
  database: {
    path: string;
  };
  tools: {
    greenframe: {
      enabled: boolean;
    };
  };
}

export async function loadProjectConfig(searchPath?: string): Promise<ProjectConfig | null> {
  const startPath = searchPath || process.cwd();
  let currentPath = startPath;
  
  // Search up the directory tree for carbonara.config.json
  while (currentPath !== path.dirname(currentPath)) {
    const configPath = path.join(currentPath, 'carbonara.config.json');
    
    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        return config as ProjectConfig;
      } catch (error) {
        throw new Error(`Failed to parse config file: ${configPath}`);
      }
    }
    
    currentPath = path.dirname(currentPath);
  }
  
  return null;
}

export function saveProjectConfig(config: ProjectConfig, projectPath?: string): void {
  const configPath = path.join(projectPath || process.cwd(), 'carbonara.config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function getProjectRoot(searchPath?: string): string | null {
  const startPath = searchPath || process.cwd();
  let currentPath = startPath;
  
  while (currentPath !== path.dirname(currentPath)) {
    const configPath = path.join(currentPath, 'carbonara.config.json');
    
    if (fs.existsSync(configPath)) {
      return currentPath;
    }
    
    currentPath = path.dirname(currentPath);
  }
  
  return null;
} 