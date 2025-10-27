<script>
  import { onMount } from 'svelte';
  import './Dashboard.css';

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
