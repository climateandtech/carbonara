#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { assessCommand } from './commands/assess.js';
import { analyzeCommand } from './commands/analyze.js';
import { toolsCommand } from './commands/tools.js';
import { dataCommand } from './commands/data.js';
import { importCommand } from './commands/import.js';
import packageJson from '../package.json' with { type: 'json' };

const { version } = packageJson;

program
  .name('carbonara')
  .description('CLI tool for CO2 assessment and sustainability tooling')
  .version(version);

program
  .command('init')
  .description('Initialize a new Carbonara project')
  .option('-p, --path <path>', 'Project path', '.')
  .action(initCommand);

program
  .command('assess')
  .description('Run CO2 assessment questionnaire')
  .option('-i, --interactive', 'Interactive mode', true)
  .option('-f, --file <file>', 'Load from configuration file')
  .action(assessCommand);

program
  .command('analyze')
  .description('Run carbon analysis with specified tool')
  .argument('<tool>', 'Analysis tool to use (greenframe, impact-framework, etc.)')
  .argument('<url>', 'URL to analyze')
  .option('-s, --save', 'Save results to data lake')
  .option('-o, --output <format>', 'Output format (json|table)', 'table')
  .option('--scroll-to-bottom', 'Scroll to bottom of page during analysis (Impact Framework)')
  .action(analyzeCommand);

program
  .command('tools')
  .description('Manage analysis tools')
  .option('-l, --list', 'List all available tools')
  .option('-i, --install <tool>', 'Install an analysis tool')
  .option('-u, --uninstall <tool>', 'Show uninstall instructions for a tool')
  .option('-r, --refresh', 'Refresh tool installation status')
  .action(toolsCommand);

program
  .command('data')
  .description('Manage data lake')
  .option('-l, --list', 'List all stored data')
  .option('-s, --show', 'Show detailed project analysis')
  .option('-e, --export <format>', 'Export data (json|csv)')
  .option('-c, --clear', 'Clear all data')
  .action(dataCommand);

program
  .command('import')
  .description('Import analysis data from files or databases')
  .option('-f, --file <path>', 'Import from JSON/CSV file')
  .option('-d, --database <path>', 'Import from another Carbonara database')
  .option('--format <format>', 'Force file format (json|csv)')
  .option('-m, --merge', 'Merge with existing data (default)', true)
  .option('-o, --overwrite', 'Overwrite duplicate records')
  .action(importCommand);

program.on('command:*', () => {
  console.error(chalk.red('Invalid command: %s\nSee --help for a list of available commands.'), program.args.join(' '));
  process.exit(1);
});

program.parse();