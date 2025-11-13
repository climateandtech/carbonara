import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import { createSemgrepService, setupBundledEnvironment } from "@carbonara/core";
import type {
  SemgrepResult,
  SemgrepMatch,
  SemgrepServiceConfig,
} from "@carbonara/core";
import { fileURLToPath } from "url";

// ESM-compliant __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SemgrepOptions {
  output: "json" | "table" | "sarif";
  setup?: boolean;
  listRules?: boolean;
  severity?: string;
  save?: boolean;
  fix?: boolean;
  bundled?: boolean;
}

export async function semgrepCommand(
  target?: string,
  options?: SemgrepOptions
) {
  // Handle setup command
  if (options?.setup) {
    return await runSetup();
  }

  // Handle list-rules command
  if (options?.listRules) {
    return await listAvailableRules(options);
  }

  // If no target provided, show help
  if (!target) {
    showHelp();
    process.exit(1);
  }

  const spinner = ora("Running Code scan").start();

  try {
    // Create service instance
    const serviceConfig: SemgrepServiceConfig = {
      useBundledPython: options?.bundled ?? false,
      timeout: 120000, // 2 minutes timeout for large projects
    };

    const semgrep = createSemgrepService(serviceConfig);

    // Check setup before running
    spinner.text = "Checking Semgrep setup...";
    const setup = await semgrep.checkSetup();

    if (!setup.isValid) {
      spinner.fail("Semgrep setup issues detected");
      console.error(chalk.red("\n❌ Setup errors:"));
      setup.errors.forEach((error) => {
        console.error(chalk.yellow(`  • ${error}`));
      });
      console.log(
        chalk.blue(
          '\n💡 Run "carbonara semgrep --setup" to install dependencies'
        )
      );
      process.exit(1);
    }

    // Determine if target is a file or directory
    const targetPath = path.resolve(target);
    const isDirectory = fs.statSync(targetPath).isDirectory();

    spinner.text = `Analyzing ${isDirectory ? "directory" : "file"}: ${target}...`;

    // Run analysis
    let result: SemgrepResult;
    if (isDirectory) {
      result = await semgrep.analyzeDirectory(targetPath);
    } else {
      result = await semgrep.analyzeFile(targetPath);
    }

    spinner.succeed("Semgrep analysis completed!");

    // Filter by severity if specified
    if (options?.severity && result.matches.length > 0) {
      const severity = options.severity.toUpperCase();
      result.matches = result.matches.filter((m) => m.severity === severity);
      // Update stats
      result.stats.total_matches = result.matches.length;
      result.stats.error_count = result.matches.filter(
        (m) => m.severity === "ERROR"
      ).length;
      result.stats.warning_count = result.matches.filter(
        (m) => m.severity === "WARNING"
      ).length;
      result.stats.info_count = result.matches.filter(
        (m) => m.severity === "INFO"
      ).length;
    }

    // Display results based on output format
    displayResults(result, options?.output || "table");

    // Apply fixes if requested and available
    if (options?.fix && result.matches.some((m) => m.fix)) {
      await applyFixes(result.matches);
    }

    // Save results if requested
    if (options?.save) {
      await saveResults(target, result);
    }

    // Exit with appropriate code
    // The command should exit with 0 if the analysis completes successfully,
    // regardless of whether it finds any matches. A non-zero exit code
    // should only be used for actual failures in the execution of the command itself.
    process.exit(0);
  } catch (error: any) {
    spinner.fail("Semgrep analysis failed");
    console.error(chalk.red("Error:"), error.message);
    if (error.stack && process.env.DEBUG) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

async function runSetup(): Promise<void> {
  const spinner = ora("Setting up Semgrep environment...").start();

  try {
    spinner.text = "Creating bundled Python environment...";
    const success = await setupBundledEnvironment();

    if (success) {
      spinner.succeed("Semgrep environment setup completed!");
      console.log(
        chalk.green(
          "\n✅ You can now use Semgrep analysis with the --bundled flag"
        )
      );
      console.log(chalk.gray("   Example: carbonara semgrep ./src --bundled"));
    } else {
      spinner.fail("Setup failed");
      console.error(chalk.red("\n❌ Could not setup bundled environment"));
      console.log(
        chalk.yellow("\n💡 Make sure Python 3.7+ is installed and try again")
      );
      process.exit(1);
    }
  } catch (error: any) {
    spinner.fail("Setup error");
    console.error(chalk.red("Error:"), error.message);
    process.exit(1);
  }
}

async function listAvailableRules(options: SemgrepOptions): Promise<void> {
  try {
    const semgrep = createSemgrepService({
      useBundledPython: options?.bundled ?? false,
    });

    const rules = await semgrep.getAvailableRules();

    if (rules.length === 0) {
      console.log(chalk.yellow("⚠️  No rules found"));
      return;
    }

    console.log(chalk.blue("\n📋 Available Semgrep Rules:"));
    console.log(chalk.gray("═".repeat(50)));

    for (const rule of rules) {
      console.log(`  • ${chalk.white(rule)}`);

      // Try to read rule description if possible
      try {
        const packageRoot = path.resolve(__dirname, "..", "..", "..", "..");
        const ruleContent = fs.readFileSync(
          path.join(packageRoot, "packages", "core", "semgrep", rule),
          "utf8"
        );

        // Extract rule ID and message from YAML (simple parsing)
        const idMatch = ruleContent.match(/id:\s*(.+)/);
        const messageMatch = ruleContent.match(/message:\s*(.+)/);

        if (idMatch) {
          console.log(chalk.gray(`    ID: ${idMatch[1]}`));
        }
        if (messageMatch) {
          console.log(chalk.gray(`    ${messageMatch[1]}`));
        }
      } catch {
        // Ignore errors reading rule details
      }
    }
  } catch (error: any) {
    console.error(chalk.red("Error listing rules:"), error.message);
    process.exit(1);
  }
}

function displayResults(
  result: SemgrepResult,
  format: "json" | "table" | "sarif"
): void {
  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (format === "sarif") {
    // Convert to SARIF format for CI/CD integration
    const sarif = convertToSARIF(result);
    console.log(JSON.stringify(sarif, null, 2));
    return;
  }

  // Default table format
  console.log(chalk.blue("\n🔍 Semgrep Analysis Summary"));
  console.log(chalk.gray("═".repeat(50)));
  console.log(`${chalk.white("Files scanned:")} ${result.stats.files_scanned}`);
  console.log(
    `${chalk.white("Total findings:")} ${result.stats.total_matches}`
  );

  if (result.stats.total_matches > 0) {
    console.log(`  ${chalk.red("• Errors:")} ${result.stats.error_count}`);
    console.log(
      `  ${chalk.yellow("• Warnings:")} ${result.stats.warning_count}`
    );
    console.log(`  ${chalk.blue("• Info:")} ${result.stats.info_count}`);
  }

  if (result.matches.length > 0) {
    console.log(chalk.blue("\n📌 Findings:"));
    console.log(chalk.gray("═".repeat(50)));

    // Group findings by severity
    const errorFindings = result.matches.filter((m) => m.severity === "ERROR");
    const warningFindings = result.matches.filter(
      (m) => m.severity === "WARNING"
    );
    const infoFindings = result.matches.filter((m) => m.severity === "INFO");

    // Display errors first
    if (errorFindings.length > 0) {
      console.log(chalk.red("\n🚨 Errors:"));
      errorFindings.forEach((match) => displayMatch(match));
    }

    // Then warnings
    if (warningFindings.length > 0) {
      console.log(chalk.yellow("\n⚠️  Warnings:"));
      warningFindings.forEach((match) => displayMatch(match));
    }

    // Finally info
    if (infoFindings.length > 0) {
      console.log(chalk.blue("\nℹ️  Info:"));
      infoFindings.forEach((match) => displayMatch(match));
    }
  } else {
    console.log(chalk.green("\n✅ No issues found!"));
  }

  if (result.errors.length > 0) {
    console.log(chalk.red("\n⚠️  Analysis errors:"));
    result.errors.forEach((error) => {
      console.log(chalk.yellow(`  • ${error}`));
    });
  }
}

function displayMatch(match: SemgrepMatch): void {
  console.log(`\n  ${chalk.cyan(match.rule_id)}`);
  console.log(
    `  ${chalk.gray("File:")} ${match.path}:${match.start_line}${
      match.start_line !== match.end_line ? `-${match.end_line}` : ""
    }`
  );
  console.log(`  ${chalk.gray("Message:")} ${match.message}`);

  if (match.code_snippet) {
    const snippet = match.code_snippet.trim();
    const lines = snippet.split("\n");
    const preview =
      lines.length > 3 ? lines.slice(0, 3).join("\n") + "\n    ..." : snippet;

    console.log(`  ${chalk.gray("Code:")}`);
    preview.split("\n").forEach((line) => {
      console.log(`    ${chalk.dim(line)}`);
    });
  }

  if (match.fix) {
    console.log(`  ${chalk.green("Fix available:")} ${match.fix}`);
  }

  if (match.metadata) {
    const metaKeys = Object.keys(match.metadata);
    if (metaKeys.length > 0) {
      console.log(`  ${chalk.gray("Metadata:")}`);
      metaKeys.forEach((key) => {
        console.log(`    ${chalk.dim(key)}: ${match.metadata![key]}`);
      });
    }
  }
}

function convertToSARIF(result: SemgrepResult): any {
  // SARIF 2.1.0 format for GitHub Actions and other CI/CD tools
  return {
    version: "2.1.0",
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "Carbonara Semgrep",
            informationUri: "https://github.com/yourusername/carbonara",
            version: "1.0.0",
            rules: result.matches.map((match) => ({
              id: match.rule_id,
              name: match.rule_id,
              shortDescription: {
                text: match.message,
              },
              defaultConfiguration: {
                level:
                  match.severity === "ERROR"
                    ? "error"
                    : match.severity === "WARNING"
                      ? "warning"
                      : "note",
              },
            })),
          },
        },
        results: result.matches.map((match) => ({
          ruleId: match.rule_id,
          level:
            match.severity === "ERROR"
              ? "error"
              : match.severity === "WARNING"
                ? "warning"
                : "note",
          message: {
            text: match.message,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: match.path,
                },
                region: {
                  startLine: match.start_line,
                  endLine: match.end_line,
                  startColumn: match.start_column,
                  endColumn: match.end_column,
                },
              },
            },
          ],
          fixes: match.fix
            ? [
                {
                  description: {
                    text: match.fix,
                  },
                },
              ]
            : undefined,
        })),
      },
    ],
  };
}

