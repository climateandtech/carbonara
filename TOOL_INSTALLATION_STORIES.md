# Tool Installation & Detection User Stories

## Case 1: GreenFrame (Global Tool) - Fresh Installation

**As a user,**

**Given** GreenFrame is not installed
- Tool shows as **🔴 RED** (not installed) in the tools tree
- Status: "Not installed"

**When** I click "Install GreenFrame"
1. Extension runs: `carbonara tools install greenframe`
2. CLI executes: `npm install -g @marmelab/greenframe-cli`
3. Installation succeeds ✅
4. **Logging**: Entry written to `.carbonara/logs/greenframe.log` with action: `install`
5. **Config**: `carbonara.config.json` updated with:
   ```json
   {
     "tools": {
       "greenframe": {
         "installationStatus": {
           "installed": true,
           "installedAt": "2025-11-25T..."
         }
       }
     }
   }
   ```
6. Extension refreshes tools tree
7. **Detection** runs:
   - For global tool: Runs `greenframe --version` directly
   - Command succeeds ✅
   - Tool detected as installed

**Then** GreenFrame shows as **🟢 GREEN** (installed and ready)
- Status: "Installed"
- Can run analysis

---

## Case 2: GreenFrame - Installation Succeeds but Detection Temporarily Fails

**As a user,**

**Given** GreenFrame is not installed
- Tool shows as **🔴 RED**

**When** I install it
1. Installation succeeds ✅
2. **Config flag set**: `installationStatus.installed = true`
3. **Detection runs**: `greenframe --version`
4. **Detection fails** (exit code 127 - command not found, maybe PATH not updated yet)

**Then** 
- **Config fallback kicks in**: Checks `isToolMarkedInstalled()` → returns `true`
- Tool shows as **🟢 GREEN** (trusts config flag)
- Message: "✅ GreenFrame installed successfully! (Detection may take a moment)"
- After PATH refresh, detection will work normally

---

## Case 3: IF Webpage Scan (Local Tool with Plugins) - All Packages Installed

**As a user,**

**Given** IF Webpage Scan is not installed
- Tool shows as **🔴 RED**
- Requires: `@grnsft/if` AND `@tngtech/if-webpage-plugins`

**When** I install it
1. Extension runs: `carbonara tools install if-webpage-scan`
2. CLI executes: `npm install @grnsft/if @tngtech/if-webpage-plugins` (local, no `-g`)
3. Installation succeeds ✅
4. **Logging**: Entry in `.carbonara/logs/if-webpage-scan.log`
5. **Config**: `installationStatus.installed = true` set
6. Extension refreshes
7. **Detection** runs:
   - **Step 1**: Check ALL packages are installed:
     - ✅ `@grnsft/if` found in `node_modules` or via `npm list`
     - ✅ `@tngtech/if-webpage-plugins` found in `node_modules` or via `npm list`
     - Log: `✅ Tool if-webpage-scan all required packages installed: @grnsft/if, @tngtech/if-webpage-plugins`
   - **Step 2**: Run tool command: `if-run --version`
   - Command succeeds ✅

**Then** Tool shows as **🟢 GREEN** (all packages + command work)
- Status: "Installed"
- Can run analysis

---

## Case 4: IF Webpage Scan - Some Packages Missing

**As a user,**

**Given** IF Webpage Scan is not installed

**When** I install it but only `@grnsft/if` gets installed (plugin fails)
1. Installation partially succeeds
2. **Detection** runs:
   - **Step 1**: Check ALL packages:
     - ✅ `@grnsft/if` found
     - ❌ `@tngtech/if-webpage-plugins` NOT found
     - Log: `❌ Tool if-webpage-scan missing required packages: @tngtech/if-webpage-plugins`
   - **Step 2**: Config fallback check → `isToolMarkedInstalled()` returns `true`
   - Returns `true` (trusts config flag)

**Then** Tool shows as **🟡 YELLOW** (installed but prerequisites/plugins missing)
- Status: "Installed but prerequisites missing"
- User sees warning about missing plugin
- Instructions show which package is missing

---

## Case 5: IF Webpage Scan - Prerequisites Missing (Puppeteer Browser)

**As a user,**

**Given** IF Webpage Scan packages are installed
- `@grnsft/if` ✅
- `@tngtech/if-webpage-plugins` ✅

**When** Detection runs
1. **All packages check**: ✅ Both found
2. **Tool command check**: `if-run --version` ✅ Works
3. **Prerequisites check**: Puppeteer Chrome browser
   - Runs: `npx --package=@tngtech/if-webpage-plugins puppeteer browsers install --dry-run chrome`
   - ❌ Chrome not found

**Then** Tool shows as **🟡 YELLOW** (installed but prerequisites missing)
- Status: "Installed but prerequisites missing"
- Shows: "Puppeteer browsers (Chrome) are required but not installed"
- User can click to install prerequisites

---

## Case 6: Tool Already Installed

**As a user,**

**Given** GreenFrame is already installed
- Tool shows as **🟢 GREEN**

