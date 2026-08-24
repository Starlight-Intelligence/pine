import type { ProjectEntry } from "../shared/projectFiles";
import type { PineProject, PineProjectFolder } from "../shared/projects";
import type {
  PromptSessionRequest,
  PromptSessionResult,
} from "../shared/agent";
import type {
  LoginProviderRequest,
  PineModelCatalog,
  ProviderLoginResult,
  SelectModelRequest,
} from "../shared/models";
import type {
  LoadSessionMessagesResult,
  PineSessionSummary,
  SessionSearchResult,
} from "../shared/sessions";
import { listProjectDirectory } from "./projectFiles";
import type { ProjectDataPaths } from "./projects/projectRepository";
import { ProjectSessionService } from "./sessions";
import type { AgentHost } from "./agentProcessHost";

interface ProjectRuntime {
  activeSessionId: string | null;
  activeSessionSummary: PineSessionSummary | null;
  dataPaths: ProjectDataPaths;
  project: PineProject;
  sessionCreation: Promise<PineSessionSummary> | null;
  sessions: ProjectSessionService;
}

export class ProjectRuntimeRegistry {
  private readonly runtimes = new Map<number, ProjectRuntime>();

  constructor(
    private readonly agentHost: AgentHost,
    private readonly agentDir: string,
  ) {}

  async open(
    webContentsId: number,
    project: PineProject,
    dataPaths: ProjectDataPaths,
  ): Promise<void> {
    const defaultFolder = project.folders.find(
      (folder) => folder.id === project.defaultFolderId,
    );
    if (!defaultFolder?.isAvailable) {
      throw new Error("The project's default folder is unavailable.");
    }

    await this.dispose(webContentsId);

    const sessions = await ProjectSessionService.create({
      cacheRoot: dataPaths.cacheRoot,
      cwd: defaultFolder.path,
      sessionsRoot: dataPaths.sessionsRoot,
    });
    this.runtimes.set(webContentsId, {
      activeSessionId: null,
      activeSessionSummary: null,
      dataPaths,
      project,
      sessionCreation: null,
      sessions,
    });
  }

  isOpen(webContentsId: number, projectId: string): boolean {
    return this.runtimes.get(webContentsId)?.project.id === projectId;
  }

  async search(
    webContentsId: number,
    query: string,
  ): Promise<SessionSearchResult[]> {
    return this.get(webContentsId).sessions.search(query);
  }

  async loadMessages(
    webContentsId: number,
    sessionId: string,
    before?: string,
    limit?: number,
  ): Promise<LoadSessionMessagesResult> {
    return this.get(webContentsId).sessions.loadMessages(
      sessionId,
      before,
      limit,
    );
  }

  async listDirectory(
    webContentsId: number,
    folderId: string,
    relativePath: string,
  ): Promise<ProjectEntry[]> {
    const runtime = this.get(webContentsId);
    return listProjectDirectory(
      this.getFolder(runtime.project, folderId),
      relativePath,
    );
  }

  async resume(
    webContentsId: number,
    sessionId: string,
  ): Promise<PineSessionSummary> {
    const runtime = this.get(webContentsId);
    if (runtime.activeSessionId === sessionId && runtime.activeSessionSummary) {
      return runtime.activeSessionSummary;
    }

    const descriptor = await runtime.sessions.describeSession(sessionId);
    if (runtime.activeSessionId) {
      await this.agentHost.disposeSession(runtime.activeSessionId);
    }
    const opened = await this.agentHost.openSession(
      this.location(runtime),
      descriptor.sessionFile,
    );
    runtime.activeSessionId = opened.session.id;
    runtime.activeSessionSummary = opened.session;
    return opened.session;
  }

