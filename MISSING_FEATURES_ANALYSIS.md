# Missing Features Analysis: Branch vs Main

## Summary

This document compares the branch `fix/tool-data-display-impact-framework-playwright-version-broken-tests` with `main` to identify what features are missing from main.

**Analysis Date:** Current
**Branch:** `fix/tool-data-display-impact-framework-playwright-version-broken-tests`
**Base:** `main`

---

## ✅ Already on Main (No Action Needed)

1. **E2E Test for Test Analyzer** - Test is uncommented and working on main
2. **Playwright Version** - Both branches have `playwright: ^1.55.1` and `@playwright/test: ^1.40.0`
3. **Playwright Config** - `playwright.config.ts` exists and is identical on both branches

---

## ❌ Missing from Main (High Priority)

### 1. Prerequisites System
**Priority:** HIGH  
**Status:** Completely missing from main

**Files:**
- `packages/cli/src/utils/prerequisites.ts` - NEW file (173 lines)
- `packages/cli/src/utils/tool-executor.ts` - NEW file (204 lines)

**Features:**
- Generic prerequisite checking system for tools (Docker, Playwright, etc.)
- Checks if prerequisites are available before tool execution
- Provides user-friendly error messages and setup instructions
- Docker daemon status checking
- Playwright browser installation checking

**Integration Points:**
- `packages/cli/src/commands/analyze.ts` - Uses `checkPrerequisites()` before tool execution
- `packages/cli/src/registry/tools.json` - GreenFrame has prerequisites field with Docker requirement

**Impact:** Tools like GreenFrame require Docker, but main doesn't check for it before execution, leading to cryptic errors.

---

### 2. Isolated Tool Execution
**Priority:** HIGH  
**Status:** Completely missing from main

**Files:**
- `packages/cli/src/utils/tool-executor.ts` - Contains `IsolatedToolExecutor` class

**Features:**
- Creates isolated temporary directories for tool execution
- Prevents npm from checking parent workspace (avoids conflicts)
- Creates minimal package.json in temp dir to satisfy npm checks
- Preserves PATH so globally installed tools remain accessible
- Prevents environment conflicts when tools run `npm list` or check dependencies

**Integration Points:**
- `packages/cli/src/commands/analyze.ts` - Uses `IsolatedToolExecutor` for external tools
- Replaces direct `execa` calls with isolated execution

**Impact:** Tools may fail when they check for npm packages in parent workspace, causing false negatives.

---

### 3. VSCode Extension: Prerequisites Support
**Priority:** HIGH  
**Status:** Missing from main

**Files:**
- `plugins/vscode/src/tools-tree-provider.ts` - Missing prerequisites display and error handling
- `plugins/vscode/src/extension.ts` - Missing tool instructions provider

**Features Missing:**
- Prerequisites display in tool installation instructions
- Prerequisite error detection and user-friendly messages
- "View Installation Instructions" command integration
- Tool instructions virtual document provider
- Enhanced error handling for prerequisite failures

**Current State on Main:**
- Tools show installation status but no prerequisite information
- Errors from missing prerequisites (e.g., Docker) show cryptic messages
- No way to view detailed installation instructions with prerequisites

**Impact:** Users get confusing errors when prerequisites are missing, with no clear guidance.

---

### 4. VSCode Extension: Display Name Support
**Priority:** MEDIUM  
**Status:** Missing from main

**Files:**
- `plugins/vscode/src/tools-tree-provider.ts` - Missing `displayName` field support
- `packages/cli/src/registry/tools.json` - Missing `displayName` for Impact Framework

**Features Missing:**
- `displayName` field in tool interface
- Impact Framework shows as "Impact Framework" instead of "IF Webpage Scan"
- Tools show "(Installed)" suffix when installed

**Current State on Main:**
- Tools only use `name` field
- Impact Framework shows as "IF Webpage Scan" (less user-friendly)

**Impact:** Less user-friendly tool names in UI.

---

### 5. VSCode Extension: Removed Tool Icons
**Priority:** LOW  
**Status:** Missing from main

**Files:**
- `plugins/vscode/src/tools-tree-provider.ts` - Still has icon logic on main

**Features Missing:**
- Removed icon display for tools (cleaner UI)
- Icons removed from ToolItem constructor

**Current State on Main:**
- Tools show icons (check/circle-outline) based on installation status

**Impact:** Minor UI difference - branch has cleaner appearance without icons.

---

### 6. CLI Working Directory Fix
**Priority:** MEDIUM  
**Status:** ✅ VERIFIED - Missing from main

**Files:**
- `plugins/vscode/src/tools-tree-provider.ts` - Missing `cwd` parameter in `runCommand()`

**Verification:**
- ✅ Checked `git show main:plugins/vscode/src/tools-tree-provider.ts` - no `cwd` parameter
- ✅ Current main branch file (line 682-687) - no `cwd` in spawn call
- ✅ Branch version has: `cwd?: string` parameter and `cwd: this.workspaceFolder?.uri.fsPath` in spawn

**Features Missing:**
- `cwd` parameter added to `runCommand()` method
- Uses workspace folder as working directory when available
- Ensures CLI commands run from correct directory

**Current State on Main:**
- `runCommand()` doesn't accept `cwd` parameter
- `spawn()` call doesn't include `cwd` option
- Commands may run from wrong directory

**Impact:** CLI commands may fail or behave incorrectly if they depend on working directory.

---

### 7. Tools.json Updates
**Priority:** MEDIUM  
**Status:** Partially missing from main

**Files:**
- `packages/cli/src/registry/tools.json`

**Changes Missing:**
1. **GreenFrame:**
   - Command changed from `npx greenframe` to `greenframe` (direct executable)
   - Detection changed from `npx greenframe --help` to `greenframe --version`
   - Prerequisites field added (Docker requirement)

