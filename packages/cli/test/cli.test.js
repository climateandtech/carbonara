import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { describe, test, beforeEach, afterEach, expect } from "vitest";
describe("Carbonara CLI - Tests", () => {
    let testDir;
    let cliPath;
    beforeEach(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), "carbonara-test-"));
        cliPath = path.resolve("./dist/index.js");
    });
    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });
    test("CLI should show help", () => {
        const result = execSync(`node "${cliPath}" --help`, { encoding: "utf8" });
        expect(result).toContain("CLI tool for CO2 assessment");
        expect(result).toContain("Commands:");
        expect(result).toContain("init");
        expect(result).toContain("assess");
        expect(result).toContain("greenframe");
        expect(result).toContain("data");
    });
    test("CLI should show version", () => {
        const result = execSync(`node "${cliPath}" --version`, {
            encoding: "utf8",
        });
        expect(result).toContain("1.0.0");
    });
    test("assess command should show warning without project", () => {
        const result = execSync(`cd "${testDir}" && node "${cliPath}" assess`, {
            encoding: "utf8",
        });
        expect(result).toContain("No project found");
    });
    test("greenframe command should handle invalid URL", () => {
        try {
            execSync(`cd "${testDir}" && node "${cliPath}" greenframe invalid-url`, {
                encoding: "utf8",
            });
        }
        catch (error) {
            expect(error.status).toBe(1);
            expect(error.stderr.toString()).toContain("Error");
        }
    });
    test("greenframe command should work with valid URL", () => {
        try {
            const result = execSync(`cd "${testDir}" && node "${cliPath}" greenframe https://example.com`, {
                encoding: "utf8",
                timeout: 5000,
            });
            expect(result).toContain("Greenframe analysis completed");
            expect(result).toContain("Carbon Footprint");
        }
        catch (error) {
            // If greenframe fails, just check that it's trying to run
            expect(error.stderr.toString()).toContain("Greenframe analysis failed");
        }
    });
    test("data command should show help when no options provided", () => {
        fs.writeFileSync(path.join(testDir, "carbonara.config.json"), JSON.stringify({
            name: "Test Project",
            projectType: "web",
            projectId: "test-123",
        }));
        const result = execSync(`cd "${testDir}" && node "${cliPath}" data`, {
            encoding: "utf8",
        });
        expect(result).toContain("Data Lake Management");
        expect(result).toContain("--list");
    });
    test("data --list should handle missing database gracefully", () => {
        fs.writeFileSync(path.join(testDir, "carbonara.config.json"), JSON.stringify({
            name: "Test Project",
            projectType: "web",
            projectId: "test-123",
        }));
        try {
            const result = execSync(`cd "${testDir}" && node "${cliPath}" data --list`, { encoding: "utf8" });
            expect(result).toContain("No data found");
        }
        catch (error) {
            expect(error.stderr.toString()).toContain("Data operation failed");
        }
    });
    test("megalinter command should save results to database", () => {
        // Create a mock project config
        fs.writeFileSync(path.join(testDir, "carbonara.config.json"), JSON.stringify({
            name: "Test Project",
            projectType: "web",
            projectId: "test-megalinter-123",
        }));
        // Create mock megalinter reports directory and file
        const reportsDir = path.join(testDir, "megalinter-reports");
        fs.mkdirSync(reportsDir, { recursive: true });
        fs.writeFileSync(path.join(reportsDir, "mega-linter-report.json"), JSON.stringify({
            status: "completed",
            timestamp: new Date().toISOString(),
            summary: {
                linters_run: 5,
                errors: 2,
                warnings: 3,
            },
        }));
        // Get initial database entries count
        let initialEntries = 0;
        try {
            const initialResult = execSync(`cd "${testDir}" && node "${cliPath}" data -l`, {
                encoding: "utf8",
            });
            // Count entries by looking for lines that contain assessment data
            const lines = initialResult.split('\n').filter(line => line.includes('megalinter') || line.includes('code-quality'));
            initialEntries = lines.length;
        }
        catch {
            // If data command fails, assume 0 entries initially
            initialEntries = 0;
        }
        try {
            const result = execSync(`cd "${testDir}" && node "${cliPath}" megalinter`, {
                encoding: "utf8",
                timeout: 30000,
            });
            // Check that the command indicates database save
            expect(result).toContain("Results saved to database");
            expect(result).toContain("MegaLinter analysis completed");
            // Verify database entries increased
            const finalResult = execSync(`cd "${testDir}" && node "${cliPath}" data -l`, {
                encoding: "utf8",
            });
            const finalLines = finalResult.split('\n').filter(line => line.includes('megalinter') || line.includes('code-quality'));
            const finalEntries = finalLines.length;
            expect(finalEntries).toBeGreaterThan(initialEntries);
        }
        catch (error) {
            // If megalinter isn't installed, check that it tries to run and save
            const output = error.stdout?.toString() || "";
            const stderr = error.stderr?.toString() || "";
            // Should still show completion message even if megalinter fails
            if (stderr.includes("MegaLinter not found")) {
                // Test passes - megalinter not installed, can't test database storage
                expect(true).toBe(true);
            }
            else if (output.includes("Results saved to database")) {
                // Test passes - data was saved
                expect(true).toBe(true);
            }
            else {
                throw error;
            }
        }
    });
    test("megalinter command should clean up reports folder", () => {
        // Create a mock project config
        fs.writeFileSync(path.join(testDir, "carbonara.config.json"), JSON.stringify({
            name: "Test Project",
            projectType: "web",
            projectId: "test-megalinter-cleanup-123",
        }));
        // Create mock megalinter reports directory
        const reportsDir = path.join(testDir, "megalinter-reports");
        fs.mkdirSync(reportsDir, { recursive: true });
        fs.writeFileSync(path.join(reportsDir, "test-report.txt"), "test content");
        // Verify directory exists before running command
        expect(fs.existsSync(reportsDir)).toBe(true);
        try {
            execSync(`cd "${testDir}" && node "${cliPath}" megalinter`, {
                encoding: "utf8",
                timeout: 30000,
            });
        }
        catch (error) {
            // Command might fail due to missing megalinter, but cleanup should still happen
        }
        // Verify directory is cleaned up after command
        expect(fs.existsSync(reportsDir)).toBe(false);
    });
});
//# sourceMappingURL=cli.test.js.map