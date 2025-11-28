/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2025 Carbonara team
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

/**
 * Checks if Playwright browsers are installed
 */
export async function arePlaywrightBrowsersInstalled(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    const executablePath = chromium.executablePath();
    
    // Check if the executable actually exists
    if (!fs.existsSync(executablePath)) {
      return false;
    }
    
    return true;
  } catch (error: any) {
    // Browser not installed or executable doesn't exist
    if (
      error.message?.includes("Executable doesn't exist") ||
      error.message?.includes("browser executable not found") ||
      error.message?.includes("Executable not found")
    ) {
      return false;
    }
    // Re-throw if it's a different error
    throw error;
  }
}

/**
 * Checks if Puppeteer browsers are installed
 * Specifically checks for Chrome 139 which is required by Puppeteer 24.17.0 (used by IF plugin)
 */
export async function arePuppeteerBrowsersInstalled(): Promise<boolean> {
  try {
    // First, try to use the IF plugin's Puppeteer to check if Chrome is installed
    // This ensures we check for the correct version (139)
    try {
      const execaModule = await import("execa");
      const execa = (execaModule as any).execa || execaModule.default;
      
      // Check if IF plugin is installed
      try {
        await execa("npm", ["list", "-g", "@tngtech/if-webpage-plugins"], {
          stdio: "pipe",
          timeout: 5000,
        });
        
        // IF plugin is installed, use its Puppeteer to check for Chrome
        const result = await execa(
          "npx",
          ["--package=@tngtech/if-webpage-plugins", "puppeteer", "browsers", "install", "--dry-run", "chrome"],
          {
            stdio: "pipe",
            timeout: 10000,
          }
        );
        
        // If the command succeeds, Chrome is available
        return result.exitCode === 0;
      } catch {
        // IF plugin not installed, fall back to file system check
      }
    } catch {
      // Fall back to file system check
    }

    // Fallback: Check if Puppeteer cache directory exists and contains Chrome
    // Puppeteer typically installs browsers to ~/.cache/puppeteer
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      return false;
    }

    const puppeteerCachePath = path.join(homeDir, ".cache", "puppeteer");
    if (!fs.existsSync(puppeteerCachePath)) {
      return false;
    }

    // Check if chrome directory exists in cache
    // Prefer Chrome 139 (required by IF plugin's Puppeteer 24.17.0)
    const chromeDirs = fs.readdirSync(puppeteerCachePath).filter((dir) =>
      dir.startsWith("chrome")
    );
    
    if (chromeDirs.length === 0) {
      return false;
    }

    // Check if executable exists in the chrome directory
    // Prioritize Chrome 139 if it exists
    const chrome139Dir = chromeDirs.find((dir) => dir.includes("139.0.7258.138"));
    const dirsToCheck = chrome139Dir ? [chrome139Dir, ...chromeDirs.filter(d => d !== chrome139Dir)] : chromeDirs;

    for (const chromeDir of dirsToCheck) {
      const chromePath = path.join(puppeteerCachePath, chromeDir);
      const macChromePath = path.join(chromePath, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
      const linuxChromePath = path.join(chromePath, "chrome-linux64", "chrome");
      const winChromePath = path.join(chromePath, "chrome-win64", "chrome.exe");

      if (fs.existsSync(macChromePath) || fs.existsSync(linuxChromePath) || fs.existsSync(winChromePath)) {
        return true;
      }
    }

    return false;
  } catch (error: any) {
    console.error("Error checking Puppeteer browsers:", error);
    return false;
  }
}

/**
 * Ensures Playwright browsers are installed, installing them if necessary
 */
