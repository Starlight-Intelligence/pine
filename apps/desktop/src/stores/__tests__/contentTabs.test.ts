import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import type { PineSessionSummary } from "@/shared/sessions";
import { useContentTabsStore } from "../contentTabs";

const firstSession: PineSessionSummary = {
  createdAt: "2026-08-25T00:00:00.000Z",
  id: "019cfe51-7166-79b9-a5b9-c652fcca9eab",
  messageCount: 2,
  preview: "First prompt",
  updatedAt: "2026-08-25T00:01:00.000Z",
};

describe("content tabs store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("creates a draft tab from a bound session", () => {
    const store = useContentTabsStore();
    store.bindSession("session-1", firstSession);

    const draft = store.createSessionTab();

    expect(draft.state).toBe("draft");
    expect(store.tabs).toContainEqual(draft);
    expect(store.tabs).toHaveLength(2);
  });

  it("does not duplicate an already active draft tab", () => {
    const store = useContentTabsStore();

    const draft = store.createSessionTab();

    expect(draft.id).toBe("session-1");
    expect(store.tabs).toHaveLength(1);
  });

  it("binds a prompt result to the tab that sent it", () => {
    const store = useContentTabsStore();
    const firstTabId = "session-1";
    store.beginPrompt(firstTabId, "Pending prompt");
    const secondTab = store.createSessionTab();

    store.bindSession(firstTabId, firstSession);

    expect(secondTab.state).toBe("draft");
    expect(store.tabs).toContainEqual(
      expect.objectContaining({
        id: firstTabId,
        sessionId: firstSession.id,
        state: "bound",
      }),
    );
  });

  it("moves a draft through creating to bound", () => {
    const store = useContentTabsStore();

    expect(store.beginPrompt("session-1", "First prompt")).toBe(true);
    expect(store.tabs).toContainEqual(
      expect.objectContaining({
        id: "session-1",
        label: "First prompt",
        state: "creating",
      }),
    );

    store.bindSession("session-1", firstSession);

    expect(store.tabs).toContainEqual(
      expect.objectContaining({
        id: "session-1",
        sessionId: firstSession.id,
        state: "bound",
      }),
    );
  });

  it("leaves no tabs after closing the last one", () => {
    const store = useContentTabsStore();
    expect(store.close("session-1", "session-1")).toBe("");
    expect(store.tabs).toEqual([]);
    expect(store.createSessionTab().state).toBe("draft");
  });

  it("opens distinct files without replacing existing tabs and reuses the same file", () => {
    const store = useContentTabsStore();
    const file = {
      projectId: "p1",
      folderId: "f1",
      relativePath: "src/main.ts",
    };
    const first = store.openFile(file);
    const second = store.openFile({ ...file, relativePath: "image.png" });
    const otherRoot = store.openFile({ ...file, folderId: "f2" });
    expect(store.openFile(file).id).toBe(first.id);
    expect(new Set([first.id, second.id, otherRoot.id]).size).toBe(3);
    expect(store.tabs).toHaveLength(4);
    expect(store.close("session-1", first.id)).toBe(first.id);
    expect(store.tabs.every((tab) => tab.kind === "file")).toBe(true);
    expect(store.close(first.id, first.id)).toBe(second.id);
    store.reset();
    expect(store.tabs).toEqual([
      { id: "session-1", kind: "session", state: "draft" },
    ]);
  });

  it("opens an existing session tab instead of duplicating it", () => {
    const store = useContentTabsStore();
    store.bindSession("session-1", firstSession);
    store.createSessionTab();

    const opened = store.openSession(firstSession, store.createSessionTab().id);

    expect(opened.id).toBe("session-1");
    expect(
      store.tabs.filter(
        (tab) => tab.kind === "session" && tab.state === "bound",
      ),
    ).toHaveLength(1);
  });
});
