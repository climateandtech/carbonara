# Svelte Dashboard Architecture

This document describes the technical architecture of the Carbonara VSCode extension dashboard, built with Svelte.

## File Structure

### Core Files

```
plugins/vscode/
├── src/
│   ├── dashboard-svelte-provider.ts    # Extension-side provider
│   ├── dashboard-tree-provider.ts      # Sidebar tree view (temporary?)
│   └── webview/
│       ├── Dashboard.svelte            # Svelte template
│       └── Dashboard.css               # Separated styles
├── dist/
│   └── webview/
│       └── dashboard-component.js         # Compiled output (from Dashboard.svelte)
└── rollup.config.js                    # Build configuration
```

### File Responsibilities

#### `Dashboard.svelte`

- Compiles into dashboard-component.js
- Dashboard component that renders the dashboard UI
- Manages client-side state (loading, error, dashboard data)
- Sends messages to the extension via `vscode.postMessage()`
- Receives data updates via `window.addEventListener('message')`

#### `Dashboard.css`

- Styles for the dashboard component
- Uses VSCode CSS variables for theme integration
- Loaded via import in the Svelte template

#### `dashboard-svelte-provider.ts`

- Creates and manages the VSCode WebView panel
- Initializes Carbonara core services (data, schema, VSCode data provider)
- Handles bidirectional message passing with the Dashboard component
- Loads and sends data from the SQLite database to the WebView
- Implements export functionality (JSON/CSV)

#### `dashboard-tree-provider.ts`

- Probably not the UI solution we want in the end product
- Provides the "Dashboard" section in the Carbonara sidebar
- Displays a clickable "📊 Open Dashboard" button
- Triggers the `carbonara.showDashboardSvelte` command

## Communication Flow

### Extension → Dashboard (Data Updates)

```typescript
// In dashboard-svelte-provider.ts
panel.webview.postMessage({
  type: "data",
  data: {
    groups: [...],  // Data grouped by tool
    stats: {...}    // Project statistics
  }
});
```

### Dashboard → Extension (Commands)

```javascript
// In Dashboard.svelte / dashboard-component.js
// limited interactivity for now, just a refresh button and data export buttons
vscode.postMessage({ command: "refresh" });
vscode.postMessage({ command: "export", format: "json" });
```

### Message Handler

```typescript
// In dashboard-svelte-provider.ts
panel.webview.onDidReceiveMessage(async (message) => {
  switch (message.command) {
    case "getData":
    case "refresh":
      await this.sendDataToWebview(panel);
      break;
    case "export":
      await this.exportData(message.format);
      break;
  }
});
```

## Auto-Refresh on Focus

The dashboard automatically refreshes when the panel regains focus:

```typescript
// In dashboard-svelte-provider.ts (lines 128-137)
panel.onDidChangeViewState(
  async (e) => {
    if (e.webviewPanel.active) {
      await this.sendDataToWebview(panel);
    }
  },
  null,
  this.context.subscriptions
);
```

**Triggers:**

- User switches to the dashboard tab from another tab
- Dashboard panel regains focus after being in the background
- User returns to the dashboard from another part of VSCode
- Refresh button

**Behavior:**

- Queries the SQLite database for latest data
- Sends updated data to the dashboard component via `postMessage`
- Dashboard component reactively updates the UI

## Build Process

### Rollup Configuration

The Dashboard component is compiled using Rollup with the following plugins:

```javascript
// rollup.config.js
{
  input: 'src/webview/Dashboard.svelte',
  output: {
    format: 'iife',
    name: 'app',
    file: 'dist/webview/dashboard-component.js'
  },
  plugins: [
    postcss({
      inject: true,        // Inject CSS into bundle
      minimize: production
    }),
    svelte({
      preprocess: sveltePreprocess(),
      compilerOptions: {
        dev: !production
      },
      emitCss: false      // Inline CSS for simplicity
    }),
    resolve({
      browser: true,
      dedupe: ['svelte']
    }),
    commonjs(),
    production && terser()
  ]
}
```

### Build Pipeline

1. **CSS Processing** (`rollup-plugin-postcss`)
   - Processes `Dashboard.css` imported in the Svelte template
   - Injects CSS directly into the JavaScript bundle
   - Minifies CSS in production builds

2. **Svelte Compilation** (`rollup-plugin-svelte`)
   - Compiles `.svelte` file to vanilla JavaScript Dashboard component
   - Preprocesses with `svelte-preprocess` for enhanced syntax support
   - Runs in development mode with helpful debugging in non-production

3. **Dependency Resolution** (`@rollup/plugin-node-resolve`, `@rollup/plugin-commonjs`)
   - Resolves npm dependencies
   - Converts CommonJS modules to ES6

4. **Minification** (`@rollup/plugin-terser`)
   - Minifies JavaScript in production builds

### Build Commands

```bash
# Build Svelte dashboard only
npm run build:svelte

# Watch mode (rebuild on file changes)
npm run watch:svelte

# Full extension build (includes Svelte build)
npm run build
```

### Output

The build produces a single file:

- **`dist/webview/dashboard-component.js`** (~12KB)
  - Self-contained JavaScript bundle
  - Includes compiled Svelte template logic
  - Includes injected CSS styles
  - Exposed as global `app` variable

### Loading in WebView

```typescript
// In dashboard-svelte-provider.ts
private getHtmlForWebview(webview: vscode.Webview): string {
  const scriptUri = webview.asWebviewUri(scriptPath);
  return `
    <script src="${scriptUri}"></script>
    <script>
      new app({ target: document.body });
    </script>
  `;
}
```

## Data Flow

### Initialization Sequence

1. User opens dashboard (clicks button or runs command)
2. `DashboardSvelteProvider.showDashboard()` creates WebView panel
3. Provider initializes Carbonara core services
4. Provider loads HTML with Dashboard component
5. Dashboard component mounts and sends `getData` message
6. Provider queries database and sends data to Dashboard
7. Dashboard component renders the dashboard

### Export Flow

1. User clicks "Export JSON" or "Export CSV" button
2. Dashboard sends `{ command: 'export', format: 'json'|'csv' }` message
3. Provider calls `vscodeProvider.exportData(projectPath, format)`
4. Core service queries database and formats data
5. Provider writes file to workspace folder
6. User receives success notification

## VSCode API Integration

### WebView API

```javascript
// Acquired in Dashboard.svelte
const vscode = acquireVsCodeApi();
```

### Message Passing

- **Sending**: `vscode.postMessage({ ... })`
- **Receiving**: `window.addEventListener('message', ...)`

### State Persistence

The WebView retains its context when hidden via:

```typescript
{
  retainContextWhenHidden: true;
}
```

## Development Notes

### Hot Reload

Use watch mode during development:

```bash
npm run watch:svelte
```

### Debugging

- Open VSCode Developer Tools: `Cmd/Ctrl+Shift+P` → "Developer: Toggle Developer Tools"
- Svelte logs appear in the Console tab
- Extension logs appear under "[Extension Host]"

### TypeScript Compilation

The main extension code (`.ts` files) is compiled separately via `tsc`:

```bash
tsc -p ./
```

The full build process runs in order:

1. Clean dist folder
2. Build Dashboard component from Svelte template (Rollup)
3. Compile TypeScript (tsc)
4. Copy dependencies
