import { Type } from "typebox";
import type { Tool } from "@earendil-works/pi-ai";
import type { PineAgentEvent } from "../shared/agent";
import type { GateDecision } from "./protocol";
import { matchDestructive } from "./destructive";

/** Mutable per-turn conversation context the reviewer can see. */
export interface GateTurnContext {
  lastUserPrompt?: string;
  lastAssistantText?: string;
  lastThinking?: string;
}

export interface JudgeRequest {
  toolName: string;
  trigger: "sandbox-denied" | "authorize-denied" | "destructive-pattern";
  /** Primary subject of the review (bash command or file path). */
  subject: string;
  /** Evidence for the escalation (sandbox stderr excerpt, policy error, …). */
  evidence?: string;
  signal?: AbortSignal;
  turn: GateTurnContext;
}

export interface JudgeRuling {
  verdict: "allow" | "deny";
  reason?: string;
  scope?: "once" | "session";
}

export interface UserApprovalRequest {
  trigger: "pre-execution" | "sandbox-denied" | "authorize-denied";
  toolCallId: string;
  toolName: string;
  subject?: string;
  /** The caller's imperative summary, shown on the approval card. */
  description?: string;
  evidence?: string;
  signal?: AbortSignal;
}

/**
 * Services a gate needs from the runtime: event emission, the model judge
 * (agent-decides), and the cross-process user approval round trip (ask mode).
 */
export interface GateHost {
  sessionId: string;
  emit(event: PineAgentEvent): void;
  turnContext(): GateTurnContext;
  judge(request: JudgeRequest): Promise<JudgeRuling>;
  /**
   * Route a review to the renderer. Resolves with the user's decision; the
   * runtime emits both the approval-request and approval-decided events.
   */
  requestUserApproval(request: UserApprovalRequest): Promise<GateDecision>;
}

export interface BashReviewInput {
  toolCallId: string;
  command: string;
  /** The caller's imperative summary, shown on the approval card. */
  description?: string;
  signal?: AbortSignal;
}

export interface FileReviewInput {
  toolCallId: string;
  toolName: string;
  path?: string;
  signal?: AbortSignal;
}

export interface DenialReviewInput {
  toolCallId: string;
  toolName: string;
  /** Bash command (sandbox denials) or file path (authorize denials). */
  subject: string;
  /** The caller's imperative summary, shown on the approval card. */
  description?: string;
  evidence: string;
  signal?: AbortSignal;
}

/**
 * The seam between Pine's deterministic sandbox and a decision maker. Ask mode
 * routes every review to the user; agent-decides routes escalations to the
 * model judge; YOLO has no gate at all.
 */
export interface ToolGate {
  /**
   * Decide whether a bash command may run. Ask mode prompts the user for every
   * command; agent-decides only escalates destructive-pattern matches.
   */
  reviewBashCommand(input: BashReviewInput): Promise<GateDecision>;
  /**
   * Ask-mode pre-execution confirmation for file-mutating tools. Agent-decides
   * allows file calls through and relies on denial escalation instead.
   */
  reviewFileCall(input: FileReviewInput): Promise<GateDecision>;
  /**
   * Decide whether a call the sandbox or folder policy denied may bypass it.
   * An allowance re-runs the exact call outside the restriction.
   */
  reviewDenial(
    kind: "sandbox" | "authorize",
    input: DenialReviewInput,
  ): Promise<GateDecision>;
  /** Session-scope approved bash commands skip the sandbox entirely. */
  isApprovedCommand(command: string): boolean;
  /** Reset per-turn state (escalation streaks). Called on every prompt. */
  resetTurn(): void;
}

const MAX_CONSECUTIVE_ESCALATIONS = 5;

/**
 * Ask mode: every review becomes an approval request in the renderer. The
 * runtime owns the cross-process round trip, including both events.
 */
export class UserApprovalGate implements ToolGate {
  constructor(private readonly host: GateHost) {}

  async reviewBashCommand(input: BashReviewInput): Promise<GateDecision> {
    return this.host.requestUserApproval({
      trigger: "pre-execution",
      toolCallId: input.toolCallId,
      toolName: "bash",
      subject: input.command,
      description: input.description,
      signal: input.signal,
    });
  }

  async reviewFileCall(input: FileReviewInput): Promise<GateDecision> {
    // Reads stay silent in ask mode: prompting on every read makes the
    // transcript unusable. Out-of-scope reads still surface through the
    // authorize-denial review, so the folder boundary is not lost.
    if (input.toolName === "read") {
      return Promise.resolve({ kind: "allow" });
    }
    return this.host.requestUserApproval({
      trigger: "pre-execution",
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      subject: input.path,
      signal: input.signal,
    });
  }

  async reviewDenial(
    kind: "sandbox" | "authorize",
    input: DenialReviewInput,
  ): Promise<GateDecision> {
    return this.host.requestUserApproval({
      trigger: kind === "sandbox" ? "sandbox-denied" : "authorize-denied",
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      subject: input.subject,
      description: input.description,
      evidence: input.evidence,
      signal: input.signal,
    });
  }

  isApprovedCommand(): boolean {
    // User approvals are scoped to a single execution; nothing is remembered.
    return false;
  }

