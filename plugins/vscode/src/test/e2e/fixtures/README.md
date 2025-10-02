# Workspace Fixtures for Testing

This directory contains different workspace configurations to test various project states and user workflows.

## 🏗️ **Available Fixtures**

### `empty-workspace/`
**Purpose**: Test behavior when no Carbonara project exists  
**Contains**: Only basic `package.json`, no `carbonara.config.json`  
**Tests**:  
- ✅ "Initialize Project" workflow
- ✅ "Search workspace" returns "No projects found"  
- ✅ Menu shows initialization options
- ✅ Extension handles missing project gracefully

### `with-carbonara-project/`
**Purpose**: Test behavior with existing valid Carbonara project  
**Contains**: 
- `package.json`
- Valid `carbonara.config.json` with sample assessment data
**Tests**:
- ✅ Extension recognizes existing project
- ✅ Assessment data loads correctly  
- ✅ Sidebar shows project information
- ✅ "Current workspace is already a Carbonara project" message

### `multiple-projects/`
**Purpose**: Test project discovery when multiple projects exist  
**Contains**:
- Root `package.json` 
- `project-a/carbonara.config.json` (Web Application)
- `project-b/carbonara.config.json` (Mobile Application)
**Tests**:
- ✅ Workspace search finds multiple projects
- ✅ Project selection UI displays both projects
- ✅ User can choose between different project types
- ✅ Project names and descriptions shown correctly

### `invalid-project/`
**Purpose**: Test error handling with corrupted configuration  
**Contains**:
- `package.json`
- Invalid `carbonara.config.json` (malformed JSON)
**Tests**:
- ✅ Extension handles JSON parse errors gracefully
- ✅ No crashes when loading invalid config
- ✅ User sees appropriate error messages
- ✅ Fallback to "no project" behavior

### `test-workspace/` *(Legacy)*
**Purpose**: Basic test workspace (same as empty-workspace)  
**Status**: Maintained for backward compatibility

## 🚀 **Usage in Tests**

```typescript
import { VSCodeLauncher, WorkspaceFixture } from './helpers/vscode-launcher';

// Test with empty workspace
const vscode = await VSCodeLauncher.launch('empty-workspace');

// Test with existing project
const vscode = await VSCodeLauncher.launch('with-carbonara-project');

// Test multiple projects scenario
const vscode = await VSCodeLauncher.launch('multiple-projects');

// Test error handling
const vscode = await VSCodeLauncher.launch('invalid-project');
```

## 🧪 **Running Fixture-Specific Tests**

```bash
# Test all workspace scenarios
npm run test:ui:workspace-scenarios

# Test specific scenarios
npm run test:ui:empty-workspace
npm run test:ui:existing-project  
npm run test:ui:multiple-projects

# Test with visible browser
npm run test:ui:headed
```

## 📋 **Test Coverage by Fixture**

| Scenario | Empty Workspace | Existing Project | Multiple Projects | Invalid Project |
|----------|----------------|------------------|-------------------|-----------------|
| **Project Detection** | ❌ No project | ✅ Found project | ✅ Multiple found | ⚠️ Invalid config |
| **Menu Behavior** | Show "Initialize" | Show "Already exists" | Show selection | Handle gracefully |
| **Sidebar Content** | Empty/default | Load assessment data | Choose project first | Fallback behavior |
| **Search Results** | "No projects found" | Current project | List all projects | Error or no results |
| **Initialization** | ✅ Full workflow | ❌ Already exists | ✅ In subdirs | ✅ After cleanup |

## 🔧 **Fixture Structure**

Each fixture follows this pattern:
```
fixture-name/
├── package.json                 # Workspace package.json
├── carbonara.config.json        # Carbonara project config (if applicable)
└── subdirectories/              # For multiple project scenarios
    └── carbonara.config.json    # Additional project configs
```

## 📝 **Adding New Fixtures**

1. **Create directory**: `e2e/fixtures/new-scenario/`
2. **Add package.json**: Basic workspace information
3. **Add carbonara.config.json**: Project configuration (if needed)
4. **Update WorkspaceFixture type**: In `vscode-launcher.ts`
5. **Add test cases**: In `workspace-scenarios.spec.ts`
6. **Document**: Update this README

## 🎯 **Real-World Scenarios Covered**

- **🆕 New User**: Opens VSCode, needs to create first Carbonara project
- **🔄 Existing User**: Has project, wants to continue assessment  
- **👥 Team Workspace**: Multiple projects, needs to choose which one
- **🚨 Error Recovery**: Corrupted files, network issues, etc.
- **🔀 Project Switching**: Moving between different project types

This fixture system ensures our extension works reliably across all common user scenarios! 🌱 