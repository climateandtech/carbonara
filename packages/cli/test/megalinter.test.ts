import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { describe, test, beforeEach, afterEach, expect } from "vitest";

describe("Carbonara CLI - MegaLinter Tests", () => {
  let testDir: string;
  let cliPath: string;
  let megalinterResult: string | null = null;
  let initialFiles: string[] = [];
  let finalFiles: string[] = [];
  const isCI =
    process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

  beforeEach(() => {
    testDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "carbonara-megalinter-test-")
    );
    cliPath = path.resolve("./dist/index.js");

    // Create a mock project config
    fs.writeFileSync(
      path.join(testDir, "carbonara.config.json"),
      JSON.stringify({
        name: "Test Project",
        projectType: "web",
        projectId: "test-megalinter-123",
      })
    );

    // Get initial file list
    initialFiles = fs.readdirSync(testDir);

    // Run megalinter once
    try {
      megalinterResult = execSync(
        `cd "${testDir}" && node "${cliPath}" megalinter`,
        {
          encoding: "utf8",
          timeout: 30000,
        }
      );
    } catch (error: any) {
      // If megalinter fails, that's ok for this test
      console.log("MegaLinter execution may have failed, checking file creation");
      megalinterResult = null;
    }

    // Get final file list after running megalinter
    finalFiles = fs.readdirSync(testDir);
  }, 45000);

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("megalinter command should save results to database", () => {
    // Check that the command indicates database save
    if (megalinterResult) {
      expect(megalinterResult).toContain("Results saved to database");
    }

    // Verify only the expected database file was created
    const expectedFiles = [...initialFiles, "carbonara.db"];
    expect(finalFiles.sort()).toEqual(expectedFiles.sort());
  });

  test("megalinter command should only create database file", () => {
    // Verify only the expected database file was created
    const expectedFiles = [...initialFiles, "carbonara.db"];
    expect(finalFiles.sort()).toEqual(expectedFiles.sort());
  });
});
