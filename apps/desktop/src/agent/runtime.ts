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
  type AssistantMessage,
  type AuthPrompt,
  type Context,
  type Model,
  type ModelsApiStreamOptions,
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
import type { PineContextUsage, PineSessionSummary } from "../shared/sessions";
import {
  type AgentSessionLocation,
  type AgentWorkerPromptResult,
  type AgentWorkerSessionResult,
  GateDecision,
  toErrorMessage,
  toPineJsonValue,
} from "./protocol";
import { PINE_SYSTEM_PROMPT } from "./system-prompt";
import {
  AutoReviewGate,
  RULING_TOOL,
  UserApprovalGate,
  type GateHost,
  type GateTurnContext,
  type JudgeRequest,
  type JudgeRuling,
  type ToolGate,
  type UserApprovalRequest,
} from "./gate";
import { createPineToolDefinitions } from "./tools";

const JUDGE_TIMEOUT_MS = 60_000;

const JUDGE_SYSTEM_PROMPT = `You are the automated safety reviewer inside Pine, a desktop coding agent. The agent tried to make a tool call that Pine's deterministic sandbox or folder policy blocked, that matched a destructive-command heuristic, or that explicitly requested native execution outside the sandbox. You decide whether the agent may proceed.

Be permissive about ordinary development work: builds, test runs, package installs, scaffolding, formatters, git operations on local branches, and file edits inside the project. Be strict about anything destructive, irreversible, or that leaves the machine.

Deny when the call:
- destroys data that is hard or impossible to recreate: uncommitted work, untracked files, database tables or databases, Docker volumes, files outside the project
- rewrites shared history (git push --force) or force-deletes branches others may use
- publishes or uploads anything publicly (npm/bun publish, curl POST of project files, secrets, or environment data to external services)
- exfiltrates credentials: sends .env files, tokens, SSH keys, or browser profiles over the network
- pipes downloaded scripts straight into a shell
- appears to have partially applied side effects before the sandbox blocked it, making a blind re-run unsafe

Allow destructive-looking commands whose target is clearly safe to regenerate (build output, dependency caches, temporary files inside the project).

Call submit_ruling exactly once with your verdict. Set scope to "session" only when identical commands should skip re-review for the rest of this session (for example a package manager the project clearly relies on). Write reason in the same language the user's messages use; for denials make it actionable by naming the safer alternative.`;

const TRIGGER_DESCRIPTIONS: Record<JudgeRequest["trigger"], string> = {
  "sandbox-denied":
    "The macOS sandbox blocked the command at runtime (EPERM). An allowance re-runs the exact command outside the sandbox.",
  "authorize-denied":
    "Pine's folder policy rejected the path. An allowance performs the operation regardless of folder grants.",
  "destructive-pattern":
    "A destructive-command heuristic matched before execution. The sandbox has NOT run; an allowance runs the command (sandboxed as usual).",
  "privileged-execution":
    "The agent explicitly requested native shell execution outside Pine's project sandbox. This call has not executed yet and must receive a fresh per-call ruling before it can run.",
};

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n…[truncated]`;
}

function buildJudgeEvidence(request: JudgeRequest): string {
  const sections = [
    `Review trigger: ${TRIGGER_DESCRIPTIONS[request.trigger]}`,
    `Tool: ${request.toolName}`,
    `Call subject:\n${truncateText(request.subject, 4_000)}`,
  ];
  if (request.evidence) {
    sections.push(
      `Evidence from the sandbox or policy:\n${truncateText(request.evidence, 2_000)}`,
    );
  }
  if (request.turn.lastUserPrompt) {
    sections.push(
      `The user's most recent message:\n${truncateText(request.turn.lastUserPrompt, 2_000)}`,
    );
  }
  if (request.turn.lastAssistantText) {
    sections.push(
      `The agent's current response so far:\n${truncateText(request.turn.lastAssistantText, 3_000)}`,
    );
  }
  if (request.turn.lastThinking) {
    sections.push(
      `The agent's current reasoning (truncated):\n${truncateText(request.turn.lastThinking, 2_000)}`,
    );
  }
  return sections.join("\n\n");
}

