import * as path from "path";
import { runTests } from "@vscode/test-electron";
import { spawn } from "child_process";
import Mocha from "mocha";
import { glob } from "glob";

/**
 * Mocha test runner function called by @vscode/test-electron
 * This function is executed inside the VSCode extension host
 */
export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
  });

  // __dirname is dist/test, so we want to search in the current directory
  const testsRoot = __dirname;

  try {
    // Use async glob API (v11+ uses promises instead of callbacks)
    // Exclude e2e tests since they use Playwright, not Mocha
    const files = await glob("**/**.test.js", {
      cwd: testsRoot,
      ignore: ["**/e2e/**"],
    });

    // Add files to the test suite
    files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

    // Run the mocha test
    return new Promise((c, e) => {
      mocha.run((failures: number) => {
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    });
  } catch (err) {
    console.error(err);
    throw err;
  }
}

async function runMochaTests() {
  console.log("\n=== Running Mocha Tests (regular/ and suite/) ===\n");

  const extensionDevelopmentPath = path.resolve(__dirname, "../../");
  const extensionTestsPath = path.resolve(__dirname, "./runTest");

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      "--disable-extensions", // Disable other extensions
      "--disable-workspace-trust",
    ],
  });
}

async function runPlaywrightTests() {
  console.log("\n=== Running Playwright Tests (e2e/) ===\n");

  return new Promise<void>((resolve, reject) => {
    // Run playwright test command from the project root
    const projectRoot = path.resolve(__dirname, "../../");

    const playwrightProcess = spawn(
      "npx",
      ["playwright", "test", "src/test/e2e", "--workers=1"],
      {
        cwd: projectRoot,
        stdio: "inherit",
        shell: true,
      }
    );

    playwrightProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Playwright tests failed with exit code ${code}`));
      } else {
        resolve();
      }
    });

    playwrightProcess.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  try {
    // Run Mocha tests first
    await runMochaTests();

    // Then run Playwright tests
    await runPlaywrightTests();

    console.log("\n=== All tests completed successfully ===\n");
  } catch (err) {
    console.error("\n=== Test execution failed ===");
    console.error(err);
    process.exit(1);
  }
}

// Only run main() if this file is executed directly (not imported as a module)
if (require.main === module) {
  main();
}