export async function ensurePlaywrightBrowsersInstalled(): Promise<void> {
  if (await arePlaywrightBrowsersInstalled()) {
    return;
  }

  const progressOptions: vscode.ProgressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: "Installing Playwright browsers",
    cancellable: false,
  };

  await vscode.window.withProgress(progressOptions, async (progress) => {
    progress.report({
      increment: 0,
      message: "This is a one-time setup for webpage analysis tools...",
    });

    try {
      const execaModule = await import("execa");
      const execa = (execaModule as any).execa || execaModule.default;

      progress.report({
        increment: 30,
        message: "Installing Chromium browser...",
      });

      const { stdout, stderr } = await execa(
        "npx",
        ["playwright", "install", "chromium"],
        {
          stdio: "pipe",
          timeout: 300000,
        }
      );

      if (stderr && !stderr.includes("Installing")) {
        console.log("Playwright install warnings:", stderr);
      }

      progress.report({
        increment: 100,
        message: "Playwright browsers installed successfully!",
      });

      vscode.window.showInformationMessage(
        "✅ Playwright browsers installed successfully! You can now use webpage analysis tools."
      );
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      const errorOutput = error.stderr || error.stdout || "";

      const fullError = `Failed to install Playwright browsers automatically.\n` +
        `Error: ${errorMessage}\n` +
        `${errorOutput ? errorOutput + "\n" : ""}` +
        `Please run manually: npx playwright install chromium`;

      vscode.window.showErrorMessage(
        `Failed to install Playwright browsers: ${errorMessage}`,
        "Install Manually"
      ).then((selection) => {
        if (selection === "Install Manually") {
          const terminal = vscode.window.createTerminal("Carbonara - Install Playwright");
          terminal.sendText("npx playwright install chromium");
          terminal.show();
        }
      });

      throw new Error(fullError);
    }
  });
}

/**
 * Ensures Puppeteer browsers are installed, installing them if necessary
 * Uses the Puppeteer from @tngtech/if-webpage-plugins to ensure version compatibility
 */
