import chalk from 'chalk';
import ora from 'ora';
import execa from 'execa';
import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import { Command } from 'commander';
import { getToolRegistry, AnalysisTool } from '../registry/index.js';
import { createDataLake, createDeploymentService } from '@carbonara/core';
import { loadProjectConfig, getProjectRoot } from '../utils/config.js';
import { CarbonaraSWDAnalyzer } from '../analyzers/carbonara-swd.js';
import { IsolatedToolExecutor } from '../utils/tool-executor.js';
import { checkPrerequisites, Prerequisite } from '../utils/prerequisites.js';

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

  // Check prerequisites before execution
  if (tool.prerequisites && tool.prerequisites.length > 0) {
    const prerequisites: Prerequisite[] = tool.prerequisites.map((p: any) => ({
      type: p.type,
      name: p.name,
      checkCommand: p.checkCommand,
      expectedOutput: p.expectedOutput,
      errorMessage: p.errorMessage,
      setupInstructions: p.setupInstructions
    }));

    const prereqCheck = await checkPrerequisites(prerequisites);
    
    if (!prereqCheck.allAvailable) {
      console.error(chalk.red(`❌ Prerequisites not met for ${tool.name}:`));
      prereqCheck.missing.forEach(({ prerequisite, error }) => {
        console.error(chalk.red(`   • ${prerequisite.name}: ${error}`));
        if (prerequisite.setupInstructions) {
          console.log(chalk.yellow(`     Setup: ${prerequisite.setupInstructions}`));
        }
      });
      
      // Show full installation instructions including prerequisites
      console.log(chalk.yellow('\n📋 Installation Instructions:'));
      showInstallationInstructions(tool);
      
      process.exit(1);
    }
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
    
    // Check if error is related to missing prerequisites (e.g., Docker, Playwright)
    const errorMessage = error.message || String(error);
    const errorOutput = error.stderr || error.stdout || '';
    const fullError = errorMessage + (errorOutput ? '\n' + errorOutput : '');
    
    // Detect Docker-related errors
    if (fullError.includes('Cannot connect to the Docker daemon') || 
        fullError.includes('docker daemon') ||
        fullError.includes('Is the docker daemon running')) {
      console.error(chalk.red('\n❌ Docker Error:'));
      console.error(chalk.yellow('   Docker is required but not running.'));
      console.log(chalk.yellow('\n💡 Please:'));
      console.log(chalk.white('   1. Start Docker Desktop'));
      console.log(chalk.white('   2. Wait for Docker to fully start'));
      console.log(chalk.white('   3. Try running the analysis again'));
      if (tool.prerequisites) {
        const dockerPrereq = tool.prerequisites.find((p: any) => p.type === 'docker');
        if (dockerPrereq?.setupInstructions) {
          console.log(chalk.gray(`\n   Setup: ${dockerPrereq.setupInstructions}`));
        }
      }
    } 
    // Detect Playwright browser errors
    else if (fullError.includes('Executable doesn\'t exist') ||
             fullError.includes('Please run the following command to download new browsers') ||
             fullError.includes('npx playwright install')) {
      console.error(chalk.red('\n❌ Playwright Browser Error:'));
      console.error(chalk.yellow('   Playwright browsers are required but not installed.'));
      console.log(chalk.yellow('\n💡 Please:'));
      console.log(chalk.white('   1. Run: npx playwright install chromium'));
      console.log(chalk.white('   2. Wait for the installation to complete'));
      console.log(chalk.white('   3. Try running the analysis again'));
      if (tool.prerequisites) {
        const playwrightPrereq = tool.prerequisites.find((p: any) => p.type === 'playwright');
        if (playwrightPrereq?.setupInstructions) {
          console.log(chalk.gray(`\n   Setup: ${playwrightPrereq.setupInstructions}`));
        }
      }
      // Show full installation instructions
      console.log(chalk.yellow('\n📋 Installation Instructions:'));
      showInstallationInstructions(tool);
    } 
    else {
      console.error(chalk.red('Error:'), errorMessage);
      if (errorOutput) {
        console.error(chalk.gray(errorOutput));
      }
    }
    
    process.exit(1);
  }
}

