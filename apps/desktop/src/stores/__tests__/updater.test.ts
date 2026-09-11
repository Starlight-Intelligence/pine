import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateEventListener } from "@/shared/updates";
import { useUpdaterStore } from "../updater";

const update = {
  changelog: "- Improved updates",
  internalVersion: "abc1234",
  publishedAt: "2026-09-10T12:00:00.000Z",
  version: "1.1.0",
};

describe("updater store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.pine = {
      checkForUpdate: vi.fn().mockResolvedValue({
        status: "available",
        update,
      }),
      downloadUpdate: vi.fn().mockResolvedValue({ ready: true }),
      installUpdate: vi.fn().mockResolvedValue({ started: true }),
      onUpdateEvent: vi.fn(() => () => undefined),
      platform: "darwin",
    } as unknown as typeof window.pine;
  });

  it("surfaces an available R2 release", async () => {
    const store = useUpdaterStore();
    await store.check();

    expect(store.isAvailable).toBe(true);
    expect(store.phase).toBe("available");
    expect(store.update).toEqual(update);
  });

  it("tracks download progress and readiness", () => {
    let listener: UpdateEventListener | undefined;
    window.pine.onUpdateEvent = vi.fn((nextListener) => {
      listener = nextListener;
      return () => undefined;
    });
    const store = useUpdaterStore();
    store.initialize();
    listener?.({
      percent: 42,
      totalBytes: 100,
      transferredBytes: 42,
      type: "download-progress",
    });
    expect(store.progress).toBe(42);
    listener?.({ type: "download-ready" });
    expect(store.phase).toBe("ready");
  });
});