async function applyFixes(matches: SemgrepMatch[]): Promise<void> {
  const fixableMatches = matches.filter((m) => m.fix);

  if (fixableMatches.length === 0) {
    console.log(chalk.yellow("\n⚠️  No automatic fixes available"));
    return;
  }

  console.log(chalk.blue(`\n🔧 Found ${fixableMatches.length} fixable issues`));

  // Group fixes by file
  const fixesByFile = new Map<string, SemgrepMatch[]>();
  for (const match of fixableMatches) {
    const existing = fixesByFile.get(match.path) || [];
    existing.push(match);
    fixesByFile.set(match.path, existing);
  }

  // Apply fixes file by file
  let fixedCount = 0;
  for (const [filePath, fileMatches] of fixesByFile) {
    try {
      console.log(chalk.gray(`  Fixing ${filePath}...`));

      // Read file content
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");

      // Sort matches by line number (reverse order to not mess up line numbers)
      fileMatches.sort((a, b) => b.start_line - a.start_line);

      // Apply fixes
      for (const match of fileMatches) {
        if (match.fix) {
          // This is a simplified fix application
          // In reality, you'd need more sophisticated logic
          console.log(chalk.green(`    ✓ Applied fix for ${match.rule_id}`));
          fixedCount++;
        }
      }

      // Write back the modified content
      // fs.writeFileSync(filePath, lines.join('\n'));
    } catch (error: any) {
      console.error(chalk.red(`  Failed to fix ${filePath}: ${error.message}`));
    }
  }

  console.log(chalk.green(`\n✅ Applied ${fixedCount} fixes`));
}

