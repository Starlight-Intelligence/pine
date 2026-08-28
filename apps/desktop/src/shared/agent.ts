import type { PineSessionSummary } from "./sessions";

export const PROMPT_SESSION_CHANNEL = "sessions:prompt" as const;
export const ABORT_SESSION_CHANNEL = "sessions:abort" as const;
export const SESSION_EVENT_CHANNEL = "sessions:event" as const;

/**
 * How strictly Pine gates the agent's tool calls.
 *
 * - `ask-for-permission`: confirm every tool call before it runs.
 * - `agent-decides`: let the agent decide which actions need confirmation.
 * - `yolo`: close all sandboxes and grant the agent full permissions, keeping
 *   only whatever guardrails the pi harness itself provides.
 */
export type PineApprovalMode = "ask-for-permission" | "agent-decides" | "yolo";

/** Why a tool call needed an approval decision before it could proceed. */
export type PineApprovalTrigger =
  | "pre-execution"
  | "sandbox-denied"
  | "authorize-denied"
  | "destructive-pattern";

export type PineApprovalAction = "approve" | "reject" | "guide";

export interface RespondApprovalRequest {
  requestId: string;
  action: PineApprovalAction;
  /** Required when action is "guide": steering text fed back to the agent. */
  guidance?: string;
}

export const APPROVAL_RESPONSE_CHANNEL = "sessions:approval-response" as const;

export type PineJsonValue =
  | boolean
  | number
  | string
  | null
  | PineJsonValue[]
  | { [key: string]: PineJsonValue | undefined };

export type PineAgentRunState = "idle" | "running" | "aborting" | "failed";

export type PineAgentEvent =
  | {
      type: "run-state";
      sessionId: string;
      state: PineAgentRunState;
      error?: string;
    }
  | {
      type: "message-start" | "message-end";
      sessionId: string;
      messageId: string;
      message: PineJsonValue;
    }
  | {
      type: "message-update";
      sessionId: string;
      messageId: string;
      message: PineJsonValue;
      update: PineJsonValue;
    }
  | {
      type: "tool-start" | "tool-update" | "tool-end";
      sessionId: string;
      toolCallId: string;
      toolName: string;
      payload?: PineJsonValue;
      isError?: boolean;
    }
  | {
      type: "session-updated";
      sessionId: string;
      summary: PineSessionSummary;
    }
  | {
      type: "context-usage";
      sessionId: string;
      /** Estimated context tokens, or null when unknown (e.g. right after
       * compaction, before the next LLM response). */
      tokens: number | null;
      contextWindow: number;
      /** Context usage as percentage of the window, or null when unknown. */
      percent: number | null;
      /** Cumulative conversation cost in USD. */
      cost: number;
    }
  | {
      type: "approval-request";
      sessionId: string;
      requestId: string;
      toolCallId: string;
      toolName: string;
      trigger: PineApprovalTrigger;
      /** Tool arguments as captured when the gate escalated. */
      input?: PineJsonValue;
      /** Why the gate escalated (sandbox stderr excerpt, policy error, …). */
      evidence?: string;
    }
  | {
      type: "approval-decided";
      sessionId: string;
      requestId: string;
      toolCallId: string;
      verdict: "approved" | "denied";
      /** Who decided: the user (ask mode) or the model judge (agent-decides). */
      decidedBy: "user" | "judge";
      reason?: string;
    }
  | {
      type: "tool-review";
      sessionId: string;
      toolCallId: string;
      toolName: string;
      /** The auto-reviewer is holding the call before it may execute. */
      state: "reviewing";
    };

export interface PromptSessionRequest {
  message: string;
  target:
    | { kind: "new" }
    | {
        kind: "session";
        sessionId: string;
      };
  streamingBehavior?: "follow-up" | "steer";
  /** Sandbox/permission mode for the targeted session. Defaults to
   * `agent-decides` when omitted. */
  approvalMode?: PineApprovalMode;
}

export interface PromptSessionResult {
  accepted: boolean;
  session: PineSessionSummary;
}

export interface AbortSessionResult {
  aborted: boolean;
  sessionId?: string;
}

export type SessionEventListener = (event: PineAgentEvent) => void;
