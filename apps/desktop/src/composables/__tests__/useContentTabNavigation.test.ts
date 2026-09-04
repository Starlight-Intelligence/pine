import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";
import { useContentTabsStore } from "@/stores/contentTabs";
import { CONTENT_TABS_STORAGE_PREFIX } from "@/lib/contentTabStorage";
import { useContentTabNavigation } from "../useContentTabNavigation";

describe("persisted content tab navigation", () => {
  it("restores selection without a query and records route changes for the right project", async () => {
    localStorage.clear();
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useContentTabsStore();
    store.restore("one");
    const file = store.openFile({
      projectId: "one",
      folderId: "root",
      relativePath: "notes.txt",
    });
    store.setActiveTab(file.id);
    store.reset();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/projects/:projectId", component: {} }],
    });
    router.beforeEach((to) => {
      if (store.projectId !== to.params.projectId)
        store.restore(String(to.params.projectId));
    });
    await router.push("/projects/one");
    const wrapper = mount(
      defineComponent({
        setup() {
          const navigation = useContentTabNavigation();
          return () => h("span", navigation.activeTabId.value);
        },
      }),
      { global: { plugins: [pinia, router] } },
    );
    expect(wrapper.text()).toBe(file.id);

    await router.push({ query: { tab: "session-1" } });
    await flushPromises();
    expect(store.fallbackActiveTabId).toBe("session-1");
    await router.push({ query: { tab: file.id } });
    await router.push("/projects/two");
    await flushPromises();
    expect(wrapper.text()).toBe("session-1");
    expect(
      JSON.parse(localStorage.getItem(CONTENT_TABS_STORAGE_PREFIX + "one")!)
        .activeTabId,
    ).toBe(file.id);
    await router.push("/projects/one");
    await flushPromises();
    expect(wrapper.text()).toBe(file.id);
    await router.push({ query: { tab: "missing" } });
    await flushPromises();
    expect(wrapper.text()).toBe(file.id);
    wrapper.unmount();
  });
});
