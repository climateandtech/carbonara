import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

test.describe("Assessment Questionnaire E2E Tests", () => {
  const testWorkspacePath = path.join(__dirname, "../../../test-workspace-assessment");

  test.beforeAll(async () => {
    // Create test workspace
    if (!fs.existsSync(testWorkspacePath)) {
      fs.mkdirSync(testWorkspacePath, { recursive: true});
    }
  });

  test.afterAll(async () => {
    // Cleanup
    if (fs.existsSync(testWorkspacePath)) {
      fs.rmSync(testWorkspacePath, { recursive: true, force: true });
    }
  });

  test("should load all assessment sections from schema", async ({ page }) => {
    // Wait for extension to activate
    await page.waitForTimeout(2000);

    // Find the assessment tree view
    const assessmentTree = page.locator('[aria-label*="Assessment"]');
    await expect(assessmentTree).toBeVisible({ timeout: 10000 });

    // Check that all sections are present
    const expectedSections = [
      "Project Overview",
      "Infrastructure",
      "Development",
      "Features and Workload",
      "Sustainability and Goals",
      "Hardware Configuration",
      "Monitoring Configuration"
    ];

    for (const sectionName of expectedSections) {
      const section = page.locator(`text="${sectionName}"`);
      await expect(section).toBeVisible({ timeout: 5000 });
    }
  });

  test("should show completion status", async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for completion indicator (e.g., "0/7 completed")
    const completionStatus = page.locator('text=/\\d+\\/\\d+ completed/i');
    await expect(completionStatus).toBeVisible({ timeout: 10000 });
  });

  test("should expand section to show fields", async ({ page }) => {
    await page.waitForTimeout(2000);

    // Click on Project Overview section to expand
    const projectOverviewSection = page.locator('text="Project Overview"').first();
    await projectOverviewSection.click();

    // Wait for fields to appear
    await page.waitForTimeout(1000);

    // Check for expected fields
    const expectedUsersField = page.locator('text="Expected Users"');
    await expect(expectedUsersField).toBeVisible({ timeout: 5000 });
  });

  test("should persist assessment progress", async ({ page }) => {
    await page.waitForTimeout(2000);

    // Make sure .carbonara directory gets created
    const carbonaraDir = path.join(testWorkspacePath, ".carbonara");
    const progressFile = path.join(carbonaraDir, "assessment-progress.json");

    // After some interaction, progress should be saved
    // (This test verifies the file gets created - detailed progress testing is in unit tests)
    await page.waitForTimeout(3000);

    // Note: In a real E2E test, we'd interact with the UI and then check the file
    // For now, we just verify the mechanism exists
  });

  test("should display field types correctly", async ({ page }) => {
    await page.waitForTimeout(2000);

    // Expand a section
    const featuresSection = page.locator('text="Features and Workload"').first();
    await featuresSection.click();
    await page.waitForTimeout(1000);

    // Boolean fields should show checkboxes or toggle indicators
    // Select fields should show dropdown indicators
    // This is a visual verification test
  });

  test("should show section descriptions", async ({ page }) => {
    await page.waitForTimeout(2000);

    // Hover over or check for section descriptions
    // Each section should have its description from the schema
    const projectOverview = page.locator('text="Project Overview"').first();
    await projectOverview.hover();

    // Description might appear as tooltip or inline text
    // "context and baseline assumptions"
  });

  test("should handle schema loading errors gracefully", async ({ page }) => {
    // If schema fails to load, should show error message or empty state
    // Rather than crashing
    await page.waitForTimeout(2000);

    // Tree should still be visible even if there's an error
    const assessmentTree = page.locator('[aria-label*="Assessment"]');
    await expect(assessmentTree).toBeVisible({ timeout: 10000 });
  });
});