2. **Impact Framework Tools:**
   - Detection simplified from `npm list -g @tngtech/if-webpage-plugins && if-run --help` to `if-run --help`
   - `displayName: "Impact Framework"` added to if-webpage-scan

**Current State on Main:**
- GreenFrame still uses `npx` wrapper
- Impact Framework detection is more complex (checks npm list)
- No prerequisites field for GreenFrame
- No displayName for Impact Framework

**Impact:** 
- GreenFrame may not work correctly if installed globally
- Impact Framework detection may fail unnecessarily
- Less user-friendly names

---

### 8. Test Files
**Priority:** MEDIUM  
**Status:** Completely missing from main

**Files:**
- `packages/cli/test/tools-commands-validation.test.ts` - NEW (274 lines)
- `packages/cli/test/tools-sandbox-integration.test.ts` - NEW (536 lines)
- `packages/cli/test/tools-sanity.test.ts` - NEW (364 lines)
- `packages/cli/test/external-tools-integration.test.ts` - UPDATED (carbonara path fixes)

**Features:**
- Comprehensive test coverage for tool commands
- Sandbox/isolation testing
- Sanity checks for tools
- Updated integration tests for `.carbonara` path structure

**Impact:** Missing test coverage for new features (prerequisites, isolation).

---

### 9. Analyze.ts Integration
**Priority:** HIGH  
**Status:** Missing from main

**Files:**
- `packages/cli/src/commands/analyze.ts`

**Changes Missing:**
- Import `IsolatedToolExecutor` and `checkPrerequisites`
- Prerequisite checking before tool execution
- Isolated execution for external tools
- Enhanced error handling for Docker/Playwright errors
- Better error messages with setup instructions

**Current State on Main:**
- No prerequisite checking
- Direct `execa` calls (no isolation)
- Basic error handling

**Impact:** Tools fail without clear error messages, and may have environment conflicts.

---

### 10. VSCode Extension: CLI Auto-Installation
**Priority:** LOW  
**Status:** ✅ VERIFIED - Missing from main

**Files:**
- `plugins/vscode/src/extension.ts` - Missing CLI auto-installation logic

**Verification:**
- ✅ Checked `git show main:plugins/vscode/src/extension.ts` - no functions found
- ✅ Grepped current main branch - no `ensureCarbonaraCLI`, `installCLI`, `isCarbonaraCLIInstalled`, or `findLocalCLIPackage`
- ✅ Branch version has all these functions (verified in branch)

**Features Missing:**
- `ensureCarbonaraCLIInstalled()` - Main entry point
- `isCarbonaraCLIInstalled()` - Checks if CLI is available
- `findLocalCLIPackage()` - Finds CLI in monorepo
- `installCLIFromLocalPath()` - Installs from monorepo
- `installCLIFromNpm()` - Installs from npm
- `checkPackageExistsOnNpm()` - Validates package exists
- Progress notifications during installation
- Error handling and user guidance

**Current State on Main:**
- No auto-installation feature
- No CLI detection/installation functions
- Users must manually install CLI

**Impact:** Less user-friendly setup experience.

---

## Priority Summary

### Critical (Must Have)
1. Prerequisites System
2. Isolated Tool Execution
3. Analyze.ts Integration
4. VSCode Extension: Prerequisites Support

### Important (Should Have)
5. CLI Working Directory Fix
6. Tools.json Updates
7. Test Files

### Nice to Have
8. Display Name Support
9. Removed Tool Icons
10. CLI Auto-Installation

---

## Dependencies

- Prerequisites System → Analyze.ts Integration → VSCode Extension Prerequisites Support
- Isolated Tool Execution → Analyze.ts Integration
- Tools.json Updates → Display Name Support
- Test Files → All features (for validation)

---

## Recommended Merge Order

1. **Prerequisites System** (prerequisites.ts, tool-executor.ts)
2. **Tools.json Updates** (add prerequisites, displayName, simplify detection)
3. **Analyze.ts Integration** (add prerequisite checks and isolated execution)
4. **VSCode Extension: Prerequisites Support** (UI updates)
5. **CLI Working Directory Fix** (cwd parameter)
6. **Display Name Support** (UI enhancement)
7. **Test Files** (validation)
8. **Removed Tool Icons** (UI cleanup)
9. **CLI Auto-Installation** (optional enhancement)

---

## Merge Strategy: Rebase Approach

**Recommended Approach:** Rebase the branch onto main to create a clean linear history.

**Steps:**
1. Checkout the branch: `fix/tool-data-display-impact-framework-playwright-version-broken-tests`
2. Rebase onto main: `git rebase main`
3. Resolve conflicts (6 files identified):
   - `packages/cli/src/commands/analyze.ts`
   - `packages/core/src/vscode-data-provider.ts`
   - `plugins/vscode/src/data-tree-provider.ts`
   - `plugins/vscode/src/extension.ts`
   - `plugins/vscode/src/semgrep-integration.ts`
   - `plugins/vscode/carbonara-vscode-0.1.0.vsix` (binary, can be regenerated)
4. Test after rebase to ensure all features work
5. Merge into main (fast-forward or create PR)

**Why Rebase:**
- Conflicts need to be resolved anyway (merge test showed 6 conflicts)
- Creates cleaner linear history
- Easier to test after rebase
- Branch is small (5 commits), manageable rebase
- Resolve conflicts one commit at a time (cleaner than all at once)

**Alternative:** If rebase is too complex, can merge and resolve all conflicts at once, then test.

## Notes

- E2E test for test analyzer is already working on main (no action needed)
- Playwright version is consistent (no action needed)
- Some features may have been implemented differently on main - verify before merging
- Test all features after merging to ensure compatibility

