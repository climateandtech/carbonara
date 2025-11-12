import chalk from 'chalk';
import ora from 'ora';
import execa from 'execa';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Command } from 'commander';
import { getToolRegistry, AnalysisTool } from '../registry/index.js';
import { createDataLake, createDeploymentService } from '@carbonara/core';
import { loadProjectConfig } from '../utils/config.js';
import { CarbonaraSWDAnalyzer } from '../analyzers/carbonara-swd.js';

interface AnalyzeOptions {
  save: boolean;
  output: 'json' | 'table';
  [key: string]: any; // Allow dynamic options
}

export async function analyzeCommand(toolId: string | undefined, url: string | undefined, options: AnalyzeOptions, command: Command) {
  if (!toolId) {
    command.help();
    return;
  }

  const registry = getToolRegistry();
  await registry.refreshInstalledTools();
  const tool = registry.getTool(toolId);

  if (!tool) {
    console.error(chalk.red(`❌ Unknown analysis tool: ${toolId}`));
    console.log(chalk.yellow('\n📋 Available tools:'));
    
    // FIXME: Replace with generic tool listing logic
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

  if (!(await registry.isToolInstalled(toolId))) {
    console.error(chalk.red(`❌ Tool ${tool.name} is not installed`));
    console.log(chalk.yellow('\n💡 Install it with:'));
    console.log(chalk.white(tool.installation.instructions));
    console.log(chalk.gray('\nOr run:'));
    console.log(chalk.white(`carbonara tools install ${toolId}`));
    process.exit(1);
  }

  const spinner = ora(`Running ${tool.name} analysis...`).start();

  try {
    // Validate URL for tools that require it (skip for deployment-scan)
    if (toolId !== 'deployment-scan') {
      if (!url) {
        throw new Error('URL parameter is required');
      }
      try {
        new URL(url);
      } catch {
        throw new Error('Invalid URL provided');
      }
    }

    spinner.text = `Analyzing with ${tool.name}...`;

    let results: any;

    if (toolId === 'deployment-scan') {
      results = await runDeploymentScan(url || '.', options, tool);
    } else if (toolId === 'test-analyzer') {
      results = await runTestAnalyzer(url!, options, tool);
    } else if (toolId === 'carbonara-swd') {
      results = await runCarbonaraSWD(url!, options, tool);
    } else if (toolId.startsWith('if-')) {
      results = await runImpactFramework(url!, options, tool);
    } else {
      results = await runGenericTool(url!, options, tool);
    }

    spinner.succeed(`${tool.name} analysis completed!`);

    // Display results
    displayResults(results, tool, options.output);

    // Save to database if requested (skip for deployment-scan as it saves directly)
    if (options.save && toolId !== 'deployment-scan') {
      await saveToDatabase(toolId, url!, results);
    }

  } catch (error: any) {
    spinner.fail(`${tool.name} analysis failed`);
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

async function runCarbonaraSWD(url: string, options: AnalyzeOptions, tool: AnalysisTool): Promise<any> {
  const analyzer = new CarbonaraSWDAnalyzer();

  const analyzeOptions: any = {
    timeout: options.timeout ? parseInt(options.timeout.toString()) : 30000,
    gridIntensity: options.gridIntensity ? parseFloat(options.gridIntensity.toString()) : 473,
    returningVisitor: options.returningVisitor || false
  };

  return await analyzer.analyze(url, analyzeOptions);
}

async function runDeploymentScan(dirPath: string, options: AnalyzeOptions, tool: AnalysisTool): Promise<any> {
  // Get the data service
  const config = await loadProjectConfig();
  const dataService = createDataLake(config?.database ? { dbPath: config.database.path } : undefined);
  await dataService.initialize();

  // Create deployment service
  const deploymentService = createDeploymentService(dataService);

  // Scan directory for deployment configurations
  const detections = await deploymentService.scanDirectory(path.resolve(dirPath));

  // Save to database if requested
  if (options.save) {
    await deploymentService.saveDeployments(detections);
  }

  return {
    timestamp: new Date().toISOString(),
    tool: 'deployment-scan',
    path: dirPath,
    deployments: detections,
    count: detections.length
  };
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
  // Check if tool has manifest template
  if (!tool.manifestTemplate) {
    throw new Error(`Tool ${tool.id} does not have a manifest template configured`);
  }

  // Create temporary directory for analysis
  const tempDir = path.join(process.cwd(), '.carbonara-temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create manifest from template with placeholder replacement
  const manifest = JSON.parse(JSON.stringify(tool.manifestTemplate)); // Deep clone
  
  // Replace placeholders in manifest
  const replacePlaceholders = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj
        .replace('{url}', url)
        .replace('{scrollToBottom}', (options.scrollToBottom || false).toString())
        .replace('{firstVisitPercentage}', (options.firstVisitPercentage || 0.9).toString())
        .replace('{returnVisitPercentage}', (1 - (options.firstVisitPercentage || 0.9)).toString())
        .replace('{testCommand}', (options.testCommand || 'npm test').toString());
    } else if (Array.isArray(obj)) {
      return obj.map(replacePlaceholders);
    } else if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = replacePlaceholders(value);
      }
      return result;
    }
    return obj;
  };

  const processedManifest = replacePlaceholders(manifest);

  const manifestPath = path.join(tempDir, 'manifest.yml');
  const outputPath = path.join(tempDir, 'output.yml');
  
  fs.writeFileSync(manifestPath, yaml.dump(processedManifest));

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

  // Parse results and convert to JSON
  const outputContent = fs.readFileSync(outputPath, 'utf8');
  const yamlResults = yaml.load(outputContent) as any;
  
  // Add URL to results for database storage
  const results = {
    url: url,
    timestamp: new Date().toISOString(),
    tool: tool.id,
    ...yamlResults
  };
  
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
  if (tool.id === 'deployment-scan') {
    displayDeploymentScanResults(results);
  } else if (tool.id === 'carbonara-swd') {
    const analyzer = new CarbonaraSWDAnalyzer();
    console.log(analyzer.formatResults(results));
  } else if (tool.id.startsWith('if-')) {
    displayImpactFrameworkResults(results, tool);
  } else if (tool.id === 'greenframe') {
    displayGreenframeResults(results);
  } else {
    // Generic display
    console.log(JSON.stringify(results, null, 2));
  }
}

