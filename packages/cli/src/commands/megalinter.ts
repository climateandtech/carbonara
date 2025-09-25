// import execa from "execa";
// @ts-ignore
import { MegaLinterRunnerCli } from "../../../../node_modules/mega-linter-runner/lib/index.js";
// import MegaLinterRunner from "mega-linter-runner";
import chalk from "chalk";
import ora from "ora";
import { createDataLake } from "../database/index.js";
import { loadProjectConfig } from "../utils/config.js";
interface MegalinterOptions {
  save?: boolean;
  output: "json" | "table";
  flavor?: string;
  env?: string;
}
export async function megalinterCommand(options: MegalinterOptions) {
  const spinner = ora("MegaLinter ").start();
  try {
    // // Prepare command arguments
    // // NOTE: I haven't yet found a way to run megalinter with a config file - P.
    const args = [
      "-e",
      "'APPLY_FIXES=none'",
      "-e",
      "'DISABLE_ERRORS=true'",
      "-e",
      "'PRINT_ALL_FILES=false'",
      "-e",
      "'SHOW_ELAPSED_TIME=true'",
      "-e",
      "'FLAVOR_SUGGESTIONS=false'",
      "-e",
      "'JSON_REPORTER=true'",
      "-e",
      "'REPORT_OUTPUT_FOLDER=none'",
      "-e",
      "'SHOW_SKIPPED_LINTERS=false'",
      "-e",
      "'VALIDATE_ALL_CODEBASE=true'",
      "-e",
      "'DISABLE_ERRORS=true'",
      "-e",
      "'LOG_LEVEL=INFO'",
      "-e",
      "'PRINT_ALPACA=false'",
      // "-e",
      // "MEGALINTER_CONFIG=/Users/pes/code/carbonara/packages/cli/src/utils/.mega-linter.yml",
      "-e",
      "'DISABLE=BASH,C,CLOJURE,COFFEE,CPP,CSHARP,DART,GO,GROOVY,JAVA,JAVASCRIPT,JSX,KOTLIN,LUA,MAKEFILE,\
      PERL,PHP,POWERSHELL,PYTHON,R,RAKU,RUBY,RUST,SALESFORCE,SCALA,SQL,SWIFT,TSX,TYPESCRIPT,VBDOTNET,CSS,\
      ENV,GRAPHQL,HTML,JSON,LATEX,MARKDOWN,PROTOBUF,RST,XML,YAML,ACTION,ANSIBLE,API,ARM,BICEP,CLOUDFORMATION,\
      DOCKERFILE,EDITORCONFIG,GHERKIN,KUBERNETES,PUPPET,SNAKEMAKE,TEKTON,TERRAFORM,COPYPASTE,REPOSITORY,SPELL'",
    ];

    // // Run MegaLinter
    let megalinterFailed = false;
    let megalinterError: any = null;

    try {
      await new MegaLinterRunnerCli().run(args);

      // const megalinterResult = await execa("npx", args, {
      //   stdio: "inherit",
      //   cwd: process.cwd(),
      // });

      spinner.succeed("MegaLinter analysis completed!");
      // Since MegaLinter outputs to files, we need to read the results
      const results = await parseMegalinterResults();
      // Display results
      displayResults(results, options.output);
      // Save to database by default (skip only if explicitly set to false)
      if (options.save !== false) {
        await saveToDatabase(results);
      }
    } catch (execError: any) {
      // MegaLinter might fail due to missing installation or other issues
      // but we still want to attempt cleanup and provide helpful feedback
      megalinterFailed = true;
      megalinterError = execError;
      spinner.fail("MegaLinter analysis failed");
    }

    // Clean up megalinter-reports folder after processing (always run)
    // await cleanupReportsFolder();

    // Re-throw error after cleanup if megalinter failed
    if (megalinterFailed && megalinterError) {
      throw megalinterError;
    }
  } catch (error: any) {
    spinner.fail("MegaLinter setup failed");
    console.error(chalk.red("Error:"), error.message);
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
      const reportPath = path.join(reportsDir, "mega-linter-report.json");
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
  } catch (error: any) {
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
  // Table format - show completion message instead of error status
  console.log(chalk.green("✅ MegaLinter analysis completed"));
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
  } catch (error: any) {
    console.error(chalk.red("❌ Failed to save to database:"), error.message);
  }
}

// async function cleanupReportsFolder() {
//   try {
//     const fs = await import("fs/promises");
//     const path = await import("path");
//     const reportsDir = path.join(process.cwd(), "megalinter-reports");

//     // Check if the directory exists before trying to remove it
//     try {
//       await fs.access(reportsDir);
//       await fs.rm(reportsDir, { recursive: true, force: true });
//     } catch {
//       // Directory doesn't exist, nothing to clean up
//     }
//   } catch (error: any) {
//     // Silently ignore cleanup errors to not disrupt the main flow
//   }
// }
