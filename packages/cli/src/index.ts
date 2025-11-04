#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import { initCommand } from "./commands/init.js";
import { assessCommand } from "./commands/assess.js";
import { dataCommand } from "./commands/data.js";
import { analyzeCommand } from "./commands/analyze.js";
import { toolsCommand } from "./commands/tools.js";
import { semgrepCommand } from "./commands/semgrep.js";

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
  .command("data")
  .description("Manage data lake")
  .option("-l, --list", "List all stored data")
  .option("-s, --show", "Show detailed project analysis")
  .option("-e, --export <format>", "Export data (json|csv)")
  .option("-j, --json", "Output raw JSON to stdout")
  .option("-c, --clear", "Clear all data")
  .action(dataCommand);

program
  .command("analyze")
  .description("Run analysis with specified tool")
  .argument("<tool>", "Analysis tool to use")
  .argument("<target>", "URL or directory path to analyze (depends on tool)")
  .option("-s, --save", "Save results to data lake")
  .option("-o, --output <format>", "Output format (json|table)", "table")
  .option("--timeout <ms>", "Analysis timeout in milliseconds", "30000")
  .action(analyzeCommand);

const toolsCmd = program
  .command("tools")
  .description("Manage analysis tools");

toolsCmd
  .command("list")
  .description("List all available tools")
  .action(() => toolsCommand({ list: true }));

toolsCmd
  .command("install <tool>")
  .description("Install analysis tool")
  .action((tool) => toolsCommand({ install: tool }));

toolsCmd
  .command("uninstall <tool>")
  .description("Uninstall analysis tool")
  .action((tool) => toolsCommand({ uninstall: tool }));

toolsCmd
  .command("refresh")
  .description("Refresh tool installation status")
  .action(() => toolsCommand({ refresh: true }));

// Keep the old option-based interface for backward compatibility
toolsCmd
  .option("-l, --list", "List all available tools")
  .option("-i, --install <tool>", "Install analysis tool")
  .option("-u, --uninstall <tool>", "Uninstall analysis tool")
  .option("-r, --refresh", "Refresh tool installation status")
  .action(toolsCommand);

program
  .command("semgrep [target]")
  .description("Run Semgrep static analysis on files or directories")
  .option("-o, --output <format>", "Output format: table, json, sarif", "table")
  .option("-r, --rule-file <file>", "Use specific rule file")
  .option("-s, --severity <level>", "Filter by severity: error, warning, info")
  .option("--save", "Save results to file")
  .option("--fix", "Apply available fixes (experimental)")
  .option("--bundled", "Use bundled Python environment")
  .option("--setup", "Setup bundled Semgrep environment")
  .option("--list-rules", "List available rules")
  .action(semgrepCommand);

program.on("command:*", () => {
  console.error(
    chalk.red(
      "Invalid command: %s\nSee --help for a list of available commands."
    ),
    program.args.join(" ")
  );
  process.exit(1);
});

program.parse();
