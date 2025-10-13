import chalk from 'chalk';
import ora from 'ora';
import execa from 'execa';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Command } from 'commander';
import { getToolRegistry, AnalysisTool } from '../registry/index.js';
import { createDataLake } from '@carbonara/core';
import { loadProjectConfig } from '../utils/config.js';
// Built-in analyzers will be imported when added via separate PRs

interface AnalyzeOptions {
  save: boolean;
  output: 'json' | 'table';
  [key: string]: any; // Allow dynamic options
}

export async function analyzeCommand(toolId: string | undefined, url: string | undefined, options: AnalyzeOptions, command: Command) {
  if (!toolId || !url) {
    command.help();
    return;
  }
  const registry = getToolRegistry();
  const tool = registry.getTool(toolId);

  if (!tool) {
    console.error(chalk.red(`❌ Unknown analysis tool: ${toolId}`));
    console.log(chalk.yellow('\n📋 Available tools:'));
    
    const installedTools = await registry.getInstalledTools();
    const allTools = registry.getAllTools();
    
    if (installedTools.length > 0) {
      console.log(chalk.green('\n✅ Installed:'));
      installedTools.forEach(t => {
        console.log(`  ${chalk.white(t.id)} - ${t.name}`);
        if (t.description) {
          console.log(`    ${chalk.gray(t.description)}`);
        }
      });
    }
    
    const notInstalledTools = [];
    for (const tool of allTools) {
      if (!(await registry.isToolInstalled(tool.id))) {
        notInstalledTools.push(tool);
      }
    }
    if (notInstalledTools.length > 0) {
      console.log(chalk.yellow('\n⚠️  Available (not installed):'));
      notInstalledTools.forEach(t => {
        console.log(`  ${chalk.white(t.id)} - ${t.name}`);
        if (t.description) {
          console.log(`    ${chalk.gray(t.description)}`);
        }
        console.log(`    ${chalk.dim('Install:')} ${t.installation.instructions}`);
      });
    }
    
    process.exit(1);
  }

  if (!registry.isToolInstalled(toolId)) {
    console.error(chalk.red(`❌ Tool ${tool.name} is not installed`));
    console.log(chalk.yellow('\n💡 Install it with:'));
    console.log(chalk.white(tool.installation.instructions));
    console.log(chalk.gray('\nOr run:'));
    console.log(chalk.white(`carbonara tools install ${toolId}`));
    process.exit(1);
  }

  const spinner = ora(`Running ${tool.name} analysis...`).start();

  try {
    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid URL provided');
    }

    spinner.text = `Analyzing with ${tool.name}...`;
    
    let results: any;
    
    if (toolId === 'test-analyzer') {
      results = await runTestAnalyzer(url, options, tool);
    } else if (toolId === 'impact-framework') {
      results = await runImpactFramework(url, options, tool);
    } else {
      results = await runGenericTool(url, options, tool);
    }

    spinner.succeed(`${tool.name} analysis completed!`);
    
    // Display results
    displayResults(results, tool, options.output);

    // Save to database if requested
    if (options.save) {
      await saveToDatabase(toolId, url, results);
    }

  } catch (error: any) {
    spinner.fail(`${tool.name} analysis failed`);
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}



async function runGenericTool(url: string, options: AnalyzeOptions, tool: AnalysisTool): Promise<any> {
  // Replace placeholders in command args
  const args = tool.command.args.map(arg => arg.replace('{url}', url));
  
  const result = await execa(tool.command.executable, args, {
    stdio: 'pipe'
  });

  if (tool.command.outputFormat === 'json') {
    return JSON.parse(result.stdout);
  } else if (tool.command.outputFormat === 'yaml') {
    return yaml.load(result.stdout);
  } else {
    return { output: result.stdout };
  }
}

async function runTestAnalyzer(url: string, options: AnalyzeOptions, tool: AnalysisTool): Promise<any> {
  // Built-in test analyzer that returns predictable hardcoded results for E2E testing
  // Simulate a brief analysis delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Return predictable test results
  return {
    url: url,
    timestamp: new Date().toISOString(),
    tool: 'test-analyzer',
    result: 'success',
    data: {
      testScore: 85,
      testMetric: 'A+',
      testValue: 42,
      analysisTime: '0.5s',
      testSite: new URL(url).hostname
    },
    summary: {
      status: 'completed',
      message: 'Test analysis completed successfully',
      details: `Analyzed ${url} with test analyzer`
    }
  };
}

