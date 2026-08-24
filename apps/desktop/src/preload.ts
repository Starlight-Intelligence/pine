// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";
import {
  CREATE_PROJECT_CHANNEL,
  CLOSE_PROJECT_CHANNEL,
  DELETE_PROJECT_CHANNEL,
  LIST_PROJECTS_CHANNEL,
  OPEN_PROJECT_CHANNEL,
  PICK_PROJECT_FOLDERS_CHANNEL,
  UPDATE_PROJECT_CHANNEL,
  type CreateProjectRequest,
  type DeleteProjectResult,
  type ListProjectsResult,
  type PineDesktopApi,
  type PickProjectFoldersRequest,
  type PickProjectFoldersResult,
  type ProjectIdRequest,
  type ProjectResult,
  type UpdateProjectRequest,
} from "./shared/projects";
import {
  RESUME_SESSION_CHANNEL,
  SEARCH_SESSIONS_CHANNEL,
  type ResumeSessionRequest,
  type ResumeSessionResult,
  type SearchSessionsRequest,
  type SearchSessionsResult,
} from "./shared/sessions";
import {
  LIST_PROJECT_DIRECTORY_CHANNEL,
  type ListProjectDirectoryRequest,
  type ListProjectDirectoryResult,
} from "./shared/projectFiles";

const pineApi: PineDesktopApi = {
  closeProject: (): Promise<void> => ipcRenderer.invoke(CLOSE_PROJECT_CHANNEL),
  createProject: (request: CreateProjectRequest): Promise<ProjectResult> =>
    ipcRenderer.invoke(CREATE_PROJECT_CHANNEL, request),
  deleteProject: (request: ProjectIdRequest): Promise<DeleteProjectResult> =>
    ipcRenderer.invoke(DELETE_PROJECT_CHANNEL, request),
  listProjectDirectory: (
    request: ListProjectDirectoryRequest,
  ): Promise<ListProjectDirectoryResult> =>
    ipcRenderer.invoke(LIST_PROJECT_DIRECTORY_CHANNEL, request),
  listProjects: (): Promise<ListProjectsResult> =>
    ipcRenderer.invoke(LIST_PROJECTS_CHANNEL),
  openProject: (request: ProjectIdRequest): Promise<ProjectResult> =>
    ipcRenderer.invoke(OPEN_PROJECT_CHANNEL, request),
  pickProjectFolders: (
    request: PickProjectFoldersRequest,
  ): Promise<PickProjectFoldersResult> =>
    ipcRenderer.invoke(PICK_PROJECT_FOLDERS_CHANNEL, request),
  resumeSession: (
    request: ResumeSessionRequest,
  ): Promise<ResumeSessionResult> =>
    ipcRenderer.invoke(RESUME_SESSION_CHANNEL, request),
  searchSessions: (
    request: SearchSessionsRequest,
  ): Promise<SearchSessionsResult> =>
    ipcRenderer.invoke(SEARCH_SESSIONS_CHANNEL, request),
  updateProject: (request: UpdateProjectRequest): Promise<ProjectResult> =>
    ipcRenderer.invoke(UPDATE_PROJECT_CHANNEL, request),
};

contextBridge.exposeInMainWorld("pine", pineApi);

declare global {
  interface Window {
    pine: PineDesktopApi;
  }
}
