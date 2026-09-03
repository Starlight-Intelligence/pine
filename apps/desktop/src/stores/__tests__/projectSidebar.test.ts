import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROJECT_SIDEBAR_STORAGE_PREFIX,
  useProjectSidebarStore,
} from "../projectSidebar";

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
describe("project sidebar preferences", () => {
  it("persists tabs and expanded folders separately for each project", () => {
    const store = useProjectSidebarStore();
    store.setExpanded("one", ["folder:", "folder:docs"]);
    store.setTab("one", "files");
    store.setExpanded("two", ["other:"]);
    store.setTab("two", "sessions");
    setActivePinia(createPinia());
    const restored = useProjectSidebarStore();
    expect(restored.stateFor("one")).toEqual({
      tab: "files",
      expanded: ["folder:", "folder:docs"],
    });
    expect(restored.stateFor("two")).toEqual({
      tab: "sessions",
      expanded: ["other:"],
    });
    restored.setExpanded("one", []);
    setActivePinia(createPinia());
    expect(useProjectSidebarStore().stateFor("one").expanded).toEqual([]);
  });

  it("falls back safely when saved data is corrupt or storage is unavailable", () => {
    localStorage.setItem(PROJECT_SIDEBAR_STORAGE_PREFIX + "one", "broken");
    const store = useProjectSidebarStore();
    expect(store.stateFor("one")).toEqual({ tab: "sessions", expanded: [] });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(() => store.setTab("one", "files")).not.toThrow();
    expect(store.stateFor("one").tab).toBe("files");
  });
});
