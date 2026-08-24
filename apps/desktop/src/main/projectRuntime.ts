import type {
  JsonlSessionMetadata,
  Session,
} from "@earendil-works/pi-agent-core";
import type { ProjectEntry } from "../shared/projectFiles";
import type { PineProject, PineProjectFolder } from "../shared/projects";
import type {
  PineSessionSummary,
  SessionSearchResult,
} from "../shared/sessions";
import { listProjectDirectory } from "./projectFiles";
import type { ProjectDataPaths } from "./projects/projectRepository";
import { type PineSessionHandle, ProjectSessionService } from "./sessions";

interface ProjectRuntime {
  activeSession: Session<JsonlSessionMetadata> | null;
  activeSessionSummary: PineSessionSummary | null;
  project: PineProject;
  sessionCreation: Promise<PineSessionHandle> | null;
  sessions: ProjectSessionService;
}

export class ProjectRuntimeRegistry {
  private readonly runtimes = new Map<number, ProjectRuntime>();

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
      activeSession: null,
      activeSessionSummary: null,
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
        throw new Error("The active project changed while creating a session.");
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
}
