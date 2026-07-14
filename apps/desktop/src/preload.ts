// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";
import {
  OPEN_WORKSPACE_CHANNEL,
  type OpenWorkspaceResult,
  type PineDesktopApi,
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
  LIST_WORKSPACE_DIRECTORY_CHANNEL,
  type ListWorkspaceDirectoryRequest,
  type ListWorkspaceDirectoryResult,
} from "./shared/workspaceFiles";

const pineApi: PineDesktopApi = {
  listWorkspaceDirectory: (
    request: ListWorkspaceDirectoryRequest,
  ): Promise<ListWorkspaceDirectoryResult> =>
    ipcRenderer.invoke(LIST_WORKSPACE_DIRECTORY_CHANNEL, request),
  openWorkspace: (): Promise<OpenWorkspaceResult> =>
    ipcRenderer.invoke(OPEN_WORKSPACE_CHANNEL),
  resumeSession: (
    request: ResumeSessionRequest,
  ): Promise<ResumeSessionResult> =>
    ipcRenderer.invoke(RESUME_SESSION_CHANNEL, request),
  searchSessions: (
    request: SearchSessionsRequest,
  ): Promise<SearchSessionsResult> =>
    ipcRenderer.invoke(SEARCH_SESSIONS_CHANNEL, request),
};

contextBridge.exposeInMainWorld("pine", pineApi);

declare global {
  interface Window {
    pine: PineDesktopApi;
  }
}
