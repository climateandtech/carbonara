import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { createDataLake } from '@carbonara/core';

interface InitOptions {
  path: string;
}

export async function initCommand(options: InitOptions) {
  try {
    console.log(chalk.blue('🚀 Initializing Carbonara project...'));
    
    const projectPath = path.resolve(options.path);
    
    // Check if directory exists
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    // Get project details
    const name = await input({
      message: 'Project name:',
      default: path.basename(projectPath),
      validate: (input: string) => input.length > 0 ? true : 'Project name is required'
    });

    const description = await input({
      message: 'Project description:',
      default: 'A Carbonara CO2 assessment project'
    });

    const projectType = await select({
      message: 'Project type:',
      choices: [
        { name: 'Web Application', value: 'web' },
        { name: 'Mobile Application', value: 'mobile' },
        { name: 'Desktop Application', value: 'desktop' },
        { name: 'API/Backend Service', value: 'api' },
        { name: 'Other', value: 'other' }
      ]
    });

    const answers = { name, description, projectType };

    // Initialize database
    const dataLake = createDataLake({
      dbPath: path.join(projectPath, 'carbonara.db')
    });
    
    await dataLake.initialize();
    
    // Create project in database
    const projectId = await dataLake.createProject(
      answers.name,
      projectPath,
      {
        description: answers.description,
        projectType: answers.projectType,
        initialized: new Date().toISOString()
      }
    );

    // Create carbonara config file
    const config = {
      name: answers.name,
      description: answers.description,
      projectType: answers.projectType,
      projectId,
      database: {
        path: 'carbonara.db'
      },
      tools: {
        greenframe: {
          enabled: true
        }
      }
    };

    fs.writeFileSync(
      path.join(projectPath, 'carbonara.config.json'),
      JSON.stringify(config, null, 2)
    );

    // Create schemas directory
    const schemasDir = path.join(projectPath, 'schemas');
    if (!fs.existsSync(schemasDir)) {
      fs.mkdirSync(schemasDir);
    }

    await dataLake.close();

    console.log(chalk.green('✅ Project initialized successfully!'));
    console.log(chalk.yellow('📁 Project path:'), projectPath);
    console.log(chalk.yellow('🗄️  Database:'), 'carbonara.db');
    console.log(chalk.yellow('⚙️  Config:'), 'carbonara.config.json');
    console.log('');
    console.log(chalk.blue('Next steps:'));
    console.log(chalk.gray('  1. Run'), chalk.white('carbonara assess'), chalk.gray('to start CO2 assessment'));
    console.log(chalk.gray('  2. Run'), chalk.white('carbonara greenframe <url>'), chalk.gray('to analyze a website'));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to initialize project:'), error);
    process.exit(1);
  }
} 