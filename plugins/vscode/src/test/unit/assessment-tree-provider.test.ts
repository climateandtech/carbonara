import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { AssessmentTreeProvider } from "../../assessment-tree-provider";

// Mock vscode
vi.mock("vscode", () => ({
  TreeItem: class TreeItem {
    constructor(
      public label: string,
      public collapsibleState?: number
    ) {}
    iconPath?: any;
    command?: any;
    contextValue?: string;
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  EventEmitter: class EventEmitter {
    fire = vi.fn();
    event = vi.fn();
  },
  ThemeIcon: class ThemeIcon {
    constructor(public id: string) {}
  },
  window: {
    showInputBox: vi.fn(),
    showQuickPick: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  workspace: {
    workspaceFolders: [],
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
  },
}));

describe("AssessmentTreeProvider", () => {
  let provider: AssessmentTreeProvider;
  let testWorkspaceFolder: vscode.WorkspaceFolder;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(process.cwd(), "test-assessment");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    testWorkspaceFolder = {
      uri: { fsPath: testDir } as vscode.Uri,
      name: "test-workspace",
      index: 0,
    };

    (vscode.workspace as any).workspaceFolders = [testWorkspaceFolder];
    provider = new AssessmentTreeProvider();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Schema Loading", () => {
    it("should load assessment sections from JSON schema", async () => {
      const children = await provider.getChildren();

      expect(children).toBeDefined();
      expect(children.length).toBeGreaterThan(0);
    });

    it("should have all required sections", async () => {
      const children = await provider.getChildren();
      const sectionIds = children.map((child: any) => child.id);

      expect(sectionIds).toContain("projectOverview");
      expect(sectionIds).toContain("infrastructure");
      expect(sectionIds).toContain("development");
      expect(sectionIds).toContain("featuresAndWorkload");
      expect(sectionIds).toContain("sustainabilityGoals");
      expect(sectionIds).toContain("hardwareConfig");
      expect(sectionIds).toContain("monitoringConfig");
    });

    it("should load section titles from schema", async () => {
      const children = await provider.getChildren();
      const projectOverview = children.find((c: any) => c.id === "projectOverview");

      expect(projectOverview).toBeDefined();
      expect(projectOverview.label).toBe("Project Overview");
    });

    it("should load section descriptions from schema", async () => {
      const children = await provider.getChildren();
      const infrastructure = children.find((c: any) => c.id === "infrastructure");

      expect(infrastructure).toBeDefined();
      expect(infrastructure.description).toBeDefined();
      expect(infrastructure.description.length).toBeGreaterThan(0);
    });
  });

  describe("Field Loading", () => {
    it("should load fields for each section", async () => {
      const sections = await provider.getChildren();
      const projectOverview = sections.find((s: any) => s.id === "projectOverview");

      const fields = await provider.getChildren(projectOverview);
      expect(fields).toBeDefined();
      expect(fields.length).toBeGreaterThan(0);
    });

    it("should map field types correctly from schema", async () => {
      const sections = await provider.getChildren();
      const projectOverview = sections.find((s: any) => s.id === "projectOverview");
      const fields = await provider.getChildren(projectOverview);

      // Should have select fields with options
      const expectedUsersField = fields.find((f: any) => f.id === "expectedUsers");
      expect(expectedUsersField).toBeDefined();
      expect(expectedUsersField.type).toBe("select");
      expect(expectedUsersField.options).toBeDefined();
      expect(expectedUsersField.options.length).toBeGreaterThan(0);

      // Should have number field
      const lifespanField = fields.find((f: any) => f.id === "projectLifespan");
      expect(lifespanField).toBeDefined();
      expect(lifespanField.type).toBe("number");
    });

    it("should detect boolean fields", async () => {
      const sections = await provider.getChildren();
      const features = sections.find((s: any) => s.id === "featuresAndWorkload");
      const fields = await provider.getChildren(features);

      const boolField = fields.find((f: any) => f.id === "realTimeFeatures");
      expect(boolField).toBeDefined();
      expect(boolField.type).toBe("boolean");
    });

    it("should detect select fields from options", async () => {
      const sections = await provider.getChildren();
      const infrastructure = sections.find((s: any) => s.id === "infrastructure");
      const fields = await provider.getChildren(infrastructure);

      const hostingField = fields.find((f: any) => f.id === "hostingType");
      expect(hostingField).toBeDefined();
      expect(hostingField.type).toBe("select");
      expect(hostingField.options).toBeDefined();
    });
  });

  describe("Field Options", () => {
    it("should load options with labels and values", async () => {
      const sections = await provider.getChildren();
      const projectOverview = sections.find((s: any) => s.id === "projectOverview");
      const fields = await provider.getChildren(projectOverview);
      const usersField = fields.find((f: any) => f.id === "expectedUsers");

      expect(usersField.options).toBeDefined();
      const firstOption = usersField.options[0];
      expect(firstOption.label).toBeDefined();
      expect(firstOption.value).toBeDefined();
      expect(typeof firstOption.label).toBe("string");
      expect(typeof firstOption.value).toBe("string");
    });

    it("should include detail field when present", async () => {
      const sections = await provider.getChildren();
      const projectOverview = sections.find((s: any) => s.id === "projectOverview");
      const fields = await provider.getChildren(projectOverview);
      const usersField = fields.find((f: any) => f.id === "expectedUsers");

      const optionWithDetail = usersField.options.find((opt: any) => opt.detail);
      expect(optionWithDetail).toBeDefined();
      expect(optionWithDetail.detail).toBeDefined();
    });
  });

  describe("Completion Status", () => {
    it("should report 0 completed sections initially", () => {
      const status = provider.getCompletionStatus();
      expect(status.completed).toBe(0);
      expect(status.total).toBe(7);
    });

    it("should track completion percentage", () => {
      const status = provider.getCompletionStatus();
      expect(status.percentage).toBe(0);
    });
  });

  describe("Progress Persistence", () => {
    it("should save progress to .carbonara directory", () => {
      const carbonaraDir = path.join(testDir, ".carbonara");
      const progressFile = path.join(carbonaraDir, "assessment-progress.json");

      // Trigger some action that saves progress
      provider.refresh();

      // Should create .carbonara directory
      expect(fs.existsSync(carbonaraDir)).toBe(true);
    });
  });

  describe("Section Status", () => {
    it("should mark sections as pending by default", async () => {
      const sections = await provider.getChildren();
      sections.forEach((section: any) => {
        expect(section.status).toBe("pending");
      });
    });
  });

  describe("Default Values", () => {
    it("should load default values from schema", async () => {
      const sections = await provider.getChildren();
      const hardwareConfig = sections.find((s: any) => s.id === "hardwareConfig");
      const fields = await provider.getChildren(hardwareConfig);

      const cpuTdpField = fields.find((f: any) => f.id === "cpuTdp");
      expect(cpuTdpField.defaultValue).toBe(100);

      const totalVcpusField = fields.find((f: any) => f.id === "totalVcpus");
      expect(totalVcpusField.defaultValue).toBe(8);
    });
  });

  describe("Required Fields", () => {
    it("should mark required fields correctly", async () => {
      const sections = await provider.getChildren();
      const projectOverview = sections.find((s: any) => s.id === "projectOverview");
      const fields = await provider.getChildren(projectOverview);

      const expectedUsersField = fields.find((f: any) => f.id === "expectedUsers");
      expect(expectedUsersField.required).toBe(true);
    });

    it("should mark optional fields correctly", async () => {
      const sections = await provider.getChildren();
      const infrastructure = sections.find((s: any) => s.id === "infrastructure");
      const fields = await provider.getChildren(infrastructure);

      const cloudProviderField = fields.find((f: any) => f.id === "cloudProvider");
      expect(cloudProviderField.required).toBe(false);
    });
  });

  describe("Tree Item Generation", () => {
    it("should create tree items for sections", async () => {
      const sections = await provider.getChildren();
      const treeItem = provider.getTreeItem(sections[0]);

      expect(treeItem).toBeDefined();
      expect(treeItem.label).toBeDefined();
      expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    });

    it("should include context value for commands", async () => {
      const sections = await provider.getChildren();
      const treeItem = provider.getTreeItem(sections[0]);

      expect(treeItem.contextValue).toBe("assessment-section");
    });
  });
});
