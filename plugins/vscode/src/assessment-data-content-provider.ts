/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2025 Carbonara team
 */

import * as vscode from "vscode";
import { VSCodeDataProvider, DataDetail, DataService, SchemaService, type AssessmentDataEntry, type ToolDisplayField } from "@carbonara/core";

export type CoreServices = {
  dataService: DataService;
  schemaService: SchemaService;
  vscodeProvider: VSCodeDataProvider;
};

const SCHEME = "carbonara-data";

/**
 * Content provider for virtual documents showing assessment data
 */
export class AssessmentDataContentProvider
  implements vscode.TextDocumentContentProvider
{
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  private coreServices: CoreServices | null = null;

  onDidChange = this._onDidChange.event;

  setCoreServices(services: CoreServices) {
    this.coreServices = services;
  }

  provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
    const path = uri.path;
    const authority = uri.authority;

    // Handle carbonara-data://entry/123 format
    // In this format: authority = "entry", path = "/123"
    if (authority === "entry" && path) {
      const entryIdStr = path.replace(/^\//, "");
      const entryId = parseInt(entryIdStr);
      if (isNaN(entryId)) {
        return `# Error\n\nInvalid entry ID: ${entryIdStr}`;
      }
      return this.getEntryContent(entryId);
    }
    
    // Handle carbonara-data://group/toolName format
    // In this format: authority = "group", path = "/toolName"
    if (authority === "group" && path) {
      const toolName = decodeURIComponent(path.replace(/^\//, ""));
      return this.getGroupContent(toolName);
    }

    // Fallback: try parsing from path (for backwards compatibility)
    if (path.startsWith("/entry/") || path.startsWith("entry/")) {
      const entryIdStr = path.startsWith("/entry/") 
        ? path.substring("/entry/".length)
        : path.substring("entry/".length);
      const entryId = parseInt(entryIdStr);
      if (isNaN(entryId)) {
        return `# Error\n\nInvalid entry ID: ${entryIdStr}`;
      }
      return this.getEntryContent(entryId);
    } else if (path.startsWith("/group/") || path.startsWith("group/")) {
      const toolNameStr = path.startsWith("/group/")
        ? path.substring("/group/".length)
        : path.substring("group/".length);
      const toolName = decodeURIComponent(toolNameStr);
      return this.getGroupContent(toolName);
    }

    return `# Error\n\nInvalid document path: ${uri.toString()}\nAuthority: ${authority}, Path: ${path}`;
  }

  private async getEntryContent(entryId: number): Promise<string> {
    if (!this.coreServices) {
      return "# Error\n\nCore services not initialized.";
    }

    try {
      // Get all entries and find the one we want
      const allEntriesData =
        await this.coreServices.dataService.getAssessmentData();
      const entry = allEntriesData.find((e: AssessmentDataEntry) => e.id === entryId);

      if (!entry) {
        return `# Entry Not Found\n\nEntry with ID ${entryId} could not be found.`;
      }

      // Get schema for formatting
      const toolSchema = this.coreServices.schemaService.getToolSchema(entry.tool_name);
      
      // Use schema templates if available
      let title = `${entry.tool_name} Assessment`;
      let description = `Entry ID: ${entry.id}`;
      
      if (toolSchema?.display) {
        // Use entryTemplate for title
        title = toolSchema.display.entryTemplate;
        description = toolSchema.display.descriptionTemplate;
        
      // Replace template variables
      const date = new Date(entry.timestamp).toLocaleDateString();
      title = title.replace('{date}', date);
      description = description.replace('{date}', date);
      
      // Special handling for computed values that don't have direct fields
      // totalKB: computed from totalBytes (for carbonara-swd)
      if (title.includes('{totalKB}') || description.includes('{totalKB}')) {
        const totalBytes = this.coreServices!.schemaService.extractValue(entry, 'data.totalBytes');
        if (totalBytes !== null && totalBytes !== undefined) {
          const totalKB = Math.round(Number(totalBytes) / 1024);
          title = title.replace('{totalKB}', totalKB.toString());
          description = description.replace('{totalKB}', totalKB.toString());
        }
      }
      
      // count: computed from deployments array length (for deployment-scan)
      if (title.includes('{count}') || description.includes('{count}')) {
        const deployments = this.coreServices!.schemaService.extractValue(entry, 'data.deployments');
        let count = 0;
        if (Array.isArray(deployments)) {
          count = deployments.length;
        } else if (deployments === null || deployments === undefined) {
          // Try total_count as fallback
          const totalCount = this.coreServices!.schemaService.extractValue(entry, 'data.total_count');
          if (totalCount !== null && totalCount !== undefined) {
            count = Number(totalCount);
          }
        }
        title = title.replace('{count}', count.toString());
        description = description.replace('{count}', count.toString());
      }
      
      // Replace field values in templates
      toolSchema.display.fields.forEach((field: ToolDisplayField) => {
        const value = this.coreServices!.schemaService.extractValue(entry, field.path);
        if (value !== null && value !== undefined) {
          const placeholder = `{${field.key}}`;
          const formattedValue = this.coreServices!.schemaService.formatValue(value, field.type, field.format);
          
          title = title.replace(placeholder, formattedValue);
          description = description.replace(placeholder, formattedValue);
        }
      });
      
      // Remove any unreplaced placeholders
      title = title.replace(/\{[^}]+\}/g, '').trim();
      description = description.replace(/\{[^}]+\}/g, '').trim();
      
      // Fallback if empty
      if (!title || title.length === 0) {
        title = `${entry.tool_name} Assessment`;
      }
      if (!description || description.length === 0) {
        description = date;
      }
      }

      // Get details using the schema
      const details =
        await this.coreServices.vscodeProvider.createDataDetails(entry);

      // Get badge color if available
      const entriesForTool = allEntriesData.filter((e: AssessmentDataEntry) => e.tool_name === entry.tool_name);
      const badgeColor = this.coreServices.vscodeProvider.calculateBadgeColor(entry, entry.tool_name, entriesForTool);

      // Format as markdown
      let markdown = `# ${title}\n\n`;
      markdown += `${description}\n\n`;
      markdown += `**Timestamp:** ${new Date(entry.timestamp).toLocaleString()}\n\n`;
      
      // Add badge if available
      if (badgeColor && badgeColor !== 'none') {
        markdown += `**Carbon Impact:** <span class="badge badge-${badgeColor}">●</span> ${badgeColor}\n\n`;
      }
      
      markdown += `---\n\n`;

      // Add all details as a table
      if (details.length > 0) {
        markdown += `## Details\n\n`;
        markdown += `| Field | Value |\n`;
        markdown += `|-------|-------|\n`;
        for (const detail of details) {
          // Extract label and value from formatted label
          const colonIndex = detail.label.indexOf(':');
          let fieldLabel = detail.label;
          let value = '';
          
          if (colonIndex > 0) {
            fieldLabel = detail.label.substring(0, colonIndex).trim();
            value = detail.label.substring(colonIndex + 1).trim();
          } else {
            value = detail.formattedValue || String(detail.value || '');
          }
          
          // Remove emoji if present
          fieldLabel = fieldLabel.replace(/^[^\s]+\s+/, '');
          
          markdown += `| ${fieldLabel} | ${value} |\n`;
        }
        markdown += `\n`;
      }

      // Add raw data section (collapsed)
      if (entry.data) {
        markdown += `---\n\n`;
        markdown += `<details>\n<summary>Raw Data</summary>\n\n`;
        markdown += `\`\`\`json\n${JSON.stringify(entry.data, null, 2)}\n\`\`\`\n\n`;
        markdown += `</details>\n`;
      }

      return markdown;
    } catch (error: any) {
      return `# Error\n\nFailed to load entry: ${error.message}`;
    }
  }

  private async getGroupContent(toolName: string): Promise<string> {
    if (!this.coreServices) {
      return "# Error\n\nCore services not initialized.";
    }

    try {
      // Get all entries for this tool
      const allEntries =
        await this.coreServices.dataService.getAssessmentData(undefined, toolName);
      const entries = allEntries.filter((e: AssessmentDataEntry) => e.tool_name === toolName);

      if (entries.length === 0) {
        return `# ${toolName} Summary\n\nNo entries found for this tool.`;
      }

      // Get schema for formatting
      const toolSchema = this.coreServices.schemaService.getToolSchema(toolName);
      const groupName = toolSchema?.display?.groupName || `${toolName} Results`;
      const icon = toolSchema?.display?.icon || "📊";

      // Format as markdown
      let markdown = `# ${icon} ${groupName}\n\n`;
      markdown += `**Total Entries:** ${entries.length}\n\n`;
      markdown += `---\n\n`;

      // Group by date (most recent first)
      const sortedEntries = entries.sort(
        (a: any, b: any) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      markdown += `## Entries\n\n`;

      for (const entry of sortedEntries) {
        // Use schema templates if available
        let entryTitle = `Entry #${entry.id}`;
        let entryDescription = new Date(entry.timestamp).toLocaleString();
        
        if (toolSchema?.display) {
          // Use entryTemplate for title
          entryTitle = toolSchema.display.entryTemplate;
          entryDescription = toolSchema.display.descriptionTemplate;
          
          // Replace template variables
          const date = new Date(entry.timestamp).toLocaleDateString();
          entryTitle = entryTitle.replace('{date}', date);
          entryDescription = entryDescription.replace('{date}', date);
          
          // Special handling for computed values that don't have direct fields
          // totalKB: computed from totalBytes (for carbonara-swd)
          if (entryTitle.includes('{totalKB}') || entryDescription.includes('{totalKB}')) {
            const totalBytes = this.coreServices!.schemaService.extractValue(entry, 'data.totalBytes');
            if (totalBytes !== null && totalBytes !== undefined) {
              const totalKB = Math.round(Number(totalBytes) / 1024);
              entryTitle = entryTitle.replace('{totalKB}', totalKB.toString());
              entryDescription = entryDescription.replace('{totalKB}', totalKB.toString());
            }
          }
          
          // count: computed from deployments array length (for deployment-scan)
          if (entryTitle.includes('{count}') || entryDescription.includes('{count}')) {
            const deployments = this.coreServices!.schemaService.extractValue(entry, 'data.deployments');
            let count = 0;
            if (Array.isArray(deployments)) {
              count = deployments.length;
            } else if (deployments === null || deployments === undefined) {
              // Try total_count as fallback
              const totalCount = this.coreServices!.schemaService.extractValue(entry, 'data.total_count');
              if (totalCount !== null && totalCount !== undefined) {
                count = Number(totalCount);
              }
            }
            entryTitle = entryTitle.replace('{count}', count.toString());
            entryDescription = entryDescription.replace('{count}', count.toString());
          }
          
          // Replace field values in templates
          toolSchema.display.fields.forEach((field: ToolDisplayField) => {
            const value = this.coreServices!.schemaService.extractValue(entry, field.path);
            if (value !== null && value !== undefined) {
              const placeholder = `{${field.key}}`;
              const formattedValue = this.coreServices!.schemaService.formatValue(value, field.type, field.format);
              
              entryTitle = entryTitle.replace(placeholder, formattedValue);
              entryDescription = entryDescription.replace(placeholder, formattedValue);
            }
          });
          
          // Remove any unreplaced placeholders
          entryTitle = entryTitle.replace(/\{[^}]+\}/g, '').trim();
          entryDescription = entryDescription.replace(/\{[^}]+\}/g, '').trim();
          
          // Fallback if empty
          if (!entryTitle || entryTitle.length === 0) {
            entryTitle = `Entry #${entry.id}`;
          }
          if (!entryDescription || entryDescription.length === 0) {
            entryDescription = date;
          }
        }

        // Get badge color if available
        const badgeColor = this.coreServices.vscodeProvider.calculateBadgeColor(entry, toolName, entries);

        // Get key details for summary
        const details =
          await this.coreServices.vscodeProvider.createDataDetails(entry);

        markdown += `### ${entryTitle}\n\n`;
        markdown += `${entryDescription}\n\n`;
        
        // Add badge if available
        if (badgeColor && badgeColor !== 'none') {
          markdown += `**Carbon Impact:** <span class="badge badge-${badgeColor}">●</span> ${badgeColor}\n\n`;
        }

        // Show details as a table
        if (details.length > 0) {
          markdown += `| Field | Value |\n`;
          markdown += `|-------|-------|\n`;
          const keyDetails = details.slice(0, 5);
          for (const detail of keyDetails) {
            // Extract label and value
            const colonIndex = detail.label.indexOf(':');
            let fieldLabel = detail.label;
            let value = '';
            
            if (colonIndex > 0) {
              fieldLabel = detail.label.substring(0, colonIndex).trim();
              value = detail.label.substring(colonIndex + 1).trim();
            } else {
              value = detail.formattedValue || String(detail.value || '');
            }
            
            // Remove emoji if present
            fieldLabel = fieldLabel.replace(/^[^\s]+\s+/, '');
            
            markdown += `| ${fieldLabel} | ${value} |\n`;
          }
          markdown += `\n`;
        }

        // Use command URI format: command:commandId?[arg1,arg2]
        // For a single number argument, we need to encode the brackets
        const commandUri = `command:carbonara.openEntryDocument?${encodeURIComponent(JSON.stringify([entry.id]))}`;
        markdown += `[View Full Entry](${commandUri})\n\n`;
        markdown += `---\n\n`;
      }

      return markdown;
    } catch (error: any) {
      return `# Error\n\nFailed to load group summary: ${error.message}`;
    }
  }

  refresh(uri: vscode.Uri) {
    this._onDidChange.fire(uri);
  }
}

