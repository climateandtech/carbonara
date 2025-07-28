import { execa } from "execa";
import chalk from "chalk";
import ora from "ora";
import { createDataLake } from "../database/index.js";
import { loadProjectConfig } from "../utils/config.js";
interface MegalinterOptions {
  save: boolean;
  output: "json" | "table";
  flavor?: string;
  env?: string;
}
export async function megalinterCommand(options: MegalinterOptions) {
  const spinner = ora("Running MegaLinter analysis... v4").start();
  try {
    // Check if npx is available
    try {
      await execa("npx", ["--version"]);
    } catch {
      throw new Error(
        "npx is required to run MegaLinter. Please install Node.js"
      );
    }

    // Check if .mega-linter.yml exists
    const fs = await import("fs/promises");
    const path = await import("path");
    // const configPath = path.join(process.cwd(), ".mega-linter.yml");

    // try {
    //   await fs.access(configPath);
    //   spinner.text = "Running MegaLinter with configuration file...";
    // } catch {
    //   spinner.warn(
    //     "No .mega-linter.yml found. Run 'carbonara init' to create one."
    //   );
    //   throw new Error("Configuration file .mega-linter.yml not found");
    // }

    // Prepare command arguments
    const args = [
      "mega-linter-runner",
      "-e",
      "'JSON_REPORTER=true'",
      "-e",
      "'DISABLE=true'",
      "-e",
      "'DISABLE_LINTERS=SPELL_CSPELL",
      "-e",
      "'DISABLE_LINTERS=SPELL_MISSPELL'",
      "-e",
      "'DISABLE_LINTERS=COPYPASTE_JSCPD'",
      "-e",
      "'DISABLE_LINTERS=CREDENTIALS_SECRETLINT'",
    ];
    if (options.flavor) {
      args.push("--flavor", options.flavor);
    }
    if (options.env) {
      args.push("--env", options.env);
    }
    // Run MegaLinter with configuration file
    const megalinterResult = await execa("npx", args, {
      stdio: "inherit",
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
  } catch (error: any) {
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
  } catch (error: any) {
    console.error(chalk.red("❌ Failed to save to database:"), error.message);
  }
}

// import { execa } from "execa";
// import chalk from "chalk";
// import ora from "ora";
// import { createDataLake } from "../database/index.js";
// import { loadProjectConfig } from "../utils/config.js";

// interface MegalinterOptions {
//   save: boolean;
//   output: "json" | "table";
//   fix?: boolean;
// }

// export async function megalinterCommand(options: MegalinterOptions) {
//   const spinner = ora("Running MegaLinter analysis...").start();

//   try {
//     // Check if npx is available
//     try {
//       await execa("npx", ["--version"]);
//     } catch {
//       throw new Error(
//         "npx is required to run MegaLinter. Please install Node.js"
//       );
//     }

//     spinner.text = "Running MegaLinter code analysis... BOB v5";

//     // Build command arguments with configuration options
//     const args = [
//       "mega-linter-runner",
//       "-e",
//       "JSON_REPORTER=true",
//       "-e",
//       "JSON_REPORTER_FILE_NAME=./bob.json",
//       "-e",
//       "APPLY_FIXES=none",
//       "-e",
//       "FILTER_REGEX_INCLUDE=(src/|packages/|tests?/|spec/)",
//       "-e",
//       "FILTER_REGEX_EXCLUDE=(node_modules/|\\.git/|dist/|build/|coverage/|\\.next/|\\.nuxt/)",
//       "-e",
//       "DISABLE_LINTERS=SPELL_CSPELL,SPELL_MISSPELL,COPYPASTE_JSCPD,CREDENTIALS_SECRETLINT",
//       "-e",
//       "TYPESCRIPT_DEFAULT_STYLE=prettier",
//       "-e",
//       "JAVASCRIPT_DEFAULT_STYLE=prettier",
//       "-e",
//       "REPORT_OUTPUT_FOLDER=megalinter-reports",
//       "-e",
//       "LOG_LEVEL=INFO",
//       "-e",
//       "PARALLEL=true",
//       "-e",
//       "VALIDATE_ALL_CODEBASE=false",
//       "-e",
//       "FORMATTERS_DISABLE_ERRORS=true",
//     ];

//     if (options.fix) {
//       args.push("-e", "APPLY_FIXES=all");
//     }

//     // Run MegaLinter analysis - it may return non-zero exit code even when successful
//     let megalinterResult;
//     let megalinterRan = false;

//     try {
//       // megalinterResult = await execa("npx", args, {
//       megalinterResult = await execa(
//         "npx mega-linter-runner -e JSON_REPORTER=true -e JSON_REPORTER_FILE_NAME=./bob.json",
//         {
//           stdio: "inherit",
//           cwd: process.cwd(),
//         }
//       );
//       megalinterRan = true;
//     } catch (execError: any) {
//       // MegaLinter often returns non-zero exit codes when issues are found
//       // Check if it actually ran by looking for output or report files
//       megalinterRan = await checkIfMegalinterRan();

//       if (!megalinterRan) {
//         throw execError;
//       }

//       // If MegaLinter ran but returned errors, that's normal behavior
//       megalinterResult = execError;
//     }

//     if (megalinterRan) {
//       spinner.succeed("MegaLinter analysis completed!");

//       // Parse results - MegaLinter outputs to megalinter-reports folder
//       const results = await parseResults();

//       // Display results
//       displayResults(results, options.output);

//       // Save to database if requested
//       if (options.save) {
//         await saveToDatabase(results);
//       }
//     } else {
//       throw new Error("MegaLinter did not run successfully");
//     }
//   } catch (error: any) {
//     spinner.fail("MegaLinter analysis failed");

//     if (error.message.includes("mega-linter-runner")) {
//       console.log(chalk.yellow("\n💡 MegaLinter not found. Install it with:"));
//       console.log(chalk.white("npm install mega-linter-runner --save-dev"));
//       console.log(chalk.gray("or use:"));
//       console.log(chalk.white("npx mega-linter-runner"));
//     } else {
//       console.error(chalk.red("Error:"), error.message);
//     }

//     process.exit(1);
//   }
// }

// async function checkIfMegalinterRan(): Promise<boolean> {
//   try {
//     const fs = await import("fs/promises");
//     const path = await import("path");

//     // Check if megalinter-reports folder exists
//     const reportsPath = path.join(process.cwd(), "megalinter-reports");
//     try {
//       await fs.access(reportsPath);
//       return true;
//     } catch {
//       return false;
//     }
//   } catch {
//     return false;
//   }
// }

// async function parseResults(): Promise<any> {
//   try {
//     // MegaLinter typically outputs results to megalinter-reports folder
//     // Try to read the main report file
//     const fs = await import("fs/promises");
//     const path = await import("path");

//     const reportPath = path.join(
//       process.cwd(),
//       "megalinter-reports",
//       "megalinter-report.json"
//     );
//     const reportData = await fs.readFile(reportPath, "utf-8");
//     return JSON.parse(reportData);
//   } catch {
//     // If JSON report is not available, return a basic structure
//     return {
//       summary: "MegaLinter analysis completed",
//       timestamp: new Date().toISOString(),
//       reportAvailable: false,
//     };
//   }
// }

// function displayResults(results: any, format: "json" | "table") {
//   console.log(chalk.blue("\n🔍 MegaLinter Analysis Results"));
//   console.log("═".repeat(50));

//   if (format === "json") {
//     console.log(JSON.stringify(results, null, 2));
//     return;
//   }

//   // Table format
//   if (results.summary) {
//     console.log(chalk.green("📋 Summary:"), results.summary);
//   }

//   if (results.linters_run) {
//     console.log(chalk.blue("\n🔧 Linters executed:"), results.linters_run);
//   }

//   if (results.total_errors !== undefined) {
//     const errorColor = results.total_errors > 0 ? chalk.red : chalk.green;
//     console.log(
//       chalk.blue("\n❌ Total errors:"),
//       errorColor(results.total_errors)
//     );
//   }

//   if (results.total_warnings !== undefined) {
//     const warningColor =
//       results.total_warnings > 0 ? chalk.yellow : chalk.green;
//     console.log(
//       chalk.blue("⚠️  Total warnings:"),
//       warningColor(results.total_warnings)
//     );
//   }

//   if (results.total_fixed !== undefined && results.total_fixed > 0) {
//     console.log(
//       chalk.blue("✅ Issues fixed:"),
//       chalk.green(results.total_fixed)
//     );
//   }

//   if (results.linters && Array.isArray(results.linters)) {
//     console.log(chalk.blue("\n📊 Linter Details:"));
//     results.linters.forEach((linter: any) => {
//       if (
//         linter.status === "success" &&
//         (linter.errors > 0 || linter.warnings > 0)
//       ) {
//         console.log(
//           `  ${linter.linter_name}: ${chalk.red(linter.errors)} errors, ${chalk.yellow(linter.warnings)} warnings`
//         );
//       }
//     });
//   }

//   if (!results.reportAvailable) {
//     console.log(
//       chalk.yellow(
//         "\n💡 For detailed results, check the megalinter-reports folder"
//       )
//     );
//   }

//   console.log(chalk.blue("\n📁 Reports location:"), "megalinter-reports/");
// }

// async function saveToDatabase(results: any) {
//   try {
//     const config = await loadProjectConfig();
//     if (!config) {
//       console.log(
//         chalk.yellow("⚠️  No project found. Results not saved to database.")
//       );
//       return;
//     }

//     const dataLake = createDataLake();
//     await dataLake.initialize();

//     await dataLake.storeAssessmentData(
//       config.projectId,
//       "megalinter",
//       "code-quality",
//       {
//         results,
//         analyzedAt: new Date().toISOString(),
//       },
//       "cli"
//     );

//     await dataLake.close();
//     console.log(chalk.green("✅ Results saved to database"));
//   } catch (error: any) {
//     console.error(chalk.red("❌ Failed to save to database:"), error.message);
//   }
// }
