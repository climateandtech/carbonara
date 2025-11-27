# Carbonara VSCode Extension Testing

This directory contains **two complementary testing approaches** for the Carbonara VSCode extension:

## 🎭 **UI Tests (Playwright)** - End-to-End User Experience Testing

Full browser automation testing that launches real VSCode and tests actual user interactions.

### What it Tests

- ✅ **Real user workflows**: Status bar clicks, menu navigation, project initialization
- ✅ **Visual validation**: Screenshots for debugging, UI element presence
- ✅ **Complete scenarios**: From our corrected behavior stories in `behaviour.md`
- ✅ **Cross-platform**: Works on macOS, Windows, Linux

### Running UI Tests

```bash
# Run all UI tests
npm run test:ui

# Run simple extension loading test
npm run test:ui:simple

# Run comprehensive workflow tests
npm run test:ui:comprehensive

# Run with visible browser (debugging)
npm run test:ui:headed
```

### Test Files

- `simple-ui.spec.ts` - Basic extension loading and presence validation
- `carbonara-ui-comprehensive.spec.ts` - Complete user workflow testing
- `helpers/vscode-launcher.ts` - VSCode launch utilities for testing

## 🧪 **Integration Tests** - Fast Command & API Testing

Standard VSCode test framework for testing extension APIs and commands directly.

### What it Tests

- ✅ **Extension activation**: Command registration, tree data providers
- ✅ **Configuration**: Package.json contributions, settings schema
- ✅ **Error handling**: Graceful failures without UI complexity
- ✅ **Performance**: Fast execution for CI/CD pipelines

### Running Integration Tests

```bash
# Run integration tests
npm test
```

### Test Files

- `src/test/suite/integration.test.ts` - API and command testing
- `src/test/runTest.ts` - Test runner using @vscode/test-electron

## 📋 **Test Coverage**

### UI Tests Cover:

✅ Status bar menu display and interaction  
✅ Project initialization workflow (name input, type selection)  
✅ Sidebar navigation (assessment questionnaire, Data & Results panels)  
✅ Menu option validation (all 6 commands present)  
✅ Extension loading and activation  
✅ Dialog handling (extension reload, git prompts)

### Integration Tests Cover:

✅ All 15 commands registered correctly  
✅ Tree data providers registration  
✅ Configuration schema validation  
✅ Package.json contributions  
✅ Extension activation and lifecycle  
✅ Error handling without crashes

## 🏗️ **Architecture**

### Playwright Approach (UI Tests)

```
VSCode Extension Development Host
    ↓
Electron Application (Real VSCode)
    ↓
Playwright Browser Automation
    ↓
User Interaction Testing
```

**Key Benefits:**

- Tests **exactly what users experience**
- Validates **real UI interactions**
- Catches **visual and UX issues**
- **Platform-specific testing** (macOS VSCode app)

### VSCode Test Framework (Integration Tests)

```
Extension Host Environment
    ↓
@vscode/test-electron
    ↓
Direct API Testing
```

**Key Benefits:**

- **Fast execution** (10-30 seconds vs 60+ seconds)
- **Reliable in CI/CD** (no UI timing issues)
- **API-focused** validation
- **Easier debugging** of extension logic

## 🚀 **Best Practices**

### When to Use UI Tests

- Testing **complete user workflows**
- Validating **visual elements** and layouts
- **Cross-browser/platform** compatibility
- **Regression testing** of user journeys

### When to Use Integration Tests

- **Unit testing** extension commands and APIs
- **CI/CD pipelines** (faster, more reliable)
- **API contract** validation
- **Error handling** and edge cases

## 🔧 **Setup Requirements**

### For UI Tests

```bash
npm install
npm run build
npm run playwright:install
```

### For Integration Tests

```bash
npm install
npm run build
```

## 📊 **Results & Validation**

Both testing approaches have been **validated on macOS** and are working successfully:

- **UI Tests**: ✅ 100% passing - real VSCode launches, extension loads, user interactions work
- **Integration Tests**: ✅ 100% passing - all commands registered, APIs functional

This dual approach gives us **comprehensive coverage** with both **fast feedback** (integration) and **high confidence** (UI) testing.
