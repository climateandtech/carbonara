import execa from 'execa';
import chalk from 'chalk';
import ora from 'ora';
import { createDataLake } from '../database/index.js';
import { loadProjectConfig } from '../utils/config.js';

interface MegalinterOptions {
  save: boolean;
  output: 'json' | 'table';
  fix?: boolean;
}

export async function megalinterCommand(options: MegalinterOptions) {
  const spinner = ora('Running MegaLinter analysis...').start();
  
  try {
    // Check if npx is available
    try {
      await execa('npx', ['--version']);
    } catch {
      throw new Error('npx is required to run MegaLinter. Please install Node.js');
    }

    spinner.text = 'Running MegaLinter code analysis...';
    
    // Build command arguments with configuration options
    const args = [
      'mega-linter-runner',
      '-e', 'APPLY_FIXES=all',
      '-e', 'FILTER_REGEX_INCLUDE=(src/|packages/|tests?/|spec/)',
      '-e', 'FILTER_REGEX_EXCLUDE=(node_modules/|\\.git/|dist/|build/|coverage/|\\.next/|\\.nuxt/)',
      '-e', 'DISABLE_LINTERS=SPELL_CSPELL,SPELL_MISSPELL,COPYPASTE_JSCPD,CREDENTIALS_SECRETLINT',
      '-e', 'TYPESCRIPT_DEFAULT_STYLE=prettier',
      '-e', 'JAVASCRIPT_DEFAULT_STYLE=prettier',
      '-e', 'REPORT_OUTPUT_FOLDER=megalinter-reports',
      '-e', 'LOG_LEVEL=INFO',
      '-e', 'PARALLEL=true',
      '-e', 'VALIDATE_ALL_CODEBASE=false',
      '-e', 'FORMATTERS_DISABLE_ERRORS=true'
    ];
    
    if (options.fix) {
      args.push('-e', 'APPLY_FIXES=all');
    }
    
    // Run MegaLinter analysis - it may return non-zero exit code even when successful
    let megalinterResult;
    let megalinterRan = false;
    
    try {
      megalinterResult = await execa('npx', args, {
        stdio: 'pipe',
        cwd: process.cwd()
      });
      megalinterRan = true;
    } catch (execError: any) {
      // MegaLinter often returns non-zero exit codes when issues are found
      // Check if it actually ran by looking for output or report files
      megalinterRan = await checkIfMegalinterRan();
      
      if (!megalinterRan) {
        throw execError;
      }
      
      // If MegaLinter ran but returned errors, that's normal behavior
      megalinterResult = execError;
    }

    if (megalinterRan) {
      spinner.succeed('MegaLinter analysis completed!');
      
      // Parse results - MegaLinter outputs to megalinter-reports folder
      const results = await parseResults();
      
      // Display results
      displayResults(results, options.output);

      // Save to database if requested
      if (options.save) {
        await saveToDatabase(results);
      }
    } else {
      throw new Error('MegaLinter did not run successfully');
    }

  } catch (error: any) {
    spinner.fail('MegaLinter analysis failed');
    
    if (error.message.includes('mega-linter-runner')) {
      console.log(chalk.yellow('\n💡 MegaLinter not found. Install it with:'));
      console.log(chalk.white('npm install mega-linter-runner --save-dev'));
      console.log(chalk.gray('or use:'));
      console.log(chalk.white('npx mega-linter-runner'));
    } else {
      console.error(chalk.red('Error:'), error.message);
    }
    
    process.exit(1);
  }
}

async function checkIfMegalinterRan(): Promise<boolean> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Check if megalinter-reports folder exists
    const reportsPath = path.join(process.cwd(), 'megalinter-reports');
    try {
      await fs.access(reportsPath);
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

async function parseResults(): Promise<any> {
  try {
    // MegaLinter typically outputs results to megalinter-reports folder
    // Try to read the main report file
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const reportPath = path.join(process.cwd(), 'megalinter-reports', 'megalinter-report.json');
    const reportData = await fs.readFile(reportPath, 'utf-8');
    return JSON.parse(reportData);
  } catch {
    // If JSON report is not available, return a basic structure
    return {
      summary: 'MegaLinter analysis completed',
      timestamp: new Date().toISOString(),
      reportAvailable: false
    };
  }
}

function displayResults(results: any, format: 'json' | 'table') {
  console.log(chalk.blue('\n🔍 MegaLinter Analysis Results'));
  console.log('═'.repeat(50));

  if (format === 'json') {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Table format
  if (results.summary) {
    console.log(chalk.green('📋 Summary:'), results.summary);
  }

  if (results.linters_run) {
    console.log(chalk.blue('\n🔧 Linters executed:'), results.linters_run);
  }

  if (results.total_errors !== undefined) {
    const errorColor = results.total_errors > 0 ? chalk.red : chalk.green;
    console.log(chalk.blue('\n❌ Total errors:'), errorColor(results.total_errors));
  }

  if (results.total_warnings !== undefined) {
    const warningColor = results.total_warnings > 0 ? chalk.yellow : chalk.green;
    console.log(chalk.blue('⚠️  Total warnings:'), warningColor(results.total_warnings));
  }

  if (results.total_fixed !== undefined && results.total_fixed > 0) {
    console.log(chalk.blue('✅ Issues fixed:'), chalk.green(results.total_fixed));
  }

  if (results.linters && Array.isArray(results.linters)) {
    console.log(chalk.blue('\n📊 Linter Details:'));
    results.linters.forEach((linter: any) => {
      if (linter.status === 'success' && (linter.errors > 0 || linter.warnings > 0)) {
        console.log(`  ${linter.linter_name}: ${chalk.red(linter.errors)} errors, ${chalk.yellow(linter.warnings)} warnings`);
      }
    });
  }

  if (!results.reportAvailable) {
    console.log(chalk.yellow('\n💡 For detailed results, check the megalinter-reports folder'));
  }

  console.log(chalk.blue('\n📁 Reports location:'), 'megalinter-reports/');
}

async function saveToDatabase(results: any) {
  try {
    const config = await loadProjectConfig();
    if (!config) {
      console.log(chalk.yellow('⚠️  No project found. Results not saved to database.'));
      return;
    }

    const dataLake = createDataLake();
    await dataLake.initialize();

    await dataLake.storeAssessmentData(
      config.projectId,
      'megalinter',
      'code-quality',
      {
        results,
        analyzedAt: new Date().toISOString()
      },
      'cli'
    );

    await dataLake.close();
    console.log(chalk.green('✅ Results saved to database'));
    
  } catch (error: any) {
    console.error(chalk.red('❌ Failed to save to database:'), error.message);
  }
}