<script lang="ts">
  import { onMount } from 'svelte';
  import { createWebSocketClient, type CarbonaraClient } from '@carbonara/rpc-client-js';
  import type { Diagnostic, CompletionItem } from '@carbonara/rpc-protocol';

  let client: CarbonaraClient;
  let connected = false;
  let serverStatus = 'Disconnected';
  let currentFile = '';
  let fileContent = '';
  let diagnostics: Diagnostic[] = [];
  let completions: CompletionItem[] = [];
  let logs: string[] = [];

  onMount(() => {
    client = createWebSocketClient('localhost', 3000);
    
    client.on('connected', () => {
      connected = true;
      serverStatus = 'Connected';
      addLog('Connected to Carbonara server');
      initializeClient();
    });

    client.on('disconnected', () => {
      connected = false;
      serverStatus = 'Disconnected';
      addLog('Disconnected from server');
    });

    client.on('error', (error) => {
      addLog(`Error: ${error.message}`);
    });

    client.on('notification', (notification) => {
      addLog(`Notification: ${notification.method}`);
      if (notification.method === 'carbonara/diagnosticsChanged') {
        diagnostics = notification.params.diagnostics;
      }
    });

    connectToServer();
  });

  async function connectToServer() {
    try {
      await client.connect();
    } catch (error) {
      addLog(`Failed to connect: ${error.message}`);
    }
  }

  async function initializeClient() {
    try {
      const response = await client.initialize({
        name: 'Carbonara Web UI',
        version: '1.0.0'
      });
      addLog(`Server capabilities: ${JSON.stringify(response.capabilities)}`);
    } catch (error) {
      addLog(`Initialization failed: ${error.message}`);
    }
  }

  async function analyzeFile() {
    if (!currentFile || !connected) return;
    
    try {
      const result = await client.analyze(currentFile, fileContent);
      diagnostics = result.diagnostics;
      addLog(`Analysis complete: ${diagnostics.length} diagnostics found`);
    } catch (error) {
      addLog(`Analysis failed: ${error.message}`);
    }
  }

  async function getCompletions() {
    if (!currentFile || !connected) return;

    try {
      const result = await client.getCompletions(currentFile, { line: 0, character: 0 });
      completions = result.items;
      addLog(`Completions: ${completions.length} items`);
    } catch (error) {
      addLog(`Completions failed: ${error.message}`);
    }
  }

  function addLog(message: string) {
    logs = [new Date().toLocaleTimeString() + ': ' + message, ...logs.slice(0, 49)];
  }

  function clearLogs() {
    logs = [];
  }
</script>

