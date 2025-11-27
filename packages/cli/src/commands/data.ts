import chalk from "chalk";
import fs from "fs";
import path from "path";
import { createDataLake } from "@carbonara/core";
import { loadProjectConfig } from "../utils/config.js";

interface DataOptions {
  list: boolean;
  show: boolean;
  export?: "json" | "csv";
  json: boolean; // Raw JSON output to stdout
  clear: boolean;
}

export async function dataCommand(options: DataOptions) {
  try {
    const config = await loadProjectConfig();
    if (!config) {
      if (options.json) {
        console.log("[]");
        return;
      }
      console.log(
        chalk.yellow('⚠️  No project found. Run "carbonara init" first.')
      );
      return;
    }

    const dataLake = createDataLake();
    await dataLake.initialize();

    if (options.json) {
      await outputJsonData(dataLake, config.projectId);
      return;
    }

    if (options.list) {
      await listData(dataLake, config.projectId);
    }

    if (options.show) {
      await showData(dataLake, config.projectId, config);
    }

    if (options.export) {
      await exportData(dataLake, config.projectId, options.export);
    }

    if (options.clear) {
      await clearData(dataLake, config.projectId);
    }

    if (
      !options.list &&
      !options.show &&
      !options.export &&
      !options.json &&
      !options.clear
    ) {
      // Show help
      console.log(chalk.blue("📊 Data Lake Management"));
      console.log("");
      console.log("Available options:");
      console.log("  --list      List all stored data");
      console.log("  --show      Show detailed project analysis");
      console.log("  --export    Export data (json|csv)");
      console.log("  --json      Output raw JSON to stdout");
      console.log("  --clear     Clear all data");
    }

    await dataLake.close();
  } catch (error) {
    console.error(chalk.red("❌ Data operation failed:"), error);
    process.exit(1);
  }
}

async function listData(dataLake: any, projectId: number) {
  console.log(chalk.blue("📋 Stored Data"));
  console.log("═".repeat(50));

  // Get all assessment data (don't filter by projectId to show all data)
  const assessmentData = await dataLake.getAssessmentData();

  if (assessmentData.length === 0) {
    console.log(chalk.gray("No data found."));
    return;
  }

  // Group by tool
  const groupedData = assessmentData.reduce((acc: any, item: any) => {
    if (!acc[item.tool_name]) {
      acc[item.tool_name] = [];
    }
    acc[item.tool_name].push(item);
    return acc;
  }, {});

  Object.entries(groupedData).forEach(([toolName, data]: [string, any]) => {
    console.log(chalk.green(`\n🔧 ${toolName.toUpperCase()}`));
    console.log(`  Entries: ${data.length}`);
    console.log(`  Latest: ${new Date(data[0].timestamp).toLocaleString()}`);

    // Show recent entries
    data.slice(0, 3).forEach((entry: any, index: number) => {
      console.log(
        `  ${index + 1}. ${entry.data_type} - ${new Date(entry.timestamp).toLocaleDateString()}`
      );
    });

    if (data.length > 3) {
      console.log(`  ... and ${data.length - 3} more`);
    }
  });

  console.log(chalk.blue(`\n📊 Total entries: ${assessmentData.length}`));
}

async function showData(dataLake: any, projectId: number, config: any) {
  console.log(chalk.blue.bold("🌱 Carbonara Project Analysis"));
  console.log("═".repeat(60));

  // Show project info
  console.log(chalk.cyan.bold("\n📋 Project Information"));
  console.log(
    `   Name: ${chalk.white(config.projectName || "Unnamed Project")}`
  );
  console.log(`   ID: ${chalk.gray(config.projectId)}`);
  console.log(
    `   Created: ${chalk.gray(new Date(config.createdAt).toLocaleDateString())}`
  );

  // Get all data
  const assessmentData = await dataLake.getAssessmentData(projectId);

  if (assessmentData.length === 0) {
    console.log(
      chalk.yellow(
        "\n⚠️  No analysis data found. Run assessments to see results here."
      )
    );
    return;
  }

  // Group by tool for better display
  const groupedData = assessmentData.reduce((acc: any, item: any) => {
    if (!acc[item.tool_name]) {
      acc[item.tool_name] = [];
    }
    acc[item.tool_name].push(item);
    return acc;
  }, {});

  // Show assessment questionnaire data nicely
  if (groupedData.assessment) {
    const latestAssessment = groupedData.assessment[0];
    const data = latestAssessment.data;

    console.log(chalk.green.bold("\n🌍 assessment questionnaire Results"));
    console.log(
      `   Date: ${chalk.gray(new Date(latestAssessment.timestamp).toLocaleDateString())}`
    );

    if (data.finalScore !== undefined) {
      const scoreColor =
        data.finalScore >= 70
          ? "green"
          : data.finalScore >= 40
            ? "yellow"
            : "red";
      console.log(
        `   Overall Score: ${chalk[scoreColor].bold(data.finalScore + "/100")}`
      );
    }

    if (data.projectScope) {
      console.log(chalk.cyan("\n   📊 Project Scope:"));
      if (data.projectScope.estimatedUsers) {
        console.log(
          `      Users: ${chalk.white(data.projectScope.estimatedUsers.toLocaleString())}`
        );
      }
      if (data.projectScope.expectedTraffic) {
        console.log(
          `      Traffic: ${chalk.white(data.projectScope.expectedTraffic)}`
        );
      }
      if (data.projectScope.projectLifespan) {
        console.log(
          `      Lifespan: ${chalk.white(data.projectScope.projectLifespan)}`
        );
      }
    }

    if (data.infrastructure) {
      console.log(chalk.cyan("\n   🏗️  Infrastructure:"));
      if (data.infrastructure.hostingProvider) {
        console.log(
          `      Hosting: ${chalk.white(data.infrastructure.hostingProvider)}`
        );
      }
      if (data.infrastructure.serverLocation) {
        console.log(
          `      Location: ${chalk.white(data.infrastructure.serverLocation)}`
        );
      }
    }

    if (data.categoryBreakdown) {
      console.log(chalk.cyan("\n   📈 Score Breakdown:"));
      Object.entries(data.categoryBreakdown).forEach(([category, score]) => {
        const scoreColor =
          (score as number) >= 7
            ? "green"
            : (score as number) >= 4
              ? "yellow"
              : "red";
        console.log(`      ${category}: ${chalk[scoreColor](score + "/10")}`);
      });
    }
  }

  // Show Greenframe data nicely
  if (groupedData.greenframe) {
    const latestGreenframe = groupedData.greenframe[0];
    const data = latestGreenframe.data;

    console.log(chalk.green.bold("\n🌐 Greenframe Analysis"));
    console.log(
      `   Date: ${chalk.gray(new Date(latestGreenframe.timestamp).toLocaleDateString())}`
    );
    console.log(`   URL: ${chalk.blue(data.url || "N/A")}`);

    if (data.carbonFootprint) {
      console.log(
        `   Carbon Footprint: ${chalk.yellow.bold(data.carbonFootprint)}`
      );
    }
    if (data.ecoIndex) {
      const ecoColor =
        data.ecoIndex >= 70 ? "green" : data.ecoIndex >= 40 ? "yellow" : "red";
      console.log(
        `   Eco Index: ${chalk[ecoColor].bold(data.ecoIndex + "/100")}`
      );
    }
    if (data.grade) {
      console.log(`   Grade: ${chalk.white.bold(data.grade)}`);
    }
  }

  // Show summary
  console.log(chalk.blue.bold("\n📊 Data Summary"));
  Object.entries(groupedData).forEach(([toolName, data]: [string, any]) => {
    console.log(`   ${toolName}: ${chalk.white(data.length)} entries`);
  });

  console.log(
    chalk.gray(`\n💡 Use 'carbonara data --list' for a quick overview`)
  );
  console.log(
    chalk.gray(`💡 Use 'carbonara data --export json' to export all data`)
  );
}

