import type {
  ListProjectDirectoryRequest,
  ListProjectDirectoryResult,
} from "./projectFiles";
import type {
  ResumeSessionRequest,
  ResumeSessionResult,
  SearchSessionsRequest,
  SearchSessionsResult,
} from "./sessions";

export const PROJECTS_DIRECTORY = "projects" as const;
export const PROJECT_METADATA_FILE = "project.json" as const;
export const PROJECT_SESSIONS_DIRECTORY = "sessions" as const;
export const PROJECT_CACHE_DIRECTORY = "cache" as const;

export const LIST_PROJECTS_CHANNEL = "project:list" as const;
export const CREATE_PROJECT_CHANNEL = "project:create" as const;
export const CLOSE_PROJECT_CHANNEL = "project:close" as const;
export const OPEN_PROJECT_CHANNEL = "project:open" as const;
export const UPDATE_PROJECT_CHANNEL = "project:update" as const;
export const DELETE_PROJECT_CHANNEL = "project:delete" as const;
export const PICK_PROJECT_FOLDERS_CHANNEL = "project:pick-folders" as const;

export type ProjectFolderAccess = "read-only" | "read-write";

export interface ProjectFolderInput {
  access: ProjectFolderAccess;
  id: string;
  name: string;
  path: string;
}

export interface PineProjectFolder extends ProjectFolderInput {
  isAvailable: boolean;
}

export interface PineProject {
  createdAt: string;
  defaultFolderId: string;
  folders: PineProjectFolder[];
  id: string;
  lastOpenedAt?: string;
  name: string;
  schemaVersion: 1;
  updatedAt: string;
}

export interface ProjectMutationInput {
  defaultFolderId: string;
  folders: ProjectFolderInput[];
  name: string;
}

export type CreateProjectRequest = ProjectMutationInput;

export interface UpdateProjectRequest extends ProjectMutationInput {
  id: string;
}

export interface ProjectIdRequest {
  id: string;
}

export interface ListProjectsResult {
  projects: PineProject[];
}

export interface ProjectResult {
  project: PineProject;
}

export interface DeleteProjectResult {
  deleted: boolean;
}

export interface PickProjectFoldersResult {
  folders: ProjectFolderInput[];
}

export interface PickProjectFoldersRequest {
  mode: "context" | "default";
}

export interface PineDesktopApi {
  closeProject: () => Promise<void>;
  createProject: (request: CreateProjectRequest) => Promise<ProjectResult>;
  deleteProject: (request: ProjectIdRequest) => Promise<DeleteProjectResult>;
  listProjectDirectory: (
    request: ListProjectDirectoryRequest,
  ) => Promise<ListProjectDirectoryResult>;
  listProjects: () => Promise<ListProjectsResult>;
  openProject: (request: ProjectIdRequest) => Promise<ProjectResult>;
  pickProjectFolders: (
    request: PickProjectFoldersRequest,
  ) => Promise<PickProjectFoldersResult>;
  resumeSession: (
    request: ResumeSessionRequest,
  ) => Promise<ResumeSessionResult>;
  searchSessions: (
    request: SearchSessionsRequest,
  ) => Promise<SearchSessionsResult>;
  updateProject: (request: UpdateProjectRequest) => Promise<ProjectResult>;
}
