"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const path = __importStar(require("path"));
const test_electron_1 = require("@vscode/test-electron");
const child_process_1 = require("child_process");
const mocha_1 = __importDefault(require("mocha"));
const glob_1 = require("glob");
/**
 * Mocha test runner function called by @vscode/test-electron
 * This function is executed inside the VSCode extension host
 */
async function run() {
    // Create the mocha test
    const mocha = new mocha_1.default({
        ui: "tdd",
        color: true,
    });
    // __dirname is dist/test, so we want to search in the current directory
    const testsRoot = __dirname;
    try {
        // Use async glob API (v11+ uses promises instead of callbacks)
        // Exclude e2e tests since they use Playwright, not Mocha
        // Only run integration tests for now
        const files = await (0, glob_1.glob)("**/integration/**/*.test.js", {
            cwd: testsRoot,
            ignore: ["**/e2e/**"],
        });
        // Add files to the test suite
        files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));
        // Run the mocha test
        return new Promise((c, e) => {
            mocha.run((failures) => {
                if (failures > 0) {
                    e(new Error(`${failures} tests failed.`));
                }
                else {
                    c();
                }
            });
        });
    }
    catch (err) {
        console.error(err);
        throw err;
    }
}
async function runMochaTests() {
    console.log("\n=== Running Mocha Tests (unit/ and integration/) ===\n");
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const extensionTestsPath = path.resolve(__dirname, "./runTest");
    await (0, test_electron_1.runTests)({
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
    return new Promise((resolve, reject) => {
        // Run playwright test command from the project root
        const projectRoot = path.resolve(__dirname, "../../");
        const playwrightProcess = (0, child_process_1.spawn)("npx", ["playwright", "test", "src/test/e2e", "--workers=1"], {
            cwd: projectRoot,
            stdio: "inherit",
            shell: true,
        });
        playwrightProcess.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(`Playwright tests failed with exit code ${code}`));
            }
            else {
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
    }
    catch (err) {
        console.error("\n=== Test execution failed ===");
        console.error(err);
        process.exit(1);
    }
}
// Only run main() if this file is executed directly (not imported as a module)
if (require.main === module) {
    main();
}
