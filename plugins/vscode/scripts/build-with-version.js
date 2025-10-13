#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function getPackageVersion() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return packageJson.version;
}

function buildExtension(type = 'test') {
  const version = getPackageVersion();
  const timestamp = getTimestamp();
  
  let filename;
  switch (type) {
    case 'test':
      filename = `carbonara-vscode-test-${timestamp}.vsix`;
      break;
    case 'version':
      filename = `carbonara-vscode-${version}.vsix`;
      break;
    case 'release':
      filename = `carbonara-vscode-${version}-${timestamp}.vsix`;
      break;
    default:
      filename = `carbonara-vscode-${type}.vsix`;
  }

  console.log(`🔨 Building extension: ${filename}`);
  console.log(`📦 Version: ${version}`);
  console.log(`⏰ Timestamp: ${timestamp}`);
  
  try {
    execSync(`vsce package --out ${filename}`, { stdio: 'inherit' });
    console.log(`✅ Successfully built: ${filename}`);
  } catch (error) {
    console.error(`❌ Build failed:`, error.message);
    process.exit(1);
  }
}

// Get build type from command line argument
const buildType = process.argv[2] || 'test';
buildExtension(buildType);