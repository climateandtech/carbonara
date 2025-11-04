import { input, select } from "@inquirer/prompts";
import chalk from "chalk";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { createDataLake } from "@carbonara/core";

interface InitOptions {
  path: string;
}

/**
 * Check if a directory is a git repository
 */
function isGitRepository(dirPath: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: dirPath,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the root path of the git repository
 */
function getGitRoot(dirPath: string): string | null {
  try {
    const result = execSync("git rev-parse --show-toplevel", {
      cwd: dirPath,
      encoding: "utf-8",
      stdio: "pipe",
    });
    return result.trim();
  } catch {
    return null;
  }
}

export async function initCommand(options: InitOptions) {
  try {
    console.log(chalk.blue("🚀 Initializing Carbonara project..."));

    const projectPath = path.resolve(options.path);

    // Check if directory exists
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    // Try to detect git repository (soft dependency)
    let finalProjectPath = projectPath;
    let dbPath: string;

    if (isGitRepository(projectPath)) {
      const gitRoot = getGitRoot(projectPath);
      if (gitRoot) {
        console.log(
          chalk.gray("📂 Git repository detected, using root:"),
          gitRoot
        );
        finalProjectPath = gitRoot;
        dbPath = path.join(gitRoot, "carbonara.db");
      } else {
        console.log(
          chalk.yellow("⚠️  Warning: Could not determine git repository root.")
        );
        console.log(
          chalk.yellow("   Using current directory instead:"),
          projectPath
        );
        dbPath = path.join(projectPath, "carbonara.db");
      }
    } else {
      console.log(chalk.yellow("⚠️  Warning: No git repository found."));
      console.log(
        chalk.yellow("   It is recommended to run"),
        chalk.white("git init"),
        chalk.yellow("first.")
      );
      console.log(chalk.gray("   Using current directory:"), projectPath);
      dbPath = path.join(projectPath, "carbonara.db");
    }

    // Check if carbonara.db already exists
    const dbExists = fs.existsSync(dbPath);

    if (dbExists) {
      console.log(chalk.yellow("⚠️  Database already exists:"), "carbonara.db");
    } else {
      console.log(chalk.gray("Creating new database at:"), dbPath);
    }

    // Get project details
    const name = await input({
      message: "Project name:",
      default: path.basename(finalProjectPath),
      validate: (input: string) =>
        input.length > 0 ? true : "Project name is required",
    });

    const description = await input({
      message: "Project description:",
      default: "A Carbonara CO2 assessment project",
    });

    const projectType = await select({
      message: "Project type:",
      choices: [
        { name: "Web Application", value: "web" },
        { name: "Mobile Application", value: "mobile" },
        { name: "Desktop Application", value: "desktop" },
        { name: "API/Backend Service", value: "api" },
        { name: "Other", value: "other" },
      ],
    });

    const answers = { name, description, projectType };

    // Initialize database (will create it if it doesn't exist)
    const dataLake = createDataLake({
      dbPath: path.join(projectPath, ".carbonara", "carbonara.db"),
    });

    await dataLake.initialize();

    // Create project in database
    const projectId = await dataLake.createProject(
      answers.name,
      finalProjectPath,
      {
        description: answers.description,
        projectType: answers.projectType,
        initialized: new Date().toISOString(),
      }
    );

    // Create carbonara config file
    const config = {
      name: answers.name,
      description: answers.description,
      projectType: answers.projectType,
      projectId,
      database: {
        path: ".carbonara/carbonara.db",
      },
      tools: {
        greenframe: {
          enabled: true,
        },
      },
    };

    // Ensure .carbonara directory exists
    const carbonaraDir = path.join(projectPath, ".carbonara");
    if (!fs.existsSync(carbonaraDir)) {
      fs.mkdirSync(carbonaraDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(finalProjectPath, "carbonara.config.json"),
      JSON.stringify(config, null, 2)
    );

    // Create schemas directory
    const schemasDir = path.join(finalProjectPath, "schemas");
    if (!fs.existsSync(schemasDir)) {
      fs.mkdirSync(schemasDir);
    }

    await dataLake.close();

    console.log(chalk.green("✅ Project initialized successfully!"));
    console.log(chalk.yellow("📁 Project path:"), finalProjectPath);
    console.log(chalk.yellow("🗄️  Database:"), ".carbonara/carbonara.db");
    console.log(
      chalk.yellow("⚙️  Config:"),
      ".carbonara/carbonara.config.json"
    );
    console.log("");
    console.log(chalk.blue("Next steps:"));
    console.log(
      chalk.gray("  1. Run"),
      chalk.white("carbonara assess"),
      chalk.gray("to start CO2 assessment")
    );
    console.log(
      chalk.gray("  2. Run"),
      chalk.white("carbonara greenframe <url>"),
      chalk.gray("to analyze a website")
    );
  } catch (error) {
    console.error(chalk.red("❌ Failed to initialize project:"), error);
    process.exit(1);
  }
}
