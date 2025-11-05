import chalk from 'chalk';
import ora from 'ora';
import { select, input } from '@inquirer/prompts';
import {
  PythonProfilerAdapter,
  NodeProfilerAdapter,
  RubyProfilerAdapter,
  GoProfilerAdapter,
  createDataLake
} from '@carbonara/core';
import { loadProjectConfig } from '../utils/config.js';
import type { CpuProfileResult, CpuProfileLine } from '@carbonara/core';

interface ProfileOptions {
  url?: string;
  test?: string;
  server?: string;
  lang?: 'python' | 'node' | 'ruby' | 'go';
  duration?: number;
  save?: boolean;
  output?: 'json' | 'table';
}

export async function profileCommand(options: ProfileOptions) {
  const spinner = ora('Setting up CPU profiling...').start();

  try {
    // Determine scenario type and value
    let scenario: { type: 'url' | 'test' | 'server'; value: string } | undefined;
    let command: string | undefined;
    let scenarioType: 'url' | 'test' | 'server';

    if (options.url) {
      scenario = { type: 'url', value: options.url };
      command = options.url;
      scenarioType = 'url';
    } else if (options.test) {
      scenario = { type: 'test', value: options.test };
      command = options.test;
      scenarioType = 'test';
    } else if (options.server) {
      scenario = { type: 'server', value: options.server };
      command = options.server;
      scenarioType = 'server';
    } else {
      // Interactive prompt
      spinner.stop();
      const scenarioTypeAnswer = await select({
        message: 'What would you like to profile?',
        choices: [
          { name: 'URL (profile web request)', value: 'url' },
          { name: 'Test command (e.g., npm test)', value: 'test' },
          { name: 'Server command (e.g., npm start)', value: 'server' }
        ]
      });

      let valueMessage = 'Enter value:';
      if (scenarioTypeAnswer === 'url') {
        valueMessage = 'Enter URL to profile:';
      } else if (scenarioTypeAnswer === 'test') {
        valueMessage = 'Enter test command to run:';
      } else {
        valueMessage = 'Enter server command to start:';
      }

      const valueAnswer = await input({
        message: valueMessage,
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Please enter a value';
          }
          if (scenarioTypeAnswer === 'url') {
            try {
              new URL(input);
            } catch {
              return 'Please enter a valid URL';
            }
          }
          return true;
        }
      });

      scenario = { type: scenarioTypeAnswer as 'url' | 'test' | 'server', value: valueAnswer };
      command = valueAnswer;
      scenarioType = scenarioTypeAnswer as 'url' | 'test' | 'server';
      spinner.start('Setting up CPU profiling...');
    }

    if (!command) {
      throw new Error('No command or URL provided');
    }

    // Detect or use specified language
    let language = options.lang;
    if (!language) {
      language = await detectLanguage(scenarioType, command);
    }

    if (!language) {
      spinner.fail('Could not detect language');
      console.log(chalk.yellow('\n💡 Please specify language with --lang flag:'));
      console.log(chalk.gray('  carbonara profile --lang <python|node|ruby|go> ...'));
      process.exit(1);
    }

    spinner.text = `Detected language: ${language}`;

    // Get appropriate adapter
    const adapter = getAdapter(language);
    if (!adapter) {
      throw new Error(`Unsupported language: ${language}`);
    }

    // Check availability
    spinner.text = 'Checking profiler availability...';
    const isAvailable = await adapter.checkAvailability();
    if (!isAvailable) {
      spinner.fail('Profiler not available');
      console.log(chalk.yellow(`\n⚠️  ${adapter.getInstallInstructions()}`));
      process.exit(1);
    }

    // Run profiling
    const duration = options.duration || 30;
    spinner.text = `Profiling ${scenarioType} for ${duration} seconds...`;
    
    const result = await adapter.profile(command, duration, {
      scenario,
      cwd: process.cwd()
    });

    spinner.succeed('CPU profiling completed!');

    // Display results
    displayResults(result, options.output || 'table');

    // Save to database if requested
    if (options.save) {
      await saveToDatabase(result);
    }

  } catch (error: any) {
    spinner.fail('Profiling failed');
    console.error(chalk.red('Error:'), error.message);
    if (error.stack && process.env.DEBUG) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

function getAdapter(lang: string) {
  switch (lang) {
    case 'python':
      return new PythonProfilerAdapter();
    case 'node':
      return new NodeProfilerAdapter();
    case 'ruby':
      return new RubyProfilerAdapter();
    case 'go':
      return new GoProfilerAdapter();
    default:
      return null;
  }
}

async function detectLanguage(
  scenarioType: 'url' | 'test' | 'server',
  command: string
): Promise<'python' | 'node' | 'ruby' | 'go' | undefined> {
  // For URLs, we can't easily detect - user should specify
  if (scenarioType === 'url') {
    return undefined;
  }

  // Check for common patterns in commands
  if (command.includes('python') || command.includes('.py') || command.includes('pytest') || command.includes('python3')) {
    return 'python';
  }
  if (command.includes('node') || command.includes('npm') || command.includes('yarn') || command.includes('ts-node') || command.includes('.js')) {
    return 'node';
  }
  if (command.includes('ruby') || command.includes('bundle') || command.includes('rake') || command.includes('rspec') || command.includes('.rb')) {
    return 'ruby';
  }
  if (command.includes('go run') || command.includes('go test') || command.includes('.go')) {
    return 'go';
  }

  // Check for package.json (Node.js)
  try {
    const fs = await import('fs');
    if (fs.existsSync('package.json')) {
      return 'node';
    }
  } catch {}

  // Check for requirements.txt (Python)
  try {
    const fs = await import('fs');
    if (fs.existsSync('requirements.txt') || fs.existsSync('setup.py') || fs.existsSync('pyproject.toml')) {
      return 'python';
    }
  } catch {}

  // Check for Gemfile (Ruby)
  try {
    const fs = await import('fs');
    if (fs.existsSync('Gemfile')) {
      return 'ruby';
    }
  } catch {}

  // Check for go.mod (Go)
  try {
    const fs = await import('fs');
    if (fs.existsSync('go.mod')) {
      return 'go';
    }
  } catch {}

  return undefined;
}

function displayResults(result: CpuProfileResult, format: 'json' | 'table') {
  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Table format
  console.log(chalk.blue('\n🔥 CPU Profile Results'));
  console.log(chalk.gray('═'.repeat(50)));
  console.log(`${chalk.white('Language:')} ${result.lang}`);
  console.log(`${chalk.white('Total Samples:')} ${result.samples_total}`);
  if (result.scenario) {
    console.log(`${chalk.white('Scenario:')} ${result.scenario.type} - ${result.scenario.value}`);
  }

  if (result.lines.length === 0) {
    console.log(chalk.yellow('\n⚠️  No CPU hotspots found'));
    return;
  }

  console.log(chalk.blue('\n📊 Top CPU Hotspots:'));
  console.log(chalk.gray('─'.repeat(50)));

  // Show top 20 lines
  const topLines = result.lines.slice(0, 20);
  topLines.forEach((line: CpuProfileLine, index: number) => {
    const severity = line.percent > 10 ? chalk.red : line.percent > 5 ? chalk.yellow : chalk.green;
    console.log(
      `${chalk.gray(`${(index + 1).toString().padStart(2)}.`)} ${severity(`${line.percent.toFixed(1)}%`)} ` +
      `${chalk.white(line.file)}:${chalk.cyan(line.line.toString())} ` +
      `${line.function ? chalk.gray(`(${line.function})`) : ''} ` +
      `${chalk.gray(`[${line.samples} samples]`)}`
    );
  });

  if (result.lines.length > 20) {
    console.log(chalk.gray(`\n... and ${result.lines.length - 20} more lines`));
  }
}

async function saveToDatabase(result: CpuProfileResult) {
  try {
    const config = await loadProjectConfig();
    if (!config) {
      console.log(chalk.yellow('⚠️  No project found. Results not saved.'));
      return;
    }

    const dataLake = createDataLake();
    await dataLake.initialize();

    let projectId = config.projectId;
    
    if (!projectId) {
      console.log(chalk.blue('🔧 No project ID found, creating project in database...'));
      
      const projectPath = process.cwd();
      projectId = await dataLake.createProject(
        config.name || 'Unnamed Project',
        projectPath,
        {
          description: config.description,
          projectType: config.projectType || 'web',
          initialized: new Date().toISOString()
        }
      );
      
      const { saveProjectConfig } = await import('../utils/config.js');
      const updatedConfig = { ...config, projectId };
      saveProjectConfig(updatedConfig, projectPath);
      
      console.log(chalk.green(`✅ Created project with ID: ${projectId}`));
    }

    await dataLake.storeAssessmentData(
      projectId,
      'cpu-profiler',
      'cpu-profile',
      result,
      result.scenario?.value || 'manual'
    );

    await dataLake.close();

    console.log(chalk.green('\n✅ Results saved to project database'));
  } catch (error: any) {
    console.log(chalk.yellow('\n⚠️  Could not save results:'), error.message);
  }
}

