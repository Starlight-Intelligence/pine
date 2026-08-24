import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { PineAgentEvent } from "../shared/agent";
import type { PineSessionSummary } from "../shared/sessions";
import {
  type AgentSessionLocation,
  type AgentWorkerPromptResult,
  type AgentWorkerSessionResult,
  toErrorMessage,
  toPineJsonValue,
} from "./protocol";

// Pi's built-in filesystem tools accept absolute paths. Keep the initial
// harness tool-free until Pine-owned tools enforce project folder scopes.
const PINE_TOOLS: [] = [];

interface LiveAgentSession {
  session: AgentSession;
  unsubscribe: () => void;
}

export interface PineAgentRuntimeOptions {
  emit: (event: PineAgentEvent) => void;
}

function encodeCwd(cwd: string): string {
  return `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

export function projectSessionDirectory(
  sessionsRoot: string,
  cwd: string,
): string {
  return path.join(sessionsRoot, encodeCwd(cwd));
}

function sessionSummary(session: AgentSession): PineSessionSummary {
  const header = session.sessionManager.getHeader();
  const entries = session.sessionManager.getEntries();
  const messages = entries.filter((entry) => entry.type === "message");
  const lastEntry = entries.at(-1);
  const createdAt = header?.timestamp ?? new Date().toISOString();

  return {
    id: session.sessionId,
    createdAt,
    updatedAt: lastEntry?.timestamp ?? createdAt,
    messageCount: messages.length,
    ...(session.sessionName ? { name: session.sessionName } : {}),
  };
}

export class PineAgentRuntime {
  private readonly activeMessageIds = new Map<string, string>();
  private readonly liveSessions = new Map<string, LiveAgentSession>();
  private readonly modelRuntimes = new Map<string, Promise<ModelRuntime>>();

  constructor(private readonly options: PineAgentRuntimeOptions) {}

  async createSession(
    location: AgentSessionLocation,
  ): Promise<AgentWorkerSessionResult> {
    const manager = SessionManager.create(
      location.cwd,
      projectSessionDirectory(location.sessionsRoot, location.cwd),
    );
    return this.registerSession(location, manager);
  }

  async openSession(
    location: AgentSessionLocation,
    sessionFile: string,
  ): Promise<AgentWorkerSessionResult> {
    const manager = SessionManager.open(
      sessionFile,
      projectSessionDirectory(location.sessionsRoot, location.cwd),
      location.cwd,
    );
    return this.registerSession(location, manager);
  }

  async prompt(
    sessionId: string,
    message: string,
    streamingBehavior?: "followUp" | "steer",
  ): Promise<AgentWorkerPromptResult> {
    const live = this.getSession(sessionId);
    let accepted = false;

    this.options.emit({ type: "run-state", sessionId, state: "running" });
    try {
      await live.session.prompt(message, {
        ...(streamingBehavior ? { streamingBehavior } : {}),
        preflightResult: (success) => {
          accepted = success;
        },
        source: "interactive",
      });
      return {
        accepted,
        session: sessionSummary(live.session),
        ...(live.session.sessionFile
          ? { sessionFile: live.session.sessionFile }
          : {}),
      };
    } catch (error) {
      this.options.emit({
        type: "run-state",
        sessionId,
        state: "failed",
        error: toErrorMessage(error),
      });
      throw error;
    } finally {
      if (live.session.isIdle) {
        this.options.emit({ type: "run-state", sessionId, state: "idle" });
      }
    }
  }

  async abort(sessionId: string): Promise<{ aborted: boolean }> {
    const live = this.getSession(sessionId);
    const aborted = !live.session.isIdle;
    if (aborted) {
      this.options.emit({ type: "run-state", sessionId, state: "aborting" });
      await live.session.abort();
      this.options.emit({ type: "run-state", sessionId, state: "idle" });
    }
    return { aborted };
  }

  async disposeSession(sessionId: string): Promise<{ disposed: boolean }> {
    const live = this.liveSessions.get(sessionId);
    if (!live) return { disposed: false };

    this.liveSessions.delete(sessionId);
    this.activeMessageIds.delete(sessionId);
    if (!live.session.isIdle) await live.session.abort();
    live.unsubscribe();
    await live.session.settingsManager.flush();
    live.session.dispose();
    return { disposed: true };
  }

  async dispose(): Promise<{ disposed: boolean }> {
    await Promise.all(
      [...this.liveSessions.keys()].map((sessionId) =>
        this.disposeSession(sessionId),
      ),
    );
    return { disposed: true };
  }

  private async registerSession(
    location: AgentSessionLocation,
    sessionManager: SessionManager,
  ): Promise<AgentWorkerSessionResult> {
    const existing = this.liveSessions.get(sessionManager.getSessionId());
    if (existing) {
      return {
        session: sessionSummary(existing.session),
        ...(existing.session.sessionFile
          ? { sessionFile: existing.session.sessionFile }
          : {}),
      };
    }

    const settingsManager = SettingsManager.create(
      location.cwd,
      location.agentDir,
      { projectTrusted: false },
    );
    const resourceLoader = new DefaultResourceLoader({
      cwd: location.cwd,
      agentDir: location.agentDir,
      settingsManager,
      noExtensions: true,
      noThemes: true,
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: location.cwd,
      agentDir: location.agentDir,
      modelRuntime: await this.getModelRuntime(location.agentDir),
      resourceLoader,
      sessionManager,
      settingsManager,
      tools: PINE_TOOLS,
    });
    const unsubscribe = session.subscribe((event) =>
      this.forwardEvent(session, event),
    );
    this.liveSessions.set(session.sessionId, { session, unsubscribe });

    return {
      session: sessionSummary(session),
      ...(session.sessionFile ? { sessionFile: session.sessionFile } : {}),
    };
  }

  private getSession(sessionId: string): LiveAgentSession {
    const live = this.liveSessions.get(sessionId);
    if (!live) throw new Error(`Agent session not found: ${sessionId}`);
    return live;
  }

  private getModelRuntime(agentDir: string): Promise<ModelRuntime> {
    let runtime = this.modelRuntimes.get(agentDir);
    if (!runtime) {
      runtime = ModelRuntime.create({
        allowModelNetwork: false,
        authPath: path.join(agentDir, "auth.json"),
        modelsPath: path.join(agentDir, "models.json"),
        modelsStorePath: path.join(agentDir, "models-store.json"),
      });
      this.modelRuntimes.set(agentDir, runtime);
    }
    return runtime;
  }

  private forwardEvent(session: AgentSession, event: AgentSessionEvent): void {
    const sessionId = session.sessionId;
    switch (event.type) {
      case "message_start":
      case "message_end": {
        const messageId =
          event.type === "message_start"
            ? randomUUID()
            : (this.activeMessageIds.get(sessionId) ?? randomUUID());
        if (event.type === "message_start") {
          this.activeMessageIds.set(sessionId, messageId);
        } else {
          this.activeMessageIds.delete(sessionId);
        }
        this.options.emit({
          type:
            event.type === "message_start" ? "message-start" : "message-end",
          sessionId,
          messageId,
          message: toPineJsonValue(event.message),
        });
        break;
      }
      case "message_update":
        this.options.emit({
          type: "message-update",
          sessionId,
          messageId: this.activeMessageIds.get(sessionId) ?? randomUUID(),
          message: toPineJsonValue(event.message),
          update: toPineJsonValue(event.assistantMessageEvent),
        });
        break;
      case "tool_execution_start":
        this.options.emit({
          type: "tool-start",
          sessionId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          payload: toPineJsonValue(event.args),
        });
        break;
      case "tool_execution_update":
        this.options.emit({
          type: "tool-update",
          sessionId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          payload: toPineJsonValue(event.partialResult),
        });
        break;
      case "tool_execution_end":
        this.options.emit({
          type: "tool-end",
          sessionId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          payload: toPineJsonValue(event.result),
          isError: event.isError,
        });
        break;
      case "entry_appended":
      case "session_info_changed":
        this.options.emit({
          type: "session-updated",
          sessionId,
          summary: sessionSummary(session),
        });
        break;
      default:
        break;
    }
  }
}
