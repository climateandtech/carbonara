/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2025 Carbonara team
 */

import { strictEqual, ok } from "assert";
import * as vscode from "vscode";
import { AssessmentDataContentProvider, createEntryUri, createGroupUri } from "../../assessment-data-content-provider";
import { DataService, SchemaService, VSCodeDataProvider } from "@carbonara/core";

type CoreServices = {
  dataService: DataService;
  schemaService: SchemaService;
  vscodeProvider: VSCodeDataProvider;
};

suite("AssessmentDataContentProvider", () => {
  let provider: AssessmentDataContentProvider;
  let mockCoreServices: CoreServices;

  setup(() => {
    provider = new AssessmentDataContentProvider();
    
    // Create mock core services
    const mockDataService = {
      getAssessmentData: async (projectId?: number, toolName?: string) => {
        return [
          {
            id: 1,
            tool_name: "test-analyzer",
            timestamp: "2024-01-01T00:00:00Z",
            data: {
              url: "https://example.com",
              result: "success"
            },
            project_id: 1,
            data_type: "web-analysis"
          },
          {
            id: 2,
            tool_name: "test-analyzer",
            timestamp: "2024-01-02T00:00:00Z",
            data: {
              url: "https://example2.com",
              result: "success"
            },
            project_id: 1,
            data_type: "web-analysis"
          }
        ].filter(e => !toolName || e.tool_name === toolName);
      }
    } as unknown as DataService;

    const mockSchemaService = {
      getToolSchema: (toolId: string) => {
        if (toolId === "test-analyzer") {
          return {
            id: "test-analyzer",
            name: "Test Analyzer",
            display: {
              category: "Testing",
              icon: "🧪",
              groupName: "Test Results",
              entryTemplate: "🧪 {url} - {date}",
              descriptionTemplate: "Test result: {result}",
              fields: [
                {
                  key: "url",
                  label: "🌐 URL",
                  path: "data.url",
                  type: "url" as const
                },
                {
                  key: "result",
                  label: "✅ Result",
                  path: "data.result",
                  type: "string" as const
                }
              ]
            }
          };
        }
        return null;
      },
      extractValue: (entry: any, path: string) => {
        const parts = path.split(".");
        let current = entry;
        for (const part of parts) {
          if (current && typeof current === "object" && part in current) {
            current = current[part];
          } else {
            return null;
          }
        }
        return current;
      },
      formatValue: (value: any, type: string, format?: string) => {
        return String(value);
      }
    } as unknown as SchemaService;

    const mockVSCodeProvider = {
      createDataDetails: async (entry: any) => {
        return [
          {
            key: "url",
            label: "🌐 URL: https://example.com",
            value: "https://example.com",
            formattedValue: "https://example.com",
            type: "url"
          },
          {
            key: "result",
            label: "✅ Result: success",
            value: "success",
            formattedValue: "success",
            type: "string"
          }
        ];
      }
    } as unknown as VSCodeDataProvider;

    mockCoreServices = {
      dataService: mockDataService,
      schemaService: mockSchemaService,
      vscodeProvider: mockVSCodeProvider
    };

    provider.setCoreServices(mockCoreServices);
  });

  test("should create entry URI correctly", () => {
    const uri = createEntryUri(123);
    strictEqual(uri.scheme, "carbonara-data");
    strictEqual(uri.path, "/entry/123");
  });

  test("should create group URI correctly", () => {
    const uri = createGroupUri("test-analyzer");
    strictEqual(uri.scheme, "carbonara-data");
    strictEqual(uri.path, "/group/test-analyzer");
  });

  test("should return error when core services not initialized", async () => {
    const emptyProvider = new AssessmentDataContentProvider();
    const uri = createEntryUri(1);
    const content = await emptyProvider.provideTextDocumentContent(uri);
    ok(content.includes("Error"));
    ok(content.includes("not initialized"));
  });

  test("should return error for invalid URI path", async () => {
    const uri = vscode.Uri.parse("carbonara-data://invalid/path");
    const content = await provider.provideTextDocumentContent(uri);
    ok(content.includes("Error"));
    ok(content.includes("Invalid document path"));
  });

  test("should parse URI with authority correctly", async () => {
    // Test authority-based URI parsing (carbonara-data://entry/123 format)
    const uri = vscode.Uri.parse("carbonara-data://entry/1");
    const content = await provider.provideTextDocumentContent(uri);
    ok(content.includes("🧪"), "Should parse authority-based URI");
    ok(content.includes("https://example.com"), "Should load entry content");
  });

  test("should parse group URI with authority correctly", async () => {
    // Test authority-based group URI parsing
    const uri = vscode.Uri.parse("carbonara-data://group/test-analyzer");
    const content = await provider.provideTextDocumentContent(uri);
    ok(content.includes("Test Results"), "Should parse group URI with authority");
    ok(content.includes("Total Entries"), "Should show group summary");
  });

  test("should return error when entry not found", async () => {
    const uri = createEntryUri(999);
    const content = await provider.provideTextDocumentContent(uri);
    ok(content.includes("Entry Not Found"));
    ok(content.includes("999"));
  });

  test("should generate entry content with schema templates", async () => {
    const uri = createEntryUri(1);
    const content = await provider.provideTextDocumentContent(uri);
    
    // Should use entryTemplate from schema
    ok(content.includes("🧪"), "Should include emoji from entryTemplate");
    ok(content.includes("https://example.com"), "Should include URL from template");
    
    // Should include details
    ok(content.includes("🌐 URL"), "Should include field labels");
    ok(content.includes("✅ Result"), "Should include result field");
    
    // Should include raw data section
    ok(content.includes("Raw Data"), "Should include raw data section");
    ok(content.includes("```json"), "Should include JSON code block");
  });

  test("should generate group content with schema templates", async () => {
    const uri = createGroupUri("test-analyzer");
    const content = await provider.provideTextDocumentContent(uri);
    
    // Should use groupName and icon from schema
    ok(content.includes("🧪"), "Should include icon from schema");
    ok(content.includes("Test Results"), "Should include groupName from schema");
    
    // Should show total entries
    ok(content.includes("Total Entries"), "Should show total entries count");
    ok(content.includes("2"), "Should show correct count");
    
    // Should list entries with templates
    ok(content.includes("🧪"), "Should use entryTemplate for entries");
    ok(content.includes("View Full Entry"), "Should include link to full entry");
  });

  test("should handle entries without schema gracefully", async () => {
    // Mock an entry with no schema
    const mockDataServiceNoSchema = {
      getAssessmentData: async () => [{
        id: 3,
        tool_name: "unknown-tool",
        timestamp: "2024-01-01T00:00:00Z",
        data: { test: "value" },
        project_id: 1,
        data_type: "test"
      }]
    } as unknown as DataService;

    const mockSchemaServiceNoSchema = {
      getToolSchema: () => null,
      extractValue: () => null,
      formatValue: (v: any) => String(v)
    } as unknown as SchemaService;

    const mockVSCodeProviderNoSchema = {
      createDataDetails: async () => []
    } as unknown as VSCodeDataProvider;

    const providerNoSchema = new AssessmentDataContentProvider();
    providerNoSchema.setCoreServices({
      dataService: mockDataServiceNoSchema,
      schemaService: mockSchemaServiceNoSchema,
      vscodeProvider: mockVSCodeProviderNoSchema
    });

    const uri = createEntryUri(3);
    const content = await providerNoSchema.provideTextDocumentContent(uri);
    
    // Should fallback to generic format
    ok(content.includes("unknown-tool"), "Should include tool name");
    ok(content.includes("Entry ID"), "Should include entry ID");
  });

  test("should handle empty group gracefully", async () => {
    const mockDataServiceEmpty = {
      getAssessmentData: async () => []
    } as unknown as DataService;

    const providerEmpty = new AssessmentDataContentProvider();
    providerEmpty.setCoreServices({
      ...mockCoreServices,
      dataService: mockDataServiceEmpty
    });

    const uri = createGroupUri("test-analyzer");
    const content = await providerEmpty.provideTextDocumentContent(uri);
    
    ok(content.includes("No entries found"), "Should show no entries message");
  });
});

