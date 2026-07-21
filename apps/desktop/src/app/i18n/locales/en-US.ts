export default {
  welcome: {
    title: "Let's get things done",
    openFolder: "Open folder",
    settings: "Settings",
    language: "Language",
    languageChinese: "简体中文",
    languageEnglish: "English",
    appearance: "Appearance",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
  },
  sessions: {
    searchTitle: "Search sessions",
    searchDescription:
      "Search titles and conversation content in this workspace",
    searchPlaceholder: "Search session content",
    searchAction: "Search sessions",
    searching: "Searching",
    newSession: "New session",
    current: "Current",
    noSessions: "No sessions yet",
    noResults: "No matching sessions",
  },
  workspace: {
    preferences: "Preferences",
    contentTabs: {
      newSession: "New session",
      sessionNumber: "Session {number}",
      addTab: "Add session tab",
      closeTab: "Close {name}",
    },
    composer: {
      label: "Session message",
      placeholder: "Describe a task or ask a question…",
      addContext: "Add context",
      send: "Send message",
      model: "Model",
      reasoningEffort: "Reasoning effort",
      models: {
        lightweight: "Fast and nimble for simple, everyday tasks",
        balanced: "A capable balance of speed and depth for most tasks",
        advanced: "Deeper analysis for complex and demanding tasks",
      },
      approval: {
        askForPermissionLabel: "Ask for Permission",
        askForPermission: "Confirm every tool call before it runs",
        agentDecidesLabel: "Agent Decides",
        agentDecides: "Let the agent decide which actions need confirmation",
        yoloLabel: "YOLO",
        yolo: "Run autonomously and notify only when something fails",
      },
    },
    tabs: {
      files: "Files",
      sessions: "Sessions",
    },
    files: {
      loading: "Loading",
      emptyTitle: "This folder is empty",
      emptyDescription: "There are no files in this workspace yet",
    },
  },
  errors: {
    workspaceOpen: {
      title: "Unable to open folder",
      description: "Check that the folder is accessible and try again",
    },
    sessionSearch: {
      title: "Unable to search sessions",
      description: "Try again in a moment",
    },
    sessionResume: {
      title: "Unable to open session",
      description: "The session may have been moved or deleted",
    },
    workspaceFiles: {
      title: "Unable to read files",
      description: "Check that the workspace is accessible and try again",
    },
  },
} as const;
