import type { PineWorkspaceSummary } from "../shared/projects";
import type {
  JsonlSessionMetadata,
  Session,
} from "@earendil-works/pi-agent-core";
import type {
  PineSessionSummary,
  SessionSearchResult,
} from "../shared/sessions";
import { type PineSessionHandle, WorkspaceSessionService } from "./sessions";
import { listWorkspaceDirectory } from "./workspaceFiles";
import type { WorkspaceEntry } from "../shared/workspaceFiles";

interface WorkspaceRuntime {
  activeSession: Session<JsonlSessionMetadata> | null;
  activeSessionSummary: PineSessionSummary | null;
  sessionCreation: Promise<PineSessionHandle> | null;
  sessions: WorkspaceSessionService;
  workspace: PineWorkspaceSummary;
}

export class WorkspaceRuntimeRegistry {
  private readonly runtimes = new Map<number, WorkspaceRuntime>();

  async open(
    webContentsId: number,
    workspace: PineWorkspaceSummary,
  ): Promise<void> {
    await this.dispose(webContentsId);

    const sessions = await WorkspaceSessionService.create(workspace.rootPath);
    this.runtimes.set(webContentsId, {
      activeSession: null,
      activeSessionSummary: null,
      sessionCreation: null,
      sessions,
      workspace,
    });
  }

  async search(
    webContentsId: number,
    query: string,
  ): Promise<SessionSearchResult[]> {
    return this.get(webContentsId).sessions.search(query);
  }

  async listDirectory(
    webContentsId: number,
    relativePath: string,
  ): Promise<WorkspaceEntry[]> {
    const runtime = this.get(webContentsId);
    return listWorkspaceDirectory(runtime.workspace.rootPath, relativePath);
  }

  async resume(
    webContentsId: number,
    sessionId: string,
  ): Promise<PineSessionSummary> {
    const runtime = this.get(webContentsId);
    const session = await runtime.sessions.resumeSession(sessionId);
    runtime.activeSession = session.session;
    runtime.activeSessionSummary = session.summary;
    return session.summary;
  }

  async getOrCreateActiveSession(
    webContentsId: number,
  ): Promise<PineSessionHandle> {
    const runtime = this.get(webContentsId);
    if (runtime.activeSession && runtime.activeSessionSummary) {
      return {
        session: runtime.activeSession,
        summary: runtime.activeSessionSummary,
      };
    }

    runtime.sessionCreation ??= runtime.sessions.createSession();

    try {
      const handle = await runtime.sessionCreation;
      if (this.runtimes.get(webContentsId) !== runtime) {
        throw new Error(
          "The active workspace changed while creating a session.",
        );
      }

      runtime.activeSession = handle.session;
      runtime.activeSessionSummary = handle.summary;
      return handle;
    } finally {
      runtime.sessionCreation = null;
    }
  }

  async dispose(webContentsId: number): Promise<void> {
    const runtime = this.runtimes.get(webContentsId);
    if (!runtime) return;

    this.runtimes.delete(webContentsId);
    if (runtime.sessionCreation) {
      await runtime.sessionCreation.catch(() => undefined);
    }
    await runtime.sessions.dispose();
  }

  private get(webContentsId: number): WorkspaceRuntime {
    const runtime = this.runtimes.get(webContentsId);
    if (!runtime) throw new Error("No workspace is open in this window.");
    return runtime;
  }
}
