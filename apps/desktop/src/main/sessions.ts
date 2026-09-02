import {
  JsonlSessionRepo,
  type JsonlSessionMetadata,
  type Session,
  type SessionTreeEntry,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  LoadSessionMessagesResult,
  PineSessionSummary,
  PineTextMessage,
  SessionSearchResult,
} from "../shared/sessions";
import { attachmentMessagePreview } from "../shared/attachments";
import { parseMessageBlocks } from "../shared/sessions";

const SEARCH_RESULT_LIMIT = 50;
const SEARCH_INDEX_FILE = "session-search.sqlite";
const SNIPPET_START = "\u0001";
const SNIPPET_END = "\u0002";
const SEARCH_INDEX_SCHEMA_VERSION = 2;

export interface PineSessionHandle {
  session: Session<JsonlSessionMetadata>;
  summary: PineSessionSummary;
}

export interface PineSessionDescriptor {
  sessionFile: string;
  summary: PineSessionSummary;
}

export interface ProjectSessionServiceOptions {
  cacheRoot: string;
  cwd: string;
  sessionsRoot: string;
}

interface SessionDocument extends PineSessionSummary {
  body: string;
  hasUserMessage: boolean;
  path: string;
  sourceMtimeMs: number;
}

interface SessionSearchRow {
  created_at: string;
  message_count: number;
  preview: string | null;
  session_id: string;
  snippet: string | null;
  title: string | null;
  updated_at: string;
}

interface IndexedSessionRow {
  message_count: number;
  session_id: string;
  source_mtime_ms: number;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .flatMap((part) => {
      if (typeof part !== "object" || part === null) return [];
      if ("text" in part && typeof part.text === "string") return [part.text];
      return [];
    })
    .join("\n");
}

function thinkingDurationMs(
  entry: Extract<SessionTreeEntry, { type: "message" }>,
): number | undefined {
  const startedAt = entry.message.timestamp;
  const endedAt = Date.parse(entry.timestamp);
  if (typeof startedAt !== "number" || Number.isNaN(endedAt)) return undefined;
  return Math.max(0, endedAt - startedAt);
}

function textFromMessage(
  entry: Extract<SessionTreeEntry, { type: "message" }>,
): string {
  const message = entry.message;

  if ("content" in message) return textFromContent(message.content);
  if ("summary" in message && typeof message.summary === "string") {
    return message.summary;
  }
  if ("command" in message && typeof message.command === "string") {
    return `${message.command}\n${"output" in message && typeof message.output === "string" ? message.output : ""}`;
  }

  return "";
}

function textMessages(entries: SessionTreeEntry[]): PineTextMessage[] {
  const messages: PineTextMessage[] = [];
  const toolOwners = new Map<string, PineTextMessage>();

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const entryMessage = entry.message;
    if (
      entryMessage.role === "toolResult" &&
      "toolCallId" in entryMessage &&
      typeof entryMessage.toolCallId === "string" &&
      "isError" in entryMessage &&
      typeof entryMessage.isError === "boolean" &&
      "content" in entryMessage
    ) {
      const owner = toolOwners.get(entryMessage.toolCallId);
      if (!owner) continue;
      owner.blocks = owner.blocks.map((block) => {
        if (
          block.type !== "toolCall" ||
          block.toolCall.id !== entryMessage.toolCallId
        ) {
          return block;
        }
        return {
          ...block,
          toolCall: {
            ...block.toolCall,
            status: entryMessage.isError
              ? ("error" as const)
              : ("complete" as const),
            output: entryMessage.content,
          },
        };
      });
      continue;
    }
    if (entry.message.role !== "user" && entry.message.role !== "assistant") {
      continue;
    }

    const blocks = parseMessageBlocks(entry.message);
    const hasThinking = blocks.some((block) => block.type === "thinking");
    if (blocks.length === 0) continue;
    const messageTimestamp = entry.message.timestamp;
    const message: PineTextMessage = {
      createdAt:
        typeof messageTimestamp === "number"
          ? new Date(messageTimestamp).toISOString()
          : entry.timestamp,
      id: entry.id,
      role: entry.message.role,
      blocks,
      ...(hasThinking ? { thinkingDurationMs: thinkingDurationMs(entry) } : {}),
    };
    messages.push(message);
    for (const block of blocks) {
      if (block.type === "toolCall") toolOwners.set(block.toolCall.id, message);
    }
  }

  for (const message of messages) {
    message.blocks = message.blocks.map((block) =>
      block.type === "toolCall" && block.toolCall.status === "pending"
        ? {
            ...block,
            toolCall: { ...block.toolCall, status: "error" as const },
          }
        : block,
    );
  }

  return messages;
}

