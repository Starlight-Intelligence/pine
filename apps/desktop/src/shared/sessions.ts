export const SEARCH_SESSIONS_CHANNEL = "sessions:search" as const;
export const RESUME_SESSION_CHANNEL = "sessions:resume" as const;
export const LOAD_SESSION_MESSAGES_CHANNEL = "sessions:messages" as const;

export interface PineTextMessage {
  createdAt: string;
  id: string;
  role: "assistant" | "user";
  text: string;
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
