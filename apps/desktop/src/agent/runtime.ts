import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import {
  getSupportedThinkingLevels,
  type Api,
  type AuthPrompt,
  type Model,
} from "@earendil-works/pi-ai";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { PineAgentEvent } from "../shared/agent";
import type {
  PineAuthType,
  PineModelCatalog,
  PineProviderAuthEvent,
  PineThinkingLevel,
  ProviderLoginResult,
} from "../shared/models";
import type { PineSessionSummary } from "../shared/sessions";
import {
  type AgentSessionLocation,
  type AgentWorkerPromptResult,
  type AgentWorkerSessionResult,
  toErrorMessage,
  toPineJsonValue,
} from "./protocol";
import { createPineToolDefinitions } from "./tools";

const PINE_TOOL_NAMES = ["read", "bash", "edit", "write"];

interface LiveAgentSession {
  session: AgentSession;
  unsubscribe: () => void;
}

export interface PineAgentRuntimeOptions {
  emit: (event: PineAgentEvent | PineProviderAuthEvent) => void;
}

interface PendingAuthPrompt {
  loginId: string;
  reject: (error: Error) => void;
  resolve: (value: string) => void;
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
  private readonly loginControllers = new Map<string, AbortController>();
  private readonly pendingAuthPrompts = new Map<string, PendingAuthPrompt>();

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
    for (const controller of this.loginControllers.values()) controller.abort();
    await Promise.all(
      [...this.liveSessions.keys()].map((sessionId) =>
        this.disposeSession(sessionId),
      ),
    );
    return { disposed: true };
  }

  async getModelCatalog(agentDir: string): Promise<PineModelCatalog> {
    const runtime = await this.getModelRuntime(agentDir);
    const settings = SettingsManager.create(process.cwd(), agentDir, {
      projectTrusted: false,
    });
    await settings.reload();
    const models = runtime.getModels();
    const providers = runtime.getProviders().map((provider) => {
      const status = runtime.getProviderAuthStatus(provider.id);
      const authMethods = [];
      if (provider.auth.apiKey?.login) {
        authMethods.push({
          type: "api_key" as const,
          label: provider.auth.apiKey.name,
        });
      }
      if (provider.auth.oauth) {
        authMethods.push({
          type: "oauth" as const,
          label: provider.auth.oauth.loginLabel ?? provider.auth.oauth.name,
        });
      }
      return {
        id: provider.id,
        name: provider.name,
        configured: status.configured,
        ...(status.label
          ? { authSource: status.label }
          : status.configured
            ? { authSource: status.source }
            : {}),
        authMethods,
        modelCount: models.filter((model) => model.provider === provider.id)
          .length,
      };
    });
    const defaultProvider = settings.getDefaultProvider();
    const defaultModel = settings.getDefaultModel();
    const defaultThinkingLevel = settings.getDefaultThinkingLevel() ?? "medium";

    return {
      providers,
      models: models.map((model) => this.describeModel(model, providers)),
      ...(defaultProvider &&
      defaultModel &&
      runtime.hasConfiguredAuth(defaultProvider) &&
      runtime.getModel(defaultProvider, defaultModel)
        ? {
            selection: {
              providerId: defaultProvider,
              modelId: defaultModel,
              thinkingLevel: defaultThinkingLevel,
            },
          }
        : {}),
    };
  }

  async loginProvider(
    agentDir: string,
    loginId: string,
    providerId: string,
    authType: PineAuthType,
  ): Promise<ProviderLoginResult> {
    if (this.loginControllers.has(loginId)) {
      throw new Error("Provider login is already in progress.");
    }
    const controller = new AbortController();
    this.loginControllers.set(loginId, controller);
    try {
      const runtime = await this.getModelRuntime(agentDir);
      const credential = await runtime.login(providerId, authType, {
        signal: controller.signal,
        notify: (notice) => {
          this.options.emit({
            type: "provider-auth-notice",
            loginId,
            notice,
          });
        },
        prompt: (prompt) => this.waitForAuthPrompt(loginId, prompt),
      });
      return { credentialType: credential.type };
    } finally {
      this.loginControllers.delete(loginId);
      this.rejectAuthPrompts(loginId, "Provider login ended.");
    }
  }

  respondToProviderAuth(
    loginId: string,
    promptId: string,
    value: string,
  ): { accepted: boolean } {
    const pending = this.pendingAuthPrompts.get(promptId);
    if (!pending || pending.loginId !== loginId) return { accepted: false };
    this.pendingAuthPrompts.delete(promptId);
    pending.resolve(value);
    return { accepted: true };
  }

  cancelProviderAuth(loginId: string): { cancelled: boolean } {
    const controller = this.loginControllers.get(loginId);
    if (!controller) return { cancelled: false };
    controller.abort();
    this.rejectAuthPrompts(loginId, "Provider login was cancelled.");
    return { cancelled: true };
  }

  async logoutProvider(
    agentDir: string,
    providerId: string,
  ): Promise<{ disposed: boolean }> {
    await (await this.getModelRuntime(agentDir)).logout(providerId);
    return { disposed: true };
  }

  async selectModel(
    agentDir: string,
    providerId: string,
    modelId: string,
    thinkingLevel: PineThinkingLevel,
    sessionId?: string,
  ): Promise<{ disposed: boolean }> {
    const runtime = await this.getModelRuntime(agentDir);
    const model = runtime.getModel(providerId, modelId);
    if (!model) throw new Error("Model not found.");
    const available = await runtime.getAvailable(providerId);
    if (!available.some((candidate) => candidate.id === modelId)) {
      throw new Error("Configure this provider before selecting its model.");
    }

    const supported = getSupportedThinkingLevels(model);
    const normalizedThinkingLevel = supported.includes(thinkingLevel)
      ? thinkingLevel
      : (supported.at(-1) ?? "off");
    const live = sessionId ? this.liveSessions.get(sessionId) : undefined;
    if (live) {
      await live.session.setModel(model);
      live.session.setThinkingLevel(normalizedThinkingLevel);
      await live.session.settingsManager.flush();
    } else {
      const settings = SettingsManager.create(process.cwd(), agentDir, {
        projectTrusted: false,
      });
      settings.setDefaultModelAndProvider(providerId, modelId);
      settings.setDefaultThinkingLevel(normalizedThinkingLevel);
      await settings.flush();
    }
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
    const customTools = await createPineToolDefinitions(location);

    const { session } = await createAgentSession({
      cwd: location.cwd,
      agentDir: location.agentDir,
      modelRuntime: await this.getModelRuntime(location.agentDir),
      resourceLoader,
      sessionManager,
      settingsManager,
      customTools,
      tools: PINE_TOOL_NAMES,
    });
    const unsubscribe = session.subscribe((event) =>
      this.forwardEvent(session, event),
    );
    this.liveSessions.set(session.sessionId, { session, unsubscribe });
    // A resumed session already carries usage history; surface it before the
    // next turn completes.
    this.emitContextUsage(session);

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
        allowModelNetwork: true,
        authPath: path.join(agentDir, "auth.json"),
        modelsPath: path.join(agentDir, "models.json"),
        modelsStorePath: path.join(agentDir, "models-store.json"),
      });
      this.modelRuntimes.set(agentDir, runtime);
    }
    return runtime;
  }

  private describeModel(
    model: Model<Api>,
    providers: PineModelCatalog["providers"],
  ): PineModelCatalog["models"][number] {
    return {
      api: model.api,
      contextWindow: model.contextWindow,
      id: model.id,
      input: model.input,
      maxTokens: model.maxTokens,
      name: model.name,
      providerId: model.provider,
      providerName:
        providers.find((provider) => provider.id === model.provider)?.name ??
        model.provider,
      reasoning: model.reasoning,
      supportedThinkingLevels: getSupportedThinkingLevels(model),
    };
  }

  private waitForAuthPrompt(
    loginId: string,
    prompt: AuthPrompt,
  ): Promise<string> {
    const promptId = randomUUID();
    return new Promise<string>((resolve, reject) => {
      const pending = { loginId, resolve, reject };
      this.pendingAuthPrompts.set(promptId, pending);
      const abort = () => {
        if (this.pendingAuthPrompts.get(promptId) !== pending) return;
        this.pendingAuthPrompts.delete(promptId);
        reject(new Error("Provider login was cancelled."));
      };
      prompt.signal?.addEventListener("abort", abort, { once: true });
      this.loginControllers
        .get(loginId)
        ?.signal.addEventListener("abort", abort, { once: true });
      const serializablePrompt = { ...prompt };
      delete serializablePrompt.signal;
      this.options.emit({
        type: "provider-auth-prompt",
        loginId,
        promptId,
        prompt: serializablePrompt,
      });
    });
  }

  private rejectAuthPrompts(loginId: string, message: string): void {
    for (const [promptId, pending] of this.pendingAuthPrompts) {
      if (pending.loginId !== loginId) continue;
      this.pendingAuthPrompts.delete(promptId);
      pending.reject(new Error(message));
    }
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
        if (event.type === "message_end") this.emitContextUsage(session);
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

  /** Pushes the live context usage estimate so the renderer's composer
   * indicator stays current without polling. */
  private emitContextUsage(session: AgentSession): void {
    const usage = session.getContextUsage();
    if (!usage) return;
    this.options.emit({
      type: "context-usage",
      sessionId: session.sessionId,
      tokens: usage.tokens,
      contextWindow: usage.contextWindow,
      percent: usage.percent,
      cost: session.getSessionStats().cost,
    });
  }
}
