import inquirer from "inquirer";
import chalk from "chalk";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { createDataLake } from "../database/index.js";
import { loadProjectConfig } from "../utils/config.js";

// CO2 Assessment Schema
const CO2AssessmentSchema = z.object({
  projectInfo: z.object({
    expectedUsers: z.number().min(1),
    expectedTraffic: z.enum(["low", "medium", "high", "very-high"]),
    targetAudience: z.enum(["local", "national", "global"]),
    projectLifespan: z.number().min(1), // months
  }),
  infrastructure: z.object({
    hostingType: z.enum(["shared", "vps", "dedicated", "cloud", "hybrid"]),
    cloudProvider: z.string().optional(),
    serverLocation: z.enum([
      "same-continent",
      "different-continent",
      "global-cdn",
    ]),
    dataStorage: z.enum(["minimal", "moderate", "heavy", "massive"]),
    backupStrategy: z.enum(["none", "daily", "real-time", "weekly"]),
  }),
  development: z.object({
    teamSize: z.number().min(1),
    developmentDuration: z.number().min(1), // months
    cicdPipeline: z.boolean(),
    testingStrategy: z.enum(["minimal", "moderate", "comprehensive"]),
    codeQuality: z.enum(["basic", "good", "excellent"]),
  }),
  features: z.object({
    realTimeFeatures: z.boolean(),
    mediaProcessing: z.boolean(),
    aiMlFeatures: z.boolean(),
    blockchainIntegration: z.boolean(),
    iotIntegration: z.boolean(),
  }),
  sustainabilityGoals: z.object({
    carbonNeutralityTarget: z.boolean(),
    greenHostingRequired: z.boolean(),
    optimizationPriority: z.enum(["performance", "sustainability", "balanced"]),
    budgetForGreenTech: z.enum(["none", "low", "medium", "high"]),
  }),
});

interface AssessOptions {
  interactive: boolean;
  file?: string;
}

