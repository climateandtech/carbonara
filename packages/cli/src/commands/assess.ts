import { input, select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { createDataLake } from "@carbonara/core";
import { loadProjectConfig } from "../utils/config.js";

// CO2 Assessment Schema
const CO2AssessmentSchema = z.object({
  projectOverview: z.object({
    projectType: z.enum(["Mobile App", "Web App", "API", "Other"]).optional(),
    expectedUsers: z.enum([
      "fewer-than-50",
      "500-to-5000",
      "5000-to-50000",
      "over-50000",
      "unknown",
    ]),
    expectedTraffic: z.enum(["low", "medium", "high", "very-high"]),
    targetAudience: z.enum(["local", "national", "global"]),
    projectLifespan: z.number().min(1), // months
  }),
  development: z.object({
    teamSize: z.number().min(1),
    developmentDuration: z.number().min(1), // months
    cicdPipeline: z.boolean(),
    testingStrategy: z.enum(["minimal", "moderate", "comprehensive"]),
    codeQuality: z.enum(["basic", "good", "excellent"]),
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
  featuresAndWorkload: z.object({
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
  hardwareConfig: z.object({
    cpuTdp: z.number().min(1).max(500),
    totalVcpus: z.number().min(1).max(128),
    allocatedVcpus: z.number().min(1).max(64),
    gridCarbonIntensity: z.number().min(1).max(2000),
  }),
  monitoringConfig: z.object({
    enableCpuMonitoring: z.boolean(),
    enableE2eMonitoring: z.boolean(),
    e2eTestCommand: z.string().optional(),
    scrollToBottom: z.boolean(),
    firstVisitPercentage: z.number().min(0).max(1),
  }),
});

interface AssessOptions {
  interactive: boolean;
  file?: string;
}

export async function assessCommand(options: AssessOptions) {
  try {
    // Load project config
    const config = await loadProjectConfig();
    if (!config) {
      console.log(
        chalk.yellow('No project found. Run "carbonara init" first.')
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
      "assessment-questionnaire",
      "questionnaire",
      {
        ...validated,
        impactScore,
        completedAt: new Date().toISOString(),
      }
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
  console.log(chalk.green("\n Project Overview"));

  const expectedUsers = await select({
    message: "Expected number of users:",
    choices: [
      {
        name: "Fewer than 50 users",
        value: "fewer-than-50",
        description: "small internal system",
      },
      {
        name: "500 to 5,000 users",
        value: "500-to-5000",
        description: "medium organisation use",
      },
      {
        name: "5,000 to 50,000 users",
        value: "5000-to-50000",
        description: "enterprise or large-scale",
      },
      {
        name: "Over 50,000 users",
        value: "over-50000",
        description: "mass-market or nation-wide system",
      },
      {
        name: "Unknown",
        value: "unknown",
        description: "will depend on rollout or adoption rate",
      },
    ],
  });

  const expectedTraffic = await select({
    message: "Expected traffic level:",
    choices: [
      { name: "Low (< 1K visits/month)", value: "low" },
      { name: "Medium (1K-10K visits/month)", value: "medium" },
      { name: "High (10K-100K visits/month)", value: "high" },
      { name: "Very High (> 100K visits/month)", value: "very-high" },
    ],
  });

  const targetAudience = await select({
    message: "Target audience:",
    choices: [
      { name: "Local (same city/region)", value: "local" },
      { name: "National (same country)", value: "national" },
      { name: "Global (worldwide)", value: "global" },
    ],
  });

  const projectLifespan = await input({
    message: "Project lifespan (months):",
    default: "12",
    validate: (value: string) => {
      const num = parseInt(value);
      return !isNaN(num) && num > 0 ? true : "Must be a number greater than 0";
    },
  });

  const projectOverview = {
    expectedUsers,
    expectedTraffic,
    targetAudience,
    projectLifespan: parseInt(projectLifespan as string),
  };

  console.log(chalk.green("\n Infrastructure"));

  const hostingType = await select({
    message: "Hosting type:",
    choices: [
      { name: "Shared hosting", value: "shared" },
      { name: "Virtual Private Server (VPS)", value: "vps" },
      { name: "Dedicated server", value: "dedicated" },
      { name: "Cloud (AWS/Azure/GCP)", value: "cloud" },
      { name: "Hybrid setup", value: "hybrid" },
    ],
  });

  let cloudProvider;
  if (hostingType === "cloud") {
    cloudProvider = await input({
      message: "Cloud provider (if applicable):",
    });
  }

  const serverLocation = await select({
    message: "Server location relative to users:",
    choices: [
      { name: "Same continent", value: "same-continent" },
      { name: "Different continent", value: "different-continent" },
      { name: "Global CDN", value: "global-cdn" },
    ],
  });

  const dataStorage = await select({
    message: "Data storage requirements:",
    choices: [
      { name: "Minimal (< 1GB)", value: "minimal" },
      { name: "Moderate (1-10GB)", value: "moderate" },
      { name: "Heavy (10-100GB)", value: "heavy" },
      { name: "Massive (> 100GB)", value: "massive" },
    ],
  });

  const backupStrategy = await select({
    message: "Backup strategy:",
    choices: [
      { name: "No backups", value: "none" },
      { name: "Weekly backups", value: "weekly" },
      { name: "Daily backups", value: "daily" },
      { name: "Real-time backups", value: "real-time" },
    ],
  });

  const infrastructure = {
    hostingType,
    cloudProvider,
    serverLocation,
    dataStorage,
    backupStrategy,
  };

  console.log(chalk.green("\n Development"));

  const teamSize = await input({
    message: "Development team size:",
    default: "3",
    validate: (value: string) => {
      const num = parseInt(value);
      return !isNaN(num) && num > 0 ? true : "Must be a number greater than 0";
    },
  });

  const developmentDuration = await input({
    message: "Development duration (months):",
    default: "6",
    validate: (value: string) => {
      const num = parseInt(value);
      return !isNaN(num) && num > 0 ? true : "Must be a number greater than 0";
    },
  });

  const cicdPipeline = await confirm({
    message: "Using CI/CD pipeline?",
    default: true,
  });

  const testingStrategy = await select({
    message: "Testing strategy:",
    choices: [
      { name: "Minimal testing", value: "minimal" },
      { name: "Moderate testing", value: "moderate" },
      { name: "Comprehensive testing", value: "comprehensive" },
    ],
  });

  const codeQuality = await select({
    message: "Code quality standards:",
    choices: [
      { name: "Basic", value: "basic" },
      { name: "Good", value: "good" },
      { name: "Excellent", value: "excellent" },
    ],
  });

  const development = {
    teamSize: parseInt(teamSize),
    developmentDuration: parseInt(developmentDuration),
    cicdPipeline,
    testingStrategy,
    codeQuality,
  };

  console.log(chalk.green("\n⚡ Features"));

  const realTimeFeatures = await confirm({
    message: "Real-time features (WebSocket, live updates)?",
    default: false,
  });

  const mediaProcessing = await confirm({
    message: "Media processing (images, videos)?",
    default: false,
  });

  const aiMlFeatures = await confirm({
    message: "AI/ML features?",
    default: false,
  });

  const blockchainIntegration = await confirm({
    message: "Blockchain integration?",
    default: false,
  });

  const iotIntegration = await confirm({
    message: "IoT integration?",
    default: false,
  });

  const features = {
    realTimeFeatures,
    mediaProcessing,
    aiMlFeatures,
    blockchainIntegration,
    iotIntegration,
  };

  console.log(chalk.green("\n Sustainability and Goals"));

  const carbonNeutralityTarget = await confirm({
    message: "Carbon neutrality target?",
    default: false,
  });

  const greenHostingRequired = await confirm({
    message: "Green hosting required?",
    default: false,
  });

  const optimizationPriority = await select({
    message: "Optimization priority:",
    choices: [
      { name: "Performance first", value: "performance" },
      { name: "Sustainability first", value: "sustainability" },
      { name: "Balanced approach", value: "balanced" },
    ],
  });

  const budgetForGreenTech = await select({
    message: "Budget for green technology:",
    choices: [
      { name: "No budget", value: "none" },
      { name: "Low budget", value: "low" },
      { name: "Medium budget", value: "medium" },
      { name: "High budget", value: "high" },
    ],
  });

  const sustainabilityGoals = {
    carbonNeutralityTarget,
    greenHostingRequired,
    optimizationPriority,
    budgetForGreenTech,
  };

  console.log(chalk.green("\n💻 Hardware Configuration"));

  const cpuTdp = await input({
    message: "CPU Thermal Design Power (TDP) in watts:",
    default: "100",
    validate: (value) => {
      const num = parseInt(value);
      return num >= 1 && num <= 500 ? true : "Please enter a value between 1 and 500";
    },
  });

  const totalVcpus = await input({
    message: "Total vCPUs available on your system:",
    default: "8",
    validate: (value) => {
      const num = parseInt(value);
      return num >= 1 && num <= 128 ? true : "Please enter a value between 1 and 128";
    },
  });

  const allocatedVcpus = await input({
    message: "vCPUs allocated to your application:",
    default: "2",
    validate: (value) => {
      const num = parseInt(value);
      return num >= 1 && num <= 64 ? true : "Please enter a value between 1 and 64";
    },
  });

  const gridCarbonIntensity = await input({
    message: "Grid carbon intensity for your location (gCO2e/kWh):",
    default: "750",
    validate: (value) => {
      const num = parseInt(value);
      return num >= 1 && num <= 2000 ? true : "Please enter a value between 1 and 2000";
    },
  });

  const hardwareConfig = {
    cpuTdp: parseInt(cpuTdp),
    totalVcpus: parseInt(totalVcpus),
    allocatedVcpus: parseInt(allocatedVcpus),
    gridCarbonIntensity: parseInt(gridCarbonIntensity),
  };

  console.log(chalk.green("\n📊 Monitoring Configuration"));

  const enableCpuMonitoring = await confirm({
    message: "Enable CPU utilization monitoring during web analysis?",
    default: true,
  });

  const enableE2eMonitoring = await confirm({
    message: "Enable CPU monitoring during E2E test execution?",
    default: false,
  });

  let e2eTestCommand: string | undefined;
  if (enableE2eMonitoring) {
    e2eTestCommand = await input({
      message: "Command to run your E2E tests (e.g., 'npx cypress run'):",
      default: "npx cypress run",
    });
  }

  const scrollToBottom = await confirm({
    message: "Scroll to bottom of pages during web analysis?",
    default: false,
  });

  const firstVisitPercentage = await input({
    message: "Percentage of first-time visitors (0.0 to 1.0):",
    default: "0.9",
    validate: (value) => {
      const num = parseFloat(value);
      return num >= 0 && num <= 1 ? true : "Please enter a value between 0.0 and 1.0";
    },
  });

  const monitoringConfig = {
    enableCpuMonitoring,
    enableE2eMonitoring,
    e2eTestCommand,
    scrollToBottom,
    firstVisitPercentage: parseFloat(firstVisitPercentage),
  };

  return {
    projectOverview,
    infrastructure,
    development,
    features,
    sustainabilityGoals,
    hardwareConfig,
    monitoringConfig,
  };
}

function calculateCO2Impact(data: z.infer<typeof CO2AssessmentSchema>): number {
  let score = 0;

  // Traffic impact
  const trafficMultipliers = { low: 1, medium: 2, high: 4, "very-high": 8 };
  score += trafficMultipliers[data.projectOverview.expectedTraffic] * 10;

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
  if (data.featuresAndWorkload.realTimeFeatures) score += 15;
  if (data.featuresAndWorkload.mediaProcessing) score += 20;
  if (data.featuresAndWorkload.aiMlFeatures) score += 25;
  if (data.featuresAndWorkload.blockchainIntegration) score += 50;
  if (data.featuresAndWorkload.iotIntegration) score += 10;

  // Sustainability adjustments
  if (data.sustainabilityGoals.greenHostingRequired) score *= 0.7;
  if (data.sustainabilityGoals.carbonNeutralityTarget) score *= 0.8;

  return Math.round(score);
}

function generateAssessmentReport(
  data: z.infer<typeof CO2AssessmentSchema>,
  impactScore: number
) {
  console.log(chalk.green("\n Assessment Report"));
  console.log("═".repeat(50));

  console.log(chalk.blue("\n Project Overview:"));
  // Map expectedUsers value to label for display
  const userLabels: Record<string, string> = {
    "fewer-than-50": "Fewer than 50 users",
    "500-to-5000": "500 to 5,000 users",
    "5000-to-50000": "5,000 to 50,000 users",
    "over-50000": "Over 50,000 users",
    unknown: "Unknown",
  };
  console.log(
    `Expected Users: ${userLabels[data.projectOverview.expectedUsers] || data.projectOverview.expectedUsers}`
  );
  console.log(`Traffic Level: ${data.projectOverview.expectedTraffic}`);
  console.log(`Target Audience: ${data.projectOverview.targetAudience}`);
  console.log(
    `Project Lifespan: ${data.projectOverview.projectLifespan} months`
  );

  console.log(chalk.blue("\n Infrastructure:"));
  console.log(`Hosting: ${data.infrastructure.hostingType}`);
  console.log(`Server Location: ${data.infrastructure.serverLocation}`);
  console.log(`Data Storage: ${data.infrastructure.dataStorage}`);

  console.log(chalk.blue("\n High-Impact Features:"));
  const highImpactFeatures = [];
  if (data.featuresAndWorkload.realTimeFeatures)
    highImpactFeatures.push("Real-time features");
  if (data.featuresAndWorkload.mediaProcessing)
    highImpactFeatures.push("Media processing");
  if (data.featuresAndWorkload.aiMlFeatures)
    highImpactFeatures.push("AI/ML features");
  if (data.featuresAndWorkload.blockchainIntegration)
    highImpactFeatures.push("Blockchain");
  if (data.featuresAndWorkload.iotIntegration)
    highImpactFeatures.push("IoT integration");

  if (highImpactFeatures.length > 0) {
    highImpactFeatures.forEach((feature) => console.log(`• ${feature}`));
  } else {
    console.log("• None detected");
  }

  console.log(chalk.blue("\n Sustainability:"));
  console.log(
    `Carbon Neutrality Target: ${data.sustainabilityGoals.carbonNeutralityTarget ? "Yes" : "No"}`
  );
  console.log(
    `Green Hosting: ${data.sustainabilityGoals.greenHostingRequired ? "Yes" : "No"}`
  );
  console.log(
    `Optimization Priority: ${data.sustainabilityGoals.optimizationPriority}`
  );

  // Impact score and recommendations
  console.log(chalk.blue("\n CO2 Impact Score:"));
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

  console.log(chalk.blue("\n Recommendations:"));
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
  console.log(chalk.green(" Assessment completed successfully!"));
}
