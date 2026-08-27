import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PineAgentEvent, PineJsonValue } from "@/shared/agent";
import type { PineSessionSummary } from "@/shared/sessions";
import { useSessionStore } from "../session";

const session: PineSessionSummary = {
  id: "019cfe51-7166-79b9-a5b9-c652fcca9eab",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
  messageCount: 1,
  name: "Session search",
};

describe("session store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("keeps the newest search response when requests finish out of order", async () => {
    let resolveFirst: ((value: { sessions: [] }) => void) | undefined;
    const firstResult = new Promise<{ sessions: [] }>((resolve) => {
      resolveFirst = resolve;
    });
    const searchSessions = vi
      .fn()
      .mockReturnValueOnce(firstResult)
      .mockResolvedValueOnce({ sessions: [session] });
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: { searchSessions },
    });
    const store = useSessionStore();

    const firstSearch = store.search("old");
    await store.search("new");
    resolveFirst?.({ sessions: [] });
    await firstSearch;

    expect(store.searchResults).toEqual([session]);
    expect(store.isSearching).toBe(false);
  });

  it("activates a resumed session", async () => {
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        loadSessionMessages: vi.fn().mockResolvedValue({
          hasMore: false,
          messages: [],
        }),
        resumeSession: vi.fn().mockResolvedValue({ session }),
      },
    });
    const store = useSessionStore();

    await expect(store.resume(session.id)).resolves.toEqual(session);
    expect(store.activeSession).toEqual(session);
  });

  it("reuses the cached transcript array across resumes without re-fetching", async () => {
    const loadedMessages = [
      {
        id: "m1",
        blocks: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        role: "assistant" as const,
      },
    ];
    const loadSessionMessages = vi.fn().mockResolvedValue({
      hasMore: false,
      messages: loadedMessages,
    });
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        loadSessionMessages,
        resumeSession: vi.fn().mockResolvedValue({ session }),
      },
    });
    const store = useSessionStore();

    await store.resume(session.id);
    const firstArray = store.messages;
    expect(loadSessionMessages).toHaveBeenCalledTimes(1);

    // Switching back to the same session restores the same array reference and
    // must not re-fetch from disk.
    await store.resume(session.id);
    expect(store.messages).toBe(firstArray);
    expect(loadSessionMessages).toHaveBeenCalledTimes(1);
  });

  it("evicts a session from the cache when it is deleted", async () => {
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        deleteSession: vi.fn().mockResolvedValue({ deleted: true }),
        loadSessionMessages: vi.fn().mockResolvedValue({
          hasMore: false,
          messages: [],
        }),
        resumeSession: vi.fn().mockResolvedValue({ session }),
      },
    });
    const store = useSessionStore();

    await store.resume(session.id);
    await store.deleteSession(session.id);

    // Re-resume must re-fetch because the cached slice was dropped.
    expect(store.messages).toEqual([]);
  });

  it("keeps the indexed title when the live resume summary omits it", async () => {
    const liveSession = { ...session };
    delete liveSession.name;
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        loadSessionMessages: vi.fn().mockResolvedValue({
          hasMore: false,
          messages: [],
        }),
        resumeSession: vi.fn().mockResolvedValue({ session: liveSession }),
      },
    });
    const store = useSessionStore();
    store.recentSessions = [session];

    await store.resume(session.id);

    expect(store.activeSession?.name).toBe("Session search");
  });

  it("loads recent sessions separately from search results", async () => {
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        searchSessions: vi.fn().mockResolvedValue({ sessions: [session] }),
      },
    });
    const store = useSessionStore();

    await expect(store.loadRecent()).resolves.toEqual([session]);

    expect(store.recentSessions).toEqual([session]);
    expect(store.searchResults).toEqual([]);
    expect(store.isLoadingRecent).toBe(false);
  });

  it("starts a new session without persisting it", async () => {
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        loadSessionMessages: vi.fn().mockResolvedValue({
          hasMore: false,
          messages: [],
        }),
        resumeSession: vi.fn().mockResolvedValue({ session }),
      },
    });
    const store = useSessionStore();
    await store.resume(session.id);

    store.startDraft();

    expect(store.activeSession).toBeNull();
  });

  it("adds a newly prompted session to the recent list immediately", async () => {
    const promptSession = vi.fn().mockResolvedValue({ session });
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        promptSession,
      },
    });
    const store = useSessionStore();

    await store.prompt("Describe the task");

    expect(store.recentSessions).toEqual([
      expect.objectContaining({
        id: session.id,
        preview: "Describe the task",
      }),
    ]);
    expect(store.activeSession?.id).toBe(session.id);
    expect(promptSession).toHaveBeenCalledWith({
      message: "Describe the task",
      target: { kind: "new" },
    });
  });

  it("targets the active session when sending a follow-up", async () => {
    const promptSession = vi.fn().mockResolvedValue({ session });
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        loadSessionMessages: vi.fn().mockResolvedValue({
          hasMore: false,
          messages: [],
        }),
        promptSession,
        resumeSession: vi.fn().mockResolvedValue({ session }),
      },
    });
    const store = useSessionStore();
    await store.resume(session.id);

    await store.prompt("Continue here", session.id);

    expect(promptSession).toHaveBeenCalledWith({
      message: "Continue here",
      target: { kind: "session", sessionId: session.id },
    });
  });

  it("removes a deleted session and clears it when active", async () => {
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        deleteSession: vi.fn().mockResolvedValue({ deleted: true }),
        loadSessionMessages: vi.fn().mockResolvedValue({
          hasMore: false,
          messages: [],
        }),
        resumeSession: vi.fn().mockResolvedValue({ session }),
      },
    });
    const store = useSessionStore();
    store.recentSessions = [session];
    await store.resume(session.id);

    await expect(store.deleteSession(session.id)).resolves.toBe(true);

    expect(store.recentSessions).toEqual([]);
    expect(store.activeSession).toBeNull();
    expect(store.messages).toEqual([]);
  });

  it("builds a text transcript from streaming agent events", async () => {
    let listener: ((event: PineAgentEvent) => void) | undefined;
    let resolvePrompt:
      ((value: { session: PineSessionSummary }) => void) | undefined;
    const promptResult = new Promise<{ session: PineSessionSummary }>(
      (resolve) => {
        resolvePrompt = resolve;
      },
    );
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        onSessionEvent: vi.fn((nextListener) => {
          listener = nextListener;
          return () => undefined;
        }),
        promptSession: vi.fn().mockReturnValue(promptResult),
      },
    });
    const store = useSessionStore();
    store.connectAgentEvents();
    const prompt = store.prompt("Hello");

    listener?.({
      type: "run-state",
      sessionId: session.id,
      state: "running",
    });
    listener?.({
      type: "message-start",
      sessionId: session.id,
      messageId: "019cfe51-7166-79b9-a5b9-c652fcca9eac",
      message: {
        role: "assistant",
        timestamp: 1_784_000_000_000,
        content: [{ type: "text", text: "Hello" }],
      },
    });
    listener?.({
      type: "message-end",
      sessionId: session.id,
      messageId: "019cfe51-7166-79b9-a5b9-c652fcca9eac",
      message: {
        role: "assistant",
        timestamp: 1_784_000_000_000,
        content: [
          { type: "thinking", thinking: "Check the incoming message." },
          { type: "text", text: "Hello, world" },
        ],
      },
    });
    resolvePrompt?.({ session });
    await prompt;

    expect(store.messages).toEqual([
      expect.objectContaining({
        id: "019cfe51-7166-79b9-a5b9-c652fcca9eac",
        role: "assistant",
        status: "complete",
        blocks: [
          { type: "thinking", thinking: "Check the incoming message." },
          { type: "text", text: "Hello, world" },
        ],
      }),
    ]);
    expect(store.isRunning).toBe(true);
  });

  it("tracks thinking completion and tool execution by call id", async () => {
    vi.useFakeTimers();
    try {
      let listener: ((event: PineAgentEvent) => void) | undefined;
      let resolvePrompt:
        ((value: { session: PineSessionSummary }) => void) | undefined;
      const promptResult = new Promise<{ session: PineSessionSummary }>(
        (resolve) => {
          resolvePrompt = resolve;
        },
      );
      Object.defineProperty(window, "pine", {
        configurable: true,
        value: {
          onSessionEvent: vi.fn((nextListener) => {
            listener = nextListener;
            return () => undefined;
          }),
          promptSession: vi.fn().mockReturnValue(promptResult),
        },
      });
      const store = useSessionStore();
      store.connectAgentEvents();
      const prompt = store.prompt("Inspect the file");
      const messageId = "assistant-with-tool";

      listener?.({
        type: "run-state",
        sessionId: session.id,
        state: "running",
      });
      vi.setSystemTime(1_000);
      listener?.({
        type: "message-update",
        sessionId: session.id,
        messageId,
        message: {
          role: "assistant",
          timestamp: 500,
          content: [{ type: "thinking", thinking: "Inspect.\nRead the file." }],
        },
        update: { type: "thinking_delta" },
      });
      vi.setSystemTime(3_500);
      listener?.({
        type: "message-update",
        sessionId: session.id,
        messageId,
        message: {
          role: "assistant",
          timestamp: 500,
          content: [{ type: "thinking", thinking: "Inspect.\nRead the file." }],
        },
        update: { type: "thinking_end" },
      });
      listener?.({
        type: "message-end",
        sessionId: session.id,
        messageId,
        message: {
          role: "assistant",
          timestamp: 500,
          content: [
            { type: "thinking", thinking: "Inspect.\nRead the file." },
            {
              type: "toolCall",
              id: "call-read",
              name: "read",
              arguments: { path: "/project/src/main.ts" },
            },
          ],
        },
      });
      listener?.({
        type: "tool-start",
        sessionId: session.id,
        toolCallId: "call-read",
        toolName: "read",
        payload: { path: "/project/src/main.ts" },
      });
      vi.setSystemTime(4_500);
      listener?.({
        type: "tool-end",
        sessionId: session.id,
        toolCallId: "call-read",
        toolName: "read",
        payload: { content: [{ type: "text", text: "export {}" }] },
        isError: false,
      });
      resolvePrompt?.({ session });
      await prompt;

      expect(store.messages).toEqual([
        expect.objectContaining({
          id: messageId,
          thinkingDurationMs: 2_500,
          thinkingStatus: "complete",
          blocks: [
            { type: "thinking", thinking: "Inspect.\nRead the file." },
            {
              type: "toolCall",
              toolCall: expect.objectContaining({
                durationMs: 1_000,
                id: "call-read",
                input: { path: "/project/src/main.ts" },
                status: "complete",
              }),
            },
          ],
        }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces progressively streamed tool arguments before execution", async () => {
    let listener: ((event: PineAgentEvent) => void) | undefined;
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        onSessionEvent: vi.fn((nextListener) => {
          listener = nextListener;
          return () => undefined;
        }),
        promptSession: vi.fn().mockResolvedValue({ accepted: true, session }),
      },
    });
    const store = useSessionStore();
    store.connectAgentEvents();
    await store.prompt("go");
    const sessionId = session.id;
    const messageId = "assistant-streaming-tool";

    listener?.({ type: "run-state", sessionId, state: "running" });
    const emitToolUpdate = (
      arguments_: Record<string, PineJsonValue> | undefined,
    ) => {
      listener?.({
        type: "message-update",
        sessionId,
        messageId,
        update: { type: "toolcall_delta", delta: "..." },
        message: {
          role: "assistant",
          timestamp: 1000,
          content: [
            arguments_ === undefined
              ? { type: "toolCall", id: "call-bash", name: "bash" }
              : {
                  type: "toolCall",
                  id: "call-bash",
                  name: "bash",
                  arguments: arguments_,
                },
          ],
        },
      });
    };

    // toolcall_start: no arguments parsed yet.
    emitToolUpdate(undefined);
    let blocks = store.messages[0]?.blocks ?? [];
    expect(
      blocks[0]?.type === "toolCall" && blocks[0].toolCall.input,
    ).toBeUndefined();

    // First delta: partial arguments parsed from the stream so far.
    emitToolUpdate({ command: "bun run" });
    blocks = store.messages[0]?.blocks ?? [];
    expect(blocks[0]?.type === "toolCall" && blocks[0].toolCall.input).toEqual({
      command: "bun run",
    });

    // Later delta: arguments grow — never shadowed by the stale snapshot.
    emitToolUpdate({ command: "bun run check" });
    blocks = store.messages[0]?.blocks ?? [];
    expect(blocks[0]?.type === "toolCall" && blocks[0].toolCall.input).toEqual({
      command: "bun run check",
    });

    // Execution start pins the complete payload without regressions.
    listener?.({
      type: "tool-start",
      sessionId,
      toolCallId: "call-bash",
      toolName: "bash",
      payload: { command: "bun run check", description: "Checks types" },
    });
    blocks = store.messages[0]?.blocks ?? [];
    expect(blocks[0]?.type === "toolCall" && blocks[0].toolCall.input).toEqual({
      command: "bun run check",
      description: "Checks types",
    });
  });

  it("keeps the prompt title when a runtime summary omits display fields", async () => {
    let listener: ((event: PineAgentEvent) => void) | undefined;
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        onSessionEvent: vi.fn((nextListener) => {
          listener = nextListener;
          return () => undefined;
        }),
        promptSession: vi.fn().mockResolvedValue({ session }),
      },
    });
    const store = useSessionStore();
    store.connectAgentEvents();
    await store.prompt("Describe the task");

    const summaryWithoutDisplayFields = { ...session };
    delete summaryWithoutDisplayFields.name;
    listener?.({
      type: "session-updated",
      sessionId: session.id,
      summary: summaryWithoutDisplayFields,
    });

    expect(store.activeSession?.preview).toBe("Describe the task");
    expect(store.recentSessions[0]?.preview).toBe("Describe the task");
  });

  it("ignores late events from a session after opening a new tab", async () => {
    let listener: ((event: PineAgentEvent) => void) | undefined;
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        loadSessionMessages: vi.fn().mockResolvedValue({
          hasMore: false,
          messages: [],
        }),
        onSessionEvent: vi.fn((nextListener) => {
          listener = nextListener;
          return () => undefined;
        }),
        resumeSession: vi.fn().mockResolvedValue({ session }),
      },
    });
    const store = useSessionStore();
    store.connectAgentEvents();
    await store.resume(session.id);
    store.startDraft();

    listener?.({
      type: "run-state",
      sessionId: session.id,
      state: "running",
    });
    listener?.({
      type: "message-end",
      sessionId: session.id,
      messageId: "019cfe51-7166-79b9-a5b9-c652fcca9ead",
      message: {
        role: "assistant",
        timestamp: 1_784_000_000_000,
        content: [{ type: "text", text: "Late response" }],
      },
    });

    expect(store.activeSession).toBeNull();
    expect(store.messages).toEqual([]);
    expect(store.isRunning).toBe(false);
  });

  it("tracks context usage for the active session only", async () => {
    let listener: ((event: PineAgentEvent) => void) | undefined;
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        onSessionEvent: vi.fn((nextListener) => {
          listener = nextListener;
          return () => undefined;
        }),
        promptSession: vi.fn().mockResolvedValue({ session }),
      },
    });
    const store = useSessionStore();
    store.connectAgentEvents();
    await store.prompt("Hello", session.id);

    listener?.({
      type: "context-usage",
      sessionId: "another-session",
      tokens: 1,
      contextWindow: 200_000,
      percent: 0.5,
      cost: 0.01,
    });
    expect(store.contextUsage).toBeNull();

    listener?.({
      type: "context-usage",
      sessionId: session.id,
      tokens: 86_400,
      contextWindow: 200_000,
      percent: 43.2,
      cost: 0.1234,
    });

    expect(store.contextUsage).toEqual({
      tokens: 86_400,
      contextWindow: 200_000,
      percent: 43.2,
      cost: 0.1234,
    });
  });
});