  async getOrCreateActiveSession(
    webContentsId: number,
  ): Promise<PineSessionSummary> {
    const runtime = this.get(webContentsId);
    if (runtime.activeSessionId && runtime.activeSessionSummary) {
      return runtime.activeSessionSummary;
    }

    runtime.sessionCreation ??= this.agentHost
      .createSession(this.location(runtime))
      .then(({ session }) => session);

    try {
      const handle = await runtime.sessionCreation;
      if (this.runtimes.get(webContentsId) !== runtime) {
        throw new Error("The active project changed while creating a session.");
      }

      runtime.activeSessionId = handle.id;
      runtime.activeSessionSummary = handle;
      return handle;
    } finally {
      runtime.sessionCreation = null;
    }
  }

  async prompt(
    webContentsId: number,
    request: PromptSessionRequest,
  ): Promise<PromptSessionResult> {
    const runtime = this.get(webContentsId);
    const activeSession = await this.getOrCreateActiveSession(webContentsId);
    const result = await this.agentHost.prompt(
      activeSession.id,
      request.message,
      request.streamingBehavior === "follow-up"
        ? "followUp"
        : request.streamingBehavior,
    );
    runtime.activeSessionSummary = result.session;
    return { accepted: result.accepted, session: result.session };
  }

  async abort(webContentsId: number): Promise<{
    aborted: boolean;
    sessionId?: string;
  }> {
    const runtime = this.get(webContentsId);
    if (!runtime.activeSessionId) return { aborted: false };
    const result = await this.agentHost.abort(runtime.activeSessionId);
    return { ...result, sessionId: runtime.activeSessionId };
  }

  getModelCatalog(): Promise<PineModelCatalog> {
    return this.agentHost.getModelCatalog(this.agentDir);
  }

  loginProvider(request: LoginProviderRequest): Promise<ProviderLoginResult> {
    return this.agentHost.loginProvider(this.agentDir, request);
  }

  respondToProviderAuth(
    loginId: string,
    promptId: string,
    value: string,
  ): Promise<{ accepted: boolean }> {
    return this.agentHost.respondToProviderAuth(loginId, promptId, value);
  }

  cancelProviderAuth(loginId: string): Promise<{ cancelled: boolean }> {
    return this.agentHost.cancelProviderAuth(loginId);
  }

  logoutProvider(providerId: string): Promise<{ disposed: boolean }> {
    return this.agentHost.logoutProvider(this.agentDir, providerId);
  }

  selectModel(
    webContentsId: number,
    request: SelectModelRequest,
  ): Promise<{ disposed: boolean }> {
    return this.agentHost.selectModel(
      this.agentDir,
      request.providerId,
      request.modelId,
      request.thinkingLevel,
      this.runtimes.get(webContentsId)?.activeSessionId ?? undefined,
    );
  }

  ownerOfSession(sessionId: string): number | undefined {
    for (const [webContentsId, runtime] of this.runtimes) {
      if (runtime.activeSessionId === sessionId) return webContentsId;
    }
    return undefined;
  }

  async dispose(webContentsId: number): Promise<void> {
    const runtime = this.runtimes.get(webContentsId);
    if (!runtime) return;

    this.runtimes.delete(webContentsId);
    let createdSessionId: string | undefined;
    if (runtime.sessionCreation) {
      createdSessionId = await runtime.sessionCreation
        .then((session) => session.id)
        .catch(() => undefined);
    }
    const sessionId = runtime.activeSessionId ?? createdSessionId;
    if (sessionId) {
      await this.agentHost.disposeSession(sessionId);
    }
    await runtime.sessions.dispose();
  }

  private get(webContentsId: number): ProjectRuntime {
    const runtime = this.runtimes.get(webContentsId);
    if (!runtime) throw new Error("No project is open in this window.");
    return runtime;
  }

  private getFolder(project: PineProject, folderId: string): PineProjectFolder {
    const folder = project.folders.find(
      (candidate) => candidate.id === folderId,
    );
    if (!folder) throw new Error("Folder not found in the active project.");
    return folder;
  }

  private location(runtime: ProjectRuntime) {
    const defaultFolder = this.getFolder(
      runtime.project,
      runtime.project.defaultFolderId,
    );
    return {
      agentDir: this.agentDir,
      cwd: defaultFolder.path,
      sessionsRoot: runtime.dataPaths.sessionsRoot,
    };
  }
}
