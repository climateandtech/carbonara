import chalk from 'chalk';
import ora from 'ora';
import { getToolRegistry } from '../registry/index.js';

interface ToolsOptions {
  list?: boolean;
  install?: string;
  uninstall?: string;
  refresh?: boolean;
}

export async function toolsCommand(options: ToolsOptions) {
  const registry = getToolRegistry();

  if (options.list) {
    await listTools();
  } else if (options.install) {
    await installTool(options.install);
  } else if (options.uninstall) {
    await uninstallTool(options.uninstall);
  } else if (options.refresh) {
    await refreshTools();
  } else {
    // Show help
    showToolsHelp();
  }
}

export async function listTools() {
  const registry = getToolRegistry();
  
  console.log(chalk.blue('🛠️  Analysis Tools Registry'));
  console.log('═'.repeat(50));
  
  const installedTools = await registry.getInstalledTools();
  const allTools = registry.getAllTools();
  
  if (installedTools.length > 0) {
    console.log(chalk.green('\n✅ Installed Tools:'));
    for (const tool of installedTools) {
      // Check prerequisites
      const prereqCheck = await registry.checkToolPrerequisites(tool.id);
      const hasMissingPrereqs = !prereqCheck.allAvailable;
      
      if (hasMissingPrereqs) {
        console.log(`  ${chalk.white(tool.id)} - ${chalk.cyan(tool.name)} ${chalk.yellow('⚠️  Prerequisites missing')}`);
      } else {
        console.log(`  ${chalk.white(tool.id)} - ${chalk.cyan(tool.name)}`);
      }
      
      if (tool.description) {
        console.log(`    ${chalk.gray(tool.description)}`);
      }
      
      // Show missing prerequisites
      if (hasMissingPrereqs) {
        prereqCheck.missing.forEach(({ prerequisite }) => {
          console.log(`    ${chalk.yellow('⚠️  Missing:')} ${chalk.white(prerequisite.name)}`);
          if (prerequisite.setupInstructions) {
            console.log(`       ${chalk.dim(prerequisite.setupInstructions)}`);
          } else if (prerequisite.installCommand) {
            console.log(`       ${chalk.dim('Run:')} ${chalk.white(prerequisite.installCommand)}`);
          }
        });
      }
      
      // Use the first parameter name from the tool's parameters, or default to 'url'
      let paramDisplay = '<url>';
      if (tool.parameters && tool.parameters.length > 0) {
        const param = tool.parameters[0];
        // Show optional parameters in brackets [param] and required in angle brackets <param>
        paramDisplay = param.required ? `<${param.name}>` : `[${param.name}]`;
      }
      console.log(`    ${chalk.dim('Usage:')} carbonara analyze ${tool.id} ${paramDisplay}`);
    }
  }
  
  const notInstalledTools = [];
  for (const tool of allTools) {
    if (!(await registry.isToolInstalled(tool.id))) {
      notInstalledTools.push(tool);
    }
  }
  if (notInstalledTools.length > 0) {
    console.log(chalk.yellow('\n⚠️  Available Tools (not installed):'));
    notInstalledTools.forEach(tool => {
      console.log(`  ${chalk.white(tool.id)} - ${chalk.cyan(tool.name)}`);
      if (tool.description) {
        console.log(`    ${chalk.gray(tool.description)}`);
      }
      console.log(`    ${chalk.dim('Install:')} carbonara tools install ${tool.id}`);
      console.log(`    ${chalk.dim('Manual:')} ${tool.installation.instructions}`);
    });
  }
  
  if (allTools.length === 0) {
    console.log(chalk.yellow('\n⚠️  No tools registered'));
  }
  
  console.log(chalk.blue('\n💡 Commands:'));
  console.log('  carbonara tools list              - List all tools');
  console.log('  carbonara tools install <tool>    - Install a tool');
  console.log('  carbonara tools refresh           - Refresh installation status');
  console.log('  carbonara analyze <tool> <url>    - Run analysis');
}

