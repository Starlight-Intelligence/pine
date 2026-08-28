import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import type { PineProject } from "@/shared/projects";
import type { PineSessionSummary } from "@/shared/sessions";
import { useContentTabsStore } from "@/stores/contentTabs";
import { useProjectStore } from "@/stores/project";
import ProjectSessionList from "../ProjectSessionList.vue";

const session: PineSessionSummary = {
  createdAt: "2026-08-25T00:00:00.000Z",
  id: "019cfe51-7166-79b9-a5b9-c652fcca9eab",
  messageCount: 2,
  preview: "Existing conversation",
  updatedAt: "2026-08-25T00:01:00.000Z",
};

const project: PineProject = {
  createdAt: "2026-08-24T00:00:00.000Z",
  defaultFolderId: "cde9a86c-7632-43ac-96d6-c41ddeddce0e",
  folders: [
    {
      access: "read-write",
      id: "cde9a86c-7632-43ac-96d6-c41ddeddce0e",
      isAvailable: true,
      name: "source",
      path: "/projects/source",
    },
  ],
  id: "9ab0b15f-331f-4aa6-8056-cd2be3bf7414",
  name: "Pine",
  schemaVersion: 1,
  updatedAt: "2026-08-24T00:00:00.000Z",
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

  it("reloads history when the active project's folders change", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: { template: "<div />" } }],
    });
    await router.push("/");
    await router.isReady();
    const searchSessions = vi.fn().mockResolvedValue({ sessions: [session] });
    Object.defineProperty(window, "pine", {
      configurable: true,
      value: { searchSessions },
    });
    const projectStore = useProjectStore();
    projectStore.activeProject = project;

    mount(ProjectSessionList, {
      global: {
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
    expect(searchSessions).toHaveBeenCalledTimes(1);

    projectStore.activeProject = {
      ...project,
      defaultFolderId: "9e775dc8-27f1-4eaf-89c9-e5b1b4a65ae5",
      folders: [
        ...project.folders,
        {
          access: "read-write",
          id: "9e775dc8-27f1-4eaf-89c9-e5b1b4a65ae5",
          isAvailable: true,
          name: "next-source",
          path: "/projects/next-source",
        },
      ],
      updatedAt: "2026-08-26T00:00:00.000Z",
    };
    await flushPromises();

    expect(searchSessions).toHaveBeenCalledTimes(2);
  });
});