  resetTurn(): void {}
}

/**
 * Agent-decides mode: deterministic checks stay in the sandbox; the model judge
 * only sees escalations (sandbox/authorize denials) and destructive-pattern
 * matches — exactly the "only sandbox-intercepted calls are reviewed" contract.
 * Judgments are fail-closed.
 */
export class AutoReviewGate implements ToolGate {
  private readonly approvedCommands = new Set<string>();
  private consecutiveEscalations = 0;
  private sequence = 0;

  constructor(private readonly host: GateHost) {}

  async reviewBashCommand(input: BashReviewInput): Promise<GateDecision> {
    if (this.isApprovedCommand(input.command)) return { kind: "allow" };
    const match = matchDestructive(input.command);
    if (!match) return { kind: "allow" };

    return this.judge("destructive-pattern", {
      toolCallId: input.toolCallId,
      toolName: "bash",
      subject: input.command,
      evidence: `Matched destructive-command heuristic "${match.name}": ${match.description}`,
      signal: input.signal,
    });
  }

  reviewFileCall(): Promise<GateDecision> {
    // File calls pass through; the folder policy plus denial escalation covers
    // them, per the "only sandbox-intercepted calls are reviewed" contract.
    return Promise.resolve({ kind: "allow" });
  }

  async reviewDenial(
    kind: "sandbox" | "authorize",
    input: DenialReviewInput,
  ): Promise<GateDecision> {
    if (kind === "sandbox" && this.isApprovedCommand(input.subject)) {
      return { kind: "allow" };
    }
    return this.judge(
      kind === "sandbox" ? "sandbox-denied" : "authorize-denied",
      {
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        subject: input.subject,
        evidence: input.evidence,
        signal: input.signal,
      },
    );
  }

  isApprovedCommand(command: string): boolean {
    return this.approvedCommands.has(normalizeCommand(command));
  }

  resetTurn(): void {
    this.consecutiveEscalations = 0;
  }

  private async judge(
    trigger: "sandbox-denied" | "authorize-denied" | "destructive-pattern",
    input: {
      toolCallId: string;
      toolName: string;
      subject: string;
      evidence: string;
      signal?: AbortSignal;
    },
  ): Promise<GateDecision> {
    if (this.consecutiveEscalations >= MAX_CONSECUTIVE_ESCALATIONS) {
      const reason =
        "Too many escalations in this turn; the auto-reviewer stopped responding. Change your approach or ask the user directly.";
      this.emitDecided(++this.sequence, input.toolCallId, "denied", reason);
      return { kind: "deny", reason };
    }

    this.consecutiveEscalations += 1;
    // Signal the transcript so the tool marker can show a review status.
    this.host.emit({
      type: "tool-review",
      sessionId: this.host.sessionId,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      state: "reviewing",
    });
    let ruling: JudgeRuling;
    try {
      ruling = await this.host.judge({
        toolName: input.toolName,
        trigger,
        subject: input.subject,
        evidence: input.evidence,
        signal: input.signal,
        turn: this.host.turnContext(),
      });
    } catch (error) {
      // Fail closed: an unavailable reviewer must not widen permissions.
      const reason = `Auto-review unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this.emitDecided(this.sequence, input.toolCallId, "denied", reason);
      return { kind: "deny", reason };
    }

    if (ruling.verdict === "allow") {
      this.consecutiveEscalations = 0;
      if (ruling.scope === "session") {
        this.approvedCommands.add(normalizeCommand(input.subject));
      }
      this.emitDecided(
        this.sequence,
        input.toolCallId,
        "approved",
        ruling.reason,
      );
      return { kind: "allow", scope: ruling.scope };
    }
    const denyReason = ruling.reason ?? "The auto-reviewer denied this call.";
    this.emitDecided(this.sequence, input.toolCallId, "denied", denyReason);
    return { kind: "deny", reason: denyReason };
  }

  private emitDecided(
    sequence: number,
    toolCallId: string,
    verdict: "approved" | "denied",
    reason?: string,
  ): void {
    this.host.emit({
      type: "approval-decided",
      sessionId: this.host.sessionId,
      requestId: `judge-${sequence}`,
      toolCallId,
      verdict,
      decidedBy: "judge",
      reason,
    });
  }
}

/** Structured-output contract for the model judge. */
export const RULING_TOOL: Tool = {
  name: "submit_ruling",
  description:
    "Submit your verdict for the reviewed tool call. Call this exactly once and do not answer in plain text.",
  parameters: Type.Object({
    verdict: Type.Union([Type.Literal("allow"), Type.Literal("deny")], {
      description: "Whether the agent may proceed with the call.",
    }),
    reason: Type.String({
      description:
        "Short explanation of the verdict. For denials, make it actionable: tell the agent what safer alternative to use. Write it in the same language as the user's messages.",
    }),
    scope: Type.Optional(
      Type.Union([Type.Literal("once"), Type.Literal("session")], {
        description:
          "once (default): the allowance applies to this single execution. session: identical commands are allowed without re-review for the rest of the session.",
      }),
    ),
  }),
};

export function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, " ").trim();
}
