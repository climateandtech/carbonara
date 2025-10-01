// Performance Critical Issues - High Energy Consumption
function infiniteLoop() {
  while (true) {
    console.log("This will run forever - high energy consumption!");
  }
}

function memoryLeak() {
  const data = [];
  setInterval(() => {
    data.push(new Array(1000).fill('memory leak'));
  }, 100);
}

// Resource Optimization Issues
var unusedVariable = 'this is never used - waste of memory';
let anotherUnused = 42;

function deadCode() {
  return 'this code is never called - waste of processing';
}

// Network Efficiency Issues
async function inefficientAPI() {
  // Multiple requests to same endpoint - bandwidth waste
  const user1 = await fetch('/api/user/1');
  const user2 = await fetch('/api/user/2');
  const user3 = await fetch('/api/user/3');
}

function duplicateRequests() {
  fetch('/api/data');
  fetch('/api/data'); // Duplicate request - waste
}

// Data Efficiency Issues
function inefficientQuery() {
  // N+1 query problem - database performance impact
  const users = getUsers();
  users.forEach(user => {
    const posts = getPostsByUser(user.id); // Separate query for each user
  });
}

function largeDataStructure() {
  const hugeArray = new Array(1000000).fill('data');
  return hugeArray;
}

// Security issues that Semgrep will detect
function sqlInjection(userInput) {
  const query = "SELECT * FROM users WHERE id = " + userInput; // SQL injection
  return query;
}

function evalUsage(code) {
  return eval(code); // Dangerous eval usage
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
