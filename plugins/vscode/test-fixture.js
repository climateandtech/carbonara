// Test fixture to verify unified highlighter functionality
// This file contains code patterns that Semgrep will definitely detect

// Security issues that Semgrep will catch
function sqlInjection(userInput) {
  const query = "SELECT * FROM users WHERE id = " + userInput; // SQL injection
  return query;
}

function evalUsage(code) {
  return eval(code); // Dangerous eval usage - Semgrep will detect this
}

function hardcodedPassword() {
  const password = "admin123"; // Hardcoded password
  return password;
}

// Code quality issues
function unusedFunction() {
  console.log("This function is never called");
}

var globalVariable = "This should not be global";

// Performance issues
function infiniteLoop() {
  while (true) {
    console.log("This will run forever");
  }
}

function memoryLeak() {
  const data = [];
  setInterval(() => {
    data.push(new Array(1000).fill('memory leak'));
  }, 100);
}
