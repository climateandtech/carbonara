/**
 * Centralized UI text and selectors for Carbonara VSCode extension
 * This ensures consistency between extension code and tests
 */

export const UI_TEXT = {
  // Status bar
  STATUS_BAR: {
    TEXT: "$(pulse) Carbonara",
    TOOLTIP: "Carbonara CO2 Assessment Tools",
    ARIA_LABEL: "carbonara-statusbar",
  },

  // Quick pick menu
  MENU: {
    PLACEHOLDER: "Select a Carbonara action",
    ITEMS: {
      OPEN_PROJECT: {
        LABEL: "$(folder-opened) Open Carbonara Project",
        DESCRIPTION: "Browse and open a Carbonara project",
        SEARCH_TEXT: "Open Carbonara Project",
      },
      INITIALIZE_PROJECT: {
        LABEL: "$(rocket) Initialize Project",
        DESCRIPTION: "Set up Carbonara in this workspace",
        SEARCH_TEXT: "Initialize Project",
      },
      RUN_ASSESSMENT: {
        LABEL: "$(checklist) Run CO2 Assessment",
        DESCRIPTION: "Complete sustainability questionnaire",
        SEARCH_TEXT: "Run CO2 Assessment",
      },

      ANALYZE_WEBSITE: {
        LABEL: "$(globe) Analyze Website",
        DESCRIPTION: "Run website analysis (demo mode)",
        SEARCH_TEXT: "Analyze Website",
      },

      VIEW_DATA: {
        LABEL: "$(database) View Data",
        DESCRIPTION: "Browse collected assessment data",
        SEARCH_TEXT: "View Data",
      },

      OPEN_CONFIG: {
        LABEL: "$(gear) Open Configuration",
        DESCRIPTION: "Edit Carbonara settings",
        SEARCH_TEXT: "Open Configuration",
      },
      SHOW_STATUS: {
        LABEL: "$(info) Show Status",
        DESCRIPTION: "Display project status",
        SEARCH_TEXT: "Show Status",
      },
      REFRESH_HIGHLIGHTS: {
        LABEL: "$(info) Refresh Code Highlights",
        DESCRIPTION: "Refresh Code Highlights",
        SEARCH_TEXT: "Refresh Code Highlights",
      },
    },
  },

  // Project initialization
  PROJECT_INIT: {
    NAME_PROMPT: "Enter project name",
    TYPE_PLACEHOLDER: "Select project type",
    SUCCESS_MESSAGE: "Carbonara project initialized successfully!",
    PROJECT_TYPES: {
      WEB_APP: "Web Application",
      MOBILE_APP: "Mobile Application",
      DESKTOP_APP: "Desktop Application",
    },
  },

  // Project opening options
  PROJECT_OPEN: {
    PLACEHOLDER: "How would you like to set up Carbonara?",
    OPTIONS: {
      INITIALIZE: {
        LABEL: "🚀 Initialize Carbonara in current workspace",
        DESCRIPTION: "Set up Carbonara in the current workspace",
        SEARCH_TEXT: "Initialize Carbonara in current workspace",
      },
      SEARCH: {
        LABEL: "🔍 Search current workspace for projects",
        DESCRIPTION: "Find existing Carbonara projects in subdirectories",
        SEARCH_TEXT: "Search current workspace for projects",
      },
      BROWSE: {
        LABEL: "📁 Browse for existing config (new window)",
        DESCRIPTION: "Select a carbonara.config.json file to open its project",
        SEARCH_TEXT: "Browse for existing config",
      },
    },
  },

  // Data tree messages
  DATA_TREE: {
    LOADING: "🔄 Loading analysis data...",
    LOADING_DESCRIPTION: "Please wait while we load your data",
    NO_DATA: "No data available",
    NO_DATA_DESCRIPTION: "",
    ERROR_LOADING: "❌ Error loading data",
    ERROR_LOADING_DESCRIPTION: "Unknown error",
    DATABASE_NOT_FOUND: "❌ Database not found",
  },

  // Website analysis
  WEBSITE_ANALYSIS: {
    URL_PROMPT: "Enter website URL to analyze (demo mode)",
    URL_PLACEHOLDER: "https://example.com",
  },

  // Notifications
  NOTIFICATIONS: {
    NO_PROJECT:
      "No Carbonara project detected. Initialize one from the status bar or sidebar.",
    PROJECT_INITIALIZED: "Carbonara project initialized successfully!",
  },
} as const;

// CSS Selectors for tests
export const SELECTORS = {
  STATUS_BAR: {
    ITEM: `a[role="button"][aria-label="${UI_TEXT.STATUS_BAR.ARIA_LABEL}"]`,
    BUTTON: `a[role="button"][aria-label="${UI_TEXT.STATUS_BAR.ARIA_LABEL}"]`,
    CONTAINER: `[id="carbonara.carbonara-vscode"]`,
  },

  QUICK_PICK: {
    WIDGET: ".quick-input-widget",
    INPUT: ".quick-input-box input",
    LIST: ".quick-input-list",
    LIST_ROW: ".quick-input-list .monaco-list-row",
  },

  PROJECT_INIT: {
    // VSCode input boxes have different selectors than regular HTML inputs
    NAME_INPUT: ".quick-input-widget .quick-input-box input",
    TYPE_INPUT: `input[placeholder="${UI_TEXT.PROJECT_INIT.TYPE_PLACEHOLDER}"]`,
  },

  INPUT_BOX: {
    // VSCode showInputBox selectors
    WIDGET: ".quick-input-widget",
    INPUT: ".quick-input-widget .quick-input-box input",
    TITLE: ".quick-input-widget .quick-input-title",
  },

  NOTIFICATIONS: {
    // VSCode notification selectors
    CENTER: ".notifications-center",
    TOAST: ".notification-toast",
    TOAST_WITH_TEXT: (text: string) =>
      `.notifications-center .notification-toast:has-text("${text}")`,
  },
} as const;
