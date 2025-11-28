import chalk from 'chalk';
import ora from 'ora';
import { execa } from 'execa';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Command } from 'commander';
import { getToolRegistry, AnalysisTool } from '../registry/index.js';
import { createDataLake, createDeploymentService } from '@carbonara/core';
import { loadProjectConfig, getProjectRoot } from '../utils/config.js';
import { CarbonaraSWDAnalyzer } from '../analyzers/carbonara-swd.js';

interface AnalyzeOptions {
  save: boolean;
  output: 'json' | 'table';
  [key: string]: any; // Allow dynamic options
}

export async function analyzeCommand(toolId: string | undefined, url: string | undefined, options: AnalyzeOptions, command: Command) {
  // Commander.js passes options as a parameter, but command.opts() is the reliable source
  // However, for boolean flags, we need to check both sources
  // The options parameter might have boolean flags that command.opts() doesn't show when false
  const optsFromCommand = command.opts() as any;
  const optsFromParam = options || {};
  
  // Commander.js v14: boolean flags only appear in opts() when they're true
  // If the flag is not provided, it won't appear at all (not even as false)
  // So we need to check if the flag exists in either source
  const opts: AnalyzeOptions = {
    output: optsFromCommand.output || optsFromParam.output || 'table',
    timeout: optsFromCommand.timeout || optsFromParam.timeout || '30000',
    // For boolean flags: check if 'save' property exists (truthy) in either source
    // In Commander.js, if --save is passed, it will be true in opts()
    // If not passed, the property won't exist at all
    save: !!(optsFromCommand.save || optsFromParam.save)
  };
  
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
      results = await runDeploymentScan(url || '.', opts, tool);
    } else if (toolId === 'test-analyzer') {
      results = await runTestAnalyzer(url!, opts, tool);
    } else if (toolId === 'carbonara-swd') {
      results = await runCarbonaraSWD(url!, opts, tool);
    } else if (toolId.startsWith('if-')) {
      results = await runImpactFramework(url!, opts, tool);
    } else {
      results = await runGenericTool(url!, opts, tool);
    }

    spinner.succeed(`${tool.name} analysis completed!`);

    // Display results
    displayResults(results, tool, opts.output || 'table');

    // Save to database if requested (skip for deployment-scan as it saves directly)
    console.log(chalk.blue(`\n💾 Save option: ${opts.save}, toolId: ${toolId}`));
    if (opts.save && toolId !== 'deployment-scan') {
      console.log(chalk.blue(`\n💾 Calling saveToDatabase for ${toolId}...`));
      await saveToDatabase(toolId, url!, results);
    } else {
      if (!opts.save) {
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
  
  // Build parameter values from tools.json configuration
  const parameterValues: Record<string, any> = {};
  
  // 1. Get values from options (user-provided)
  if (tool.parameters) {
    for (const param of tool.parameters) {
      // Ensure placeholder has braces
      let placeholder = param.placeholder || `{${param.name}}`;
      if (!placeholder.startsWith('{') || !placeholder.endsWith('}')) {
        placeholder = `{${placeholder}}`;
      }
      
      const optionValue = options[param.name];
      const defaultValue = param.default ?? tool.parameterDefaults?.[param.name];
      
      // Get value from options, co2Variables, or default
      let value: any;
      if (optionValue !== undefined) {
        value = optionValue;
      } else if (co2Variables.monitoringConfig?.[param.name] !== undefined) {
        value = co2Variables.monitoringConfig[param.name];
      } else {
        value = defaultValue;
      }
      
      // Convert type if needed
      if (param.type === 'boolean' && typeof value === 'string') {
        value = value === 'true';
      } else if (param.type === 'number' && typeof value === 'string') {
        value = parseFloat(value);
      }
      
      parameterValues[placeholder] = value;
    }
  }
  
  // 2. Handle parameter mappings (derived values)
  if (tool.parameterMappings) {
    for (const [mappedName, mapping] of Object.entries(tool.parameterMappings)) {
      // Type guard for mapping
      const mappingObj = mapping as { source?: string; transform?: string; type?: 'string' | 'number' | 'boolean' };
      
      // Ensure placeholder has braces
      let placeholder = `{${mappedName}}`;
      
      if (mappingObj.transform && mappingObj.source) {
        // Get source value - find the source parameter's placeholder
        const sourceParam = tool.parameters?.find(p => p.name === mappingObj.source);
        let sourcePlaceholder = sourceParam?.placeholder || `{${mappingObj.source}}`;
        // Ensure source placeholder has braces
        if (!sourcePlaceholder.startsWith('{') || !sourcePlaceholder.endsWith('}')) {
          sourcePlaceholder = `{${sourcePlaceholder}}`;
        }
        const sourceValue = parameterValues[sourcePlaceholder];
        
        if (sourceValue !== undefined) {
          // Apply transform (e.g., "1 - {source}")
          // Replace {source} placeholder in transform expression with actual value
          let transformExpr = mappingObj.transform;
          // Replace {source} with the actual value
          transformExpr = transformExpr.replace(/{source}/g, String(sourceValue));
          // Also replace the parameter name placeholder if present
          transformExpr = transformExpr.replace(new RegExp(`{${mappingObj.source}}`, 'g'), String(sourceValue));
          
          try {
            // Simple evaluation for basic math expressions
            const value = Function(`"use strict"; return (${transformExpr})`)();
            // Ensure correct type based on mapping type
            if (mappingObj.type === 'number') {
              parameterValues[placeholder] = Number(value);
            } else if (mappingObj.type === 'boolean') {
              parameterValues[placeholder] = Boolean(value);
            } else {
              parameterValues[placeholder] = value;
            }
          } catch (error) {
            // Fallback to string replacement if eval fails
            console.log(chalk.yellow(`⚠️  Transform evaluation failed for ${mappedName}: ${error}`));
            parameterValues[placeholder] = transformExpr;
          }
        }
      }
    }
  }
  
  // 3. Add common placeholders
  parameterValues['{url}'] = url;
  parameterValues['{testCommand}'] = options.testCommand ?? co2Variables.monitoringConfig?.e2eTestCommand ?? 'npm test';
  
  // Replace placeholders in manifest
  const replacePlaceholders = (obj: any): any => {
    if (typeof obj === 'string') {
      // Check if it's an exact placeholder match (preserve type)
      if (parameterValues.hasOwnProperty(obj)) {
        return parameterValues[obj];
      }
      // Otherwise do string replacement for placeholders within strings
      let result = obj;
      for (const [placeholder, value] of Object.entries(parameterValues)) {
        result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(value));
      }
      return result;
    } else if (Array.isArray(obj)) {
      return obj.map(replacePlaceholders);
    } else if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Handle exact placeholder matches first (for type preservation)
        // Check if value is a string that exactly matches a placeholder
        if (typeof value === 'string' && parameterValues.hasOwnProperty(value)) {
          result[key] = parameterValues[value];
        } else {
          result[key] = replacePlaceholders(value);
        }
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

  // Determine file extensions based on output format
  const outputFormat = tool.command.outputFormat || 'yaml';
  const manifestExt = outputFormat === 'yaml' ? 'yml' : outputFormat;
  const outputExt = outputFormat === 'yaml' ? 'yaml' : outputFormat; // Some tools use .yaml, some .yml
  
  const manifestPath = path.join(tempDir, `manifest.${manifestExt}`);
  const outputPath = path.join(tempDir, `output.${outputExt}`);
  
  // Write manifest file
  if (outputFormat === 'yaml') {
    fs.writeFileSync(manifestPath, yaml.dump(processedManifest));
  } else if (outputFormat === 'json') {
    fs.writeFileSync(manifestPath, JSON.stringify(processedManifest, null, 2));
  } else {
    throw new Error(`Unsupported output format: ${outputFormat}`);
  }

  // Replace placeholders in command args using tool's command configuration
  const args = tool.command.args.map(arg => {
    return arg
      .replace('{manifest}', manifestPath)
      .replace('{output}', outputPath)
      .replace('{url}', url);
  });

  // Execute command using tool's configuration
  let commandResult;
  try {
    commandResult = await execa(tool.command.executable, args, {
      stdio: 'pipe',
      reject: false // Don't throw on non-zero exit, we'll check the output file
    });
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const stdout = error.stdout?.toString() || '';
    const stderr = error.stderr?.toString() || '';
    throw new Error(
      `Failed to run ${tool.command.executable}: ${errorMessage}\n` +
      (stdout ? `stdout: ${stdout}\n` : '') +
      (stderr ? `stderr: ${stderr}` : '')
    );
  }

  // Log command output for debugging
  const exitCode = commandResult.exitCode || 0;
  const stdout = commandResult.stdout?.toString() || '';
  const stderr = commandResult.stderr?.toString() || '';
  
  if (stdout) {
    console.log(chalk.gray(`\n${tool.command.executable} stdout:\n${stdout}`));
  }
  if (stderr) {
    console.log(chalk.yellow(`\n${tool.command.executable} stderr:\n${stderr}`));
  }

  // Check if output file exists (try both .yaml and .yml for yaml format)
  let finalOutputPath = outputPath;
  if (!fs.existsSync(finalOutputPath) && outputFormat === 'yaml') {
    // Try alternative extension
    const altPath = outputPath.replace('.yaml', '.yml');
    if (fs.existsSync(altPath)) {
      finalOutputPath = altPath;
      console.log(chalk.blue(`\n✅ Found output at alternative path: ${altPath}`));
    }
  }

  if (!fs.existsSync(finalOutputPath)) {
    console.log(chalk.yellow(`\n⚠️  Output file not found at ${finalOutputPath}`));
    console.log(chalk.gray(`${tool.command.executable} exit code: ${exitCode}`));
    throw new Error(
      `Output file not created at ${finalOutputPath}\n` +
      `${tool.command.executable} exit code: ${exitCode}\n` +
      (stdout ? `stdout: ${stdout}\n` : '') +
      (stderr ? `stderr: ${stderr}` : '')
    );
  }

  // Read raw output content
  const outputContent = fs.readFileSync(finalOutputPath, 'utf8');
  
  // Parse results for display and processing
  let parsedResults: any;
  if (outputFormat === 'json') {
    parsedResults = JSON.parse(outputContent);
  } else if (outputFormat === 'yaml') {
    parsedResults = yaml.load(outputContent);
  } else {
    parsedResults = { output: outputContent };
  }
  
  // Structure results for display and database
  // Wrap in 'data' key to match tools.json path structure (data.tree.children...)
  const results = {
    url: url,
    timestamp: new Date().toISOString(),
    tool: tool.id,
    // Store raw output as JSON string for database (convert YAML to JSON)
    raw_results: outputFormat === 'yaml' ? JSON.stringify(parsedResults, null, 2) : outputContent,
    // Parsed data for display and querying
    data: {
      url: url,
      ...parsedResults
    },
    // Also keep parsed at top level for backward compatibility
    ...parsedResults
  };
  
  // Don't cleanup immediately - keep files for debugging if needed
  // fs.rmSync(tempDir, { recursive: true, force: true });
  
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
// Handles paths like "data.tree.children.child.outputs[0]['estimated-carbon']" or "data.tree.children.child.outputs[0]['network/data/bytes']"
function extractValueFromPath(obj: any, path: string): any {
  // Split by dots, but preserve bracket expressions
  const parts: string[] = [];
  let current = '';
  let inBrackets = false;
  
  for (let i = 0; i < path.length; i++) {
    const char = path[i];
    if (char === '[') {
      if (current) {
        parts.push(current);
        current = '';
      }
      inBrackets = true;
      current += char;
    } else if (char === ']') {
      current += char;
      parts.push(current);
      current = '';
      inBrackets = false;
    } else if (char === '.' && !inBrackets) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) {
    parts.push(current);
  }
  
  let result = obj;
  for (const part of parts) {
    if (part.startsWith('[') && part.endsWith(']')) {
      // Handle bracket notation: [0] or ['key'] or ["key"] or ['network/data/bytes']
      const content = part.slice(1, -1);
      if (/^\d+$/.test(content)) {
        // Numeric index
        result = result?.[parseInt(content)];
      } else {
        // String key - remove quotes (handles keys with slashes like 'network/data/bytes')
        const key = content.replace(/^['"]|['"]$/g, '');
        result = result?.[key];
      }
    } else {
      result = result?.[part];
    }
    
    if (result === null || result === undefined) {
      return null;
    }
  }
  
  return result;
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

    // Store assessment data
    // Structure: raw_results (original output as JSON) + processed data (spread)
    // For IF tools: raw_results contains the original YAML converted to JSON
    // For other tools: raw_results contains JSON.stringify(results)
    const rawResults = results.raw_results || JSON.stringify(results, null, 2);
    
    // Remove raw_results from spread to avoid duplication
    const { raw_results: _, ...processedData } = results;
    
    const assessmentData = {
      url: url,
      raw_results: rawResults, // Store raw output as JSON string
      timestamp: new Date().toISOString(),
      // Spread processed data for easy access (without raw_results to avoid duplication)
      ...processedData
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
