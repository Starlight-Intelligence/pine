import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import type { PineSessionSummary } from "@/shared/sessions";
import { useContentTabsStore } from "@/stores/contentTabs";
import ProjectSessionList from "../ProjectSessionList.vue";

const session: PineSessionSummary = {
  createdAt: "2026-08-25T00:00:00.000Z",
  id: "019cfe51-7166-79b9-a5b9-c652fcca9eab",
  messageCount: 2,
  preview: "Existing conversation",
  updatedAt: "2026-08-25T00:01:00.000Z",
};

describe("ProjectSessionList", () => {
  it("opens a new draft tab from the new-session action", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: { template: "<div />" } }],
    });
    await router.push({ path: "/", query: { tab: "session-1" } });
    await router.isReady();
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: {
        searchSessions: vi.fn().mockResolvedValue({ sessions: [session] }),
      },
    });
    const tabsStore = useContentTabsStore();
    tabsStore.bindSession("session-1", session);
    const wrapper = mount(ProjectSessionList, {
      global: {
        directives: { "scroll-fade": {} },
        plugins: [pinia, router, createAppI18n("en-US")],
        stubs: {
          SidebarGroup: { template: "<div><slot /></div>" },
          SidebarGroupContent: { template: "<div><slot /></div>" },
          SidebarMenu: { template: "<div><slot /></div>" },
          SidebarMenuButton: { template: "<button><slot /></button>" },
          SidebarMenuItem: { template: "<div><slot /></div>" },
          SidebarMenuSkeleton: true,
        },
      },
    });
    await flushPromises();

    const newSessionButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("New session"));
    expect(newSessionButton).toBeDefined();
    await newSessionButton?.trigger("click");
    await flushPromises();

    const activeTabId = String(router.currentRoute.value.query.tab);
    expect(tabsStore.tabs.find((tab) => tab.id === activeTabId)).toEqual(
      expect.objectContaining({ state: "draft" }),
    );
    expect(tabsStore.tabs.filter((tab) => tab.kind === "session")).toHaveLength(
      2,
    );
  });
});
