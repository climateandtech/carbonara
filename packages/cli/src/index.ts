#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { assessCommand } from './commands/assess.js';
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
  .command('data')
  .description('Manage data lake')
  .option('-l, --list', 'List all stored data')
  .option('-s, --show', 'Show detailed project analysis')
  .option('-e, --export <format>', 'Export data (json|csv)')
  .option('-j, --json', 'Output raw JSON to stdout')
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