/**
 * Create a URI for an entry document
 */
export function createEntryUri(entryId: number): vscode.Uri {
  return vscode.Uri.parse(`${SCHEME}://entry/${entryId}`);
}

/**
 * Create a URI for a group document
 */
export function createGroupUri(toolName: string): vscode.Uri {
  return vscode.Uri.parse(
    `${SCHEME}://group/${encodeURIComponent(toolName)}`
  );
}

/**
 * Open a virtual document for an entry (as webview with markdown rendering)
 */
export async function openEntryDocument(
  entryId: number,
  provider: AssessmentDataContentProvider
): Promise<void> {
  const uri = createEntryUri(entryId);
  const markdown = await provider.provideTextDocumentContent(uri);
  
  // Create webview panel
  const panel = vscode.window.createWebviewPanel(
    'carbonaraEntryView',
    `Entry #${entryId}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );
  
  // Render markdown in webview
  panel.webview.html = getMarkdownWebviewContent(markdown, panel.webview, provider);
  
  // Handle command links in markdown
  panel.webview.onDidReceiveMessage(
    message => {
      if (message.command === 'openEntry') {
        const targetEntryId = parseInt(message.entryId);
        if (!isNaN(targetEntryId)) {
          openEntryDocument(targetEntryId, provider);
        }
      } else if (message.command === 'openGroup') {
        openGroupDocument(message.toolName, provider);
      }
    },
    undefined,
    []
  );
}

/**
 * Open a virtual document for a group (as webview with markdown rendering)
 */
export async function openGroupDocument(
  toolName: string,
  provider: AssessmentDataContentProvider
): Promise<void> {
  const uri = createGroupUri(toolName);
  const markdown = await provider.provideTextDocumentContent(uri);
  
  // Create webview panel
  const panel = vscode.window.createWebviewPanel(
    'carbonaraGroupView',
    `${toolName} Summary`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );
  
  // Render markdown in webview
  panel.webview.html = getMarkdownWebviewContent(markdown, panel.webview, provider);
  
  // Handle command links in markdown
  panel.webview.onDidReceiveMessage(
    message => {
      if (message.command === 'openEntry') {
        const targetEntryId = parseInt(message.entryId);
        if (!isNaN(targetEntryId)) {
          openEntryDocument(targetEntryId, provider);
        }
      } else if (message.command === 'openGroup') {
        openGroupDocument(message.toolName, provider);
      }
    },
    undefined,
    []
  );
}

/**
 * Generate HTML content for webview with markdown rendering
 */
function getMarkdownWebviewContent(
  markdown: string,
  webview: vscode.Webview,
  provider: AssessmentDataContentProvider
): string {
  // Convert command URIs to clickable HTML links
  const processedMarkdown = markdown.replace(
    /\[([^\]]+)\]\(command:([^)]+)\)/g,
    (match, text, command) => {
      // Extract command and arguments
      const [commandId, argsJson] = command.split('?');
      if (commandId === 'carbonara.openEntryDocument' && argsJson) {
        try {
          const args = JSON.parse(decodeURIComponent(argsJson));
          const entryId = args[0];
          // Replace markdown link with proper HTML anchor tag
          return `<a href="javascript:void(0);" data-entry-id="${entryId}" class="command-link">${text}</a>`;
        } catch (e) {
          return match;
        }
      }
      return match;
    }
  );
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Carbonara Data View</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      line-height: 1.6;
    }
    h1, h2, h3 {
      color: var(--vscode-textLink-foreground);
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    code {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }
    .badge {
      display: inline-block;
      margin-right: 4px;
    }
    .badge-green {
      color: var(--vscode-charts-green);
    }
    .badge-yellow {
      color: var(--vscode-charts-yellow);
    }
    .badge-orange {
      color: var(--vscode-charts-orange);
    }
    .badge-red {
      color: var(--vscode-charts-red);
    }
    pre {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 10px;
      border-radius: 5px;
      overflow-x: auto;
    }
    pre code {
      padding: 0;
    }
    a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .command-link {
      cursor: pointer;
      color: var(--vscode-textLink-foreground);
    }
    details {
      margin: 10px 0;
    }
    summary {
      cursor: pointer;
      font-weight: bold;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 10px 0;
    }
    th, td {
      border: 1px solid var(--vscode-panel-border);
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: var(--vscode-list-activeSelectionBackground);
    }
  </style>
</head>
<body>
  <div id="content"></div>
  <script>
    const vscode = acquireVsCodeApi();
    const markdown = ${JSON.stringify(processedMarkdown)};
    const html = marked.parse(markdown);
    document.getElementById('content').innerHTML = html;
    
    // Handle command links
    document.addEventListener('click', function(e) {
      const link = e.target.closest('.command-link');
      if (link) {
        e.preventDefault();
        const entryId = link.getAttribute('data-entry-id');
        if (entryId) {
          vscode.postMessage({
            command: 'openEntry',
            entryId: entryId
          });
        }
      }
    });
  </script>
</body>
</html>`;
}

