<script>
  import { onMount } from 'svelte';

  let dashboardData = {
    stats: {
      totalEntries: 0,
      toolCounts: {}
    },
    groups: []
  };

  let loading = true;
  let error = null;

  // VSCode API
  const vscode = acquireVsCodeApi();

  onMount(() => {
    // Request initial data
    vscode.postMessage({ command: 'getData' });

    // Listen for messages from the extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'data':
          dashboardData = message.data;
          loading = false;
          error = null;
          break;
        case 'error':
          error = message.error;
          loading = false;
          break;
      }
    });
  });

  function refresh() {
    loading = true;
    error = null;
    vscode.postMessage({ command: 'refresh' });
  }

  function exportData(format) {
    vscode.postMessage({ command: 'export', format });
  }
</script>

<div class="dashboard">
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading dashboard...</p>
    </div>
  {:else if error}
    <div class="error-container">
      <h2>⚠️ Error</h2>
      <p>{error}</p>
      <button on:click={refresh}>Try Again</button>
    </div>
  {:else}
    <div class="header">
      <h1>🌱 Carbonara Dashboard</h1>
      <div class="actions">
        <button on:click={refresh}>↻ Refresh</button>
        <button on:click={() => exportData('json')}>Export JSON</button>
        <button on:click={() => exportData('csv')}>Export CSV</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <h3>Total Entries</h3>
        <div class="total-entries">{dashboardData.stats.totalEntries}</div>
      </div>

      <div class="stat-card">
        <h3>Data by Tool</h3>
        {#if Object.keys(dashboardData.stats.toolCounts).length > 0}
          {#each Object.entries(dashboardData.stats.toolCounts) as [toolName, count]}
            <div class="stat-item">
              <div class="stat-label">{toolName}</div>
              <div class="stat-value">{count}</div>
            </div>
          {/each}
        {:else}
          <div class="stat-item">
            <div class="stat-label">No data</div>
          </div>
        {/if}
      </div>
    </div>

    {#if dashboardData.groups.length > 0}
      <div class="data-groups">
        {#each dashboardData.groups as group}
          <div class="data-group">
            <h3 class="group-title">{group.displayName}</h3>
            <div class="group-count">{group.entries.length} entries</div>
            <div class="entries">
              {#each group.entries as entry}
                <div class="entry-card">
                  <div class="entry-label">{entry.label}</div>
                  <div class="entry-description">{entry.description}</div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty-state">
        <h2>No Data Available</h2>
        <p>Run an analysis to see data here</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  :global(body) {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 0;
    margin: 0;
    line-height: 1.6;
  }

  * {
    box-sizing: border-box;
  }

  .dashboard {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
  }

  .loading {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100vh;
    text-align: center;
  }

  .spinner {
    border: 4px solid var(--vscode-progressBar-background);
    border-top: 4px solid var(--vscode-progressBar-foreground);
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .error-container {
    max-width: 600px;
    margin: 40px auto;
    padding: 20px;
    background: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    border-radius: 4px;
  }

  .error-container h2 {
    margin-top: 0;
    color: var(--vscode-errorForeground);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 600;
  }

  .actions {
    display: flex;
    gap: 10px;
  }

  button {
    padding: 8px 16px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-family: var(--vscode-font-family);
    transition: background 0.2s;
  }

  button:hover {
    background: var(--vscode-button-hoverBackground);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }

  .stat-card {
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 20px;
  }

  .stat-card h3 {
    margin: 0 0 15px 0;
    font-size: 14px;
    font-weight: 500;
    opacity: 0.8;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .stat-item:last-child {
    border-bottom: none;
  }

  .stat-label {
    font-size: 14px;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 600;
    color: var(--vscode-textLink-foreground);
  }

  .total-entries {
    font-size: 48px;
    font-weight: 700;
    color: var(--vscode-textLink-foreground);
  }

  .data-groups {
    display: grid;
    gap: 20px;
  }

  .data-group {
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 20px;
  }

  .group-title {
    margin: 0 0 5px 0;
    font-size: 20px;
    font-weight: 600;
  }

  .group-count {
    color: var(--vscode-descriptionForeground);
    font-size: 14px;
    margin-bottom: 15px;
  }

  .entries {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 15px;
    margin-top: 15px;
  }

  .entry-card {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 15px;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .entry-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  .entry-label {
    font-weight: 600;
    margin-bottom: 5px;
    font-size: 15px;
  }

  .entry-description {
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--vscode-descriptionForeground);
  }

  .empty-state h2 {
    font-size: 24px;
    margin-bottom: 10px;
  }
</style>