**When** I try to install it again
1. CLI checks: `isToolInstalled()` → returns `true`
2. Message: `✅ Tool 'GreenFrame' is already installed`
3. No installation attempted
4. No config/logging changes

**Then** Tool remains **🟢 GREEN**
- No changes

---

## Case 7: Installation Fails

**As a user,**

**Given** Tool is not installed

**When** I try to install but it fails (network error, permission denied, etc.)
1. Installation command runs
2. Installation fails ❌
3. **Logging**: Entry in `.carbonara/logs/{toolId}.log` with action: `error`
4. **Config**: NO `installationStatus` set (installation failed)
5. Error message shown to user

**Then** Tool shows as **🔴 RED** (not installed)
- Status: "Not installed"
- Error logged in config: `lastError` field set
- Instructions show manual installation steps

---

## Case 8: Running Analysis - Success

**As a user,**

**Given** Tool is installed and ready (🟢 GREEN)

**When** I run analysis
1. Extension runs: `carbonara analyze greenframe https://example.com --save`
2. Tool executes successfully ✅
3. **Logging**: Entry in `.carbonara/logs/greenframe.log` with:
   - action: `run`
   - command: `greenframe analyze https://example.com --format=json`
   - output: (truncated results)
   - exitCode: 0
4. Results saved to database
5. Success message shown

**Then** 
- Analysis completes successfully
- Results visible in data tree
- Log entry created

---

## Case 9: False Positive Detection - Detection Passes but Tool Not Installed

**As a user,**

**Given** Tool detection passes (shows as 🟢 GREEN)
- But tool is NOT actually installed (false positive - maybe npx downloaded on-the-fly, or command exists but tool isn't there)

**When** I try to run analysis
1. Tool appears installed, so run is allowed ✅
2. Tool execution starts
3. Tool fails with "command not found" or similar error ❌
4. **Detection failure flagged**: `detectionFailed = true` set in config
5. **Installation status cleared**: If `installationStatus` was set, it's removed (was false positive)
6. **Error logged**: `lastError` field updated
7. **Log entry**: Error logged to `.carbonara/logs/{toolId}.log`

**Then** 
- Error message shown: "⚠️ Detection was incorrect - tool is not actually installed"
- Tool status updated: Shows as 🔴 RED (not installed) after refresh
- Support options shown: "View Installation Instructions" or "View Logs"
- Next detection will respect the `detectionFailed` flag and not trust detection

---

## Case 10: Running Analysis - Error (Other Errors)

**As a user,**

**Given** Tool is installed

**When** I run analysis but it fails (invalid URL, tool error, etc.)
1. Tool execution starts
2. Tool fails ❌
3. **Logging**: Entry in `.carbonara/logs/{toolId}.log` with:
   - action: `error`
   - command: (the command that was run)
   - error: (error message)
   - exitCode: 1
4. **Config**: `lastError` field updated:
   ```json
   {
     "tools": {
       "greenframe": {
         "lastError": {
           "message": "Invalid URL provided",
           "timestamp": "2025-11-25T..."
         }
       }
     }
   }
   ```
5. Error message shown to user

**Then**
- Analysis fails
- Error logged in both log file and config
- User can see error in installation instructions (shows last error)
- Can retry after fixing the issue

---

## Case 11: Refresh After Installation

**As a user,**

**Given** I just installed a tool

**When** I click "Refresh Tools" button
1. Extension calls `refreshAsync()`
2. All tools reloaded from registry
3. **Detection runs** for each tool:
   - Checks packages (for local tools)
   - Runs detection command
   - Checks prerequisites
   - Falls back to config flag if detection fails
4. UI updates with current status

**Then** Tools tree shows accurate status
- Newly installed tools show as installed
- Status reflects current reality

---

## Case 12: Viewing Installation Instructions with Status

**As a user,**

**Given** A tool (installed or not)

**When** I click "Show Installation Instructions"
1. Opens virtual document with installation guide
2. **Shows**:
   - Prerequisites status
   - Installation instructions
   - **Installation Status section**:
     - ✅ "Marked as installed" (if config flag is set)
     - ⚠️ "Last Error" with message and timestamp (if any)
   - Verification command
   - Next steps

**Then** I see complete information
- Can see if tool is marked as installed
- Can see any previous errors
- Know what to do next

---

## Summary of Key Features

### Detection Flow (Priority Order):
1. **For local tools**: Check ALL packages are installed → Run tool command
2. **For global tools**: Run tool command directly
3. **Fallback**: Check config flag (`installationStatus.installed`)
4. **Result**: Green (installed), Yellow (prerequisites missing), Red (not installed)

### Logging:
- All actions logged to `.carbonara/logs/{toolId}.log`
- JSON format, one entry per line
- Includes: timestamp, action, command, output, error, exitCode

### Config Tracking:
- `installationStatus`: Set when installation succeeds
- `lastError`: Set when tool execution fails
- `detectionFailed`: Flagged when detection passes but tool isn't actually installed (false positive)
- Used as fallback when detection fails, and to prevent trusting false positives

### User Feedback:
- Clear status indicators (🟢🟡🔴)
- Detailed error messages
- Installation instructions with status
- Log files for debugging