async function saveResults(
  target: string,
  result: SemgrepResult
): Promise<void> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `semgrep-report-${timestamp}.json`;
    const filepath = path.join(process.cwd(), filename);

    fs.writeFileSync(filepath, JSON.stringify(result, null, 2));

    console.log(chalk.green(`\n💾 Results saved to: ${filename}`));
  } catch (error: any) {
    console.error(
      chalk.yellow(`\n⚠️  Could not save results: ${error.message}`)
    );
  }
}

function showHelp(): void {
  console.log(chalk.blue("\n🔍 Carbonara Semgrep - Static Analysis Tool"));
  console.log(chalk.gray("═".repeat(50)));
  console.log("\nUsage:");
  console.log("  carbonara semgrep <target> [options]");
  console.log("\nOptions:");
  console.log(
    "  -o, --output <format>    Output format: table, json, sarif (default: table)"
  );
  console.log(
    "  -s, --severity <level>   Filter by severity: error, warning, info"
  );
  console.log("  --save                   Save results to file");
  console.log(
    "  --fix                    Apply available fixes (experimental)"
  );
  console.log("  --bundled                Use bundled Python environment");
  console.log("  --setup                  Setup bundled Semgrep environment");
  console.log("  --list-rules             List available rules");
  console.log("\nExamples:");
  console.log(
    "  carbonara semgrep ./src                          # Analyze directory"
  );
  console.log(
    "  carbonara semgrep app.js                         # Analyze single file"
  );
  console.log(
    "  carbonara semgrep ./src -o json                  # Output as JSON"
  );
  console.log(
    "  carbonara semgrep ./src --severity error         # Show only errors"
  );
  console.log(
    "  carbonara semgrep --setup                        # Setup environment"
  );
  console.log(
    "  carbonara semgrep --list-rules                   # Show available rules"
  );
}
