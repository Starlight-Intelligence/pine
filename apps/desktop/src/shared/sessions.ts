export const SEARCH_SESSIONS_CHANNEL = "sessions:search" as const;
export const RESUME_SESSION_CHANNEL = "sessions:resume" as const;
export const LOAD_SESSION_MESSAGES_CHANNEL = "sessions:messages" as const;
export const DELETE_SESSION_CHANNEL = "sessions:delete" as const;

export type PineToolCallStatus = "pending" | "running" | "complete" | "error";

export interface PineToolCall {
  id: string;
  name: string;
  status: PineToolCallStatus;
  input?: unknown;
  output?: unknown;
  startedAt?: string;
  durationMs?: number;
}

export interface PineTextMessage {
  createdAt: string;
  id: string;
  role: "assistant" | "user";
  text: string;
  thinking?: string;
  thinkingDurationMs?: number;
  toolCalls?: PineToolCall[];
}

export interface PineSessionSummary {
  createdAt: string;
  id: string;
  messageCount: number;
  name?: string;
  preview?: string;
  updatedAt: string;
}

export interface SessionSearchResult extends PineSessionSummary {
  snippet?: string;
}

export interface SearchSessionsRequest {
  query: string;
}

export interface SearchSessionsResult {
  sessions: SessionSearchResult[];
}

export interface ResumeSessionRequest {
  sessionId: string;
}

export interface ResumeSessionResult {
  session: PineSessionSummary;
}

export interface DeleteSessionRequest {
  sessionId: string;
}

export interface DeleteSessionResult {
  deleted: boolean;
}

export interface LoadSessionMessagesRequest {
  before?: string;
  limit?: number;
  sessionId: string;
}

export interface LoadSessionMessagesResult {
  hasMore: boolean;
  messages: PineTextMessage[];
  nextBefore?: string;
}
