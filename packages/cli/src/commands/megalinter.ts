import { execa } from "execa";
import chalk from "chalk";
import ora from "ora";
import { createDataLake } from "../database";
import { loadProjectConfig } from "../utils/config";
interface MegalinterOptions {
  save: boolean;
  output: "json" | "table";
  flavor?: string;
  env?: string;
}
export async function megalinterCommand(options: MegalinterOptions) {
  const spinner = ora("Running MegaLinter analysis...").start();
  try {
    // Check if npx is available
    try {
      await execa("npx", ["--version"]);
    } catch {
      throw new Error(
        "npx is required to run MegaLinter. Please install Node.js"
      );
    }
    spinner.text = "Starting MegaLinter interactive configuration...";
    // Prepare command arguments
    const args = ["mega-linter-runner"];
    if (options.flavor) {
      args.push("--flavor", options.flavor);
    }
    if (options.env) {
      args.push("--env", options.env);
    }
    // Run MegaLinter with interactive configuration
    const megalinterResult = await execa("npx", args, {
      stdio: "inherit", // Allow interactive input/output
      cwd: process.cwd(),
    });
    spinner.succeed("MegaLinter analysis completed!");
    // Since MegaLinter outputs to files, we need to read the results
    const results = await parseMegalinterResults();
    // Display results
    displayResults(results, options.output);
    // Save to database if requested
    if (options.save) {
      await saveToDatabase(results);
    }
  } catch (error) {
    spinner.fail("MegaLinter analysis failed");
    if (error.message.includes("mega-linter-runner")) {
      console.log(
        chalk.yellow("\n💡 MegaLinter not found. You can install it with:")
      );
      console.log(chalk.white("npm install -g mega-linter-runner"));
      console.log(
        chalk.gray("or it will be downloaded automatically when run with npx")
      );
    } else {
      console.error(chalk.red("Error:"), error.message);
    }
    process.exit(1);
  }
}
async function parseMegalinterResults(): Promise<any> {
  try {
    // MegaLinter typically outputs to megalinter-reports directory
    const fs = await import("fs/promises");
    const path = await import("path");
    const reportsDir = path.join(process.cwd(), "megalinter-reports");
    // Try to read the main report file
    let reportData = {};
    try {
      const reportPath = path.join(reportsDir, "megalinter-report.json");
      const reportContent = await fs.readFile(reportPath, "utf8");
      reportData = JSON.parse(reportContent);
    } catch {
      // If JSON report doesn't exist, create a basic summary
      reportData = {
        status: "completed",
        timestamp: new Date().toISOString(),
        reportsDirectory: reportsDir,
      };
    }
    return reportData;
  } catch (error) {
    return {
      status: "completed",
      timestamp: new Date().toISOString(),
      note: "Analysis completed. Check megalinter-reports directory for detailed results.",
    };
  }
}
function displayResults(results: any, format: "json" | "table") {
  console.log(chalk.blue("\n🔍 MegaLinter Analysis Results"));
  console.log("═".repeat(50));
  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  // Table format
  if (results.status) {
    console.log(chalk.green("📊 Status:"), results.status);
  }
  if (results.timestamp) {
    console.log(
      chalk.green("🕐 Completed:"),
      new Date(results.timestamp).toLocaleString()
    );
  }
  if (results.summary) {
    console.log(chalk.blue("\n📋 Summary:"));
    if (results.summary.linters_run) {
      console.log(`  Linters Run: ${results.summary.linters_run}`);
    }
    if (results.summary.errors) {
      console.log(chalk.red(`  Errors: ${results.summary.errors}`));
    }
    if (results.summary.warnings) {
      console.log(chalk.yellow(`  Warnings: ${results.summary.warnings}`));
    }
  }
  if (results.reportsDirectory) {
    console.log(chalk.blue("\n📁 Reports:"));
    console.log(`  Check detailed reports in: ${results.reportsDirectory}`);
  }
  console.log(chalk.blue("\n💡 Tip:"));
  console.log(
    "  Open megalinter-reports/index.html in your browser for detailed results"
  );
}
async function saveToDatabase(results: any) {
  try {
    const config = await loadProjectConfig();
    if (!config) {
      console.log(
        chalk.yellow("⚠️  No project found. Results not saved to database.")
      );
      return;
    }
    const dataLake = createDataLake();
    await dataLake.initialize();
    await dataLake.storeAssessmentData(
      config.projectId,
      "megalinter",
      "code-quality",
      {
        results,
        analyzedAt: new Date().toISOString(),
      },
      "cli"
    );
    await dataLake.close();
    console.log(chalk.green("✅ Results saved to database"));
  } catch (error) {
    console.error(chalk.red("❌ Failed to save to database:"), error.message);
  }
}
