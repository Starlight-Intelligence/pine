// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer, webUtils } from "electron";
import {
  ABORT_SESSION_CHANNEL,
  APPROVAL_RESPONSE_CHANNEL,
  DEQUEUE_STEERING_CHANNEL,
  PROMPT_SESSION_CHANNEL,
  SET_APPROVAL_MODE_CHANNEL,
  SESSION_EVENT_CHANNEL,
  type AbortSessionResult,
  type DequeueSteeringRequest,
  type DequeueSteeringResult,
  type PineAgentEvent,
  type PromptSessionRequest,
  type PromptSessionResult,
  type RespondApprovalRequest,
  type SetApprovalModeRequest,
  type SetApprovalModeResult,
  type SessionEventListener,
} from "./shared/agent";
import {
  INSPECT_ATTACHMENTS_CHANNEL,
  OPEN_ATTACHMENT_CHANNEL,
  PICK_ATTACHMENT_FOLDERS_CHANNEL,
  PICK_ATTACHMENTS_CHANNEL,
  SAVE_PASTED_ATTACHMENT_CHANNEL,
  type InspectAttachmentsRequest,
  type OpenAttachmentRequest,
  type OpenAttachmentResult,
  type PickAttachmentsResult,
  type SavePastedAttachmentRequest,
  type SavePastedAttachmentResult,
} from "./shared/attachments";
import {
  CANCEL_PROVIDER_AUTH_CHANNEL,
  GET_MODEL_CATALOG_CHANNEL,
  LOGIN_PROVIDER_CHANNEL,
  LOGOUT_PROVIDER_CHANNEL,
  OPEN_PROVIDER_AUTH_URL_CHANNEL,
  PROVIDER_AUTH_EVENT_CHANNEL,
  RESPOND_PROVIDER_AUTH_CHANNEL,
  SELECT_MODEL_CHANNEL,
  type LoginProviderRequest,
  type LogoutProviderRequest,
  type PineModelCatalog,
  type PineProviderAuthEvent,
  type ProviderAuthEventListener,
  type ProviderAuthResponseRequest,
  type ProviderLoginResult,
  type SelectModelRequest,
} from "./shared/models";
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
  DELETE_SESSION_CHANNEL,
  LOAD_SESSION_MESSAGES_CHANNEL,
  RENAME_SESSION_CHANNEL,
  RESUME_SESSION_CHANNEL,
  SEARCH_SESSIONS_CHANNEL,
  type DeleteSessionRequest,
  type DeleteSessionResult,
  type LoadSessionMessagesRequest,
  type LoadSessionMessagesResult,
  type RenameSessionRequest,
  type RenameSessionResult,
  type ResumeSessionRequest,
  type ResumeSessionResult,
  type SearchSessionsRequest,
  type SearchSessionsResult,
} from "./shared/sessions";
import {
  PROJECT_FILE_OPERATION_CHANNEL,
  PROJECT_FILE_ATTACHMENTS_CHANNEL,
  LIST_PROJECT_DIRECTORY_CHANNEL,
  READ_PROJECT_FILE_PREVIEW_CHANNEL,
  type ListProjectDirectoryRequest,
  type ListProjectDirectoryResult,
} from "./shared/projectFiles";
import {
  SET_SIDEBAR_VIBRANCY_CHANNEL,
  CLOSE_TAB_REQUESTED_CHANNEL,
  NEW_TAB_REQUESTED_CHANNEL,
  CLOSE_WINDOW_CHANNEL,
  type SetSidebarVibrancyRequest,
  type SetSidebarVibrancyResult,
} from "./shared/window";

