#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import { initCommand } from "./commands/init.js";
import { assessCommand } from "./commands/assess.js";
import { greenframeCommand } from "./commands/greenframe.js";
import { megalinterCommand } from "./commands/megalinter.js";
import { dataCommand } from "./commands/data.js";
import packageJson from "../package.json" with { type: "json" };

const { version } = packageJson;

program
  .name("carbonara")
  .description("CLI tool for CO2 assessment and sustainability tooling")
  .version(version);

program
  .command("init")
  .description("Initialize a new Carbonara project")
  .option("-p, --path <path>", "Project path", ".")
  .action(initCommand);

program
  .command("assess")
  .description("Run CO2 assessment questionnaire")
  .option("-i, --interactive", "Interactive mode", true)
  .option("-f, --file <file>", "Load from configuration file")
  .action(assessCommand);

program
  .command("greenframe")
  .description("Run Greenframe web analysis")
  .argument("<url>", "URL to analyze")
  .option("-s, --save", "Save results to data lake")
  .option("-o, --output <format>", "Output format (json|table)", "table")
  .action(greenframeCommand);

program
  .command("megalinter")
  .description("Run MegaLinter code analysis")
  .option("-s, --save", "Save results to data lake")
  .option("-o, --output <format>", "Output format (json|table)", "table")
  .option("-f, --fix", "Apply automatic fixes")
  .action(megalinterCommand);

program
  .command("data")
  .description("Manage data lake")
  .option("-l, --list", "List all stored data")
  .option("-e, --export <format>", "Export data (json|csv)")
  .option("-c, --clear", "Clear all data")
  .action(dataCommand);

program.on("command:*", () => {
  console.error(chalk.red(`Invalid command: ${program.args.join(" ")}`));
  console.log(chalk.yellow("See --help for a list of available commands."));
  process.exit(1);
});

if (process.argv.length === 2) {
  program.help();
}

program.parse();