function displayDeploymentScanResults(results: any) {
  console.log(chalk.green(`\n📊 Deployment Scan Results:`));
  console.log(chalk.gray(`  Scanned directory: ${results.path}`));
  console.log(chalk.gray(`  Total deployments found: ${results.count}\n`));

  if (results.deployments.length === 0) {
    console.log(chalk.yellow('  No deployment configurations detected.'));
    return;
  }

  // Group deployments by provider
  const byProvider: Record<string, any[]> = {};
  for (const deployment of results.deployments) {
    if (!byProvider[deployment.provider]) {
      byProvider[deployment.provider] = [];
    }
    byProvider[deployment.provider].push(deployment);
  }

  // Display each provider's deployments
  for (const [provider, deployments] of Object.entries(byProvider)) {
    console.log(chalk.cyan(`  ☁️  ${provider.toUpperCase()}`));
    for (const deployment of deployments) {
      console.log(chalk.white(`    • ${deployment.name}`));
      console.log(chalk.gray(`      Environment: ${deployment.environment}`));
      if (deployment.region) {
        console.log(chalk.gray(`      Region: ${deployment.region}`));
      }
      if (deployment.country) {
        console.log(chalk.gray(`      Country: ${deployment.country}`));
      }
      console.log(chalk.gray(`      Config: ${path.relative(process.cwd(), deployment.config_file_path)}`));
      console.log('');
    }
  }
}

function displayImpactFrameworkResults(results: any, tool: AnalysisTool) {
  try {
    // Use tool's display configuration if available
    if (tool.display && tool.display.fields) {
      console.log(chalk.green('\n📊 Analysis Results:'));
      
      for (const field of tool.display.fields) {
        const value = extractValueFromPath(results, field.path);
        if (value !== null && value !== undefined) {
          const formattedValue = formatFieldValue(value, field.type, field.format);
          console.log(`  ${field.label}: ${chalk.white(formattedValue)}`);
        }
      }
    } else {
      // Fallback to generic display
      const childData = results?.tree?.children?.child;
      
      if (childData && childData.outputs && childData.outputs.length > 0) {
        const output = childData.outputs[0];
        
        console.log(chalk.green('\n📊 Impact Framework Results:'));
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
    }
  } catch (error) {
    console.log(chalk.yellow('\n⚠️  Could not parse results'));
    console.log(JSON.stringify(results, null, 2));
  }
}

// Helper function to extract values from nested object paths
function extractValueFromPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (part.includes('[') && part.includes(']')) {
      // Handle array access like "outputs[0]"
      const [key, indexStr] = part.split('[');
      const index = parseInt(indexStr.replace(']', ''));
      current = current?.[key]?.[index];
    } else {
      current = current?.[part];
    }
    
    if (current === null || current === undefined) {
      return null;
    }
  }
  
  return current;
}

// Helper function to format field values
function formatFieldValue(value: any, type: string, format?: string): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  switch (type) {
    case 'bytes':
      if (typeof value === 'number') {
        const kb = Math.round(value / 1024);
        const mb = (value / (1024 * 1024)).toFixed(2);
        if (format) {
          return format.replace('{value}', kb.toString()).replace('{valueMB}', mb);
        }
        return `${kb} KB`;
      }
      break;
    
    case 'time':
      if (format) {
        return format.replace('{value}', value.toString());
      }
      return `${value}ms`;
    
    case 'carbon':
      if (format) {
        return format.replace('{value}', value.toString());
      }
      return `${value}g`;
    
    case 'energy':
      if (format) {
        return format.replace('{value}', value.toString());
      }
      return `${value} kWh`;
    
    case 'boolean':
      return value ? 'Yes' : 'No';
    
    case 'number':
      if (format) {
        return format.replace('{value}', value.toString());
      }
      return value.toString();
    
    case 'url':
      if (format === 'domain-only') {
        try {
          const url = new URL(value);
          return url.hostname + url.pathname;
        } catch {
          const cleaned = String(value).replace(/^https?:\/\//, '');
          return cleaned;
        }
      }
      if (format) {
        return format.replace('{value}', value.toString());
      }
      return String(value);
  }

  return String(value);
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
