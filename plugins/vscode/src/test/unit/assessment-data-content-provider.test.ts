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
              descriptionTemplate: "{date}",
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
      },
      calculateBadgeColor: (entry: any, toolName: string, allEntries: any[]) => {
        return "none" as const;
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
    // VSCode URIs with authority format: carbonara-data://entry/123
    // authority = "entry", path = "/123"
    strictEqual(uri.authority, "entry");
    strictEqual(uri.path, "/123");
    strictEqual(uri.toString(), "carbonara-data://entry/123");
  });

  test("should create group URI correctly", () => {
    const uri = createGroupUri("test-analyzer");
    strictEqual(uri.scheme, "carbonara-data");
    // VSCode URIs with authority format: carbonara-data://group/test-analyzer
    // authority = "group", path = "/test-analyzer"
    strictEqual(uri.authority, "group");
    strictEqual(uri.path, "/test-analyzer");
    strictEqual(uri.toString(), "carbonara-data://group/test-analyzer");
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
    
    // Should include details (emoji removed from labels in table)
    ok(content.includes("URL"), "Should include URL field label");
    ok(content.includes("Result"), "Should include result field label");
    ok(content.includes("https://example.com"), "Should include URL value");
    ok(content.includes("success"), "Should include result value");
    
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
    
    // Should display entries in table format
    ok(content.includes("|"), "Should include table structure");
    ok(content.includes("---"), "Should include table separator");
    // Should include table headers (normalized field names)
    ok(content.includes("URL") || content.includes("url"), "Should include URL column header");
    ok(content.includes("Result") || content.includes("result"), "Should include Result column header");
    // Should include data values
    ok(content.includes("https://example.com") || content.includes("https://example2.com"), "Should include URL values in table");
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
      createDataDetails: async () => [],
      calculateBadgeColor: (entry: any, toolName: string, allEntries: any[]) => {
        return "none" as const;
      }
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

  test("should replace {totalKB} in carbonara-swd entry content", async () => {
    const mockDataServiceSWD = {
      getAssessmentData: async () => [{
        id: 10,
        tool_name: "carbonara-swd",
        timestamp: "2024-01-01T00:00:00Z",
        data: {
          url: "https://example.com",
          totalBytes: 270 * 1024, // 270 KB
          carbonEmissions: { total: 0.028 },
          energyUsage: { total: 0.000075 },
          metadata: {
            loadTime: 42436,
            resourceCount: 23
          }
        },
        project_id: 1,
        data_type: "web-analysis"
      }]
    } as unknown as DataService;

    const mockSchemaServiceSWD = {
      getToolSchema: (toolId: string) => {
        if (toolId === "carbonara-swd") {
          return {
            id: "carbonara-swd",
            name: "Carbonara SWD",
            display: {
              category: "Website Analysis",
              icon: "",
              groupName: "SWD Analysis",
              entryTemplate: "{url}",
              descriptionTemplate: "{date}: {totalKB} KB",
              fields: [
                { key: "url", label: "URL", path: "data.url", type: "url" as const },
                { key: "totalBytes", label: "Data Transfer", path: "data.totalBytes", type: "bytes" as const }
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
      formatValue: (value: any, type: string, format?: string) => String(value)
    } as unknown as SchemaService;

    const mockVSCodeProviderSWD = {
      createDataDetails: async () => [],
      calculateBadgeColor: (entry: any, toolName: string, allEntries: any[]) => {
        return "none" as const;
      }
    } as unknown as VSCodeDataProvider;

    const providerSWD = new AssessmentDataContentProvider();
    providerSWD.setCoreServices({
      dataService: mockDataServiceSWD,
      schemaService: mockSchemaServiceSWD,
      vscodeProvider: mockVSCodeProviderSWD
    });

    const uri = createEntryUri(10);
    const content = await providerSWD.provideTextDocumentContent(uri);
    
    // Should replace {totalKB} with computed value
    ok(content.includes("270 KB"), "Should include computed totalKB value");
    ok(!content.includes("{totalKB}"), "Should not contain unreplaced placeholder");
    ok(content.includes("https://example.com"), "Should include URL from entryTemplate");
  });

  test("should replace {count} in deployment-scan entry content", async () => {
    const deployments = [
      { provider: "AWS", environment: "production", region: "us-east-1", country: "US" },
      { provider: "GCP", environment: "staging", region: "europe-west1", country: "NL" }
    ];

    const mockDataServiceDeploy = {
      getAssessmentData: async () => [{
        id: 20,
        tool_name: "deployment-scan",
        timestamp: "2024-01-01T00:00:00Z",
        data: {
          deployments,
          total_count: deployments.length
        },
        project_id: 1,
        data_type: "infrastructure-analysis"
      }]
    } as unknown as DataService;

    const mockSchemaServiceDeploy = {
      getToolSchema: (toolId: string) => {
        if (toolId === "deployment-scan") {
          return {
            id: "deployment-scan",
            name: "Deployment Scanner",
            display: {
              category: "Infrastructure",
              icon: "",
              groupName: "Deployment Analysis",
              entryTemplate: "Deployment Scan",
              descriptionTemplate: "{date}: {count} deployments",
              fields: [
                { key: "provider", label: "Provider", path: "data.deployments[*].provider", type: "string" as const }
              ]
            }
          };
        }
        return null;
      },
      extractValue: (entry: any, path: string) => {
        if (path === "data.deployments") {
          return entry.data?.deployments || null;
        }
        if (path === "data.total_count") {
          return entry.data?.total_count || null;
        }
        return null;
      },
      formatValue: (value: any, type: string, format?: string) => String(value)
    } as unknown as SchemaService;

    const mockVSCodeProviderDeploy = {
      createDataDetails: async () => [],
      calculateBadgeColor: (entry: any, toolName: string, allEntries: any[]) => {
        return "none" as const;
      }
    } as unknown as VSCodeDataProvider;

    const providerDeploy = new AssessmentDataContentProvider();
    providerDeploy.setCoreServices({
      dataService: mockDataServiceDeploy,
      schemaService: mockSchemaServiceDeploy,
      vscodeProvider: mockVSCodeProviderDeploy
    });

    const uri = createEntryUri(20);
    const content = await providerDeploy.provideTextDocumentContent(uri);
    
    // Should replace {count} with computed value from deployments array length
    ok(content.includes("2 deployments"), "Should include computed count value");
    ok(!content.includes("{count}"), "Should not contain unreplaced placeholder");
    ok(content.includes("Deployment Scan"), "Should include label from entryTemplate");
  });

  test("should use total_count fallback for {count} when deployments array is missing", async () => {
    const mockDataServiceDeployFallback = {
      getAssessmentData: async () => [{
        id: 21,
        tool_name: "deployment-scan",
        timestamp: "2024-01-01T00:00:00Z",
        data: {
          total_count: 5
          // No deployments array
        },
        project_id: 1,
        data_type: "infrastructure-analysis"
      }]
    } as unknown as DataService;

    const mockSchemaServiceDeployFallback = {
      getToolSchema: (toolId: string) => {
        if (toolId === "deployment-scan") {
          return {
            id: "deployment-scan",
            name: "Deployment Scanner",
            display: {
              category: "Infrastructure",
              icon: "",
              groupName: "Deployment Analysis",
              entryTemplate: "Deployment Scan",
              descriptionTemplate: "{date}: {count} deployments",
              fields: []
            }
          };
        }
        return null;
      },
      extractValue: (entry: any, path: string) => {
        if (path === "data.deployments") {
          return null; // Missing deployments array
        }
        if (path === "data.total_count") {
          return entry.data?.total_count || null;
        }
        return null;
      },
      formatValue: (value: any, type: string, format?: string) => String(value)
    } as unknown as SchemaService;

    const mockVSCodeProviderDeployFallback = {
      createDataDetails: async () => [],
      calculateBadgeColor: (entry: any, toolName: string, allEntries: any[]) => {
        return "none" as const;
      }
    } as unknown as VSCodeDataProvider;

    const providerDeployFallback = new AssessmentDataContentProvider();
    providerDeployFallback.setCoreServices({
      dataService: mockDataServiceDeployFallback,
      schemaService: mockSchemaServiceDeployFallback,
      vscodeProvider: mockVSCodeProviderDeployFallback
    });

    const uri = createEntryUri(21);
    const content = await providerDeployFallback.provideTextDocumentContent(uri);
    
    // Should use total_count as fallback
    ok(content.includes("5 deployments"), "Should use total_count fallback");
    ok(!content.includes("{count}"), "Should not contain unreplaced placeholder");
  });
});

