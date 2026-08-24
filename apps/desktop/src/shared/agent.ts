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
    };

export interface PromptSessionRequest {
  message: string;
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
