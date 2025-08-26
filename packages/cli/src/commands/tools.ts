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

async function listTools() {
  const registry = getToolRegistry();
  await registry.refreshInstalledTools();
  
  console.log(chalk.blue('🛠️  Analysis Tools Registry'));
  console.log('═'.repeat(50));
  
  const installedTools = registry.getInstalledTools();
  const allTools = registry.getAllTools();
  
  if (installedTools.length > 0) {
    console.log(chalk.green('\n✅ Installed Tools:'));
    installedTools.forEach(tool => {
      console.log(`  ${chalk.white(tool.id)} - ${chalk.cyan(tool.name)}`);
      if (tool.description) {
        console.log(`    ${chalk.gray(tool.description)}`);
      }
      console.log(`    ${chalk.dim('Usage:')} carbonara analyze ${tool.id} <url>`);
    });
  }
  
  const notInstalledTools = allTools.filter(t => !registry.isToolInstalled(t.id));
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
  
  if (registry.isToolInstalled(toolId)) {
    console.log(chalk.green(`✅ Tool '${tool.name}' is already installed`));
    return;
  }
  
  const spinner = ora(`Installing ${tool.name}...`).start();
  
  try {
    const success = await registry.installTool(toolId);
    
    if (success) {
      spinner.succeed(`${tool.name} installed successfully!`);
      console.log(chalk.green(`\n✅ You can now use: carbonara analyze ${toolId} <url>`));
    } else {
      spinner.fail(`Failed to install ${tool.name}`);
      console.log(chalk.yellow('\n💡 Try installing manually:'));
      console.log(chalk.white(tool.installation.instructions));
    }
  } catch (error: any) {
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
    
    const installedCount = registry.getInstalledTools().length;
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