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

export const PROJECT_FILE_OPERATION_CHANNEL = "project-files:operate" as const;
export const PROJECT_FILE_ATTACHMENTS_CHANNEL =
  "project-files:attachments" as const;
export type ProjectEntryReference = ListProjectDirectoryRequest;

export type ProjectFileOperation =
  | {
      action: "create";
      target: ProjectEntryReference;
      name: string;
      kind: ProjectEntryKind;
    }
  | { action: "rename"; target: ProjectEntryReference; name: string }
  | {
      action: "trash" | "open" | "reveal" | "copy-path";
      target: ProjectEntryReference;
    }
  | {
      action: "move";
      target: ProjectEntryReference;
      sources: ProjectEntryReference[];
    }
  | { action: "move-external"; target: ProjectEntryReference; paths: string[] };
