import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import { useContentTabsStore } from "@/stores/contentTabs";
import { useWindowTabShortcuts } from "../useWindowTabShortcuts";

describe("window close navigation", () => {
  it("closes tabs, clears the route, then closes the window only on the next request", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/project", component: {}, meta: { requiresProject: true } },
        { path: "/projects", component: {} },
      ],
    });
    const store = useContentTabsStore();
    const file = store.openFile({
      projectId: "p1",
      folderId: "f1",
      relativePath: "notes.txt",
    });
    await router.push({
      path: "/project",
      query: { tab: file.id, sidebar: "files" },
    });
    let requestClose!: () => void;
    let requestNewTab!: () => void;
    const unsubscribe = vi.fn();
    const unsubscribeNewTab = vi.fn();
    const closeWindow = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        closeWindow,
        onNewTabRequested: (listener: () => void) => {
          requestNewTab = listener;
          return unsubscribeNewTab;
        },
        onCloseTabRequested: (listener: () => void) => {
          requestClose = listener;
          return unsubscribe;
        },
      },
    });
    const wrapper = mount(
      defineComponent({
        setup() {
          useWindowTabShortcuts();
          return () => null;
        },
      }),
      { global: { plugins: [pinia, router] } },
    );
    requestClose();
    expect(store.tabs.map((tab) => tab.id)).toEqual(["session-1"]);
    await flushPromises();
    expect(router.currentRoute.value.query.tab).toBe("session-1");
    requestClose();
    await flushPromises();
    expect(store.tabs).toEqual([]);
    expect(router.currentRoute.value.query).toEqual({ sidebar: "files" });
    expect(closeWindow).not.toHaveBeenCalled();
    requestClose();
    expect(closeWindow).toHaveBeenCalledTimes(1);
    requestNewTab();
    await flushPromises();
    const firstDraft = router.currentRoute.value.query.tab;
    expect(store.tabs).toHaveLength(1);
    requestNewTab();
    await flushPromises();
    expect(store.tabs).toHaveLength(2);
    expect(router.currentRoute.value.query.tab).not.toBe(firstDraft);
    await router.push("/projects");
    requestNewTab();
    requestClose();
    expect(closeWindow).toHaveBeenCalledTimes(2);
    expect(store.tabs).toHaveLength(2);
    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(unsubscribeNewTab).toHaveBeenCalledOnce();
  });
});