function showInstallationInstructions(tool: AnalysisTool): void {
  console.log(chalk.blue(`\n${tool.name} Setup Guide`));
  console.log(chalk.gray('═'.repeat(50)));
  
  if (tool.description) {
    console.log(chalk.white(`\n${tool.description}\n`));
  }

  // Show prerequisites
  if (tool.prerequisites && tool.prerequisites.length > 0) {
    console.log(chalk.yellow('📦 Prerequisites:'));
    tool.prerequisites.forEach((prereq: any) => {
      console.log(chalk.white(`\n  • ${prereq.name} (${prereq.type})`));
      if (prereq.setupInstructions) {
        console.log(chalk.gray(`    ${prereq.setupInstructions}`));
      }
      console.log(chalk.dim(`    Check: ${prereq.checkCommand}`));
    });
    console.log('');
  }

  // Show installation instructions
  if (tool.installation) {
    console.log(chalk.yellow('🔧 Installation:'));
    if (tool.installation.type === 'npm') {
      const packages = tool.installation.package.split(' ').filter(p => p.trim().length > 0);
      console.log(chalk.white(`\n  Install packages:`));
      packages.forEach(pkg => {
        console.log(chalk.cyan(`    npm install -g ${pkg}`));
      });
    } else {
      console.log(chalk.white(`\n  ${tool.installation.instructions}`));
    }
    console.log('');
  }

  // Show usage
  console.log(chalk.yellow('🚀 Usage:'));
  console.log(chalk.white(`  carbonara analyze ${tool.id} <url>`));
  console.log('');
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
  // Get the data service and project info
  const config = await loadProjectConfig();
  const dataService = createDataLake(config?.database ? { dbPath: config.database.path } : undefined);
  await dataService.initialize();

  // If no path provided (dirPath is '.'), use the project root from the database
  let scanPath = dirPath;
  if (dirPath === '.' && config?.projectId) {
    const project = await dataService.getProjectById(config.projectId);
    if (project) {
      scanPath = project.path;
    }
  }

  // Create deployment service
  const deploymentService = createDeploymentService(dataService);

  // Scan directory for deployment configurations
  const resolvedPath = path.resolve(scanPath);
  const detections = await deploymentService.scanDirectory(resolvedPath);

  // Save to database if requested
  if (options.save && detections.length > 0) {
    await deploymentService.saveDeployments(
      detections,
      config?.projectId,
      resolvedPath
    );
  }

  return {
    timestamp: new Date().toISOString(),
    tool: 'deployment-scan',
    path: scanPath,
    deployments: detections,
    count: detections.length
  };
}