function firstUserMessage(entries: SessionTreeEntry[]): string | undefined {
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message.role !== "user") continue;
    const text = attachmentMessagePreview(textFromMessage(entry)).trim();
    if (text) return text;
  }

  return undefined;
}

function hasUserMessage(entries: SessionTreeEntry[]): boolean {
  return entries.some(
    (entry) => entry.type === "message" && entry.message.role === "user",
  );
}

function sessionName(entries: SessionTreeEntry[]): string | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type === "session_info" && entry.name?.trim()) {
      return entry.name.trim();
    }
  }

  return undefined;
}

function sessionBody(entries: SessionTreeEntry[]): string {
  return entries
    .flatMap((entry) => {
      if (
        entry.type === "message" &&
        (entry.message.role === "user" || entry.message.role === "assistant")
      ) {
        const text = textFromMessage(entry);
        return [
          entry.message.role === "user" ? attachmentMessagePreview(text) : text,
        ];
      }
      if (entry.type === "compaction" || entry.type === "branch_summary") {
        return [entry.summary];
      }
      if (entry.type === "custom_message" && entry.display) {
        return [textFromContent(entry.content)];
      }
      return [];
    })
    .filter(Boolean)
    .join("\n");
}

function sessionUpdatedAt(
  entries: SessionTreeEntry[],
  createdAt: string,
  sourceMtimeMs: number,
): string {
  let latestTimestamp = Date.parse(createdAt);
  if (Number.isNaN(latestTimestamp)) latestTimestamp = sourceMtimeMs;

  for (const entry of entries) {
    if (
      entry.type !== "message" ||
      (entry.message.role !== "user" && entry.message.role !== "assistant")
    ) {
      continue;
    }

    const messageTimestamp = entry.message.timestamp;
    const timestamp =
      typeof messageTimestamp === "number"
        ? messageTimestamp
        : Date.parse(entry.timestamp);
    if (!Number.isNaN(timestamp)) {
      latestTimestamp = Math.max(latestTimestamp, timestamp);
    }
  }

  return new Date(latestTimestamp).toISOString();
}

function rowToSearchResult(row: SessionSearchRow): SessionSearchResult {
  return {
    id: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count,
    ...(row.title ? { name: row.title } : {}),
    ...(row.preview ? { preview: row.preview } : {}),
    ...(row.snippet ? { snippet: row.snippet } : {}),
  };
}

function quoteFtsQuery(query: string): string {
  return `"${query.replaceAll('"', '""')}"`;
}

export class ProjectSessionService {
  private readonly database: DatabaseSync;
  private readonly environment: NodeExecutionEnv;
  private readonly liveSessionIds = new Set<string>();
  private readonly repository: JsonlSessionRepo;

