import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
        resumeSession: vi.fn().mockResolvedValue({ session }),
      },
    });
    const store = useSessionStore();
    await store.resume(session.id);

    store.startTransientSession();

    expect(store.activeSession).toBeNull();
  });
});
