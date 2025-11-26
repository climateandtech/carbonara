import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { DataService } from "@carbonara/core";

// Load assessment schema from CLI schemas directory
const schemaPath = path.join(
  __dirname,
  "node_modules",
  "@carbonara",
  "cli",
  "dist",
  "schemas",
  "assessment-questionnaire.json"
);
let assessmentSchema: any;
try {
  assessmentSchema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
} catch (error) {
  console.error("Failed to load assessment schema:", error);
  assessmentSchema = { properties: {} };
}

export interface AssessmentSection {
  id: string;
  label: string;
  description: string;
  status: "pending" | "in-progress" | "completed";
  data?: any;
  fields: AssessmentField[];
}

export interface AssessmentField {
  id: string;
  label: string;
  type: "input" | "select" | "number" | "boolean";
  required: boolean;
  options?: { label: string; value: string; detail?: string }[];
  value?: any;
  defaultValue?: any;
}

export class AssessmentTreeProvider
  implements vscode.TreeDataProvider<AssessmentItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    AssessmentItem | undefined | null | void
  > = new vscode.EventEmitter<AssessmentItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    AssessmentItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private assessmentData: AssessmentSection[] = [];
  private workspaceFolder: vscode.WorkspaceFolder | undefined;

  constructor() {
    this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    this.initializeAssessmentData();
  }

  private getCurrentProjectPath(): string {
    // Find project root by searching for .carbonara/carbonara.config.json
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return process.cwd();
    }

    let currentDir = workspaceFolder.uri.fsPath;

    // Search up the directory tree for .carbonara/carbonara.config.json
    while (currentDir !== path.dirname(currentDir)) {
      const configPath = path.join(
        currentDir,
        ".carbonara",
        "carbonara.config.json"
      );
      if (fs.existsSync(configPath)) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }

    // Default to workspace root
    return workspaceFolder.uri.fsPath;
  }

  refresh(): void {
    this.loadAssessmentProgress();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AssessmentItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: AssessmentItem
  ): AssessmentItem[] | Promise<AssessmentItem[]> {
    if (!this.workspaceFolder) {
      // No workspace open - return empty
      return [];
    }

    // Check if Carbonara is initialized
    const configPath = path.join(
      this.workspaceFolder.uri.fsPath,
      ".carbonara",
      "carbonara.config.json"
    );

    if (!require("fs").existsSync(configPath)) {
      // Workspace exists but Carbonara is not initialized
      // Set context to hide buttons
      vscode.commands.executeCommand(
        "setContext",
        "carbonara.assessmentInitialized",
        false
      );
      // Show a single item with description styling
      const messageItem = new AssessmentItem(
        "",
        "Initialise Carbonara to access assessment questionnaire",
        vscode.TreeItemCollapsibleState.None,
        "info-message"
      );
      messageItem.iconPath = new vscode.ThemeIcon("info");
      return [messageItem];
    }

    // Set context to show buttons
    vscode.commands.executeCommand(
      "setContext",
      "carbonara.assessmentInitialized",
      true
    );

    if (element) {
      // Return field items for a section with description as first item
      const section = this.assessmentData.find(
        (s) => s.id === element.sectionId
      );
      if (section) {
        const items: AssessmentItem[] = [
          // Add description as first item with muted appearance
          // Use minimal label and put text in description field for secondary styling
          new AssessmentItem(
            "", // Minimal label (two spaces for alignment)
            section.description, // Description appears in secondary color
            vscode.TreeItemCollapsibleState.None,
            "description",
            section.id
          ),
        ];

        // Add field items
        items.push(
          ...section.fields.map((field) => {
            let displayValue = "Not set";
            if (field.value !== undefined) {
              // For select fields, show the label instead of the value
              if (field.type === "select" && field.options) {
                const option = field.options.find(
                  (opt) => opt.value === field.value
                );
                displayValue = option ? option.label : `${field.value}`;
              } else {
                displayValue = `${field.value}`;
              }
            }

            return new AssessmentItem(
              field.label,
              displayValue,
              vscode.TreeItemCollapsibleState.None,
              "field",
              section.id,
              field.id
            );
          })
        );

        return Promise.resolve(items);
      }
    } else {
      // Return section items (without descriptions/subtitles)
      return Promise.resolve(
        this.assessmentData.map(
          (section) =>
            new AssessmentItem(
              section.label,
              "", // No subtitle for sections
              vscode.TreeItemCollapsibleState.Collapsed,
              "section",
              section.id
            )
        )
      );
    }

    return Promise.resolve([]);
  }

  private initializeAssessmentData(): void {
    // Load assessment structure from JSON schema
    const properties = (assessmentSchema as any).properties || {};

    this.assessmentData = Object.entries(properties).map(
      ([sectionId, sectionDef]: [string, any]) => {
        const fields: AssessmentField[] = [];
        const sectionProperties = sectionDef.properties || {};
        const requiredFields = sectionDef.required || [];

        for (const [fieldId, fieldDef] of Object.entries(sectionProperties)) {
          const field: any = fieldDef;

          fields.push({
            id: fieldId,
            label: field.title || fieldId,
            type: this.mapTypeToUIType(field.type, field.options),
            required: requiredFields.includes(fieldId),
            options: field.options || undefined,
            defaultValue: field.default,
          });
        }

        return {
          id: sectionId,
          label: sectionDef.title || sectionId,
          description: sectionDef.description || "",
          status: "pending" as const,
          fields,
        };
      }
    );

    this.loadAssessmentProgress();
  }

  private mapTypeToUIType(
    jsonSchemaType: string,
    options?: any[]
  ): "input" | "select" | "number" | "boolean" {
    // If field has options, it's a select
    if (options && options.length > 0) {
      return "select";
    }

    switch (jsonSchemaType) {
      case "boolean":
        return "boolean";
      case "integer":
      case "number":
        return "number";
      case "string":
        return "input";
      default:
        return "input";
    }
  }

  private loadAssessmentProgress(): void {
    if (!this.workspaceFolder) {
      return;
    }

    const projectPath = this.getCurrentProjectPath();
    const progressFile = path.join(
      projectPath,
      ".carbonara",
      ".carbonara-progress.json"
    );
    if (fs.existsSync(progressFile)) {
      try {
        const progress = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
        this.mergeProgress(progress);
      } catch (error) {
        console.error("Failed to load assessment progress:", error);
      }
    }
  }

  private mergeProgress(progress: any): void {
    for (const section of this.assessmentData) {
      if (progress[section.id]) {
        section.data = progress[section.id];
        section.status = "completed";

        // Update field values
        for (const field of section.fields) {
          if (progress[section.id][field.id] !== undefined) {
            field.value = progress[section.id][field.id];
          }
        }
      }
    }
  }

  public async editSection(
    sectionId: string,
    autoProgress: boolean = false
  ): Promise<boolean> {
    const section = this.assessmentData.find((s) => s.id === sectionId);
    if (!section) {
      return false;
    }

    section.status = "in-progress";
    this.refresh();

    const sectionData: any = {};

    for (const field of section.fields) {
      let value = await this.editField(field);
      if (value !== undefined) {
        sectionData[field.id] = value;
        field.value = value;
      } else if (field.required) {
        // User cancelled, revert status
        section.status = section.data ? "completed" : "pending";
        this.refresh();
        return false;
      }
    }

    section.data = sectionData;
    section.status = "completed";

    await this.saveProgress();
    this.refresh();

    if (autoProgress) {
      // In auto-progress mode, just show a brief success message
      vscode.window.showInformationMessage(`✅ ${section.label} completed!`);
      return true;
    } else {
      // Manual mode - check if there are more incomplete sections
      const nextIncompleteSection = this.assessmentData.find(
        (s) => s.status !== "completed"
      );

      if (nextIncompleteSection) {
        // Show success message and ask if user wants to continue
        const answer = await vscode.window.showInformationMessage(
          `✅ ${section.label} completed!`,
          "Continue to next section",
          "Finish later"
        );

        if (answer === "Continue to next section") {
          await this.editSection(nextIncompleteSection.id, false);
        }
      } else {
        // All sections completed, finalize the assessment
        vscode.window.showInformationMessage(
          `🎉 All sections completed! Finalizing assessment...`
        );
        await this.finalizeAssessment();
      }
      return true;
    }
  }

  private async finalizeAssessment(): Promise<void> {
    // Compile all data
    const assessmentData: any = {
      projectOverview:
        this.assessmentData.find((s) => s.id === "project-info")?.data || {},
      infrastructure:
        this.assessmentData.find((s) => s.id === "infrastructure")?.data || {},
      development:
        this.assessmentData.find((s) => s.id === "development")?.data || {},
      features:
        this.assessmentData.find((s) => s.id === "features")?.data || {},
      sustainabilityGoals:
        this.assessmentData.find((s) => s.id === "sustainability")?.data || {},
    };

    // Save assessment data file (for reference)
    const projectPath = this.getCurrentProjectPath();
    const carbonaraDir = path.join(projectPath, ".carbonara");

    // Ensure .carbonara directory exists
    if (!fs.existsSync(carbonaraDir)) {
      fs.mkdirSync(carbonaraDir, { recursive: true });
    }

    const assessmentFile = path.join(carbonaraDir, "carbonara-assessment.json");
    fs.writeFileSync(assessmentFile, JSON.stringify(assessmentData, null, 2));

    // Store assessment data using core DataService
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Saving assessment questionnaire...",
          cancellable: false,
        },
        async () => {
          const dataService = new DataService({
            dbPath: path.join(projectPath, ".carbonara", "carbonara.db"),
          });

          await dataService.initialize();

          // Get or create project
          let project = await dataService.getProject(projectPath);
          if (!project) {
            const configPath = path.join(
              projectPath,
              ".carbonara",
              "carbonara.config.json"
            );
            let projectName = "Carbonara Project";
            if (fs.existsSync(configPath)) {
              try {
                const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
                projectName = config.name || projectName;
              } catch {}
            }
            const projectId = await dataService.createProject(
              projectName,
              projectPath,
              {}
            );
            project = await dataService.getProject(projectPath);
          }

          if (project) {
            // Store assessment data
            await dataService.storeAssessmentData(
              project.id,
              "assessment-questionnaire",
              "assessment",
              assessmentData,
              "vscode-extension"
            );

            // Update project CO2 variables
            await dataService.updateProjectCO2Variables(
              project.id,
              assessmentData
            );
          }

          await dataService.close();
        }
      );

      // Show success message that auto-dismisses after 5 seconds
      vscode.window.setStatusBarMessage(
        "$(check) assessment questionnaire completed and saved successfully!",
        5000
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Assessment error: ${errorMessage}`);
      throw error;
    }
  }

  private async editField(field: AssessmentField): Promise<any> {
    switch (field.type) {
      case "input":
        return await vscode.window.showInputBox({
          prompt: field.label,
          value: field.value?.toString() || "",
          validateInput: field.required
            ? (value) =>
                value.length > 0 ? undefined : "This field is required"
            : undefined,
        });

      case "number":
        const numberInput = await vscode.window.showInputBox({
          prompt: field.label,
          value: field.value?.toString() || "",
          validateInput: (value) => {
            if (field.required && !value) {
              return "This field is required";
            }
            if (value && isNaN(Number(value))) {
              return "Please enter a valid number";
            }
            return undefined;
          },
        });
        return numberInput ? Number(numberInput) : undefined;

      case "select":
        const selected = await vscode.window.showQuickPick(
          (field.options || []).map((opt) => ({
            label: opt.label,
            detail: opt.detail, // Show subtitle on a new line below the label
            value: opt.value,
          })),
          { placeHolder: field.label }
        );
        return selected?.value;

      case "boolean":
        const booleanResult = await vscode.window.showQuickPick(
          [
            { label: "Yes", value: true },
            { label: "No", value: false },
          ],
          { placeHolder: field.label }
        );
        return booleanResult?.value;

      default:
        return undefined;
    }
  }

  private async saveProgress(): Promise<void> {
    if (!this.workspaceFolder) {
      return;
    }

    const progress: any = {};
    for (const section of this.assessmentData) {
      if (section.data) {
        progress[section.id] = section.data;
      }
    }

    const projectPath = this.getCurrentProjectPath();
    const carbonaraDir = path.join(projectPath, ".carbonara");

    // Ensure .carbonara directory exists
    if (!fs.existsSync(carbonaraDir)) {
      fs.mkdirSync(carbonaraDir, { recursive: true });
    }

    const progressFile = path.join(carbonaraDir, ".carbonara-progress.json");
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
  }

  public async completeAssessment(): Promise<void> {
    // Check if all sections are already completed
    const incompleteSections = this.assessmentData.filter(
      (s) => s.status !== "completed"
    );

    if (incompleteSections.length === 0) {
      // All sections already completed, ask user if they want to retake
      const answer = await vscode.window.showInformationMessage(
        "Assessment already completed. Would you like to retake it?",
        "Retake",
        "Cancel"
      );

      if (answer !== "Retake") {
        return;
      }

      // Reset all sections to allow retaking - clear data and field values
      for (const section of this.assessmentData) {
        section.status = "pending";
        section.data = undefined; // Clear saved data
        // Clear field values
        for (const field of section.fields) {
          field.value = undefined;
        }
      }

      // Delete the progress file so it doesn't restore the old data
      const projectPath = this.getCurrentProjectPath();
      const progressFile = path.join(
        projectPath,
        ".carbonara",
        ".carbonara-progress.json"
      );
      if (fs.existsSync(progressFile)) {
        fs.unlinkSync(progressFile);
      }

      this.refresh();
    }

    // Get all sections (either incomplete or all if retaking)
    const sectionsToComplete = this.assessmentData.filter(
      (s) => s.status !== "completed"
    );

    // Queue all sections and go through them sequentially
    for (const section of sectionsToComplete) {
      const completed = await this.editSection(section.id, true);
      if (!completed) {
        // User cancelled, stop the flow
        vscode.window.showInformationMessage(
          "Assessment paused. You can continue later by clicking the play button."
        );
        return;
      }
    }

    // All sections completed, finalize
    vscode.window.showInformationMessage(
      `🎉 All sections completed! Finalizing assessment...`
    );
    await this.finalizeAssessment();
  }

  public getCompletionStatus(): { completed: number; total: number } {
    const completed = this.assessmentData.filter(
      (s) => s.status === "completed"
    ).length;
    const total = this.assessmentData.length;
    return { completed, total };
  }
}

export class AssessmentItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly sectionId?: string,
    public readonly fieldId?: string,
    command?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.description = description;
    this.contextValue = contextValue;

    // Set custom command if provided
    if (command) {
      this.command = command;
    }

    if (contextValue === "section") {
      // No icon for sections
      if (!command) {
        this.command = {
          command: "carbonara.editSection",
          title: "Edit Section",
          arguments: [sectionId],
        };
      }
    } else if (contextValue === "field") {
      // No icon for fields normally, but we could add indicators
    } else if (contextValue === "description") {
      // No icon for description lines
    } else if (contextValue === "init-action") {
      this.iconPath = new vscode.ThemeIcon("add");
    } else if (contextValue === "open-action") {
      this.iconPath = new vscode.ThemeIcon("folder-opened");
    } else if (contextValue === "no-project") {
      this.iconPath = new vscode.ThemeIcon("info");
    }
  }
}