async function installTool(toolId: string) {
  const registry = getToolRegistry();
  const tool = registry.getTool(toolId);
  
  if (!tool) {
    console.error(chalk.red(`❌ Tool '${toolId}' not found in registry`));
    console.log(chalk.yellow('\n📋 Available tools:'));
    registry.getAllTools().forEach(t => {
      console.log(`  ${t.id} - ${t.name}`);
    });
    process.exit(1);
  }
  
  if (await registry.isToolInstalled(toolId)) {
    console.log(chalk.green(`✅ Tool '${tool.name}' is already installed`));
    return;
  }
  
  const spinner = ora(`Installing ${tool.name}...`).start();
  
  try {
    const success = await registry.installTool(toolId);
    
    // Log installation attempt
    try {
      const { logToolAction } = await import('../utils/tool-logger.js');
      const installCommand = tool.installation?.type === 'npm' 
        ? `npm install ${tool.installation.global ? '-g' : ''} ${tool.installation.package}`
        : tool.installation?.instructions || 'Unknown';
      
      await logToolAction({
        timestamp: new Date().toISOString(),
        toolId,
        action: success ? 'install' : 'error',
        command: installCommand,
        exitCode: success ? 0 : 1,
        error: success ? undefined : 'Installation failed',
      });
    } catch (logError) {
      // Silently fail - logging is optional
    }
    
    if (success) {
      spinner.succeed(`${tool.name} installed successfully!`);
      console.log(chalk.green(`\n✅ You can now use: carbonara analyze ${toolId} <url>`));
      
      // Mark as installed in config (even if detection fails later)
      try {
        const { markToolInstalled } = await import('../utils/config.js');
        await markToolInstalled(toolId);
      } catch (configError) {
        // Silently fail - config recording is optional
        console.error('Failed to mark tool as installed in config:', configError);
      }
    } else {
      spinner.fail(`Failed to install ${tool.name}`);
      console.log(chalk.yellow('\n💡 Try installing manually:'));
      console.log(chalk.white(tool.installation.instructions));
    }
  } catch (error: any) {
    // Log installation error
    try {
      const { logToolAction } = await import('../utils/tool-logger.js');
      await logToolAction({
        timestamp: new Date().toISOString(),
        toolId,
        action: 'error',
        error: error.message,
      });
    } catch (logError) {
      // Silently fail - logging is optional
    }
    
    spinner.fail(`Installation failed: ${error.message}`);
    console.log(chalk.yellow('\n💡 Try installing manually:'));
    console.log(chalk.white(tool.installation.instructions));
  }
}

async function uninstallTool(toolId: string) {
  const registry = getToolRegistry();
  const tool = registry.getTool(toolId);
  
  if (!tool) {
    console.error(chalk.red(`❌ Tool '${toolId}' not found in registry`));
    process.exit(1);
  }
  
  console.log(chalk.yellow(`⚠️  Uninstalling tools must be done manually:`));
  
  switch (tool.installation.type) {
    case 'npm':
      console.log(chalk.white(`npm uninstall -g ${tool.installation.package}`));
      break;
    case 'pip':
      console.log(chalk.white(`pip uninstall ${tool.installation.package}`));
      break;
    default:
      console.log(chalk.white('Check the tool\'s documentation for uninstall instructions'));
  }
  
  console.log(chalk.gray('\nRun "carbonara tools refresh" after uninstalling'));
}

async function refreshTools() {
  const registry = getToolRegistry();
  const spinner = ora('Refreshing tool installation status...').start();
  
  try {
    await registry.refreshInstalledTools();
    spinner.succeed('Tool status refreshed!');
    
    const installedCount = (await registry.getInstalledTools()).length;
    const totalCount = registry.getAllTools().length;
    
    console.log(chalk.blue(`\n📊 Status: ${installedCount}/${totalCount} tools installed`));
    console.log(chalk.gray('Run "carbonara tools list" to see details'));
  } catch (error: any) {
    spinner.fail(`Failed to refresh: ${error.message}`);
  }
}

function showToolsHelp() {
  console.log(chalk.blue('🛠️  Analysis Tools Management'));
  console.log('');
  console.log('Available commands:');
  console.log('  carbonara tools list                    - List all available tools');
  console.log('  carbonara tools install <tool-id>       - Install an analysis tool');
  console.log('  carbonara tools uninstall <tool-id>     - Show uninstall instructions');
  console.log('  carbonara tools refresh                 - Refresh installation status');
  console.log('');
  console.log('Usage examples:');
  console.log('  carbonara tools list');
  console.log('  carbonara tools install greenframe');
  console.log('  carbonara tools install impact-framework');
  console.log('  carbonara analyze greenframe https://example.com');
  console.log('  carbonara analyze impact-framework https://example.com');
}