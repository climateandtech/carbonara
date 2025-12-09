/**
 * Test script for Semgrep integration
 * Run with: npx ts-node test/test-semgrep.ts
 */

import { createSemgrepService } from "../src/services/semgrepService";
import * as path from "path";

async function testSemgrepService() {
  console.log("Testing Semgrep Service...\n");

  // Create service instance
  const semgrep = createSemgrepService({
    // Start with system Python, can switch to bundled later
    useBundledPython: false,
  });

  // 1. Check setup
  console.log("1. Checking Semgrep setup...");
  const setupCheck = await semgrep.checkSetup();
  if (setupCheck.isValid) {
    console.log("   ✓ Setup is valid");
  } else {
    console.log("   ✗ Setup has issues:");
    setupCheck.errors.forEach((err) => console.log(`     - ${err}`));
    console.log("\n   Please install Semgrep manually with: pip install semgrep");
    console.log("   Or use the VSCode extension which supports auto-installation.");
    return;
  }

  // 2. Get available rules
  console.log("\n2. Getting available rules...");
  const rules = await semgrep.getAvailableRules();
  console.log(`   Found ${rules.length} rule file(s):`);
  rules.forEach((rule) => console.log(`   - ${rule}`));

  // 3. Test on example file
  console.log("\n3. Testing on example code...");
  const exampleFile = path.resolve(
    __dirname,
    "..",
    "semgrep",
    "example-code.js"
  );

  const result = await semgrep.analyzeFile(exampleFile);

  if (result.success) {
    console.log("   ✓ Analysis completed successfully");
    console.log("\n" + semgrep.formatResults(result));
  } else {
    console.log("   ✗ Analysis failed:");
    result.errors.forEach((err) => console.log(`     - ${err}`));
  }

  // 4. Test on a directory (src directory)
  console.log("\n4. Testing on src directory...");
  const srcDir = path.resolve(__dirname, "..", "src");

  const dirResult = await semgrep.analyzeDirectory(srcDir);

  if (dirResult.success) {
    console.log("   ✓ Directory analysis completed");
    console.log(
      `   Found ${dirResult.stats.total_matches} issue(s) in ${dirResult.stats.files_scanned} file(s)`
    );

    // Show first 3 findings if any
    if (dirResult.matches.length > 0) {
      console.log("\n   First few findings:");
      dirResult.matches.slice(0, 3).forEach((match) => {
        console.log(
          `   - [${match.severity}] ${match.rule_id} in ${match.path}:${match.start_line}`
        );
      });
    }
  } else {
    console.log("   ✗ Directory analysis failed");
  }
}

// Run the test
testSemgrepService().catch(console.error);
