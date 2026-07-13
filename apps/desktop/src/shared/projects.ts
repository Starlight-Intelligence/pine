export const PINE_METADATA_DIRECTORY = ".pine" as const;
export const PINE_PROJECT_METADATA_FILE = "project.json" as const;
export const PINE_SESSIONS_DIRECTORY =
  `${PINE_METADATA_DIRECTORY}/sessions` as const;
export const PINE_SKILLS_DIRECTORY =
  `${PINE_METADATA_DIRECTORY}/skills` as const;
export const OPEN_WORKSPACE_CHANNEL = "workspace:open" as const;

export interface PineWorkspaceSummary {
  id: string;
  name: string;
  rootPath: string;
}

export interface OpenWorkspaceResult {
  workspace: PineWorkspaceSummary | null;
}

export interface PineDesktopApi {
  openWorkspace: () => Promise<OpenWorkspaceResult>;
}