<main>
  <header class="header">
    <div class="header-content">
      <div class="logo">
        <h1>🔥 Carbonara</h1>
        <span class="subtitle">Multi-Editor Plugin Architecture</span>
      </div>
      <div class="status">
        <div class="status-indicator {connected ? 'connected' : 'disconnected'}"></div>
        <span>{serverStatus}</span>
      </div>
    </div>
  </header>

  <div class="container">
    <div class="main-content">
      <div class="editor-section">
        <div class="section-header">
          <h2>Code Editor</h2>
          <div class="actions">
            <button class="btn btn-primary" on:click={analyzeFile} disabled={!connected}>
              Analyze
            </button>
            <button class="btn btn-secondary" on:click={getCompletions} disabled={!connected}>
              Get Completions
            </button>
          </div>
        </div>
        
        <div class="file-input">
          <input
            type="text"
            placeholder="File path (e.g., /path/to/file.js)"
            bind:value={currentFile}
            class="input"
          />
        </div>

        <textarea
          placeholder="Enter your code here..."
          bind:value={fileContent}
          class="code-editor"
          rows="15"
        ></textarea>
      </div>

      <div class="results-grid">
        <div class="diagnostics-section">
          <h3>Diagnostics ({diagnostics.length})</h3>
          <div class="diagnostics-list">
            {#each diagnostics as diagnostic}
              <div class="diagnostic-item {diagnostic.severity}">
                <div class="diagnostic-severity">{diagnostic.severity}</div>
                <div class="diagnostic-message">{diagnostic.message}</div>
                <div class="diagnostic-location">
                  Line {diagnostic.range.start.line + 1}, Col {diagnostic.range.start.character + 1}
                </div>
              </div>
            {:else}
              <div class="empty-state">No diagnostics found</div>
            {/each}
          </div>
        </div>

        <div class="completions-section">
          <h3>Completions ({completions.length})</h3>
          <div class="completions-list">
            {#each completions as completion}
              <div class="completion-item">
                <div class="completion-kind">{completion.kind}</div>
                <div class="completion-label">{completion.label}</div>
                <div class="completion-detail">{completion.detail || ''}</div>
              </div>
            {:else}
              <div class="empty-state">No completions available</div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <div class="sidebar">
      <div class="logs-section">
        <div class="logs-header">
          <h3>Activity Log</h3>
          <button class="btn btn-small" on:click={clearLogs}>Clear</button>
        </div>
        <div class="logs-list">
          {#each logs as log}
            <div class="log-entry">{log}</div>
          {:else}
            <div class="empty-state">No activity yet</div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</main>

<style>
  :global(body) {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0d1117;
    color: #f0f6fc;
    margin: 0;
    padding: 0;
  }

  main {
    min-height: 100vh;
    background: #0d1117;
  }

  .header {
    background: #161b22;
    border-bottom: 1px solid #30363d;
    padding: 1rem 0;
  }

  .header-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .logo h1 {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 700;
    color: #f78166;
  }

  .subtitle {
    color: #8b949e;
    font-size: 0.9rem;
    margin-left: 0.5rem;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f85149;
  }

  .status-indicator.connected {
    background: #56d364;
  }

  .container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem;
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 2rem;
  }

  .main-content {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .editor-section, .diagnostics-section, .completions-section, .logs-section {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.5rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .section-header h2 {
    margin: 0;
    color: #f0f6fc;
    font-size: 1.2rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .file-input {
    margin-bottom: 1rem;
  }

  .input {
    width: 100%;
    padding: 0.75rem;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #f0f6fc;
    font-size: 0.9rem;
  }

  .input:focus {
    outline: none;
    border-color: #1f6feb;
    box-shadow: 0 0 0 3px rgba(31, 111, 235, 0.1);
  }

  .code-editor {
    width: 100%;
    padding: 1rem;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #f0f6fc;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.9rem;
    line-height: 1.5;
    resize: vertical;
  }

  .code-editor:focus {
    outline: none;
    border-color: #1f6feb;
    box-shadow: 0 0 0 3px rgba(31, 111, 235, 0.1);
  }

  .results-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }

  h3 {
    margin: 0 0 1rem 0;
    color: #f0f6fc;
    font-size: 1rem;
  }

  .diagnostics-list, .completions-list, .logs-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .diagnostic-item {
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background: #21262d;
    border-radius: 6px;
    border-left: 3px solid;
  }

  .diagnostic-item.error {
    border-left-color: #f85149;
  }

  .diagnostic-item.warning {
    border-left-color: #d29922;
  }

  .diagnostic-item.info {
    border-left-color: #58a6ff;
  }

  .diagnostic-item.hint {
    border-left-color: #8b949e;
  }

  .diagnostic-severity {
    font-size: 0.8rem;
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .diagnostic-message {
    color: #f0f6fc;
    margin-bottom: 0.25rem;
  }

  .diagnostic-location {
    font-size: 0.8rem;
    color: #8b949e;
  }

  .completion-item {
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    background: #21262d;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .completion-kind {
    background: #1f6feb;
    color: white;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    min-width: 30px;
    text-align: center;
  }

  .completion-label {
    font-weight: 600;
    color: #f0f6fc;
  }

  .completion-detail {
    color: #8b949e;
    font-size: 0.8rem;
  }

  .logs-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .log-entry {
    padding: 0.5rem;
    margin-bottom: 0.25rem;
    background: #21262d;
    border-radius: 4px;
    font-size: 0.8rem;
    color: #8b949e;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    word-break: break-all;
  }

  .empty-state {
    color: #8b949e;
    font-style: italic;
    text-align: center;
    padding: 1rem;
  }

  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #238636;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #2ea043;
  }

  .btn-secondary {
    background: #21262d;
    color: #f0f6fc;
    border: 1px solid #30363d;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #30363d;
  }

  .btn-small {
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
    background: #21262d;
    color: #f0f6fc;
    border: 1px solid #30363d;
  }

  .btn-small:hover {
    background: #30363d;
  }

  @media (max-width: 1024px) {
    .container {
      grid-template-columns: 1fr;
      padding: 1rem;
    }

    .results-grid {
      grid-template-columns: 1fr;
    }
  }
</style> 