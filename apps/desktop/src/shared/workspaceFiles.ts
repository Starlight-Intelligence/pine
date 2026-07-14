export const LIST_WORKSPACE_DIRECTORY_CHANNEL =
  "workspace:list-directory" as const;

export type WorkspaceEntryKind = "directory" | "file";

export interface WorkspaceEntry {
  kind: WorkspaceEntryKind;
  name: string;
  relativePath: string;
}

export interface ListWorkspaceDirectoryRequest {
  relativePath: string;
}

export interface ListWorkspaceDirectoryResult {
  entries: WorkspaceEntry[];
}