const pineApi: PineDesktopApi = {
  readProjectFilePreview: (request) =>
    ipcRenderer.invoke(READ_PROJECT_FILE_PREVIEW_CHANNEL, request),
  closeWindow: () => ipcRenderer.invoke(CLOSE_WINDOW_CHANNEL),
  onCloseTabRequested: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(CLOSE_TAB_REQUESTED_CHANNEL, handler);
    return () =>
      ipcRenderer.removeListener(CLOSE_TAB_REQUESTED_CHANNEL, handler);
  },
  onNewTabRequested: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(NEW_TAB_REQUESTED_CHANNEL, handler);
    return () => ipcRenderer.removeListener(NEW_TAB_REQUESTED_CHANNEL, handler);
  },
  platform: process.platform,
  setSidebarVibrancy: (
    request: SetSidebarVibrancyRequest,
  ): Promise<SetSidebarVibrancyResult> =>
    ipcRenderer.invoke(SET_SIDEBAR_VIBRANCY_CHANNEL, request),
  abortSession: (): Promise<AbortSessionResult> =>
    ipcRenderer.invoke(ABORT_SESSION_CHANNEL),
  dequeueSteering: (
    request: DequeueSteeringRequest,
  ): Promise<DequeueSteeringResult> =>
    ipcRenderer.invoke(DEQUEUE_STEERING_CHANNEL, request),
  closeProject: (): Promise<void> => ipcRenderer.invoke(CLOSE_PROJECT_CHANNEL),
  createProject: (request: CreateProjectRequest): Promise<ProjectResult> =>
    ipcRenderer.invoke(CREATE_PROJECT_CHANNEL, request),
  deleteProject: (request: ProjectIdRequest): Promise<DeleteProjectResult> =>
    ipcRenderer.invoke(DELETE_PROJECT_CHANNEL, request),
  deleteSession: (
    request: DeleteSessionRequest,
  ): Promise<DeleteSessionResult> =>
    ipcRenderer.invoke(DELETE_SESSION_CHANNEL, request),
  listProjectDirectory: (
    request: ListProjectDirectoryRequest,
  ): Promise<ListProjectDirectoryResult> =>
    ipcRenderer.invoke(LIST_PROJECT_DIRECTORY_CHANNEL, request),
  operateProjectFile: (request) =>
    ipcRenderer.invoke(PROJECT_FILE_OPERATION_CHANNEL, request),
  inspectProjectAttachments: (entries) =>
    ipcRenderer.invoke(PROJECT_FILE_ATTACHMENTS_CHANNEL, entries),
  listProjects: (): Promise<ListProjectsResult> =>
    ipcRenderer.invoke(LIST_PROJECTS_CHANNEL),
  getModelCatalog: (): Promise<PineModelCatalog> =>
    ipcRenderer.invoke(GET_MODEL_CATALOG_CHANNEL),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  inspectAttachments: (
    request: InspectAttachmentsRequest,
  ): Promise<PickAttachmentsResult> =>
    ipcRenderer.invoke(INSPECT_ATTACHMENTS_CHANNEL, request),
  openAttachment: (
    request: OpenAttachmentRequest,
  ): Promise<OpenAttachmentResult> =>
    ipcRenderer.invoke(OPEN_ATTACHMENT_CHANNEL, request),
  savePastedAttachment: (
    request: SavePastedAttachmentRequest,
  ): Promise<SavePastedAttachmentResult> =>
    ipcRenderer.invoke(SAVE_PASTED_ATTACHMENT_CHANNEL, request),
  loginProvider: (
    request: LoginProviderRequest,
  ): Promise<ProviderLoginResult> =>
    ipcRenderer.invoke(LOGIN_PROVIDER_CHANNEL, request),
  respondToProviderAuth: (
    request: ProviderAuthResponseRequest,
  ): Promise<{ accepted: boolean }> =>
    ipcRenderer.invoke(RESPOND_PROVIDER_AUTH_CHANNEL, request),
  cancelProviderAuth: (request: {
    loginId: string;
  }): Promise<{ cancelled: boolean }> =>
    ipcRenderer.invoke(CANCEL_PROVIDER_AUTH_CHANNEL, request),
  logoutProvider: (
    request: LogoutProviderRequest,
  ): Promise<{ disposed: boolean }> =>
    ipcRenderer.invoke(LOGOUT_PROVIDER_CHANNEL, request),
  selectModel: (request: SelectModelRequest): Promise<{ disposed: boolean }> =>
    ipcRenderer.invoke(SELECT_MODEL_CHANNEL, request),
  openProviderAuthUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke(OPEN_PROVIDER_AUTH_URL_CHANNEL, url),
  onProviderAuthEvent: (listener: ProviderAuthEventListener): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      event: PineProviderAuthEvent,
    ) => listener(event);
    ipcRenderer.on(PROVIDER_AUTH_EVENT_CHANNEL, handler);
    return () =>
      ipcRenderer.removeListener(PROVIDER_AUTH_EVENT_CHANNEL, handler);
  },
  loadSessionMessages: (
    request: LoadSessionMessagesRequest,
  ): Promise<LoadSessionMessagesResult> =>
    ipcRenderer.invoke(LOAD_SESSION_MESSAGES_CHANNEL, request),
  openProject: (request: ProjectIdRequest): Promise<ProjectResult> =>
    ipcRenderer.invoke(OPEN_PROJECT_CHANNEL, request),
  pickAttachments: (): Promise<PickAttachmentsResult> =>
    ipcRenderer.invoke(PICK_ATTACHMENTS_CHANNEL),
  pickAttachmentFolders: (): Promise<PickAttachmentsResult> =>
    ipcRenderer.invoke(PICK_ATTACHMENT_FOLDERS_CHANNEL),
  pickProjectFolders: (
    request: PickProjectFoldersRequest,
  ): Promise<PickProjectFoldersResult> =>
    ipcRenderer.invoke(PICK_PROJECT_FOLDERS_CHANNEL, request),
  promptSession: (
    request: PromptSessionRequest,
  ): Promise<PromptSessionResult> =>
    ipcRenderer.invoke(PROMPT_SESSION_CHANNEL, request),
  resumeSession: (
    request: ResumeSessionRequest,
  ): Promise<ResumeSessionResult> =>
    ipcRenderer.invoke(RESUME_SESSION_CHANNEL, request),
  renameSession: (
    request: RenameSessionRequest,
  ): Promise<RenameSessionResult> =>
    ipcRenderer.invoke(RENAME_SESSION_CHANNEL, request),
  searchSessions: (
    request: SearchSessionsRequest,
  ): Promise<SearchSessionsResult> =>
    ipcRenderer.invoke(SEARCH_SESSIONS_CHANNEL, request),
  onSessionEvent: (listener: SessionEventListener): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      event: PineAgentEvent,
    ) => listener(event);
    ipcRenderer.on(SESSION_EVENT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(SESSION_EVENT_CHANNEL, handler);
  },
  respondApproval: (
    request: RespondApprovalRequest,
  ): Promise<{ accepted: boolean }> =>
    ipcRenderer.invoke(APPROVAL_RESPONSE_CHANNEL, request),
  setApprovalMode: (
    request: SetApprovalModeRequest,
  ): Promise<SetApprovalModeResult> =>
    ipcRenderer.invoke(SET_APPROVAL_MODE_CHANNEL, request),
  updateProject: (request: UpdateProjectRequest): Promise<ProjectResult> =>
    ipcRenderer.invoke(UPDATE_PROJECT_CHANNEL, request),
};

contextBridge.exposeInMainWorld("pine", pineApi);

declare global {
  interface Window {
    pine: PineDesktopApi;
  }
}