async function exportData(
  dataLake: any,
  projectId: number,
  format: "json" | "csv"
) {
  console.log(chalk.blue(`📤 Exporting data as ${format.toUpperCase()}...`));

  // Export all data (don't filter by projectId)
  const assessmentData = await dataLake.getAssessmentData();

  if (assessmentData.length === 0) {
    console.log(chalk.gray("No data to export."));
    return;
  }

  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `carbonara-export-${timestamp}.${format}`;
  const carbonaraDir = path.join(process.cwd(), ".carbonara");

  // Ensure .carbonara directory exists
  if (!fs.existsSync(carbonaraDir)) {
    fs.mkdirSync(carbonaraDir, { recursive: true });
  }

  const filePath = path.join(carbonaraDir, filename);

  if (format === "json") {
    fs.writeFileSync(filePath, JSON.stringify(assessmentData, null, 2));
  } else if (format === "csv") {
    const csv = convertToCSV(assessmentData);
    fs.writeFileSync(filePath, csv);
  }

  console.log(chalk.green(`✅ Data exported to .carbonara/${filename}`));
  console.log(chalk.gray(`📁 Location: ${path.resolve(filePath)}`));
}

async function clearData(dataLake: any, projectId: number) {
  console.log(
    chalk.yellow("⚠️  This will delete all stored data for this project.")
  );

  // In a real implementation, you'd want to confirm with the user
  // For now, we'll just show what would be deleted
  const assessmentData = await dataLake.getAssessmentData(projectId);

  console.log(chalk.red(`🗑️  Would delete ${assessmentData.length} entries`));
  console.log(chalk.gray("Use with caution in production!"));

  // TODO: Implement actual deletion with confirmation
  // import { confirm } from '@inquirer/prompts';
  // const confirmed = await confirm({
  //   message: 'Are you sure you want to delete all data?',
  //   default: false
  // });

  // if (confirmed) {
  //   // Delete data from database
  //   console.log(chalk.green('✅ Data cleared successfully'));
  // }
}

function convertToCSV(data: any[]): string {
  if (data.length === 0) return "";

  // Extract all possible keys from the data
  const headers = new Set<string>();
  data.forEach((item) => {
    Object.keys(item).forEach((key) => headers.add(key));

    // Flatten nested data object
    if (item.data && typeof item.data === "object") {
      Object.keys(item.data).forEach((dataKey) => {
        headers.add(`data_${dataKey}`);
      });
    }
  });

  const headerArray = Array.from(headers);
  const csvRows = [headerArray.join(",")];

  data.forEach((item) => {
    const row = headerArray.map((header) => {
      if (header.startsWith("data_")) {
        const dataKey = header.substring(5);
        const value = item.data?.[dataKey];
        return value !== undefined ? JSON.stringify(value) : "";
      } else {
        const value = item[header];
        if (value === null || value === undefined) return "";
        if (typeof value === "object") return JSON.stringify(value);
        return String(value).replace(/"/g, '""');
      }
    });
    csvRows.push(row.join(","));
  });

  return csvRows.join("\n");
}

async function outputJsonData(dataLake: any, projectId: number) {
  // Output all data as JSON (don't filter by projectId)
  const assessmentData = await dataLake.getAssessmentData();

  // Output raw JSON to stdout (no formatting or colors)
  console.log(JSON.stringify(assessmentData));
}
