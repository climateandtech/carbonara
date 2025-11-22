#!/usr/bin/env node
/**
 * Automatically copy all transitive dependencies needed for the VSCode extension
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../..');
const DIST = path.join(__dirname, '../dist');
const NODE_MODULES = path.join(ROOT, 'node_modules');
const DIST_NODE_MODULES = path.join(DIST, 'node_modules');

// Dependencies we need to copy (from @carbonara/core and @carbonara/cli)
const ROOT_DEPS = ['execa', 'sql.js'];
const LOCAL_PACKAGES = ['@carbonara/core', '@carbonara/cli'];

// Track what we've already copied
const copied = new Set();

/**
 * Recursively find all dependencies of a package
 */
function getAllDependencies(pkgName, root = NODE_MODULES, seen = new Set()) {
  if (seen.has(pkgName)) return [];
  seen.add(pkgName);

  let pkgPath = path.join(root, pkgName, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    // Try in execa's node_modules (some deps are bundled there)
    const execaPkgPath = path.join(NODE_MODULES, 'execa', 'node_modules', pkgName, 'package.json');
    if (fs.existsSync(execaPkgPath)) {
      pkgPath = execaPkgPath;
      root = path.join(NODE_MODULES, 'execa', 'node_modules');
    } else {
      return [];
    }
  }

  const deps = [pkgName];
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  if (pkg.dependencies) {
    for (const dep of Object.keys(pkg.dependencies)) {
      deps.push(...getAllDependencies(dep, root, seen));
    }
  }

  return deps;
}

/**
 * Find where a package is located (root node_modules or bundled)
 */
function findPackagePath(pkgName) {
  // Try main node_modules first
  const mainPath = path.join(NODE_MODULES, pkgName);
  if (fs.existsSync(mainPath)) {
    return mainPath;
  }
  
  // Try in execa's node_modules (some deps are bundled there)
  const execaPath = path.join(NODE_MODULES, 'execa', 'node_modules', pkgName);
  if (fs.existsSync(execaPath)) {
    return execaPath;
  }
  
  return null;
}

/**
 * Copy a package directory
 */
function copyPackage(pkgName) {
  if (copied.has(pkgName)) return;
  copied.add(pkgName);

  const sourcePath = findPackagePath(pkgName);
  if (!sourcePath) {
    console.warn(`⚠️  ${pkgName} not found, skipping`);
    return;
  }

  const destPath = path.join(DIST_NODE_MODULES, pkgName);

  // Create destination directory
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  // Copy the package
  if (fs.statSync(sourcePath).isDirectory()) {
    // Use cp -r equivalent
    const { execSync } = require('child_process');
    execSync(`cp -r "${sourcePath}" "${destPath}"`, { stdio: 'inherit' });
    console.log(`✅ Copied ${pkgName}`);
  }
}

/**
 * Copy local packages
 */
function copyLocalPackages() {
  console.log('📦 Copying local packages...');
  
  // Copy @carbonara/core
  const coreDist = path.join(ROOT, 'packages', 'core', 'dist');
  const coreDest = path.join(DIST_NODE_MODULES, '@carbonara', 'core', 'dist');
  fs.mkdirSync(path.dirname(coreDest), { recursive: true });
  require('child_process').execSync(`cp -r "${coreDist}" "${coreDest}"`, { stdio: 'inherit' });
  
  const corePkg = path.join(ROOT, 'packages', 'core', 'package.json');
  const corePkgDest = path.join(DIST_NODE_MODULES, '@carbonara', 'core', 'package.json');
  fs.copyFileSync(corePkg, corePkgDest);
  
  // Copy core's additional files
  const corePython = path.join(ROOT, 'packages', 'core', 'python');
  if (fs.existsSync(corePython)) {
    const corePythonDest = path.join(DIST_NODE_MODULES, '@carbonara', 'core', 'python');
    require('child_process').execSync(`cp -r "${corePython}" "${corePythonDest}"`, { stdio: 'inherit' });
  }
  
  const coreSemgrep = path.join(ROOT, 'packages', 'core', 'semgrep');
  if (fs.existsSync(coreSemgrep)) {
    const coreSemgrepDest = path.join(DIST_NODE_MODULES, '@carbonara', 'core', 'semgrep');
    require('child_process').execSync(`cp -r "${coreSemgrep}" "${coreSemgrepDest}"`, { stdio: 'inherit' });
  }

  // Copy @carbonara/cli
  const cliDist = path.join(ROOT, 'packages', 'cli', 'dist');
  const cliDest = path.join(DIST_NODE_MODULES, '@carbonara', 'cli', 'dist');
  fs.mkdirSync(path.dirname(cliDest), { recursive: true });
  require('child_process').execSync(`cp -r "${cliDist}" "${cliDest}"`, { stdio: 'inherit' });
  
  const cliPkg = path.join(ROOT, 'packages', 'cli', 'package.json');
  const cliPkgDest = path.join(DIST_NODE_MODULES, '@carbonara', 'cli', 'package.json');
  fs.copyFileSync(cliPkg, cliPkgDest);

  // Copy tools.json
  const toolsJson = path.join(ROOT, 'packages', 'cli', 'dist', 'registry', 'tools.json');
  const toolsJsonDest = path.join(DIST, 'registry', 'tools.json');
  fs.mkdirSync(path.dirname(toolsJsonDest), { recursive: true });
  if (fs.existsSync(toolsJson)) {
    fs.copyFileSync(toolsJson, toolsJsonDest);
  }

  console.log('✅ Local packages copied');
}

/**
 * Main function
 */
function main() {
  console.log('🔍 Finding all transitive dependencies...');

  // Find all dependencies starting from root deps
  const allDeps = new Set();
  for (const dep of ROOT_DEPS) {
    const deps = getAllDependencies(dep);
    deps.forEach(d => allDeps.add(d));
  }

  // Also get dependencies from local packages
  const corePkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'packages', 'core', 'package.json'), 'utf8')
  );
  if (corePkg.dependencies) {
    for (const dep of Object.keys(corePkg.dependencies)) {
      const deps = getAllDependencies(dep);
      deps.forEach(d => allDeps.add(d));
    }
  }

  console.log(`📋 Found ${allDeps.size} dependencies to copy:`);
  console.log([...allDeps].sort().join(', '));

  // Create dist/node_modules directory
  fs.mkdirSync(DIST_NODE_MODULES, { recursive: true });

  // Copy sql.js specially (has dist folder)
  if (allDeps.has('sql.js')) {
    const sqlJsDist = path.join(NODE_MODULES, 'sql.js', 'dist');
    const sqlJsDest = path.join(DIST_NODE_MODULES, 'sql.js', 'dist');
    fs.mkdirSync(path.dirname(sqlJsDest), { recursive: true });
    require('child_process').execSync(`cp -r "${sqlJsDist}" "${sqlJsDest}"`, { stdio: 'inherit' });
    
    const sqlJsPkg = path.join(NODE_MODULES, 'sql.js', 'package.json');
    const sqlJsPkgDest = path.join(DIST_NODE_MODULES, 'sql.js', 'package.json');
    fs.copyFileSync(sqlJsPkg, sqlJsPkgDest);
    allDeps.delete('sql.js');
    copied.add('sql.js');
  }

  // Copy all other dependencies
  console.log('\n📦 Copying dependencies...');
  for (const dep of allDeps) {
    copyPackage(dep);
  }

  // Copy local packages
  copyLocalPackages();

  console.log('\n✅ All dependencies copied!');
}

main();

