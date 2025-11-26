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
      const allEntries =
        await this.coreServices.dataService.getAssessmentData();
      const entry = allEntries.find((e: AssessmentDataEntry) => e.id === entryId);

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
        
        // Replace field values in templates
        toolSchema.display.fields.forEach((field: ToolDisplayField) => {
          const value = this.coreServices!.schemaService.extractValue(entry, field.path);
          if (value !== null && value !== undefined) {
            const placeholder = `{${field.key}}`;
            const formattedValue = this.coreServices!.schemaService.formatValue(value, field.type, field.format);
            
            title = title.replace(placeholder, formattedValue);
            description = description.replace(placeholder, formattedValue);
            
            // Special handling for common fields
            if (field.key === 'totalKB' && field.type === 'bytes' && value) {
              const kb = Math.round(Number(value) / 1024);
              title = title.replace('{totalKB}', kb.toString());
              description = description.replace('{totalKB}', kb.toString());
            }
          }
        });
      }

      // Get details using the schema
      const details =
        await this.coreServices.vscodeProvider.createDataDetails(entry);

      // Format as markdown
      let markdown = `# ${title}\n\n`;
      markdown += `${description}\n\n`;
      markdown += `**Timestamp:** ${new Date(entry.timestamp).toLocaleString()}\n\n`;
      markdown += `---\n\n`;

      // Add all details
      if (details.length > 0) {
        markdown += `## Details\n\n`;
        for (const detail of details) {
          // Extract emoji and label from formatted label (e.g., "🌐 URL: https://example.com")
          const labelMatch = detail.label.match(/^([^\s]+)\s+(.+?):\s*(.*)$/);
          if (labelMatch) {
            const emoji = labelMatch[1];
            const fieldLabel = labelMatch[2];
            const value = labelMatch[3];
            markdown += `### ${emoji} ${fieldLabel}\n\n`;
            markdown += `${value}\n\n`;
          } else {
            // Fallback for labels without emoji
            markdown += `### ${detail.label}\n\n`;
          }
        }
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
          
          // Replace field values in templates
          toolSchema.display.fields.forEach((field: ToolDisplayField) => {
            const value = this.coreServices!.schemaService.extractValue(entry, field.path);
            if (value !== null && value !== undefined) {
              const placeholder = `{${field.key}}`;
              const formattedValue = this.coreServices!.schemaService.formatValue(value, field.type, field.format);
              
              entryTitle = entryTitle.replace(placeholder, formattedValue);
              entryDescription = entryDescription.replace(placeholder, formattedValue);
              
              // Special handling for common fields
              if (field.key === 'totalKB' && field.type === 'bytes') {
                const kb = Math.round(Number(value) / 1024);
                entryTitle = entryTitle.replace('{totalKB}', kb.toString());
                entryDescription = entryDescription.replace('{totalKB}', kb.toString());
              }
            }
          });
        }

        markdown += `### ${entryTitle}\n\n`;
        markdown += `${entryDescription}\n\n`;

        // Get key details for summary
        const details =
          await this.coreServices.vscodeProvider.createDataDetails(entry);

        // Show first 3-5 key details
        const keyDetails = details.slice(0, 5);
        if (keyDetails.length > 0) {
          for (const detail of keyDetails) {
            // Extract just the value part
            const valueMatch = detail.label.match(/:\s*(.+)$/);
            if (valueMatch) {
              markdown += `- **${detail.key}:** ${valueMatch[1]}\n`;
            } else {
              markdown += `- ${detail.label}\n`;
            }
          }
        }

        markdown += `\n[View Full Entry](carbonara-data://entry/${entry.id})\n\n`;
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
 * Open a virtual document for an entry
 */
export async function openEntryDocument(
  entryId: number,
  provider: AssessmentDataContentProvider
): Promise<void> {
  const uri = createEntryUri(entryId);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
}

/**
 * Open a virtual document for a group
 */
export async function openGroupDocument(
  toolName: string,
  provider: AssessmentDataContentProvider
): Promise<void> {
  const uri = createGroupUri(toolName);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
}

