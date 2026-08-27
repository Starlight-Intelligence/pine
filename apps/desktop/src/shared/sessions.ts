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

export type PineContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "toolCall"; toolCall: PineToolCall };

export interface PineTextMessage {
  createdAt: string;
  id: string;
  role: "assistant" | "user";
  blocks: PineContentBlock[];
  thinkingDurationMs?: number;
}

/**
 * Parse a pi message `content` value (a string, or an array of
 * `text`/`thinking`/`toolCall` blocks) into ordered Pine content blocks.
 * Shared by the main-process read-back path and the renderer event store so
 * both preserve the original block order instead of flattening it.
 */
export function parseContentBlocks(content: unknown): PineContentBlock[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part): PineContentBlock[] => {
    if (typeof part !== "object" || part === null || Array.isArray(part)) {
      return [];
    }
    if (part.type === "text" && typeof part.text === "string") {
      return [{ type: "text", text: part.text }];
    }
    if (part.type === "thinking" && typeof part.thinking === "string") {
      return [{ type: "thinking", thinking: part.thinking }];
    }
    if (
      part.type === "toolCall" &&
      typeof part.id === "string" &&
      typeof part.name === "string"
    ) {
      return [
        {
          type: "toolCall",
          toolCall: {
            id: part.id,
            name: part.name,
            status: "pending" as const,
            ...(part.arguments !== undefined ? { input: part.arguments } : {}),
          },
        },
      ];
    }
    return [];
  });
}

export function contentBlocksToText(
  blocks: readonly PineContentBlock[],
): string {
  return blocks
    .filter((block) => block.type === "text")
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n");
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
