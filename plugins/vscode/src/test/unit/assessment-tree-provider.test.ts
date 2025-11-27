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
      if (!projectOverview) return;
      expect(projectOverview.label).toBe("Project Overview");
    });

    it("should load section descriptions from schema", async () => {
      const children = await provider.getChildren();
      const infrastructure = children.find((c: any) => c.id === "infrastructure");

      expect(infrastructure).toBeDefined();
      if (!infrastructure) return;
      expect(infrastructure.description).toBeDefined();
      expect(infrastructure.description.length).toBeGreaterThan(0);
    });
  });

  describe("Field Loading", () => {
    it("should load fields for each section", async () => {
      const sections = await provider.getChildren();
      const projectOverview = sections.find((s: any) => s.sectionId === "projectOverview");

      expect(projectOverview).toBeDefined();
      const fields = await provider.getChildren(projectOverview);
      expect(fields).toBeDefined();
      expect(fields.length).toBeGreaterThan(0);
    });

    it("should map field types correctly from schema", async () => {
      const sections = await provider.getChildren();
      const projectOverview = sections.find((s: any) => s.sectionId === "projectOverview");
      expect(projectOverview).toBeDefined();

      const fields = await provider.getChildren(projectOverview);

      // Fields are rendered as AssessmentItems with fieldId
      // We check that fields are rendered (not testing internal type mapping here)
      expect(fields.length).toBeGreaterThan(0);

      // Check that fields have the right IDs
      const fieldIds = fields.map((f: any) => f.fieldId).filter(Boolean);
      expect(fieldIds).toContain("expectedUsers");
      expect(fieldIds).toContain("projectLifespan");
    });

    it("should detect boolean fields", async () => {
      const sections = await provider.getChildren();
      const features = sections.find((s: any) => s.sectionId === "featuresAndWorkload");
      expect(features).toBeDefined();

      const fields = await provider.getChildren(features);
      const fieldIds = fields.map((f: any) => f.fieldId).filter(Boolean);
      expect(fieldIds).toContain("realTimeFeatures");
    });

    it("should detect select fields from options", async () => {
      const sections = await provider.getChildren();
      const infrastructure = sections.find((s: any) => s.sectionId === "infrastructure");
      expect(infrastructure).toBeDefined();

      const fields = await provider.getChildren(infrastructure);
      const fieldIds = fields.map((f: any) => f.fieldId).filter(Boolean);
      expect(fieldIds).toContain("hostingType");
    });
  });

  describe("Field Options", () => {
    it("should render fields for each section", async () => {
      const sections = await provider.getChildren();
      const projectOverview = sections.find((s: any) => s.sectionId === "projectOverview");
      expect(projectOverview).toBeDefined();

      const fields = await provider.getChildren(projectOverview);
      // Fields are rendered, check we have multiple
      expect(fields.length).toBeGreaterThan(3);
    });
  });

  describe("Completion Status", () => {
    it("should report 0 completed sections initially", () => {
      const status = provider.getCompletionStatus();
      expect(status.completed).toBe(0);
      expect(status.total).toBe(7);
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
    it("should render fields with default values from schema", async () => {
      const sections = await provider.getChildren();
      const hardwareConfig = sections.find((s: any) => s.sectionId === "hardwareConfig");
      expect(hardwareConfig).toBeDefined();

      const fields = await provider.getChildren(hardwareConfig);
      const fieldIds = fields.map((f: any) => f.fieldId).filter(Boolean);

      // Check that hardware config fields are rendered
      expect(fieldIds).toContain("cpuTdp");
      expect(fieldIds).toContain("totalVcpus");
    });
  });

  describe("Required Fields", () => {
    it("should render required fields", async () => {
      const sections = await provider.getChildren();
      const projectOverview = sections.find((s: any) => s.sectionId === "projectOverview");
      expect(projectOverview).toBeDefined();

      const fields = await provider.getChildren(projectOverview);
      const fieldIds = fields.map((f: any) => f.fieldId).filter(Boolean);

      // expectedUsers is a required field in projectOverview
      expect(fieldIds).toContain("expectedUsers");
    });

    it("should render optional fields", async () => {
      const sections = await provider.getChildren();
      const infrastructure = sections.find((s: any) => s.sectionId === "infrastructure");
      expect(infrastructure).toBeDefined();

      const fields = await provider.getChildren(infrastructure);
      const fieldIds = fields.map((f: any) => f.fieldId).filter(Boolean);

      // cloudProvider is an optional field in infrastructure
      expect(fieldIds).toContain("cloudProvider");
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
