import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PineAgentEvent } from "@/shared/agent";
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
        text: "Hello, world",
        thinking: "Check the incoming message.",
      }),
    ]);
    expect(store.isRunning).toBe(true);
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
});
