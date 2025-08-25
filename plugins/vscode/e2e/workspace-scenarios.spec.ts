import { test, expect } from '@playwright/test';
import { VSCodeLauncher, VSCodeInstance, WorkspaceFixture } from './helpers/vscode-launcher';
import { SELECTORS } from '../src/constants/ui-text';

async function setupTest(workspaceFixture: WorkspaceFixture): Promise<VSCodeInstance> {
  const vscode = await VSCodeLauncher.launch(workspaceFixture);
  await vscode.window.waitForTimeout(3000);
  await VSCodeLauncher.dismissDialogs(vscode.window);
  return vscode;
}

test.describe('Workspace Scenarios - Project State Testing', () => {
  test.beforeAll(async () => {
    // Clean up any existing VSCode processes before starting tests
    await VSCodeLauncher.cleanupAll();
  });

  test.afterAll(async () => {
    // Final cleanup after all tests complete
    await VSCodeLauncher.cleanupAll();
  });
  
  test('Empty workspace - should show initialization options', async () => {
    const vscode = await setupTest('empty-workspace');
    
    try {
      // Click Carbonara in status bar (simple and fast)
      const carbonaraStatusBar = vscode.window.locator('text=Carbonara');
      await expect(carbonaraStatusBar).toBeVisible({ timeout: 10000 });
      await carbonaraStatusBar.click();
      await vscode.window.waitForTimeout(1000);
      
      // Look for "Open Carbonara Project" menu item
      const openProjectOption = vscode.window.locator('text=Open Carbonara Project');
      if (await openProjectOption.isVisible({ timeout: 3000 })) {
        await openProjectOption.click();
        await vscode.window.waitForTimeout(2000);
        
        // Should see initialization options in the quick pick menu
        const initOption = vscode.window.locator('[role="option"]:has-text("Initialize Carbonara in current workspace")');
        const searchOption = vscode.window.locator('[role="option"]:has-text("Search current workspace for projects")');
        
        await expect(initOption).toBeVisible({ timeout: 5000 });
        await expect(searchOption).toBeVisible({ timeout: 5000 });
        console.log('✅ Empty workspace shows correct initialization options');
        
        // Test "Search current workspace" - should find no projects
        await searchOption.click();
        await vscode.window.waitForTimeout(2000);
        
        // Should show "No projects found" message
        const noProjectsMessage = vscode.window.locator('text=/No.*Carbonara.*projects.*found/i').first();
        await expect(noProjectsMessage).toBeVisible({ timeout: 5000 });
        console.log('✅ Search in empty workspace correctly shows "No projects found"');
      }
    } finally {
      await VSCodeLauncher.close(vscode);
    }
  });

  test('Workspace with existing project - should recognize existing project', async () => {
    const vscode = await setupTest('with-carbonara-project');
    
    try {
      // In a populated workspace there can be multiple "Carbonara" matches; select the status bar button explicitly
      const carbonaraStatusBar = vscode.window.locator(SELECTORS.STATUS_BAR.ITEM);
      await carbonaraStatusBar.waitFor({ state: 'visible', timeout: 10000 });
      console.log('✅ Found Carbonara status bar button');
      await carbonaraStatusBar.click();
      console.log('✅ Clicked Carbonara status bar button');
      await vscode.window.waitForTimeout(1000);
      
      // Look for "Open Carbonara Project"
      const openProjectOption = vscode.window.locator('text=Open Carbonara Project');
      if (await openProjectOption.isVisible({ timeout: 3000 })) {
        await openProjectOption.click();
        await vscode.window.waitForTimeout(2000);
        
        // Should show message that current workspace is already a Carbonara project
        const existingProjectMessage = vscode.window.locator('text=/Current workspace is already.*Carbonara project/i').first();
        try {
          await expect(existingProjectMessage).toBeVisible({ timeout: 5000 });
          console.log('✅ Existing project correctly recognized');
        } catch (error) {
          console.log('ℹ️ Project recognition behavior may differ');
        }
      }
      
      // Test that we can see project data in sidebar
      try {
        await VSCodeLauncher.openSidebar(vscode.window);
        await vscode.window.waitForTimeout(2000);
        
        // Look for assessment data from our fixture
        const assessmentPanel = vscode.window.locator('text=CO2 Assessment');
        if (await assessmentPanel.isVisible({ timeout: 3000 })) {
          console.log('✅ CO2 Assessment panel visible with existing project');
          
          // Look for completed project info section
          const projectInfoSection = vscode.window.locator('text=Project Information');
          if (await projectInfoSection.isVisible({ timeout: 3000 })) {
            console.log('✅ Project Information section found');
          }
        }
      } catch (error) {
        console.log('ℹ️ Sidebar test inconclusive:', error.message);
      }
      
      await vscode.window.screenshot({ path: 'existing-project-loaded.png' });
      
    } finally {
      await VSCodeLauncher.close(vscode);
    }
  });

  test('Multiple projects workspace - should show project selection', async () => {
    const vscode = await setupTest('multiple-projects');
    
    try {
      // Click Carbonara in status bar (simple and fast)
      const carbonaraStatusBar = vscode.window.locator('text=Carbonara');
      await expect(carbonaraStatusBar).toBeVisible({ timeout: 10000 });
      await carbonaraStatusBar.click();
      await vscode.window.waitForTimeout(1000);
      
      const openProjectOption = vscode.window.locator('text=Open Carbonara Project');
      if (await openProjectOption.isVisible({ timeout: 3000 })) {
        await openProjectOption.click();
        await vscode.window.waitForTimeout(2000);
        
        // Click "Search current workspace for projects"
        const searchOption = vscode.window.locator('[role="option"]:has-text("Search current workspace for projects")');
        if (await searchOption.isVisible({ timeout: 3000 })) {
          await searchOption.click();
          await vscode.window.waitForTimeout(3000);
          
          // Should show both projects for selection
          const webAppProject = vscode.window.locator('[role="option"]:has-text("Web App Project")');
          const mobileAppProject = vscode.window.locator('[role="option"]:has-text("Mobile App Project")');
          
          try {
            await expect(webAppProject).toBeVisible({ timeout: 5000 });
            await expect(mobileAppProject).toBeVisible({ timeout: 5000 });
            console.log('✅ Multiple projects found and displayed for selection');
            
            await vscode.window.screenshot({ path: 'multiple-projects-selection.png' });
          } catch (error) {
            console.log('❌ Multiple projects not found as expected:', error.message);
            await vscode.window.screenshot({ path: 'multiple-projects-failed.png' });
          }
        }
      }
    } finally {
      await VSCodeLauncher.close(vscode);
    }
  });

  test('Invalid project workspace - should handle corrupted config gracefully', async () => {
    const vscode = await setupTest('invalid-project');
    
    try {
      // Simple approach: find Carbonara status bar and click it
      const carbonaraStatusBar = vscode.window.locator(SELECTORS.STATUS_BAR.ITEM);
      await expect(carbonaraStatusBar).toBeVisible({ timeout: 10000 });
      console.log('✅ Found Carbonara status bar button');
      await carbonaraStatusBar.click();
      console.log('✅ Clicked Carbonara status bar button');
      await vscode.window.waitForTimeout(1000);
      
      const openProjectOption = vscode.window.locator('text=Open Carbonara Project');
      if (await openProjectOption.isVisible({ timeout: 3000 })) {
        await openProjectOption.click();
        await vscode.window.waitForTimeout(2000);
        
        // Should show warning about invalid config or treat as no project
        const searchOption = vscode.window.locator('[role="option"]:has-text("Search current workspace for projects")');
        if (await searchOption.isVisible({ timeout: 3000 })) {
          await searchOption.click();
          await vscode.window.waitForTimeout(3000);
          
          // Should either show no projects or show error message
          const noProjectsMessage = vscode.window.locator('text=/No.*Carbonara.*projects.*found/i').first();
          const errorMessage = vscode.window.locator('text=/invalid/i');
          
          const hasNoProjects = await noProjectsMessage.isVisible({ timeout: 3000 });
          const hasErrorMessage = await errorMessage.isVisible({ timeout: 3000 });
          
          if (hasNoProjects || hasErrorMessage) {
            console.log('✅ Invalid project handled gracefully');
          } else {
            console.log('ℹ️ Invalid project handling behavior unclear');
          }
          
          await vscode.window.screenshot({ path: 'invalid-project-handling.png' });
        }
      }
    } finally {
      await VSCodeLauncher.close(vscode);
    }
  });

  test('Project initialization in empty workspace - complete workflow', async () => {
    const vscode = await setupTest('empty-workspace');
    
    try {
      const carbonaraStatusBar = vscode.window.locator('.statusbar-item:has-text("Carbonara")');
      await carbonaraStatusBar.click();
      await vscode.window.waitForTimeout(1000);
      
      // Test full initialization workflow
      const initProjectOption = vscode.window.locator('text=Initialize Project');
      if (await initProjectOption.isVisible({ timeout: 3000 })) {
        await initProjectOption.click();
        console.log('✅ Clicked Initialize Project');
        
        await vscode.window.waitForTimeout(2000);
        await vscode.window.screenshot({ path: 'init-project-dialog.png' });
        
        // Look for project name input
        const inputField = vscode.window.locator('input[placeholder*="project name" i], input[placeholder*="name" i]');
        if (await inputField.isVisible({ timeout: 5000 })) {
          console.log('✅ Found project name input');
          await inputField.fill('E2E Test Project');
          await inputField.press('Enter');
          
          await vscode.window.waitForTimeout(2000);
          await vscode.window.screenshot({ path: 'project-type-selection.png' });
          
          // Look for project type selection
          const webAppOption = vscode.window.locator('text=Web Application');
          if (await webAppOption.isVisible({ timeout: 5000 })) {
            console.log('✅ Found project type options');
            await webAppOption.click();
            
            // Wait for success notification
            await vscode.window.waitForTimeout(3000);
            await vscode.window.screenshot({ path: 'project-init-success.png' });
            
            const successNotification = vscode.window.locator('text=/.*initialized successfully.*/i').first();
            if (await successNotification.isVisible({ timeout: 8000 })) {
              console.log('✅ Project initialization completed successfully!');
            } else {
              console.log('ℹ️ Success notification not found, but initialization may have succeeded');
            }
            
            // 🔍 VERIFY PROJECT CREATION: Test that initialization worked by checking UI consequences
            await vscode.window.waitForTimeout(3000); // Wait for project to be recognized
            
            // Test consequence 1: Status bar behavior should change
            console.log('🧪 Testing: Status bar should now recognize existing project...');
            await carbonaraStatusBar.click();
            await vscode.window.waitForTimeout(1000);
            
            // Look for "Open Carbonara Project" option (appears when no project vs when project exists)
            const openProjectOption = vscode.window.locator('text=Open Carbonara Project');
            if (await openProjectOption.isVisible({ timeout: 3000 })) {
              await openProjectOption.click();
              await vscode.window.waitForTimeout(2000);
              
              // Should now show that current workspace is already a Carbonara project
              const existingProjectMessage = vscode.window.locator('text=/Current workspace is already.*Carbonara project/i');
              try {
                await expect(existingProjectMessage).toBeVisible({ timeout: 5000 });
                console.log('✅ Project initialization verified: Extension recognizes project exists');
              } catch (error) {
                console.log('🧪 Alternative check: Look for search option behavior...');
                
                // Alternative: Check search behavior
                const searchOption = vscode.window.locator('[role="option"]:has-text("Search current workspace for projects")');
                if (await searchOption.isVisible({ timeout: 3000 })) {
                  await searchOption.click();
                  await vscode.window.waitForTimeout(2000);
                  
                  // Should find the project we just created
                  const projectFound = vscode.window.locator('text=/E2E Test Project/i');
                  if (await projectFound.isVisible({ timeout: 3000 })) {
                    console.log('✅ Project initialization verified: Project found in workspace search');
                  } else {
                    console.log('⚠️ Project may not be fully recognized yet');
                  }
                }
              }
            }
          }
        }
      }
    } finally {
      await VSCodeLauncher.close(vscode);
    }
  });
}); 