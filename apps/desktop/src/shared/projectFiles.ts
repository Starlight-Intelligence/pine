export const LIST_PROJECT_DIRECTORY_CHANNEL =
  "project-files:list-directory" as const;

export type ProjectEntryKind = "directory" | "file";

export interface ProjectEntry {
  kind: ProjectEntryKind;
  name: string;
  relativePath: string;
}

export interface ListProjectDirectoryRequest {
  folderId: string;
  relativePath: string;
}

export interface ListProjectDirectoryResult {
  entries: ProjectEntry[];
}
