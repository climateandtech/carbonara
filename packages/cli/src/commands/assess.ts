import { input, select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { createDataLake } from "@carbonara/core";
import { loadProjectConfig } from "../utils/config.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load assessment schema
const schemaPath = path.join(__dirname, "../schemas/assessment-questionnaire.json");
const assessmentSchema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

// Build Zod schema from JSON Schema
function buildZodSchemaFromJson(jsonSchema: any): z.ZodObject<any> {
  const shape: any = {};

  for (const [sectionId, sectionDef] of Object.entries(jsonSchema.properties || {})) {
    const section: any = sectionDef;
    const sectionShape: any = {};

    for (const [fieldId, fieldDef] of Object.entries(section.properties || {})) {
      const field: any = fieldDef;
      let zodType: any;

      // Determine Zod type based on JSON Schema type
      if (field.type === "boolean") {
        zodType = z.boolean();
      } else if (field.type === "integer" || field.type === "number") {
        zodType = z.number();
        if (field.minimum !== undefined) zodType = zodType.min(field.minimum);
        if (field.maximum !== undefined) zodType = zodType.max(field.maximum);
      } else if (field.type === "string") {
        // If field has options, build enum from option values
        if (field.options && field.options.length > 0) {
          const enumValues = field.options.map((opt: any) => opt.value);
          zodType = z.enum(enumValues as [string, ...string[]]);
        } else {
          zodType = z.string();
        }
      } else {
        zodType = z.any();
      }

      // Handle optional fields
      const isRequired = section.required?.includes(fieldId);
      if (!isRequired) {
        zodType = zodType.optional();
      }

      sectionShape[fieldId] = zodType;
    }

    shape[sectionId] = z.object(sectionShape);
  }

  return z.object(shape);
}

// Assessment Questionnaire Schema (generated from JSON)
const AssessmentQuestionnaireSchema = buildZodSchemaFromJson(assessmentSchema);

// Helper functions to extract labels and metadata from schema
function getFieldLabel(sectionId: string, fieldId: string): string {
  const field = assessmentSchema.properties?.[sectionId]?.properties?.[fieldId];
  return field?.title || fieldId;
}

function getFieldOptions(sectionId: string, fieldId: string): any[] {
  const field = assessmentSchema.properties?.[sectionId]?.properties?.[fieldId];
  return field?.options || [];
}

function getSectionLabel(sectionId: string): string {
  const section = assessmentSchema.properties?.[sectionId];
  return section?.title || sectionId;
}

function getFieldDefault(sectionId: string, fieldId: string): any {
  const field = assessmentSchema.properties?.[sectionId]?.properties?.[fieldId];
  return field?.default;
}

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

    // Ensure we have a valid project ID
    let projectId = config.projectId;
    if (!projectId) {
      console.log(chalk.blue('🔧 No project ID found, creating project in database...'));

      const { getProjectRoot, saveProjectConfig } = await import('../utils/config.js');
      const projectPath = getProjectRoot() || process.cwd();

      projectId = await dataLake.createProject(
        config.name || 'Unnamed Project',
        projectPath,
        {
          description: config.description,
          projectType: config.projectType || 'web',
          initialized: new Date().toISOString()
        }
      );

      // Update config with new project ID
      const updatedConfig = { ...config, projectId };
      saveProjectConfig(updatedConfig, projectPath);

      console.log(chalk.green(`✅ Created project with ID: ${projectId}`));
    }

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
    const validated = AssessmentQuestionnaireSchema.parse(assessmentData);

    // Calculate CO2 impact score
    const impactScore = calculateCO2Impact(validated);

    // Store in database
    await dataLake.updateProjectCO2Variables(projectId, validated);
    await dataLake.storeAssessmentData(
      projectId,
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
  console.log(chalk.green(`\n ${getSectionLabel("projectOverview")}`));

  const expectedUsers = await select({
    message: `${getFieldLabel("projectOverview", "expectedUsers")}:`,
    choices: getFieldOptions("projectOverview", "expectedUsers").map((opt: any) => ({
      name: opt.label,
      value: opt.value,
      description: opt.detail,
    })),
  });

  const expectedTraffic = await select({
    message: `${getFieldLabel("projectOverview", "expectedTraffic")}:`,
    choices: getFieldOptions("projectOverview", "expectedTraffic").map((opt: any) => ({
      name: opt.label,
      value: opt.value,
    })),
  });

  const targetAudience = await select({
    message: `${getFieldLabel("projectOverview", "targetAudience")}:`,
    choices: getFieldOptions("projectOverview", "targetAudience").map((opt: any) => ({
      name: opt.label,
      value: opt.value,
    })),
  });

  const projectLifespan = await input({
    message: `${getFieldLabel("projectOverview", "projectLifespan")} (months):`,
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

  console.log(chalk.green(`\n ${getSectionLabel("infrastructure")}`));

  const hostingType = await select({
    message: `${getFieldLabel("infrastructure", "hostingType")}:`,
    choices: getFieldOptions("infrastructure", "hostingType").map((opt: any) => ({
      name: opt.label,
      value: opt.value,
    })),
  });

  let cloudProvider;
  if (hostingType === "cloud") {
    cloudProvider = await input({
      message: `${getFieldLabel("infrastructure", "cloudProvider")}:`,
    });
  }

  const serverLocation = await select({
    message: `${getFieldLabel("infrastructure", "serverLocation")}:`,
    choices: getFieldOptions("infrastructure", "serverLocation").map((opt: any) => ({
      name: opt.label,
      value: opt.value,
    })),
  });

  const dataStorage = await select({
    message: `${getFieldLabel("infrastructure", "dataStorage")}:`,
    choices: getFieldOptions("infrastructure", "dataStorage").map((opt: any) => ({
      name: opt.label,
      value: opt.value,
    })),
  });

  const backupStrategy = await select({
    message: `${getFieldLabel("infrastructure", "backupStrategy")}:`,
    choices: getFieldOptions("infrastructure", "backupStrategy").map((opt: any) => ({
      name: opt.label,
      value: opt.value,
    })),
  });

  const infrastructure = {
    hostingType,
    cloudProvider,
    serverLocation,
    dataStorage,
    backupStrategy,
  };

  console.log(chalk.green(`\n ${getSectionLabel("development")}`));

  const teamSize = await input({
    message: `${getFieldLabel("development", "teamSize")}:`,
    default: "3",
    validate: (value: string) => {
      const num = parseInt(value);
      return !isNaN(num) && num > 0 ? true : "Must be a number greater than 0";
    },
  });

  const developmentDuration = await input({
    message: `${getFieldLabel("development", "developmentDuration")} (months):`,
    default: "6",
    validate: (value: string) => {
      const num = parseInt(value);
      return !isNaN(num) && num > 0 ? true : "Must be a number greater than 0";
    },
  });

  const cicdPipeline = await confirm({
    message: `${getFieldLabel("development", "cicdPipeline")}?`,
    default: true,
  });

  const testingStrategy = await select({
    message: `${getFieldLabel("development", "testingStrategy")}:`,
    choices: getFieldOptions("development", "testingStrategy").map((opt: any) => ({
      name: opt.label,
      value: opt.value,
    })),
  });

  const codeQuality = await select({
    message: `${getFieldLabel("development", "codeQuality")}:`,
    choices: getFieldOptions("development", "codeQuality").map((opt: any) => ({
      name: opt.label,
      value: opt.value,
    })),
  });

  const development = {
    teamSize: parseInt(teamSize),
    developmentDuration: parseInt(developmentDuration),
    cicdPipeline,
    testingStrategy,
    codeQuality,
  };

  console.log(chalk.green(`\n ${getSectionLabel("featuresAndWorkload")}`));

  const realTimeFeatures = await confirm({
    message: `${getFieldLabel("featuresAndWorkload", "realTimeFeatures")}?`,
    default: false,
  });

  const mediaProcessing = await confirm({
    message: `${getFieldLabel("featuresAndWorkload", "mediaProcessing")}?`,
    default: false,
  });

  const aiMlFeatures = await confirm({
    message: `${getFieldLabel("featuresAndWorkload", "aiMlFeatures")}?`,
    default: false,
  });

  const blockchainIntegration = await confirm({
    message: `${getFieldLabel("featuresAndWorkload", "blockchainIntegration")}?`,
    default: false,
  });

  const iotIntegration = await confirm({
    message: `${getFieldLabel("featuresAndWorkload", "iotIntegration")}?`,
    default: false,
  });

  const features = {
    realTimeFeatures,
    mediaProcessing,
    aiMlFeatures,
    blockchainIntegration,
    iotIntegration,
  };

  console.log(chalk.green(`\n ${getSectionLabel("sustainabilityGoals")}`));

  const carbonNeutralityTarget = await confirm({
    message: `${getFieldLabel("sustainabilityGoals", "carbonNeutralityTarget")}?`,
    default: false,
  });

  const greenHostingRequired = await confirm({
    message: `${getFieldLabel("sustainabilityGoals", "greenHostingRequired")}?`,
    default: false,
  });

  const optimizationPriority = await select({
    message: `${getFieldLabel("sustainabilityGoals", "optimizationPriority")}:`,
    choices: getFieldOptions("sustainabilityGoals", "optimizationPriority").map((opt: any) => ({
      name: opt.label,
      value: opt.value,
    })),
  });

  const budgetForGreenTech = await select({
    message: `${getFieldLabel("sustainabilityGoals", "budgetForGreenTech")}:`,
    choices: getFieldOptions("sustainabilityGoals", "budgetForGreenTech").map((opt: any) => ({
      name: opt.label,
      value: opt.value,
    })),
  });

  const sustainabilityGoals = {
    carbonNeutralityTarget,
    greenHostingRequired,
    optimizationPriority,
    budgetForGreenTech,
  };

  console.log(chalk.green(`\n ${getSectionLabel("hardwareConfig")}`));

  const cpuTdp = await input({
    message: `${getFieldLabel("hardwareConfig", "cpuTdp")}:`,
    default: String(getFieldDefault("hardwareConfig", "cpuTdp") || "100"),
    validate: (value) => {
      const num = parseInt(value);
      return num >= 1 && num <= 500
        ? true
        : "Please enter a value between 1 and 500";
    },
  });

  const totalVcpus = await input({
    message: `${getFieldLabel("hardwareConfig", "totalVcpus")}:`,
    default: String(getFieldDefault("hardwareConfig", "totalVcpus") || "8"),
    validate: (value) => {
      const num = parseInt(value);
      return num >= 1 && num <= 128
        ? true
        : "Please enter a value between 1 and 128";
    },
  });

  const allocatedVcpus = await input({
    message: `${getFieldLabel("hardwareConfig", "allocatedVcpus")}:`,
    default: String(getFieldDefault("hardwareConfig", "allocatedVcpus") || "2"),
    validate: (value) => {
      const num = parseInt(value);
      return num >= 1 && num <= 64
        ? true
        : "Please enter a value between 1 and 64";
    },
  });

  const gridCarbonIntensity = await input({
    message: `${getFieldLabel("hardwareConfig", "gridCarbonIntensity")}:`,
    default: String(getFieldDefault("hardwareConfig", "gridCarbonIntensity") || "750"),
    validate: (value) => {
      const num = parseInt(value);
      return num >= 1 && num <= 2000
        ? true
        : "Please enter a value between 1 and 2000";
    },
  });

  const hardwareConfig = {
    cpuTdp: parseInt(cpuTdp),
    totalVcpus: parseInt(totalVcpus),
    allocatedVcpus: parseInt(allocatedVcpus),
    gridCarbonIntensity: parseInt(gridCarbonIntensity),
  };

  console.log(chalk.green(`\n ${getSectionLabel("monitoringConfig")}`));

  const enableCpuMonitoring = await confirm({
    message: `${getFieldLabel("monitoringConfig", "enableCpuMonitoring")}?`,
    default: getFieldDefault("monitoringConfig", "enableCpuMonitoring") ?? true,
  });

  const enableE2eMonitoring = await confirm({
    message: `${getFieldLabel("monitoringConfig", "enableE2eMonitoring")}?`,
    default: getFieldDefault("monitoringConfig", "enableE2eMonitoring") ?? false,
  });

  let e2eTestCommand: string | undefined;
  if (enableE2eMonitoring) {
    e2eTestCommand = await input({
      message: `${getFieldLabel("monitoringConfig", "e2eTestCommand")}:`,
      default: "npx cypress run",
    });
  }

  const scrollToBottom = await confirm({
    message: `${getFieldLabel("monitoringConfig", "scrollToBottom")}?`,
    default: getFieldDefault("monitoringConfig", "scrollToBottom") ?? false,
  });

  const firstVisitPercentage = await input({
    message: `${getFieldLabel("monitoringConfig", "firstVisitPercentage")}:`,
    default: String(getFieldDefault("monitoringConfig", "firstVisitPercentage") || "0.9"),
    validate: (value) => {
      const num = parseFloat(value);
      return num >= 0 && num <= 1
        ? true
        : "Please enter a value between 0.0 and 1.0";
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
    featuresAndWorkload: features,
    sustainabilityGoals,
    hardwareConfig,
    monitoringConfig,
  };
}

function calculateCO2Impact(
  data: z.infer<typeof AssessmentQuestionnaireSchema>
): number {
  let score = 0;

  // Traffic impact
  const trafficMultipliers: Record<string, number> = { low: 1, medium: 2, high: 4, "very-high": 8 };
  score += (trafficMultipliers[data.projectOverview.expectedTraffic] || 0) * 10;

  // Infrastructure impact
  const hostingMultipliers: Record<string, number> = {
    shared: 1,
    vps: 2,
    dedicated: 4,
    cloud: 3,
    hybrid: 5,
  };
  score += (hostingMultipliers[data.infrastructure.hostingType] || 0) * 5;

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
  data: z.infer<typeof AssessmentQuestionnaireSchema>,
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
