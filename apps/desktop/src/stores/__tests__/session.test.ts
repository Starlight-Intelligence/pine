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

    store.startTransientSession();

    expect(store.activeSession).toBeNull();
  });

  it("builds a text transcript from streaming agent events", () => {
    let listener: ((event: PineAgentEvent) => void) | undefined;
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        onSessionEvent: vi.fn((nextListener) => {
          listener = nextListener;
          return () => undefined;
        }),
      },
    });
    const store = useSessionStore();
    store.connectAgentEvents();

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
        content: [{ type: "text", text: "Hello, world" }],
      },
    });

    expect(store.messages).toEqual([
      expect.objectContaining({
        id: "019cfe51-7166-79b9-a5b9-c652fcca9eac",
        role: "assistant",
        status: "complete",
        text: "Hello, world",
      }),
    ]);
    expect(store.isRunning).toBe(true);
  });
});