async function runImpactFramework(url: string, options: AnalyzeOptions, tool: AnalysisTool): Promise<any> {
  // Create temporary directory for analysis
  const tempDir = path.join(process.cwd(), '.carbonara-temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create manifest.yml
  const manifest = {
    name: 'website-carbon',
    description: 'estimate carbon for a webpage visit',
    initialize: {
      outputs: ['yaml'],
      plugins: {
        'green-hosting': {
          method: 'GreenHosting',
          path: '@tngtech/if-webpage-plugins'
        },
        'webpage-impact': {
          method: 'WebpageImpact',
          path: '@tngtech/if-webpage-plugins',
          config: {
            scrollToBottom: options.scrollToBottom || false,
            url: url
          }
        },
        co2js: {
          method: 'Co2js',
          path: '@tngtech/if-webpage-plugins',
          config: {
            type: 'swd',
            version: 4
          }
        }
      }
    },
    tree: {
      children: {
        child: {
          pipeline: {
            observe: ['webpage-impact', 'green-hosting'],
            compute: ['co2js']
          },
          inputs: [{
            options: {
              firstVisitPercentage: 0.9,
              returnVisitPercentage: 0.1
            }
          }]
        }
      }
    }
  };

  const manifestPath = path.join(tempDir, 'manifest.yml');
  const outputPath = path.join(tempDir, 'output.yml');
  
  fs.writeFileSync(manifestPath, yaml.dump(manifest));

  // Run Impact Framework analysis
  await execa('if-run', [
    '--manifest', manifestPath,
    '--output', outputPath
  ], {
    stdio: 'pipe'
  });

  // Check if output file exists
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Output file not created at ${outputPath}`);
  }

  // Parse results
  const outputContent = fs.readFileSync(outputPath, 'utf8');
  const results = yaml.load(outputContent) as any;
  
  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
  
  return results;
}

function displayResults(results: any, tool: AnalysisTool, format: 'json' | 'table') {
  console.log(chalk.blue(`\n🌱 ${tool.name} Analysis Results`));
  console.log(chalk.gray('═'.repeat(50)));

  if (format === 'json') {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Tool-specific result display logic
  if (tool.id === 'impact-framework') {
    displayImpactFrameworkResults(results);
  } else if (tool.id === 'greenframe') {
    displayGreenframeResults(results);
  } else {
    // Generic display
    console.log(JSON.stringify(results, null, 2));
  }
}

function displayImpactFrameworkResults(results: any) {
  try {
    const childData = results?.tree?.children?.child;
    
    if (childData && childData.outputs && childData.outputs.length > 0) {
      const output = childData.outputs[0];
      
      console.log(chalk.green('\n📊 Carbon Impact:'));
      if (output['operational-carbon']) {
        console.log(`  CO2 Emissions: ${chalk.white(output['operational-carbon'].toFixed(4))} g CO2e`);
      }
      
      if (output['energy']) {
        console.log(`  Energy Usage: ${chalk.white(output['energy'].toFixed(6))} kWh`);
      }
      
      if (output['network-bytes']) {
        console.log(`  Data Transfer: ${chalk.white(Math.round(output['network-bytes']))} bytes`);
      }
      
      if (output['green-web-host']) {
        const isGreen = output['green-web-host'];
        console.log(`  Green Hosting: ${isGreen ? chalk.green('✓ Yes') : chalk.red('✗ No')}`);
      }
    } else {
      console.log(chalk.yellow('\n⚠️  No detailed results found'));
    }
  } catch (error) {
    console.log(chalk.yellow('\n⚠️  Could not parse results'));
    console.log(JSON.stringify(results, null, 2));
  }
}

function displayGreenframeResults(results: any) {
  // Display Greenframe-specific results
  if (results.carbonFootprint) {
    console.log(chalk.green('\n📊 Carbon Footprint:'));
    console.log(`  Total: ${chalk.white(results.carbonFootprint)} g CO2e`);
  }
  
  if (results.energyConsumption) {
    console.log(`  Energy: ${chalk.white(results.energyConsumption)} Wh`);
  }
  
  // Add more Greenframe-specific display logic as needed
}

async function saveToDatabase(toolId: string, url: string, results: any) {
  try {
    const config = await loadProjectConfig();
    if (!config) {
      console.log(chalk.yellow('⚠️  No project found. Results not saved.'));
      return;
    }

    const dataLake = createDataLake();
    await dataLake.initialize();

    // Ensure we have a valid project ID
    let projectId = config.projectId;
    
    if (!projectId) {
      console.log(chalk.blue('🔧 No project ID found, creating project in database...'));
      
      // Create project in database
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
      
      // Update config with new project ID
      const { saveProjectConfig } = await import('../utils/config.js');
      const updatedConfig = { ...config, projectId };
      saveProjectConfig(updatedConfig, projectPath);
      
      console.log(chalk.green(`✅ Created project with ID: ${projectId}`));
    }

    const assessmentData = {
      url: url,
      raw_results: JSON.stringify(results),
      timestamp: new Date().toISOString(),
      // Extract commonly needed fields for schema templates
      ...results  // Spread the results to make fields directly accessible
    };

    await dataLake.storeAssessmentData(projectId, toolId, 'web-analysis', assessmentData, url);
    await dataLake.close();

    console.log(chalk.green('\n✅ Results saved to project database'));
  } catch (error) {
    console.log(chalk.yellow('\n⚠️  Could not save results:'), error);
  }
}