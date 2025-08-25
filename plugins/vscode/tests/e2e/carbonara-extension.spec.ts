import { test, expect } from '@playwright/test';
import { VSCodeLauncher, VSCodeInstance } from './helpers/vscode-launcher';

let vscode: VSCodeInstance;

test.describe('Carbonara VSCode Extension E2E Tests', () => {
  test.beforeEach(async () => {
    vscode = await VSCodeLauncher.launch();
    
    // Add debugging information
    console.log('📑 Extension launched, checking state...');
    await VSCodeLauncher.debugExtensionState(vscode.window);
    
    await VSCodeLauncher.waitForExtension(vscode.window);
  });

  test.afterEach(async () => {
    if (vscode) {
      await VSCodeLauncher.close(vscode);
    }
  });

  test('should show Carbonara status bar item and menu', async () => {
    // Verify status bar item exists
    const statusBarItem = vscode.window.locator('[title="Carbonara CO2 Assessment Tools"]');
    await expect(statusBarItem).toBeVisible();
    
    // Click status bar item to open menu
    await VSCodeLauncher.clickStatusBarCarbonara(vscode.window);
    
    // Verify menu appears with correct title
    const menuTitle = vscode.window.locator('text=Select a Carbonara action');
    await expect(menuTitle).toBeVisible();
    
    // Verify menu options are present
    await expect(vscode.window.locator('text=Initialize Project')).toBeVisible();
    await expect(vscode.window.locator('text=Run CO2 Assessment')).toBeVisible();
    await expect(vscode.window.locator('text=Analyze Website')).toBeVisible();
    await expect(vscode.window.locator('text=View Data')).toBeVisible();
    await expect(vscode.window.locator('text=Open Configuration')).toBeVisible();
    await expect(vscode.window.locator('text=Show Status')).toBeVisible();
  });

  test('should initialize a new project', async () => {
    // Open status bar menu
    await VSCodeLauncher.clickStatusBarCarbonara(vscode.window);
    
    // Click Initialize Project
    await vscode.window.locator('text=Initialize Project').click();
    
    // Fill project name
    const projectNameInput = vscode.window.locator('input[placeholder="Enter project name"]');
    await expect(projectNameInput).toBeVisible();
    await projectNameInput.fill('Test Carbonara Project');
    await projectNameInput.press('Enter');
    
    // Select project type
    const projectTypeMenu = vscode.window.locator('text=Select project type');
    await expect(projectTypeMenu).toBeVisible();
    
    await vscode.window.locator('text=Web Application').click();
    
    // Verify success notification
    const successNotification = vscode.window.locator('text=Carbonara project initialized successfully!');
    await expect(successNotification).toBeVisible({ timeout: 10000 });
  });

  test('should show Carbonara sidebar panels', async () => {
    // Open Carbonara sidebar
    await VSCodeLauncher.openSidebar(vscode.window);
    
    // Verify CO2 Assessment panel
    const assessmentPanel = vscode.window.locator('text=CO2 Assessment');
    await expect(assessmentPanel).toBeVisible();
    
    // Verify Data & Results panel  
    const dataPanel = vscode.window.locator('text=Data & Results');
    await expect(dataPanel).toBeVisible();
  });

  test('should show assessment sections in CO2 Assessment panel', async () => {
    // Initialize a project first
    await VSCodeLauncher.clickStatusBarCarbonara(vscode.window);
    await vscode.window.locator('text=Initialize Project').click();
    await vscode.window.locator('input[placeholder="Enter project name"]').fill('Test Project');
    await vscode.window.locator('input[placeholder="Enter project name"]').press('Enter');
    await vscode.window.locator('text=Web Application').click();
    
    // Wait for initialization to complete
    await vscode.window.locator('text=Carbonara project initialized successfully!').waitFor();
    
    // Open sidebar and navigate to CO2 Assessment
    await VSCodeLauncher.openSidebar(vscode.window);
    const assessmentPanel = vscode.window.locator('text=CO2 Assessment');
    await assessmentPanel.click();
    
    // Verify assessment sections are visible
    await expect(vscode.window.locator('text=Project Information')).toBeVisible();
    await expect(vscode.window.locator('text=Infrastructure')).toBeVisible();
    await expect(vscode.window.locator('text=Basic project details')).toBeVisible();
    await expect(vscode.window.locator('text=Hosting and infrastructure details')).toBeVisible();
  });

  test('should expand assessment section and show questions', async () => {
    // Initialize project and open assessment panel
    await VSCodeLauncher.clickStatusBarCarbonara(vscode.window);
    await vscode.window.locator('text=Initialize Project').click();
    await vscode.window.locator('input[placeholder="Enter project name"]').fill('Test Project');
    await vscode.window.locator('input[placeholder="Enter project name"]').press('Enter');
    await vscode.window.locator('text=Web Application').click();
    await vscode.window.locator('text=Carbonara project initialized successfully!').waitFor();
    
    await VSCodeLauncher.openSidebar(vscode.window);
    
    // Click on Project Information section to expand
    const projectInfoSection = vscode.window.locator('text=Project Information');
    await projectInfoSection.click();
    
    // Verify individual questions are visible
    await expect(vscode.window.locator('text=Expected Users')).toBeVisible();
    await expect(vscode.window.locator('text=Expected Traffic')).toBeVisible();
    await expect(vscode.window.locator('text=Target Audience')).toBeVisible();
    await expect(vscode.window.locator('text=Project Lifespan (months)')).toBeVisible();
    
    // Verify initial status shows "Not set"
    await expect(vscode.window.locator('text=Not set').first()).toBeVisible();
  });

  test('should allow editing assessment questions', async () => {
    // Initialize project and open assessment
    await VSCodeLauncher.clickStatusBarCarbonara(vscode.window);
    await vscode.window.locator('text=Initialize Project').click();
    await vscode.window.locator('input[placeholder="Enter project name"]').fill('Test Project');
    await vscode.window.locator('input[placeholder="Enter project name"]').press('Enter');
    await vscode.window.locator('text=Web Application').click();
    await vscode.window.locator('text=Carbonara project initialized successfully!').waitFor();
    
    await VSCodeLauncher.openSidebar(vscode.window);
    
    // Click on Project Information section header to start editing
    const projectInfoHeader = vscode.window.locator('text=📊 Project Information');
    await projectInfoHeader.click();
    
    // Fill Expected Users field
    const expectedUsersInput = vscode.window.locator('input[placeholder="Expected Users"]');
    await expect(expectedUsersInput).toBeVisible({ timeout: 5000 });
    await expectedUsersInput.fill('1000');
    await expectedUsersInput.press('Enter');
    
    // Select Expected Traffic option
    const trafficMenu = vscode.window.locator('text=Expected Traffic');
    await expect(trafficMenu).toBeVisible();
    await vscode.window.locator('text=Medium (1K-10K visits/month)').click();
    
    // Select Target Audience option
    await expect(vscode.window.locator('text=Target Audience')).toBeVisible();
    await vscode.window.locator('text=Global (worldwide)').click();
    
    // Fill Project Lifespan
    const lifespanInput = vscode.window.locator('input[placeholder="Project Lifespan (months)"]');
    await expect(lifespanInput).toBeVisible();
    await lifespanInput.fill('12');
    await lifespanInput.press('Enter');
    
    // Verify completion notification
    const completionNotification = vscode.window.locator('text=✅ 📊 Project Information completed!');
    await expect(completionNotification).toBeVisible({ timeout: 10000 });
  });

  test('should show "No projects found" when searching empty workspace', async () => {
    // Open status bar menu
    await VSCodeLauncher.clickStatusBarCarbonara(vscode.window);
    
    // Click Open Carbonara Project
    await vscode.window.locator('text=Open Carbonara Project').click();
    
    // Click Search current workspace
    await vscode.window.locator('text=Search current workspace for projects').click();
    
    // Verify no projects found message
    const noProjectsMessage = vscode.window.locator('text=No Carbonara projects found in current workspace');
    await expect(noProjectsMessage).toBeVisible();
  });

  test('should show website analysis option in menu', async () => {
    // Open status bar menu
    await VSCodeLauncher.clickStatusBarCarbonara(vscode.window);
    
    // Verify Analyze Website option exists
    const analyzeWebsiteOption = vscode.window.locator('text=Analyze Website');
    await expect(analyzeWebsiteOption).toBeVisible();
    
    // Click on it to verify dialog opens
    await analyzeWebsiteOption.click();
    
    // Should see URL input dialog
    const urlInput = vscode.window.locator('input[placeholder*="URL"], input[placeholder*="url"], input[placeholder*="website"]');
    await expect(urlInput).toBeVisible({ timeout: 5000 });
  });

  test('should show data management options', async () => {
    // Open status bar menu
    await VSCodeLauncher.clickStatusBarCarbonara(vscode.window);
    
    // Click View Data option
    await vscode.window.locator('text=View Data').click();
    
    // Verify data management options appear
    await expect(vscode.window.locator('text=View in Sidebar')).toBeVisible();
    await expect(vscode.window.locator('text=Export as JSON')).toBeVisible();
    await expect(vscode.window.locator('text=Export as CSV')).toBeVisible();
    await expect(vscode.window.locator('text=Clear All Data')).toBeVisible();
  });
}); 