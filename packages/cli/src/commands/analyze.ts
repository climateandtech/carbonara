import chalk from 'chalk';
import ora from 'ora';
import execa from 'execa';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Command } from 'commander';
import { getToolRegistry, AnalysisTool } from '../registry/index.js';
import { createDataLake, createDeploymentService } from '@carbonara/core';
import { loadProjectConfig, getProjectRoot } from '../utils/config.js';
import { CarbonaraSWDAnalyzer } from '../analyzers/carbonara-swd.js';
import { checkPrerequisites, Prerequisite } from '@carbonara/core';
import { IsolatedToolExecutor } from '../utils/tool-executor.js';

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
      console.error(chalk.red(`\n❌ Prerequisites not met for ${tool.name}:`));
      console.error('');
      prereqCheck.missing.forEach(({ prerequisite, error }) => {
        console.error(chalk.red(`   • ${prerequisite.name}: ${error}`));
        if (prerequisite.setupInstructions) {
          console.error('');
          console.error(chalk.yellow(`   📋 Setup Instructions:`));
          console.error(chalk.yellow(`      ${prerequisite.setupInstructions}`));
          console.error('');
        }
      });
      console.error(chalk.blue(`\n💡 Tip: You can view detailed installation instructions in the VSCode extension's Tools view.`));
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
    console.log(chalk.blue(`\n💾 Save option: ${options.save}, toolId: ${toolId}`));
    if (options.save && toolId !== 'deployment-scan') {
      console.log(chalk.blue(`\n💾 Calling saveToDatabase for ${toolId}...`));
      await saveToDatabase(toolId, url!, results);
    } else {
      if (!options.save) {
        console.log(chalk.yellow(`\n⚠️  --save flag not set, skipping database save`));
      } else if (toolId === 'deployment-scan') {
        console.log(chalk.blue(`\n💾 Deployment scan saves directly, skipping saveToDatabase`));
      }
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
  // Get the data service and project info
  const config = await loadProjectConfig();
  if (!config) {
    throw new Error('No Carbonara project found. Please initialize a project first.');
  }
  
  // Resolve database path correctly (same as saveToDatabase)
  const projectRoot = getProjectRoot() || process.cwd();
  console.log(chalk.blue(`📂 Project root: ${projectRoot}`));
  
  let dbPath: string;
  if (config.database?.path) {
    dbPath = path.isAbsolute(config.database.path)
      ? config.database.path
      : path.join(projectRoot, config.database.path);
  } else {
    // Default to .carbonara/carbonara.db in project root
    dbPath = path.join(projectRoot, '.carbonara', 'carbonara.db');
  }
  
  console.log(chalk.blue(`🗄️  Database path: ${dbPath}`));
  
  const dataService = createDataLake({ dbPath });
  await dataService.initialize();

  // Ensure we have a valid project ID (create if needed)
  let projectId = config.projectId;
  if (!projectId) {
    console.log(chalk.blue('🔧 No project ID found, creating project in database...'));
    projectId = await dataService.createProject(
      config.name || 'Unnamed Project',
      projectRoot,
      {
        description: config.description,
        projectType: config.projectType || 'web',
        initialized: new Date().toISOString()
      }
    );
    
    // Update config with new project ID
    const { saveProjectConfig } = await import('../utils/config.js');
    const updatedConfig = { ...config, projectId };
    saveProjectConfig(updatedConfig, projectRoot);
    
    console.log(chalk.green(`✅ Created project with ID: ${projectId}`));
  }

  // If no path provided (dirPath is '.'), use the project root
  let scanPath = dirPath === '.' ? projectRoot : dirPath;
  const resolvedPath = path.resolve(scanPath);

  // Create deployment service
  const deploymentService = createDeploymentService(dataService);

  // Scan directory for deployment configurations
  const detections = await deploymentService.scanDirectory(resolvedPath);

  // Save to database if requested
  if (options.save) {
    if (detections.length > 0) {
      try {
        await deploymentService.saveDeployments(
          detections,
          projectId,
          resolvedPath
        );
        console.log(chalk.green(`\n✅ Saved ${detections.length} deployment(s) to database`));
      } catch (error: any) {
        console.error(chalk.red(`\n❌ Could not save deployments: ${error.message}`));
        if (error.stack) {
          console.error(chalk.gray(`   Stack: ${error.stack}`));
        }
      }
    } else {
      console.log(chalk.yellow('\n⚠️  No deployments found to save'));
    }
  }

  // Ensure database is flushed to disk
  await dataService.close();

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
  
  // Use isolated execution for external tools to prevent workspace context interference
  const executor = new IsolatedToolExecutor();
  try {
    await executor.createIsolatedEnvironment();
    
    const result = await executor.execute({
      command: tool.command.executable,
      args: args,
      stdio: 'pipe'
    });

    // Check for execution errors
    if (result.exitCode !== 0) {
      const errorMessage = result.stderr || result.stdout || 'Unknown error';
      throw new Error(`Tool execution failed: ${errorMessage}`);
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

  // Create temporary directory for analysis
  const tempDir = path.join(process.cwd(), '.carbonara-temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create manifest from template with placeholder replacement
  const manifest = JSON.parse(JSON.stringify(tool.manifestTemplate)); // Deep clone
  
  // Get values for placeholders
  const scrollToBottom = options.scrollToBottom ?? co2Variables.monitoringConfig?.scrollToBottom ?? false;
  const firstVisitPercentage = options.firstVisitPercentage ?? co2Variables.monitoringConfig?.firstVisitPercentage ?? 0.9;
  const returnVisitPercentage = 1 - firstVisitPercentage;
  const testCommand = options.testCommand ?? co2Variables.monitoringConfig?.e2eTestCommand ?? 'npm test';
  
  // Replace placeholders in manifest with intelligent defaults from assessment data
  const replacePlaceholders = (obj: any): any => {
    if (typeof obj === 'string') {
      // If the entire string is a placeholder, return the actual value (boolean/number)
      if (obj === '{scrollToBottom}') {
        return scrollToBottom;
      }
      if (obj === '{firstVisitPercentage}') {
        return firstVisitPercentage;
      }
      if (obj === '{returnVisitPercentage}') {
        return returnVisitPercentage;
      }
      
      // Otherwise, replace placeholders within strings
      return obj
        .replace('{url}', url)
        .replace('{testCommand}', testCommand)
        .replace('{scrollToBottom}', scrollToBottom.toString())
        .replace('{firstVisitPercentage}', firstVisitPercentage.toString())
        .replace('{returnVisitPercentage}', returnVisitPercentage.toString());
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
  const outputPath = path.join(tempDir, 'output.yml');
  
  fs.writeFileSync(manifestPath, yaml.dump(processedManifest));

  // Run Impact Framework analysis
  try {
    const result = await execa('if-run', [
      '--manifest', manifestPath,
      '--output', outputPath
    ], {
      stdio: 'pipe',
      reject: false // Don't throw on non-zero exit
    });

    // Check exit code
    if (result.exitCode !== 0) {
      const errorMsg = result.stderr || result.stdout || 'Unknown error';
      throw new Error(`if-run failed with exit code ${result.exitCode}: ${errorMsg}`);
    }

    // Check if output file exists
    if (!fs.existsSync(outputPath)) {
      // Provide more context about what might have gone wrong
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      throw new Error(
        `Output file not created at ${outputPath}\n` +
        `if-run exit code: ${result.exitCode}\n` +
        `if-run stdout: ${result.stdout || '(empty)'}\n` +
        `if-run stderr: ${result.stderr || '(empty)'}\n` +
        `Manifest file: ${manifestPath}\n` +
        `Temp directory: ${tempDir}`
      );
    }
  } catch (error: any) {
    // If it's already our formatted error, re-throw it
    if (error.message && error.message.includes('Output file not created')) {
      throw error;
    }
    // Otherwise, wrap the error with more context
    throw new Error(
      `Failed to run Impact Framework analysis: ${error.message}\n` +
      `Manifest: ${manifestPath}\n` +
      `Output: ${outputPath}`
    );
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
    const config = await loadProjectConfig();
    if (!config) {
      console.error(chalk.red('❌ No project found. Results not saved.'));
      console.error(chalk.yellow('   Make sure you are in a Carbonara project directory with .carbonara/carbonara.config.json'));
      return;
    }

    // Get project root to resolve database path correctly
    const projectRoot = getProjectRoot() || process.cwd();
    console.log(chalk.blue(`📂 Project root: ${projectRoot}`));
    
    // Resolve database path from config (relative paths are relative to project root)
    let dbPath: string;
    if (config.database?.path) {
      dbPath = path.isAbsolute(config.database.path)
        ? config.database.path
        : path.join(projectRoot, config.database.path);
    } else {
      // Default to .carbonara/carbonara.db in project root
      dbPath = path.join(projectRoot, '.carbonara', 'carbonara.db');
    }
    
    console.log(chalk.blue(`🗄️  Database path: ${dbPath}`));

    const dataLake = createDataLake({ dbPath });
    await dataLake.initialize();

    // Ensure we have a valid project ID
    let projectId = config.projectId;
    
    if (!projectId) {
      console.log(chalk.blue('🔧 No project ID found, creating project in database...'));
      
      // Create project in database - use projectRoot instead of process.cwd()
      const projectPath = projectRoot;
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
  } catch (error: any) {
    console.error(chalk.red('\n❌ Could not save results:'));
    console.error(chalk.red(`   Error: ${error.message || error}`));
    if (error.stack) {
      console.error(chalk.gray(`   Stack: ${error.stack}`));
    }
    // Don't throw - allow the command to complete even if save fails
  }
}