export async function assessCommand(options: AssessOptions) {
  try {
    console.log(chalk.blue("🌱 Starting CO2 Assessment..."));

    // Load project config
    const config = await loadProjectConfig();
    if (!config) {
      console.log(
        chalk.yellow('⚠️  No project found. Run "carbonara init" first.'),
      );
      return;
    }

    const dataLake = createDataLake();
    await dataLake.initialize();

    let assessmentData;

    if (options.file) {
      // Load from file
      const filePath = path.resolve(options.file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Assessment file not found: ${filePath}`);
      }

      const fileContent = fs.readFileSync(filePath, "utf-8");
      assessmentData = JSON.parse(fileContent);
    } else {
      // Interactive mode
      assessmentData = await runInteractiveAssessment();
    }

    // Validate the assessment data
    const validated = CO2AssessmentSchema.parse(assessmentData);

    // Calculate CO2 impact score
    const impactScore = calculateCO2Impact(validated);

    // Store in database
    await dataLake.updateProjectCO2Variables(config.projectId, validated);
    await dataLake.storeAssessmentData(
      config.projectId,
      "co2-assessment",
      "questionnaire",
      {
        ...validated,
        impactScore,
        completedAt: new Date().toISOString(),
      },
    );

    // Generate report
    generateAssessmentReport(validated, impactScore);

    await dataLake.close();
  } catch (error) {
    console.error(chalk.red("❌ Assessment failed:"), error);
    process.exit(1);
  }
}

async function runInteractiveAssessment() {
  console.log(chalk.green("\n📊 Project Information"));
  const projectInfo = await inquirer.prompt([
    {
      type: "number",
      name: "expectedUsers",
      message: "Expected number of users:",
      default: 1000,
      validate: (value: number) =>
        value > 0 ? true : "Must be greater than 0",
    },
    {
      type: "list",
      name: "expectedTraffic",
      message: "Expected traffic level:",
      choices: [
        { name: "Low (< 1K visits/month)", value: "low" },
        { name: "Medium (1K-10K visits/month)", value: "medium" },
        { name: "High (10K-100K visits/month)", value: "high" },
        { name: "Very High (> 100K visits/month)", value: "very-high" },
      ],
    },
    {
      type: "list",
      name: "targetAudience",
      message: "Target audience:",
      choices: [
        { name: "Local (same city/region)", value: "local" },
        { name: "National (same country)", value: "national" },
        { name: "Global (worldwide)", value: "global" },
      ],
    },
    {
      type: "number",
      name: "projectLifespan",
      message: "Project lifespan (months):",
      default: 12,
      validate: (value: number) =>
        value > 0 ? true : "Must be greater than 0",
    },
  ] as any);

  console.log(chalk.green("\n🏗️  Infrastructure"));
  const infrastructure = await inquirer.prompt([
    {
      type: "list",
      name: "hostingType",
      message: "Hosting type:",
      choices: [
        { name: "Shared hosting", value: "shared" },
        { name: "Virtual Private Server (VPS)", value: "vps" },
        { name: "Dedicated server", value: "dedicated" },
        { name: "Cloud (AWS/Azure/GCP)", value: "cloud" },
        { name: "Hybrid setup", value: "hybrid" },
      ],
    },
    {
      type: "input",
      name: "cloudProvider",
      message: "Cloud provider (if applicable):",
      when: (answers: any) => answers.hostingType === "cloud",
    },
    {
      type: "list",
      name: "serverLocation",
      message: "Server location relative to users:",
      choices: [
        { name: "Same continent", value: "same-continent" },
        { name: "Different continent", value: "different-continent" },
        { name: "Global CDN", value: "global-cdn" },
      ],
    },
    {
      type: "list",
      name: "dataStorage",
      message: "Data storage requirements:",
      choices: [
        { name: "Minimal (< 1GB)", value: "minimal" },
        { name: "Moderate (1-10GB)", value: "moderate" },
        { name: "Heavy (10-100GB)", value: "heavy" },
        { name: "Massive (> 100GB)", value: "massive" },
      ],
    },
    {
      type: "list",
      name: "backupStrategy",
      message: "Backup strategy:",
      choices: [
        { name: "No backups", value: "none" },
        { name: "Weekly backups", value: "weekly" },
        { name: "Daily backups", value: "daily" },
        { name: "Real-time backups", value: "real-time" },
      ],
    },
  ]);

  console.log(chalk.green("\n👥 Development"));
  const development = await inquirer.prompt([
    {
      type: "number",
      name: "teamSize",
      message: "Development team size:",
      default: 3,
      validate: (value: number) =>
        value > 0 ? true : "Must be greater than 0",
    },
    {
      type: "number",
      name: "developmentDuration",
      message: "Development duration (months):",
      default: 6,
      validate: (value: number) =>
        value > 0 ? true : "Must be greater than 0",
    },
    {
      type: "confirm",
      name: "cicdPipeline",
      message: "Using CI/CD pipeline?",
      default: true,
    },
    {
      type: "list",
      name: "testingStrategy",
      message: "Testing strategy:",
      choices: [
        { name: "Minimal testing", value: "minimal" },
        { name: "Moderate testing", value: "moderate" },
        { name: "Comprehensive testing", value: "comprehensive" },
      ],
    },
    {
      type: "list",
      name: "codeQuality",
      message: "Code quality standards:",
      choices: [
        { name: "Basic", value: "basic" },
        { name: "Good", value: "good" },
        { name: "Excellent", value: "excellent" },
      ],
    },
  ] as any);

  console.log(chalk.green("\n⚡ Features"));
  const features = await inquirer.prompt([
    {
      type: "confirm",
      name: "realTimeFeatures",
      message: "Real-time features (WebSocket, live updates)?",
      default: false,
    },
    {
      type: "confirm",
      name: "mediaProcessing",
      message: "Media processing (images, videos)?",
      default: false,
    },
    {
      type: "confirm",
      name: "aiMlFeatures",
      message: "AI/ML features?",
      default: false,
    },
    {
      type: "confirm",
      name: "blockchainIntegration",
      message: "Blockchain integration?",
      default: false,
    },
    {
      type: "confirm",
      name: "iotIntegration",
      message: "IoT integration?",
      default: false,
    },
  ]);

  console.log(chalk.green("\n🌍 Sustainability Goals"));
  const sustainabilityGoals = await inquirer.prompt([
    {
      type: "confirm",
      name: "carbonNeutralityTarget",
      message: "Carbon neutrality target?",
      default: false,
    },
    {
      type: "confirm",
      name: "greenHostingRequired",
      message: "Green hosting required?",
      default: false,
    },
    {
      type: "list",
      name: "optimizationPriority",
      message: "Optimization priority:",
      choices: [
        { name: "Performance first", value: "performance" },
        { name: "Sustainability first", value: "sustainability" },
        { name: "Balanced approach", value: "balanced" },
      ],
    },
    {
      type: "list",
      name: "budgetForGreenTech",
      message: "Budget for green technology:",
      choices: [
        { name: "No budget", value: "none" },
        { name: "Low budget", value: "low" },
        { name: "Medium budget", value: "medium" },
        { name: "High budget", value: "high" },
      ],
    },
  ]);

  return {
    projectInfo,
    infrastructure,
    development,
    features,
    sustainabilityGoals,
  };
}

function calculateCO2Impact(data: z.infer<typeof CO2AssessmentSchema>): number {
  let score = 0;

  // Traffic impact
  const trafficMultipliers = { low: 1, medium: 2, high: 4, "very-high": 8 };
  score += trafficMultipliers[data.projectInfo.expectedTraffic] * 10;

  // Infrastructure impact
  const hostingMultipliers = {
    shared: 1,
    vps: 2,
    dedicated: 4,
    cloud: 3,
    hybrid: 5,
  };
  score += hostingMultipliers[data.infrastructure.hostingType] * 5;

  // Features impact
  if (data.features.realTimeFeatures) score += 15;
  if (data.features.mediaProcessing) score += 20;
  if (data.features.aiMlFeatures) score += 25;
  if (data.features.blockchainIntegration) score += 50;
  if (data.features.iotIntegration) score += 10;

  // Sustainability adjustments
  if (data.sustainabilityGoals.greenHostingRequired) score *= 0.7;
  if (data.sustainabilityGoals.carbonNeutralityTarget) score *= 0.8;

  return Math.round(score);
}

function generateAssessmentReport(
  data: z.infer<typeof CO2AssessmentSchema>,
  impactScore: number,
) {
  console.log(chalk.green("\n📋 Assessment Report"));
  console.log("═".repeat(50));

  console.log(chalk.blue("\n🎯 Project Overview:"));
  console.log(
    `Expected Users: ${data.projectInfo.expectedUsers.toLocaleString()}`,
  );
  console.log(`Traffic Level: ${data.projectInfo.expectedTraffic}`);
  console.log(`Target Audience: ${data.projectInfo.targetAudience}`);
  console.log(`Project Lifespan: ${data.projectInfo.projectLifespan} months`);

  console.log(chalk.blue("\n🏗️  Infrastructure:"));
  console.log(`Hosting: ${data.infrastructure.hostingType}`);
  console.log(`Server Location: ${data.infrastructure.serverLocation}`);
  console.log(`Data Storage: ${data.infrastructure.dataStorage}`);

  console.log(chalk.blue("\n⚡ High-Impact Features:"));
  const highImpactFeatures = [];
  if (data.features.realTimeFeatures)
    highImpactFeatures.push("Real-time features");
  if (data.features.mediaProcessing)
    highImpactFeatures.push("Media processing");
  if (data.features.aiMlFeatures) highImpactFeatures.push("AI/ML features");
  if (data.features.blockchainIntegration)
    highImpactFeatures.push("Blockchain");
  if (data.features.iotIntegration) highImpactFeatures.push("IoT integration");

  if (highImpactFeatures.length > 0) {
    highImpactFeatures.forEach((feature) => console.log(`• ${feature}`));
  } else {
    console.log("• None detected");
  }

  console.log(chalk.blue("\n🌍 Sustainability:"));
  console.log(
    `Carbon Neutrality Target: ${data.sustainabilityGoals.carbonNeutralityTarget ? "Yes" : "No"}`,
  );
  console.log(
    `Green Hosting: ${data.sustainabilityGoals.greenHostingRequired ? "Yes" : "No"}`,
  );
  console.log(
    `Optimization Priority: ${data.sustainabilityGoals.optimizationPriority}`,
  );

  // Impact score and recommendations
  console.log(chalk.blue("\n📊 CO2 Impact Score:"));
  let scoreColor = chalk.green;
  let rating = "Excellent";

  if (impactScore > 100) {
    scoreColor = chalk.red;
    rating = "High Impact";
  } else if (impactScore > 50) {
    scoreColor = chalk.yellow;
    rating = "Moderate Impact";
  }

  console.log(`${scoreColor(impactScore.toString())} (${rating})`);

  console.log(chalk.blue("\n💡 Recommendations:"));
  if (impactScore > 100) {
    console.log("• Consider green hosting providers");
    console.log("• Implement aggressive caching strategies");
    console.log("• Optimize high-impact features");
    console.log("• Consider edge computing for global users");
  } else if (impactScore > 50) {
    console.log("• Monitor and optimize resource usage");
    console.log("• Consider CDN for better performance");
    console.log("• Implement efficient data storage");
  } else {
    console.log("• Great job! Your project has low CO2 impact");
    console.log("• Continue monitoring as you scale");
  }

  console.log("\n" + "═".repeat(50));
  console.log(chalk.green("✅ Assessment completed successfully!"));
}
