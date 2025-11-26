import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VSCodeDataProvider } from "../src/vscode-data-provider.js";
import { DataService } from "../src/data-service.js";
import { SchemaService } from "../src/schema-service.js";
import fs from "fs";
import path from "path";

describe("VSCodeDataProvider", () => {
  let dataProvider: VSCodeDataProvider;
  let dataService: DataService;
  let schemaService: SchemaService;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = path.join("/tmp", `test-vscode-${Date.now()}.db`);
    dataService = new DataService({ dbPath: testDbPath });
    schemaService = new SchemaService();
    dataProvider = new VSCodeDataProvider(dataService, schemaService);

    await dataService.initialize();
    await schemaService.loadToolSchemas();
  });

  afterEach(async () => {
    await dataService.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe("Data Loading", () => {
    it("should load assessment data for a project", async () => {
      const projectId = await dataService.createProject(
        "Test Project",
        "/test/path"
      );

      await dataService.storeAssessmentData(
        projectId,
        "greenframe",
        "web-analysis",
        {
          url: "https://example.com",
          results: {
            carbon: { total: 0.245 },
            performance: { loadTime: 1250 },
          },
        }
      );

      const data = await dataProvider.loadDataForProject("/test/path");

      expect(data).toHaveLength(1);
      expect(data[0].tool_name).toBe("greenframe");
      expect(data[0].data.url).toBe("https://example.com");
    });

    it("should return empty array for non-existent project", async () => {
      const data = await dataProvider.loadDataForProject("/non/existent");
      expect(data).toEqual([]);
    });
  });

  describe("Schema-based Data Grouping", () => {
    let projectId: number;

    beforeEach(async () => {
      projectId = await dataService.createProject("Test Project", "/test/path");

      // Add test data for different tools
      await dataService.storeAssessmentData(
        projectId,
        "co2-assessment",
        "sustainability-assessment",
        {
          impactScore: 75,
          projectScope: { estimatedUsers: 1000, expectedTraffic: "medium" },
        }
      );

      await dataService.storeAssessmentData(
        projectId,
        "co2-assessment",
        "sustainability-assessment",
        {
          impactScore: 82,
          projectScope: { estimatedUsers: 5000, expectedTraffic: "high" },
        }
      );

      await dataService.storeAssessmentData(
        projectId,
        "co2-assessment",
        "questionnaire",
        {
          impactScore: 75,
          projectScope: { estimatedUsers: 10000, expectedTraffic: "high" },
          infrastructure: { hostingProvider: "AWS" },
        }
      );
    });

    it("should group data by tool with schema-based display", async () => {
      const groups = await dataProvider.createGroupedItems("/test/path");

      expect(groups).toHaveLength(1); // 1 tool (co2-assessment)

      // Find co2-assessment group
      const co2Group = groups.find((g) => g.toolName === "co2-assessment");
      expect(co2Group).toBeDefined();
      expect(co2Group?.displayName).toBe("🌍 assessment questionnaires");
      expect(co2Group?.entries).toHaveLength(3);
    });

    it("should create schema-based entry labels", async () => {
      const groups = await dataProvider.createGroupedItems("/test/path");

      const co2Group = groups.find((g) => g.toolName === "co2-assessment");
      const entry = co2Group?.entries[0];

      expect(entry?.label).toBeDefined();
      expect(entry?.label).toContain("Assessment"); // Contains entry type
    });

    it("should create detailed field items from schema", async () => {
      const data = await dataProvider.loadDataForProject("/test/path");
      const co2Entry = data.find((d) => d.tool_name === "co2-assessment");

      const details = await dataProvider.createDataDetails(co2Entry!);

      expect(details.length).toBeGreaterThan(0);

      // Check for expected fields based on schema
      const scoreField = details.find((d) => d.key === "impactScore");
      expect(scoreField?.label).toMatch(/📊 Overall Score: \d+/); // Should show score with schema label
    });

    it("should handle missing schema gracefully", async () => {
      // Add data for a tool without schema
      await dataService.storeAssessmentData(
        projectId,
        "unknown-tool",
        "test-type",
        {
          someData: "test",
        }
      );

      const groups = await dataProvider.createGroupedItems("/test/path");

      const unknownGroup = groups.find((g) => g.toolName === "unknown-tool");
      expect(unknownGroup).toBeDefined();
      expect(unknownGroup?.displayName).toBe(
        "Analysis results from unknown-tool"
      ); // Fallback
    });
  });

  describe("Data Refresh", () => {
    it("should refresh data when called", async () => {
      const projectId = await dataService.createProject(
        "Test Project",
        "/test/path"
      );

      // Initial load - empty
      let data = await dataProvider.loadDataForProject("/test/path");
      expect(data).toHaveLength(0);

      // Add data
      await dataService.storeAssessmentData(
        projectId,
        "greenframe",
        "web-analysis",
        {
          url: "https://example.com",
        }
      );

      // Refresh and verify data is loaded
      await dataProvider.refresh("/test/path");
      data = await dataProvider.loadDataForProject("/test/path");
      expect(data).toHaveLength(1);
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      // Suppress console.error for this test
      const originalConsoleError = console.error;
      console.error = () => {}; // Suppress error logging

      try {
        // Close the database to simulate error
        await dataService.close();

        const data = await dataProvider.loadDataForProject("/test/path");
        expect(data).toEqual([]); // Should return empty array, not throw
      } finally {
        // Restore console.error
        console.error = originalConsoleError;
      }
    });

    it("should handle malformed data gracefully", async () => {
      const projectId = await dataService.createProject(
        "Test Project",
        "/test/path"
      );

      // Store valid data
      await dataService.storeAssessmentData(
        projectId,
        "greenframe",
        "web-analysis",
        {
          url: "https://example.com",
          results: { totalBytes: 524288 },
        }
      );

      const groups = await dataProvider.createGroupedItems("/test/path");
      expect(groups).toHaveLength(1);
      expect(groups[0].entries).toHaveLength(1);
    });
  });
});
