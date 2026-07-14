import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PineWorkspaceSummary } from "@/shared/projects";
import { useWorkspaceStore } from "../workspace";

const workspace: PineWorkspaceSummary = {
  id: "9ab0b15f-331f-4aa6-8056-cd2be3bf7414",
  name: "pine",
  rootPath: "/workspace/pine",
};

describe("workspace store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("stores a workspace returned by the preload API", async () => {
    const openWorkspace = vi.fn().mockResolvedValue({
      workspace,
    });
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: { openWorkspace },
    });
    const store = useWorkspaceStore();

    await expect(store.openWorkspace()).resolves.toEqual(workspace);
    expect(store.currentWorkspace).toEqual(workspace);
    expect(store.isOpeningWorkspace).toBe(false);
  });

  it("clears its loading state when opening fails", async () => {
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: { openWorkspace: vi.fn().mockRejectedValue(new Error("failed")) },
    });
    const store = useWorkspaceStore();

    await expect(store.openWorkspace()).rejects.toThrow("failed");
    expect(store.currentWorkspace).toBeNull();
    expect(store.isOpeningWorkspace).toBe(false);
  });
});
