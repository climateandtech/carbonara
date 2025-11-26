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

  // Check if tool is installed - allow running if installation succeeded but detection failed
  const isInstalled = await registry.isToolInstalled(toolId);
  let allowRun = isInstalled;
  
  // If detection failed, check config flag (installation may have succeeded)
  if (!isInstalled) {
    try {
      const { isToolMarkedInstalled } = await import('../utils/config.js');
      if (await isToolMarkedInstalled(toolId)) {
        allowRun = true;
        console.log(chalk.yellow(`\n⚠️  Tool detection failed, but installation was marked as successful. Attempting to run...`));
      }
    } catch {
      // Config check failed, continue with normal check
    }
  }
  
  if (!allowRun) {
    console.error(chalk.red(`❌ Tool ${tool.name} is not installed`));
    console.log(chalk.yellow('\n💡 Install it with:'));
    console.log(chalk.white(tool.installation.instructions));
    console.log(chalk.gray('\nOr run:'));
    console.log(chalk.white(`carbonara tools install ${toolId}`));
    process.exit(1);
  }

  // Check prerequisites if tool is installed
  if (tool.prerequisites && tool.prerequisites.length > 0) {
    const prereqCheck = await registry.checkToolPrerequisites(toolId);
    if (!prereqCheck.allAvailable) {
      console.warn(chalk.yellow(`\n⚠️  Missing prerequisites for ${tool.name}:`));
      prereqCheck.missing.forEach(({ prerequisite, error }) => {
        console.warn(chalk.yellow(`  • ${prerequisite.name}: ${error}`));
        if (prerequisite.setupInstructions) {
          console.log(chalk.dim(`    ${prerequisite.setupInstructions}`));
        } else if (prerequisite.installCommand) {
          console.log(chalk.dim(`    Run: ${prerequisite.installCommand}`));
        }
      });
      console.log(chalk.yellow('\n⚠️  Continuing anyway, but the tool may fail...\n'));
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

    // Check for custom execution command (user manually installed)
    const { getCustomExecutionCommand } = await import('../utils/config.js');
    const customExecCommand = await getCustomExecutionCommand(toolId);
    
    // Build command string for logging
    let commandStr: string;
    if (customExecCommand) {
      // Use custom execution command
      if (Array.isArray(customExecCommand)) {
        commandStr = customExecCommand.join(' ').replace('{url}', url || '');
      } else {
        commandStr = customExecCommand.replace('{url}', url || '');
      }
    } else {
      // Use default command
      commandStr = `${tool.command.executable} ${tool.command.args.join(' ').replace('{url}', url || '')}`;
    }

    let results: any;
    let output = '';

    if (toolId === 'deployment-scan') {
      results = await runDeploymentScan(url || '.', options, tool);
    } else if (toolId === 'test-analyzer') {
      results = await runTestAnalyzer(url!, options, tool);
    } else if (toolId === 'carbonara-swd') {
      results = await runCarbonaraSWD(url!, options, tool);
    } else if (toolId.startsWith('if-')) {
      results = await runImpactFramework(url!, options, tool, customExecCommand);
      output = JSON.stringify(results, null, 2).substring(0, 1000); // Limit output length
    } else {
      results = await runGenericTool(url!, options, tool, customExecCommand);
      output = JSON.stringify(results, null, 2).substring(0, 1000);
    }

    spinner.succeed(`${tool.name} analysis completed!`);

    // Log successful execution
    try {
      const { logToolAction } = await import('../utils/tool-logger.js');
      await logToolAction({
        timestamp: new Date().toISOString(),
        toolId,
        action: 'run',
        command: commandStr,
        output: output || 'Analysis completed successfully',
        exitCode: 0,
      });
    } catch (logError) {
      // Silently fail - logging is optional
    }

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
    
    // Log error
    try {
      const { logToolAction } = await import('../utils/tool-logger.js');
      const commandStr = `${tool.command.executable} ${tool.command.args.join(' ').replace('{url}', url || '')}`;
      await logToolAction({
        timestamp: new Date().toISOString(),
        toolId,
        action: 'error',
        command: commandStr,
        error: error.message,
        exitCode: 1,
      });
    } catch (logError) {
      // Silently fail - logging is optional
    }
    
    // Check if error suggests tool is not actually installed (false positive detection)
    // This happens when detection passed but tool isn't really there (e.g., npx downloaded on-the-fly)
    const errorMessage = error.message || String(error);
    const suggestsNotInstalled = 
      errorMessage.includes('command not found') ||
      errorMessage.includes('Command not found') ||
      errorMessage.includes('ENOENT') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('cannot find') ||
      errorMessage.includes('is not installed') ||
      (error.exitCode === 127);
    
    // Check if error suggests missing plugin or configuration issue
    const suggestsPluginIssue = 
      errorMessage.includes('InputValidationError') ||
      errorMessage.includes('ValidationError') ||
      errorMessage.includes('is provided neither in config nor in input') ||
      errorMessage.includes('plugin') && errorMessage.includes('not found');
    
    // If tool was detected as installed but run failed with "not found" error,
    // flag that detection was incorrect
    if (isInstalled && suggestsNotInstalled) {
      try {
        const { flagDetectionFailed } = await import('../utils/config.js');
        await flagDetectionFailed(toolId);
        console.log(chalk.yellow(`\n⚠️  Detection was incorrect - ${tool.name} is not actually installed.`));
        console.log(chalk.yellow('Please install the tool and try again.'));
      } catch (configError) {
        // Silently fail - config recording is optional
      }
    }
    
    // If validation error suggests plugin issue, provide helpful message
    if (suggestsPluginIssue && tool.installation?.package) {
      const packages = tool.installation.package.split(' ').filter(p => p.trim());
      if (packages.length > 1) {
        console.log(chalk.yellow(`\n⚠️  Validation error detected. This may indicate a missing plugin.`));
        console.log(chalk.yellow(`Please verify all required packages are installed:`));
        packages.forEach(pkg => {
          console.log(chalk.white(`  - ${pkg}`));
        });
        console.log(chalk.yellow(`\nReinstall with: ${tool.installation.command || tool.installation.instructions}`));
      }
    }
    
    // Record error in config
    try {
      const { recordToolError } = await import('../utils/config.js');
      await recordToolError(toolId, error);
    } catch (configError) {
      // Silently fail - config recording is optional
      console.error('Failed to record tool error in config:', configError);
    }
    
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

async function runGenericTool(url: string, options: AnalyzeOptions, tool: AnalysisTool, customExecCommand?: string | string[] | null): Promise<any> {
  // Use custom execution command if provided, otherwise use default
  if (customExecCommand) {
    // Custom command can be a string or array
    if (typeof customExecCommand === 'string') {
      // Single string command - replace {url} placeholder and execute
      const command = customExecCommand.replace('{url}', url);
      // Parse command string into executable and args
      const parts = command.split(' ').filter(p => p.trim());
      const executable = parts[0];
      const args = parts.slice(1);
      
      const result = await execa(executable, args, {
        stdio: 'pipe'
      });
      
      if (tool.command.outputFormat === 'json') {
        return JSON.parse(result.stdout);
      } else if (tool.command.outputFormat === 'yaml') {
        return yaml.load(result.stdout);
      } else {
        return { output: result.stdout };
      }
    } else {
      // Array of command parts - first is executable, rest are args
      const executable = customExecCommand[0];
      const args = customExecCommand.slice(1).map(arg => arg.replace('{url}', url));
      
      const result = await execa(executable, args, {
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
  }
  
  // Default command execution
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

async function runImpactFramework(url: string, options: AnalyzeOptions, tool: AnalysisTool, customExecCommand?: string | string[] | null): Promise<any> {
  // Check if tool has manifest template
  if (!tool.manifestTemplate) {
    throw new Error(`Tool ${tool.id} does not have a manifest template configured`);
  }

  // Note: Package verification is now handled by explicit detection commands in tools.json
  // If we reach here, the tool was detected as installed, so packages should be available

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
  
  // Build parameter values map from tool configuration
  const parameterValues: Record<string, any> = {};
  
  // Process parameters from tool definition
  if (tool.parameters) {
    for (const param of tool.parameters) {
      const placeholderName = param.placeholder || param.name;
      const paramValue = (options as any)[param.name];
      const defaultValue = param.default ?? tool.parameterDefaults?.[param.name] ?? co2Variables.monitoringConfig?.[param.name];
      
      // Get value with fallback chain: options -> assessment data -> tool default -> parameter default
      let value = paramValue ?? co2Variables.monitoringConfig?.[param.name] ?? defaultValue;
      
      // Handle special case: url parameter
      if (param.name === 'url') {
        value = url;
      }
      
      // Ensure type correctness
      if (param.type === 'boolean') {
        value = Boolean(value ?? false);
      } else if (param.type === 'number') {
        value = Number(value ?? 0);
      }
      
      parameterValues[placeholderName] = value;
    }
  }
  
  // Process parameter mappings (derived/computed values)
  if (tool.parameterMappings) {
    for (const [mappedName, mapping] of Object.entries(tool.parameterMappings)) {
      if (mapping.source && parameterValues[mapping.source] !== undefined) {
        let value: any;
        if (mapping.transform) {
          // Simple transform: "1 - {source}" -> 1 - parameterValues[source]
          value = eval(mapping.transform.replace(/\{source\}/g, String(parameterValues[mapping.source])));
        } else {
          value = parameterValues[mapping.source];
        }
        
        // Ensure type correctness
        if (mapping.type === 'boolean') {
          value = Boolean(value);
        } else if (mapping.type === 'number') {
          value = Number(value);
        }
        
        parameterValues[mappedName] = value;
      }
    }
  }

  // Replace placeholders in manifest with parameter values
  const replacePlaceholders = (obj: any): any => {
    if (typeof obj === 'string') {
      // Check for exact placeholder matches first
      for (const [placeholderName, value] of Object.entries(parameterValues)) {
        if (obj === `{${placeholderName}}`) {
          return value;
        }
      }
      // Fallback to string replacement for partial matches
      let result = obj;
      for (const [placeholderName, value] of Object.entries(parameterValues)) {
        result = result.replace(`{${placeholderName}}`, String(value));
      }
      return result;
    } else if (Array.isArray(obj)) {
      return obj.map(replacePlaceholders);
    } else if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // If value is exactly a placeholder, replace with proper type
        if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
          const placeholderName = value.slice(1, -1);
          if (parameterValues[placeholderName] !== undefined) {
            result[key] = parameterValues[placeholderName];
          } else {
            result[key] = replacePlaceholders(value);
          }
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

  const manifestPath = path.join(tempDir, 'manifest.yml');
  const outputPath = path.join(tempDir, 'output.yml');
  
  fs.writeFileSync(manifestPath, yaml.dump(processedManifest));

  // Run Impact Framework analysis
  // Use the tool's command configuration (supports both 'if-run' and 'npx --package=@grnsft/if if-run')
  const executable = tool.command.executable;
  const baseArgs = tool.command.args || [];
  
  // Replace placeholders in args
  const args = baseArgs.map((arg: string) => 
    arg.replace('{manifest}', manifestPath).replace('{output}', outputPath)
  );
  
  let ifRunResult;
  try {
    ifRunResult = await execa(executable, args, {
      stdio: 'pipe',
      reject: false // Don't throw on non-zero exit, we'll check the output file
    });
  } catch (error: any) {
    // If execa throws, capture what we can
    const errorMessage = error.message || String(error);
    const stdout = error.stdout?.toString() || '';
    const stderr = error.stderr?.toString() || '';
    throw new Error(
      `Failed to run if-run: ${errorMessage}\n` +
      (stdout ? `if-run stdout: ${stdout}\n` : '') +
      (stderr ? `if-run stderr: ${stderr}` : '')
    );
  }

  // Check if output file exists
  if (!fs.existsSync(outputPath)) {
    const exitCode = ifRunResult.exitCode || 0;
    const stdout = ifRunResult.stdout?.toString() || '';
    const stderr = ifRunResult.stderr?.toString() || '';
    
    // Try to extract validation errors from stdout/stderr
    let validationError = '';
    const errorPatterns = [
      /InputValidationError[:\s]+([^\n]+)/i,
      /ValidationError[:\s]+([^\n]+)/i,
      /Error[:\s]+([^\n]+)/i,
      /expected\s+(\w+),\s+received\s+(\w+)/i,
      /parameter\s+["']?(\w+)["']?\s+is\s+expected\s+(\w+),\s+received\s+(\w+)/i
    ];
    
    const allOutput = stdout + '\n' + stderr;
    for (const pattern of errorPatterns) {
      const match = allOutput.match(pattern);
      if (match) {
        validationError = match[0];
        break;
      }
    }
    
    // Build error message with validation error if found
    let errorMessage = `Output file not created at ${outputPath}\n`;
    errorMessage += `if-run exit code: ${exitCode}\n`;
    
    if (validationError) {
      errorMessage += `\nValidation Error: ${validationError}\n`;
    }
    
    if (stdout) {
      errorMessage += `\nif-run stdout:\n${stdout}\n`;
    }
    
    if (stderr) {
      errorMessage += `\nif-run stderr:\n${stderr}`;
    }
    
    throw new Error(errorMessage);
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