async function runGenericTool(url: string, options: AnalyzeOptions, tool: AnalysisTool): Promise<any> {
  // Replace placeholders in command args
  const args = tool.command.args.map(arg => arg.replace('{url}', url));
  
  // Use isolated executor to prevent workspace interference
  const executor = new IsolatedToolExecutor();
  try {
    const result = await executor.execute({
      command: tool.command.executable,
      args: args,
      stdio: 'pipe'
    });

    // Check if command failed
    if (result.exitCode !== 0) {
      throw new Error(`Tool execution failed: ${result.stderr || result.stdout || 'Unknown error'}`);
    }

    if (tool.command.outputFormat === 'json') {
      return JSON.parse(result.stdout);
    } else if (tool.command.outputFormat === 'yaml') {
      return yaml.load(result.stdout);
    } else {
      return { output: result.stdout };
    }
  } finally {
    executor.cleanup();
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

  // Load project and get CO2 variables for intelligent defaults
  let co2Variables: any = {};
  try {
    const config = await loadProjectConfig();
    if (config?.projectId) {
      const dataLake = createDataLake();
      await dataLake.initialize();
      const project = await dataLake.getProject(process.cwd());
      co2Variables = project?.co2_variables || {};
      await dataLake.close();
    }
  } catch (error) {
    // If we can't load assessment data, continue with defaults
    console.log(chalk.yellow('⚠️  Could not load assessment data, using defaults'));
  }

  // Create isolated executor for tool execution
  const executor = new IsolatedToolExecutor();
  const tempDir = await executor.createIsolatedEnvironment();

  // Create manifest from template with placeholder replacement
  const manifest = JSON.parse(JSON.stringify(tool.manifestTemplate)); // Deep clone
  
  // Replace placeholders in manifest with intelligent defaults from assessment data
  const replacePlaceholders = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj
        .replace('{url}', url)
        .replace('{scrollToBottom}', (options.scrollToBottom ?? co2Variables.monitoringConfig?.scrollToBottom ?? false).toString())
        .replace('{firstVisitPercentage}', (options.firstVisitPercentage ?? co2Variables.monitoringConfig?.firstVisitPercentage ?? 0.9).toString())
        .replace('{returnVisitPercentage}', (1 - (options.firstVisitPercentage ?? co2Variables.monitoringConfig?.firstVisitPercentage ?? 0.9)).toString())
        .replace('{testCommand}', (options.testCommand ?? co2Variables.monitoringConfig?.e2eTestCommand ?? 'npm test').toString());
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

  // Update hardware defaults with assessment data if available
  if (processedManifest.tree?.children?.child?.defaults) {
    const defaults = processedManifest.tree.children.child.defaults;
    const originalDefaults = { ...defaults };
    
    defaults['thermal-design-power'] = co2Variables.hardwareConfig?.cpuTdp ?? defaults['thermal-design-power'] ?? 100;
    defaults['vcpus-total'] = co2Variables.hardwareConfig?.totalVcpus ?? defaults['vcpus-total'] ?? 8;
    defaults['vcpus-allocated'] = co2Variables.hardwareConfig?.allocatedVcpus ?? defaults['vcpus-allocated'] ?? 2;
    defaults['grid-carbon-intensity'] = co2Variables.hardwareConfig?.gridCarbonIntensity ?? defaults['grid-carbon-intensity'] ?? 750;
    
    // Log when assessment data is being used
    if (co2Variables.hardwareConfig && Object.keys(co2Variables.hardwareConfig).length > 0) {
      console.log(chalk.blue('🔧 Using hardware configuration from assessment data'));
      if (co2Variables.hardwareConfig.cpuTdp !== originalDefaults['thermal-design-power']) {
        console.log(chalk.gray(`  CPU TDP: ${co2Variables.hardwareConfig.cpuTdp}W (from assessment)`));
      }
      if (co2Variables.hardwareConfig.gridCarbonIntensity !== originalDefaults['grid-carbon-intensity']) {
        console.log(chalk.gray(`  Grid carbon intensity: ${co2Variables.hardwareConfig.gridCarbonIntensity} gCO2e/kWh (from assessment)`));
      }
    }
  }

  const manifestPath = path.join(tempDir, 'manifest.yml');
  // if-run outputs to .yaml extension by default, but we'll check both
  const outputPathYaml = path.join(tempDir, 'output.yaml');
  const outputPathYml = path.join(tempDir, 'output.yml');
  
  fs.writeFileSync(manifestPath, yaml.dump(processedManifest));

  // Run Impact Framework analysis in isolated environment
  try {
    const result = await executor.execute({
      command: 'if-run',
      args: [
        '--manifest', manifestPath,
        '--output', outputPathYaml  // Use .yaml extension as that's what if-run creates
      ],
      cwd: tempDir,
      stdio: 'pipe'
    });

    // Check if command failed
    if (result.exitCode !== 0) {
      const errorMessage = result.stderr || result.stdout || 'Unknown error';
      console.error('if-run command failed:', errorMessage);
      if (result.stdout) {
        console.error('if-run stdout:', result.stdout);
      }
      if (result.stderr) {
        console.error('if-run stderr:', result.stderr);
      }
      throw new Error(`Impact Framework analysis failed: ${errorMessage}`);
    }

    // Log stdout/stderr for debugging if verbose
    if (result.stdout) {
      console.log('if-run stdout:', result.stdout);
    }
    if (result.stderr) {
      console.log('if-run stderr:', result.stderr);
    }
  } catch (error: any) {
    // Capture error details
    const errorMessage = error.message || 'Unknown error';
    throw new Error(`Impact Framework analysis failed: ${errorMessage}`);
  } finally {
    // Cleanup will happen, but we need to read output first
  }

  // Check if output file exists (try both .yaml and .yml extensions)
  let outputPath = outputPathYaml;
  if (!fs.existsSync(outputPathYaml)) {
    if (fs.existsSync(outputPathYml)) {
      outputPath = outputPathYml;
    } else {
      // List files in tempDir for debugging
      const filesInTemp = fs.existsSync(tempDir) ? fs.readdirSync(tempDir) : [];
      executor.cleanup();
      throw new Error(
        `Output file not created at ${outputPathYaml} or ${outputPathYml}\n` +
        `Temp directory: ${tempDir}\n` +
        `Files in temp directory: ${filesInTemp.join(', ') || 'none'}`
      );
    }
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
  
  // Cleanup isolated environment
  executor.cleanup();
  
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
      if (deployment.grid_zone) {
        console.log(chalk.gray(`      Grid Zone: ${deployment.grid_zone}`));
      }
      if (deployment.carbon_intensity !== null && deployment.carbon_intensity !== undefined) {
        // Color code based on carbon intensity
        let carbonColor = chalk.green;
        if (deployment.carbon_intensity >= 500) {
          carbonColor = chalk.red;
        } else if (deployment.carbon_intensity >= 300) {
          carbonColor = chalk.yellow;
        } else if (deployment.carbon_intensity >= 100) {
          carbonColor = chalk.blue;
        }
        console.log(chalk.gray(`      Carbon Intensity: ${carbonColor(`${deployment.carbon_intensity} gCO2/kWh`)}`));
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
    console.log(chalk.blue(`\n💾 Saving results to database...`));
    console.log(chalk.gray(`   Tool ID: ${toolId}`));
    console.log(chalk.gray(`   URL: ${url}`));
    
    const config = await loadProjectConfig();
    const projectPath = process.cwd();
    
    // Determine database path from config or use default
    let dbPath: string | undefined;
    if (config?.database?.path) {
      // If path is relative, make it relative to project root
      dbPath = path.isAbsolute(config.database.path)
        ? config.database.path
        : path.join(projectPath, config.database.path);
    } else {
      // Use default path: .carbonara/carbonara.db in project root
      dbPath = path.join(projectPath, '.carbonara', 'carbonara.db');
    }
    
    console.log(chalk.gray(`   Database path: ${dbPath}`));
    
    const dataLake = createDataLake({ dbPath });
    await dataLake.initialize();

    // Get or create project
    let projectId: number | undefined;
    
    if (config) {
      console.log(chalk.gray(`   Project: ${config.name || 'Unnamed'}`));
      console.log(chalk.gray(`   Project ID: ${config.projectId || 'none'}`));
      projectId = config.projectId;
    } else {
      console.log(chalk.yellow('⚠️  No project config found.'));
    }
    
    // If no project ID, try to find existing project by path, or create new one
    if (!projectId) {
      // Try to find existing project by path
      const existingProject = await dataLake.getProject(projectPath);
      if (existingProject) {
        projectId = existingProject.id;
        console.log(chalk.blue(`🔧 Found existing project with ID: ${projectId}`));
      } else {
        console.log(chalk.blue('🔧 No project found, creating new project in database...'));
        
        // Create project in database
        const projectName = config?.name || path.basename(projectPath) || 'Unnamed Project';
        projectId = await dataLake.createProject(
          projectName,
          projectPath,
          {
            description: config?.description || 'Auto-created project',
            projectType: config?.projectType || 'web',
            initialized: new Date().toISOString()
          }
        );
        
        // Try to save config if we can
        if (config) {
          const { saveProjectConfig } = await import('../utils/config.js');
          const updatedConfig = { ...config, projectId };
          saveProjectConfig(updatedConfig, projectPath);
        } else {
          // Create minimal config
          const { saveProjectConfig } = await import('../utils/config.js');
          const newConfig: any = {
            name: projectName,
            description: 'Auto-created project',
            projectType: 'web',
            projectId,
            database: {
              path: '.carbonara/carbonara.db'
            },
            tools: {}
          };
          saveProjectConfig(newConfig, projectPath);
        }
        
        console.log(chalk.green(`✅ Created project with ID: ${projectId}`));
      }
    }

    const assessmentData = {
      url: url,
      raw_results: JSON.stringify(results),
      timestamp: new Date().toISOString(),
      // Extract commonly needed fields for schema templates
      ...results  // Spread the results to make fields directly accessible
    };

    console.log(chalk.gray(`   Data type: web-analysis`));
    console.log(chalk.gray(`   Data keys: ${Object.keys(assessmentData).join(', ')}`));
    
    const dataId = await dataLake.storeAssessmentData(projectId, toolId, 'web-analysis', assessmentData, url);
    
    console.log(chalk.gray(`   Saved with data ID: ${dataId}`));

    await dataLake.close();

    console.log(chalk.green(`✅ Results saved to project database (project ID: ${projectId}, data ID: ${dataId})`));
  } catch (error) {
    console.error(chalk.red('\n❌ Error saving results to database:'));
    console.error(chalk.red(`   ${error instanceof Error ? error.message : String(error)}`));
    if (error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack));
    }
    console.log(chalk.yellow('\n⚠️  Results were not saved.'));
  }
}
