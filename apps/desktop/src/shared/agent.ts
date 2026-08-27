import type { PineSessionSummary } from "./sessions";

export const PROMPT_SESSION_CHANNEL = "sessions:prompt" as const;
export const ABORT_SESSION_CHANNEL = "sessions:abort" as const;
export const SESSION_EVENT_CHANNEL = "sessions:event" as const;

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