interface LiveAgentSession {
  session: AgentSession;
  unsubscribe: () => void;
  agentDir: string;
  /** Null in YOLO mode (no gate at all). */
  gate: ToolGate | null;
  /** Latest user/assistant context fed to gate reviews. */
  turn: GateTurnContext;
}

export interface PineAgentRuntimeOptions {
  emit: (event: PineAgentEvent | PineProviderAuthEvent) => void;
}

interface PendingUserApproval {
  resolve: (decision: GateDecision) => void;
  sessionId: string;
  toolCallId: string;
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

/**
 * Judge calls must minimize latency, so reasoning is disabled wherever the
 * API exposes an explicit switch. openai-completions-family APIs send an
 * explicit "thinking disabled" flag when no effort option is present, so
 * omitting options is the off state there (passing an effort would ENABLE
 * thinking); Responses-style APIs default to medium effort unless lowered;
 * Anthropic needs thinkingEnabled: false.
 */
export function judgeStreamOptions(
  model: Model<Api>,
  signal: AbortSignal,
): ModelsApiStreamOptions<Api> {
  switch (model.api) {
    case "anthropic-messages":
      return { signal, thinkingEnabled: false };
    case "openai-responses":
    case "openai-codex-responses":
    case "azure-openai-responses":
      return { signal, reasoningEffort: "minimal" };
    default:
      return { signal };
  }
}

export class PineAgentRuntime {
  private readonly activeMessageIds = new Map<string, string>();
  private readonly liveSessions = new Map<string, LiveAgentSession>();
  private readonly modelRuntimes = new Map<string, Promise<ModelRuntime>>();
  private readonly loginControllers = new Map<string, AbortController>();
  private readonly pendingAuthPrompts = new Map<string, PendingAuthPrompt>();
  private readonly pendingApprovals = new Map<string, PendingUserApproval>();

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
    live.turn.lastUserPrompt = message;
    live.gate?.resetTurn();
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
      const message = toErrorMessage(error);
      this.options.emit({
        type: "session-error",
        sessionId,
        errorId: randomUUID(),
        message,
      });
      this.options.emit({
        type: "run-state",
        sessionId,
        state: "failed",
        error: message,
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

  renameSession(sessionId: string, name: string): AgentWorkerSessionResult {
    const session = this.getSession(sessionId).session;
    session.setSessionName(name);
    return { session: sessionSummary(session) };
  }

  async disposeSession(sessionId: string): Promise<{ disposed: boolean }> {
    const live = this.liveSessions.get(sessionId);
    if (!live) return { disposed: false };

    this.liveSessions.delete(sessionId);
    this.activeMessageIds.delete(sessionId);
    for (const [requestId, pending] of this.pendingApprovals) {
      if (pending.sessionId !== sessionId) continue;
      this.pendingApprovals.delete(requestId);
      pending.resolve({ kind: "deny", reason: "The session was closed." });
    }
    if (!live.session.isIdle) await live.session.abort();
    live.unsubscribe();
    await live.session.settingsManager.flush();
    live.session.dispose();
    return { disposed: true };
  }

  async dispose(): Promise<{ disposed: boolean }> {
    for (const controller of this.loginControllers.values()) controller.abort();
    for (const [requestId, pending] of this.pendingApprovals) {
      this.pendingApprovals.delete(requestId);
      pending.resolve({
        kind: "deny",
        reason: "The agent runtime was disposed.",
      });
    }
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
      const contextUsage = this.getContextUsage(existing.session);
      return {
        session: sessionSummary(existing.session),
        ...(existing.session.sessionFile
          ? { sessionFile: existing.session.sessionFile }
          : {}),
        ...(contextUsage ? { contextUsage } : {}),
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
      systemPromptOverride: () => PINE_SYSTEM_PROMPT,
    });
    await resourceLoader.reload();
    const live: LiveAgentSession = {
      session: undefined as never,
      unsubscribe: () => undefined,
      agentDir: location.agentDir,
      gate: null,
      turn: {},
    };
    if (
      location.approvalMode === "ask-for-permission" ||
      location.approvalMode === "agent-decides"
    ) {
      live.gate = this.createGate(
        live,
        location.approvalMode === "ask-for-permission" ? "user" : "auto",
      );
    }
    const customTools = await createPineToolDefinitions(location, live.gate);

    const { session } = await createAgentSession({
      cwd: location.cwd,
      agentDir: location.agentDir,
      modelRuntime: await this.getModelRuntime(location.agentDir),
      resourceLoader,
      sessionManager,
      settingsManager,
      customTools,
      // Keep the SDK's active-tool list derived from the actual definitions.
      // A parallel static allowlist previously registered privileged_bash but
      // silently hid it from the model.
      tools: customTools.map((tool) => tool.name),
    });
    live.session = session;
    live.unsubscribe = session.subscribe((event) =>
      this.forwardEvent(session, event),
    );
    this.liveSessions.set(session.sessionId, live);
    // A resumed session already carries usage history; surface it before the
    // next turn completes.
    const contextUsage = this.getContextUsage(session);
    if (contextUsage) this.emitContextUsage(session, contextUsage);

    return {
      session: sessionSummary(session),
      ...(session.sessionFile ? { sessionFile: session.sessionFile } : {}),
      ...(contextUsage ? { contextUsage } : {}),
    };
  }

  private createGate(live: LiveAgentSession, mode: "user" | "auto"): ToolGate {
    const host: GateHost = {
      get sessionId() {
        return live.session.sessionId;
      },
      emit: (event) => this.options.emit(event),
      turnContext: () => live.turn,
      judge: (request) => this.runJudge(live, request),
      requestUserApproval: (request) => this.requestUserApproval(live, request),
    };
    return mode === "user"
      ? new UserApprovalGate(host)
      : new AutoReviewGate(host);
  }

  /** Cross-process round trip: renderer answers, worker resumes. */
  private requestUserApproval(
    live: LiveAgentSession,
    request: UserApprovalRequest,
  ): Promise<GateDecision> {
    const sessionId = live.session.sessionId;
    const requestId = randomUUID();
    return new Promise<GateDecision>((resolve) => {
      const pending: PendingUserApproval = {
        resolve,
        sessionId,
        toolCallId: request.toolCallId,
      };
      this.pendingApprovals.set(requestId, pending);
      const onAbort = () => {
        if (this.pendingApprovals.get(requestId) !== pending) return;
        this.pendingApprovals.delete(requestId);
        resolve({ kind: "deny", reason: "aborted" });
      };
      request.signal?.addEventListener("abort", onAbort, { once: true });
      const reviewInput: Record<string, string> = {};
      if (request.subject !== undefined) reviewInput.subject = request.subject;
      if (request.description !== undefined) {
        reviewInput.description = request.description;
      }
      this.options.emit({
        type: "approval-request",
        sessionId,
        requestId,
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        trigger: request.trigger,
        input: Object.keys(reviewInput).length > 0 ? reviewInput : undefined,
        evidence: request.evidence,
      });
    });
  }

  /** Entry point for the worker's inbound `approval:response` messages. */
  resolveApproval(
    requestId: string,
    decision: GateDecision,
  ): { accepted: boolean } {
    const pending = this.pendingApprovals.get(requestId);
    if (!pending) return { accepted: false };
    this.pendingApprovals.delete(requestId);
    pending.resolve(decision);
    this.options.emit({
      type: "approval-decided",
      sessionId: pending.sessionId,
      requestId,
      toolCallId: pending.toolCallId,
      verdict: decision.kind === "allow" ? "approved" : "denied",
      decidedBy: "user",
      reason: decision.kind === "deny" ? decision.reason : undefined,
    });
    return { accepted: true };
  }

  /**
   * Structured-output judge: one direct stream call against the session's
   * selected model with a submit_ruling tool, then read the tool call back.
   * Never goes through session.prompt (no recursion into the tool pipeline).
   */
  private async runJudge(
    live: LiveAgentSession,
    request: JudgeRequest,
  ): Promise<JudgeRuling> {
    const model = live.session.model;
    if (!model) throw new Error("No model is selected for this session.");
    const modelRuntime = await this.getModelRuntime(live.agentDir);
    const timeout = AbortSignal.timeout(JUDGE_TIMEOUT_MS);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout])
      : timeout;
    const context: Context = {
      systemPrompt:
        request.allowSessionScope === false
          ? `${JUDGE_SYSTEM_PROMPT}\n\nThis privileged call must be reviewed independently. Set scope to "once"; session scope is not available.`
          : JUDGE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          timestamp: Date.now(),
          content: buildJudgeEvidence(request),
        },
      ],
      tools: [RULING_TOOL],
    };
    const stream = modelRuntime.stream(
      model,
      context,
      judgeStreamOptions(model, signal),
    );
    let final: AssistantMessage | undefined;
    for await (const event of stream) {
      if (event.type === "done") final = event.message;
      else if (event.type === "error") {
        if (event.reason === "aborted") throw new Error("aborted");
        throw new Error(
          event.error.errorMessage ?? "The reviewer stream failed.",
        );
      }
    }
    if (!final) throw new Error("The reviewer returned no response.");
    const call = final.content.find(
      (block) => block.type === "toolCall" && block.name === RULING_TOOL.name,
    );
    if (!call || call.type !== "toolCall") {
      throw new Error("The reviewer did not submit a ruling.");
    }
    const args = call.arguments as
      { verdict?: unknown; reason?: unknown; scope?: unknown } | undefined;
    if (args?.verdict !== "allow" && args?.verdict !== "deny") {
      throw new Error("The reviewer's ruling was malformed.");
    }
    const ruling: JudgeRuling = { verdict: args.verdict };
    if (typeof args.reason === "string" && args.reason.trim()) {
      ruling.reason = args.reason.trim();
    }
    if (args.scope === "session" || args.scope === "once") {
      ruling.scope = args.scope;
    }
    return ruling;
  }

  /** Keep the latest assistant text/thinking as gate review context. */
  private rememberAssistantTurn(sessionId: string, message: unknown): void {
    const live = this.liveSessions.get(sessionId);
    if (!live) return;
    const { role, content } = message as {
      role?: unknown;
      content?: unknown;
    };
    if (role !== "assistant" || !Array.isArray(content)) return;
    let text = "";
    let thinking = "";
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const candidate = block as {
        type?: unknown;
        text?: unknown;
        thinking?: unknown;
      };
      if (candidate.type === "text" && typeof candidate.text === "string") {
        text += candidate.text;
      } else if (
        candidate.type === "thinking" &&
        typeof candidate.thinking === "string"
      ) {
        thinking += candidate.thinking;
      }
    }
    live.turn.lastAssistantText = text.trim() || undefined;
    live.turn.lastThinking = thinking.trim() || undefined;
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
        if (event.type === "message_end") {
          this.rememberAssistantTurn(sessionId, event.message);
          this.emitContextUsage(session);
        }
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
      case "compaction_end":
        if (!event.aborted && !event.result && event.errorMessage) {
          this.options.emit({
            type: "session-error",
            sessionId,
            errorId: randomUUID(),
            message: event.errorMessage,
          });
        }
        break;
      case "auto_retry_end":
        if (!event.success) {
          this.options.emit({
            type: "session-error",
            sessionId,
            errorId: randomUUID(),
            message: `Retry failed after ${event.attempt} attempts: ${event.finalError ?? "Unknown error"}`,
          });
        }
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
  private getContextUsage(session: AgentSession): PineContextUsage | undefined {
    const usage = session.getContextUsage();
    if (!usage) return undefined;
    return {
      tokens: usage.tokens,
      contextWindow: usage.contextWindow,
      percent: usage.percent,
      cost: session.getSessionStats().cost,
    };
  }

  private emitContextUsage(
    session: AgentSession,
    contextUsage = this.getContextUsage(session),
  ): void {
    if (!contextUsage) return;
    this.options.emit({
      type: "context-usage",
      sessionId: session.sessionId,
      ...contextUsage,
    });
  }
}
