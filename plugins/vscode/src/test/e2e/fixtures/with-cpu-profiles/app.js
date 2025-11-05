// Test file for CPU profiling
// This file contains intentionally slow functions for profiling

function processData(data) {
  // CPU-intensive processing
  let result = [];
  for (let i = 0; i < 1000000; i++) {
    result.push(data * i);
  }
  return result;
}

function parseJson(jsonString) {
  // Simulate JSON parsing with CPU usage
  const obj = JSON.parse(jsonString);
  let processed = {};
  for (let key in obj) {
    processed[key] = obj[key] * 2;
  }
  return processed;
}

function formatData(data) {
  // Format data with CPU usage
  return data.map(item => item.toString().toUpperCase());
}

// Main execution
const testData = { test: 123 };
processData(12345);
parseJson(JSON.stringify(testData));

