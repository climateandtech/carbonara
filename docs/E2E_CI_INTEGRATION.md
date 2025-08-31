# E2E Tests + CI Integration Spike

## 🎯 Spike Results

✅ **Find out how well E2E tests and CI play together**  
✅ **Create a flag system to run with and without E2E tests**  
✅ **E2E tests can run on CI with cross-platform VSCode launcher**

## 🏷️ Label-Based Control System

### Labels to Create in GitHub Repository
- **`run-e2e`**: Forces E2E tests to run on any PR
- **`skip-e2e`**: Skips E2E tests even on main branch merges

### Behavior Matrix
| Scenario | `run-e2e` label | `skip-e2e` label | E2E Tests Run? |
|----------|----------------|------------------|----------------|
| PR to any branch | ❌ | ❌ | ❌ No |
| PR to any branch | ✅ | ❌ | ✅ Yes |
| PR to any branch | ❌ | ✅ | ❌ No |
| PR to any branch | ✅ | ✅ | ❌ No (skip takes precedence) |
| Push to main | N/A | ❌ | ✅ Yes |
| Push to main | N/A | ✅ | ❌ No |

## 🔧 CI Configuration

### E2E Job Features
- **Conditional execution** based on PR labels
- **Ubuntu environment** with Playwright browser installation
- **Headless mode** optimized for CI
- **System dependencies** installed via `--with-deps`
- **Node.js 20.x** (single version for stability)

### Build Pipeline
1. Standard project setup and dependencies
2. Build RPC Protocol (dependency order)
3. Full project build with Turbo
4. Install Playwright browsers with system deps
5. Run E2E tests in headless mode

## 🚀 Usage Examples

### For Developers
```bash
# Test E2E locally (headed for debugging)
cd plugins/vscode
npm run test:ui:headed

# Test E2E locally (headless like CI)
npm run test:ui
```

### For PRs
1. **Default**: E2E tests don't run (fast feedback)
2. **Add `run-e2e` label**: Forces E2E tests for thorough validation
3. **Add `skip-e2e` label**: Skips E2E even on main (emergency bypass)

## 📋 Test Coverage

### UI Tests (Playwright)
- ✅ VSCode extension loading and activation
- ✅ Status bar menu interactions
- ✅ Project initialization workflow
- ✅ Sidebar navigation (CO2 Assessment, Data panels)
- ✅ Dialog handling and user workflows

### Integration Tests (VSCode Test Framework)  
- ✅ Command registration (15 commands)
- ✅ Tree data providers
- ✅ Configuration schema validation
- ✅ Extension lifecycle management

## 🔍 Spike Results

### ✅ What Works
- **E2E tests run successfully on macOS** with local VSCode installation
- **E2E tests run successfully on CI** with auto-downloaded VSCode via `@vscode/test-electron`
- **Cross-platform VSCode launcher** detects environment and uses appropriate method
- **Label-based control system** implemented and ready
- **CI infrastructure** configured with xvfb and system dependencies
- **Build pipeline** handles dependencies correctly

### 🔧 Cross-Platform Implementation
- **macOS**: Uses local VSCode installation (`/Applications/Visual Studio Code.app/...`)
- **CI/Linux**: Auto-downloads VSCode using `@vscode/test-electron`
- **Environment detection**: Switches based on `CI=true` environment variable
- **Headless operation**: Uses xvfb virtual display server on Linux

### 🎯 Recommendation
**ADOPT** this approach with label-based control:

**Usage:**
- **Default**: E2E tests don't run on PRs (fast feedback)
- **Add `run-e2e` label**: Triggers E2E tests for thorough validation
- **Performance**: ~2-3 minute overhead only when needed

## 🛠️ Technical Implementation

### CI Workflow Changes
```yaml
e2e:
  runs-on: ubuntu-latest
  # Only run when explicitly requested with 'run-e2e' label
  if: ${{ contains(github.event.pull_request.labels.*.name, 'run-e2e') }}
  
  steps:
    - name: Install system dependencies for VSCode
      run: |
        sudo apt-get update
        sudo apt-get install -y xvfb libxss1 libgconf-2-4 libxrandr2 libasound2 libpangocairo-1.0-0 libatk1.0-0 libcairo-gobject2 libgtk-3-0 libgdk-pixbuf2.0-0

    - name: Run E2E tests with virtual display
      run: cd plugins/vscode && xvfb-run -a npm run test:ui
      env:
        CI: true
        DISPLAY: :99
```

### Cross-Platform VSCode Launcher
```typescript
private static async getVSCodePaths(): Promise<VSCodePaths> {
  const isCI = process.env.CI === 'true';
  const platform = process.platform;

  if (isCI || platform === 'linux') {
    // Auto-download VSCode for CI/Linux
    const vscodeDownloadPath = await downloadAndUnzipVSCode('stable');
    const cliArgs = resolveCliArgsFromVSCodeExecutablePath(vscodeDownloadPath);
    return { executablePath: vscodeDownloadPath, cliArgs };
  } else if (platform === 'darwin') {
    // Use local macOS installation
    return {
      executablePath: '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
      cliArgs: ['/Applications/Visual Studio Code.app/Contents/Resources/app']
    };
  }
}
```

### Playwright Configuration
- **Timeout**: 60s for VSCode startup
- **Retries**: 2 retries in CI for flaky test resilience  
- **Workers**: 1 (prevents VSCode instance conflicts)
- **Artifacts**: Screenshots/videos on failure for debugging

## 📈 Next Steps

1. **Create GitHub labels** (`run-e2e`, `skip-e2e`)
2. **Test the integration** with a PR
3. **Document usage** for the team
4. **Monitor reliability** and adjust timeouts if needed
5. **Consider** adding E2E tests to more critical user workflows