export async function ensurePuppeteerBrowsersInstalled(): Promise<void> {
  if (await arePuppeteerBrowsersInstalled()) {
    return;
  }

  const progressOptions: vscode.ProgressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: "Installing Puppeteer browsers",
    cancellable: false,
  };

  await vscode.window.withProgress(progressOptions, async (progress) => {
    progress.report({
      increment: 0,
      message: "This is a one-time setup for Impact Framework webpage analysis...",
    });

    try {
      const execaModule = await import("execa");
      const execa = (execaModule as any).execa || execaModule.default;

      // First, ensure the IF plugin is installed (it includes Puppeteer)
      progress.report({
        increment: 10,
        message: "Checking IF plugin installation...",
      });

      // Check if @tngtech/if-webpage-plugins is installed globally
      let ifPluginInstalled = false;
      try {
        await execa("npm", ["list", "-g", "@tngtech/if-webpage-plugins"], {
          stdio: "pipe",
          timeout: 10000,
        });
        ifPluginInstalled = true;
      } catch {
        // Plugin not installed, we'll install it
        ifPluginInstalled = false;
      }

      if (!ifPluginInstalled) {
        progress.report({
          increment: 20,
          message: "Installing IF plugin (includes Puppeteer)...",
        });

        // Install the IF plugin which includes the correct Puppeteer version
        await execa("npm", ["install", "-g", "@grnsft/if", "@tngtech/if-webpage-plugins"], {
          stdio: "pipe",
          timeout: 300000,
        });
      }

      // First, try to clear npx cache to avoid ENOTEMPTY errors
      progress.report({
        increment: 40,
        message: "Preparing browser installation...",
      });

      try {
        // Clear npm cache
        await execa("npm", ["cache", "clean", "--force"], {
          stdio: "pipe",
          timeout: 30000,
        });
      } catch (cacheError: any) {
        // Cache clean failure is not critical, continue with installation
        console.log("Cache clean warning (non-critical):", cacheError.message);
      }

      // Also try to clear the npx cache directory specifically
      try {
        const os = await import("os");
        const npxCachePath = path.join(os.homedir(), ".npm", "_npx");
        if (fs.existsSync(npxCachePath)) {
          // Try to remove the npx cache directory
          // This is safe - it's just temporary cache
          fs.rmSync(npxCachePath, { recursive: true, force: true });
          console.log("Cleared npx cache directory");
        }
      } catch (npxCacheError: any) {
        // If we can't clear it, that's okay - we'll try the install anyway
        console.log("Could not clear npx cache (non-critical):", npxCacheError.message);
      }

      progress.report({
        increment: 50,
        message: "Installing Chrome browser (using IF plugin's Puppeteer)...",
      });

      // Install Puppeteer Chrome browser using the Puppeteer from the IF plugin
      // This ensures we get the correct Chrome version (139) that matches Puppeteer 24.17.0
      const { stdout, stderr } = await execa(
        "npx",
        ["--package=@tngtech/if-webpage-plugins", "puppeteer", "browsers", "install", "chrome"],
        {
          stdio: "pipe",
          timeout: 300000,
          shell: true, // Use shell to handle npm/npx better
        }
      );

      if (stderr && !stderr.includes("Installing") && !stderr.includes("warn")) {
        console.log("Puppeteer install warnings:", stderr);
      }

      progress.report({
        increment: 100,
        message: "Puppeteer browsers installed successfully!",
      });

      vscode.window.showInformationMessage(
        "✅ Puppeteer browsers installed successfully! You can now use Impact Framework webpage analysis tools."
      );
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      const errorOutput = error.stderr || error.stdout || "";

      // Check if it's the ENOTEMPTY error
      const isCacheError = errorMessage.includes("ENOTEMPTY") || 
                          errorOutput.includes("ENOTEMPTY") ||
                          error.exitCode === 190;

      let fullError: string;
      let userMessage: string;

      if (isCacheError) {
        userMessage = `npm cache conflict detected. This usually means a previous installation was interrupted.`;
        fullError = `Failed to install Puppeteer browsers: npm cache conflict (ENOTEMPTY).\n` +
          `This usually happens when a previous npx installation was interrupted.\n\n` +
          `To fix this, please run in a terminal:\n` +
          `  npm cache clean --force\n` +
          `  rm -rf ~/.npm/_npx\n` +
          `  npx --package=@tngtech/if-webpage-plugins puppeteer browsers install chrome\n\n` +
          `Or ensure IF plugin is installed first:\n` +
          `  npm install -g @grnsft/if @tngtech/if-webpage-plugins\n` +
          `  npx --package=@tngtech/if-webpage-plugins puppeteer browsers install chrome`;
      } else {
        userMessage = `Failed to install Puppeteer browsers: ${errorMessage}`;
        fullError = `Failed to install Puppeteer browsers automatically.\n` +
          `Error: ${errorMessage}\n` +
          `${errorOutput ? errorOutput + "\n" : ""}` +
          `Please ensure the IF plugin is installed and run manually:\n` +
          `  npm install -g @grnsft/if @tngtech/if-webpage-plugins\n` +
          `  npx --package=@tngtech/if-webpage-plugins puppeteer browsers install chrome`;
      }

      const actions = isCacheError 
        ? ["Clear Cache & Retry", "Install Manually", "Dismiss"]
        : ["Install Manually", "Dismiss"];

      vscode.window.showErrorMessage(
        userMessage,
        ...actions
      ).then((selection) => {
        if (selection === "Clear Cache & Retry") {
          const terminal = vscode.window.createTerminal("Carbonara - Fix Puppeteer");
          // Clear both npm cache and npx cache directory, then install using IF plugin's Puppeteer
          terminal.sendText("npm cache clean --force && rm -rf ~/.npm/_npx && npm install -g @grnsft/if @tngtech/if-webpage-plugins && npx --package=@tngtech/if-webpage-plugins puppeteer browsers install chrome");
          terminal.show();
        } else if (selection === "Install Manually") {
          const terminal = vscode.window.createTerminal("Carbonara - Install Puppeteer");
          // Install IF plugin first, then use its Puppeteer to install Chrome
          terminal.sendText("npm install -g @grnsft/if @tngtech/if-webpage-plugins && npx --package=@tngtech/if-webpage-plugins puppeteer browsers install chrome");
          terminal.show();
        }
      });

      throw new Error(fullError);
    }
  });
}