  private constructor(
    private readonly cwd: string,
    sessionsRoot: string,
    databasePath: string,
  ) {
    this.environment = new NodeExecutionEnv({ cwd });
    this.repository = new JsonlSessionRepo({
      fs: this.environment,
      sessionsRoot,
    });
    this.database = new DatabaseSync(databasePath, { timeout: 5_000 });
    const schemaVersion = this.database.prepare("PRAGMA user_version").get() as
      { user_version: number } | undefined;
    if (schemaVersion?.user_version !== SEARCH_INDEX_SCHEMA_VERSION) {
      this.database.exec("DROP TABLE IF EXISTS session_search");
    }
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE VIRTUAL TABLE IF NOT EXISTS session_search USING fts5(
        session_id UNINDEXED,
        path UNINDEXED,
        created_at UNINDEXED,
        updated_at UNINDEXED,
        title,
        body,
        preview UNINDEXED,
        message_count UNINDEXED,
        source_mtime_ms UNINDEXED,
        tokenize = 'trigram'
      );
      PRAGMA user_version = ${SEARCH_INDEX_SCHEMA_VERSION};
    `);
  }

  static async create(
    options: ProjectSessionServiceOptions,
  ): Promise<ProjectSessionService> {
    const cacheDirectory = options.cacheRoot;
    await mkdir(cacheDirectory, { recursive: true });
    await mkdir(options.sessionsRoot, { recursive: true });

    return new ProjectSessionService(
      options.cwd,
      options.sessionsRoot,
      path.join(cacheDirectory, SEARCH_INDEX_FILE),
    );
  }

  async createSession(): Promise<PineSessionHandle> {
    const session = await this.repository.create({ cwd: this.cwd });
    const metadata = await session.getMetadata();
    this.liveSessionIds.add(metadata.id);

    return {
      session,
      summary: {
        id: metadata.id,
        createdAt: metadata.createdAt,
        updatedAt: metadata.createdAt,
        messageCount: 0,
      },
    };
  }

  async resumeSession(sessionId: string): Promise<PineSessionHandle> {
    const metadata = (await this.repository.list()).find(
      (session) => session.id === sessionId,
    );
    if (!metadata) throw new Error("Session not found in the active project.");

    const session = await this.repository.open(metadata);
    this.liveSessionIds.add(metadata.id);
    return {
      session,
      summary: await this.readSessionDocument(metadata, undefined, session),
    };
  }

  async describeSession(sessionId: string): Promise<PineSessionDescriptor> {
    const metadata = (await this.repository.list()).find(
      (session) => session.id === sessionId,
    );
    if (!metadata) throw new Error("Session not found in the active project.");

    return {
      sessionFile: metadata.path,
      summary: await this.readSessionDocument(metadata),
    };
  }

  async loadMessages(
    sessionId: string,
    before?: string,
    limit = 50,
  ): Promise<LoadSessionMessagesResult> {
    const metadata = (await this.repository.list()).find(
      (session) => session.id === sessionId,
    );
    if (!metadata) throw new Error("Session not found in the active project.");

    const session = await this.repository.open(metadata);
    const messages = textMessages(await session.getEntries());
    const end = before
      ? messages.findIndex((message) => message.id === before)
      : messages.length;
    if (end < 0) throw new Error("Session message cursor not found.");

    const start = Math.max(0, end - limit);
    const page = messages.slice(start, end);
    return {
      hasMore: start > 0,
      messages: page,
      ...(start > 0 && page[0] ? { nextBefore: page[0].id } : {}),
    };
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const metadata = (await this.repository.list()).find(
      (session) => session.id === sessionId,
    );
    if (!metadata) return false;

    await this.repository.delete(metadata);
    this.liveSessionIds.delete(sessionId);
    this.database
      .prepare("DELETE FROM session_search WHERE session_id = ?")
      .run(sessionId);
    return true;
  }

  async renameSession(
    sessionId: string,
    name: string,
  ): Promise<PineSessionSummary> {
    const metadata = (await this.repository.list()).find(
      (session) => session.id === sessionId,
    );
    if (!metadata) throw new Error("Session not found in the active project.");

    const session = await this.repository.open(metadata);
    await session.appendSessionName(name);
    const summary = await this.readSessionDocument(
      metadata,
      undefined,
      session,
    );
    await this.refreshIndex();
    return summary;
  }

  async search(query: string): Promise<SessionSearchResult[]> {
    await this.refreshIndex();
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      const rows = this.database
        .prepare(
          `SELECT session_id, created_at, updated_at, title, preview,
                  message_count, NULL AS snippet
             FROM session_search
            ORDER BY updated_at DESC
            LIMIT ?`,
        )
        .all(SEARCH_RESULT_LIMIT) as unknown as SessionSearchRow[];
      return rows.map(rowToSearchResult);
    }

    const characterCount = Array.from(normalizedQuery).length;
    const rows =
      characterCount < 3
        ? (this.database
            .prepare(
              `SELECT session_id, created_at, updated_at, title, preview,
                      message_count,
                      CASE WHEN body LIKE '%' || ? || '%'
                        THEN substr(
                          body,
                          max(1, instr(lower(body), lower(?)) - 60),
                          180
                        )
                        ELSE preview END AS snippet
                 FROM session_search
                WHERE title LIKE '%' || ? || '%'
                   OR body LIKE '%' || ? || '%'
                ORDER BY updated_at DESC
                LIMIT ?`,
            )
            .all(
              normalizedQuery,
              normalizedQuery,
              normalizedQuery,
              normalizedQuery,
              SEARCH_RESULT_LIMIT,
            ) as unknown as SessionSearchRow[])
        : (this.database
            .prepare(
              `SELECT session_id, created_at, updated_at, title, preview,
                      message_count,
                      snippet(session_search, 5, ?, ?, ' … ', 24) AS snippet
                 FROM session_search
                WHERE session_search MATCH ?
                ORDER BY bm25(session_search, 0, 0, 0, 0, 8, 1), updated_at DESC
                LIMIT ?`,
            )
            .all(
              SNIPPET_START,
              SNIPPET_END,
              quoteFtsQuery(normalizedQuery),
              SEARCH_RESULT_LIMIT,
            ) as unknown as SessionSearchRow[]);

    return rows.map(rowToSearchResult);
  }

  async dispose(): Promise<void> {
    this.database.close();
    await this.environment.cleanup();
  }

  private async refreshIndex(): Promise<void> {
    const metadataList = await this.repository.list();
    const indexedRows = this.database
      .prepare(
        "SELECT session_id, source_mtime_ms, message_count FROM session_search",
      )
      .all() as unknown as IndexedSessionRow[];
    const indexedSessions = new Map(
      indexedRows.map((row) => [row.session_id, row]),
    );
    const retainedSessionIds = new Set<string>();
    const changedDocuments: SessionDocument[] = [];

    for (const metadata of metadataList) {
      const sourceMtimeMs = (await stat(metadata.path)).mtimeMs;
      const indexedSession = indexedSessions.get(metadata.id);
      if (indexedSession?.source_mtime_ms === sourceMtimeMs) {
        if (Number(indexedSession.message_count) > 0) {
          retainedSessionIds.add(metadata.id);
        } else if (!this.liveSessionIds.has(metadata.id)) {
          await this.repository.delete(metadata);
        }
        continue;
      }

      const document = await this.readSessionDocument(metadata, sourceMtimeMs);
      if (!document.hasUserMessage) {
        if (!this.liveSessionIds.has(metadata.id)) {
          await this.repository.delete(metadata);
        }
        continue;
      }

      retainedSessionIds.add(metadata.id);
      changedDocuments.push(document);
    }

    const deleteStatement = this.database.prepare(
      "DELETE FROM session_search WHERE session_id = ?",
    );
    const insertStatement = this.database.prepare(
      `INSERT INTO session_search(
        session_id, path, created_at, updated_at, title, body, preview,
        message_count, source_mtime_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const indexedSessionId of indexedSessions.keys()) {
        if (!retainedSessionIds.has(indexedSessionId)) {
          deleteStatement.run(indexedSessionId);
        }
      }
      for (const document of changedDocuments) {
        deleteStatement.run(document.id);
        insertStatement.run(
          document.id,
          document.path,
          document.createdAt,
          document.updatedAt,
          document.name ?? null,
          document.body,
          document.preview ?? null,
          document.messageCount,
          document.sourceMtimeMs,
        );
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private async readSessionDocument(
    metadata: JsonlSessionMetadata,
    sourceMtimeMs?: number,
    openedSession?: Session<JsonlSessionMetadata>,
  ): Promise<SessionDocument> {
    const session = openedSession ?? (await this.repository.open(metadata));
    const entries = await session.getEntries();
    const preview = firstUserMessage(entries);
    const name = sessionName(entries);
    const resolvedSourceMtimeMs =
      sourceMtimeMs ?? (await stat(metadata.path)).mtimeMs;

    return {
      id: metadata.id,
      path: metadata.path,
      createdAt: metadata.createdAt,
      updatedAt: sessionUpdatedAt(
        entries,
        metadata.createdAt,
        resolvedSourceMtimeMs,
      ),
      messageCount: entries.filter((entry) => entry.type === "message").length,
      hasUserMessage: hasUserMessage(entries),
      sourceMtimeMs: resolvedSourceMtimeMs,
      body: sessionBody(entries),
      ...(name ? { name } : {}),
      ...(preview ? { preview } : {}),
    };
  }
}
