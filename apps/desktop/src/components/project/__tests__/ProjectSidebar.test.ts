import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, expect, it } from "vitest";
import { createAppI18n } from "@/app/i18n";
import { useProjectStore } from "@/stores/project";
import { useProjectSidebarStore } from "@/stores/projectSidebar";
import ProjectSidebar from "../ProjectSidebar.vue";

beforeEach(() => localStorage.clear());
it("restores the project tab and persists navigation without changing the active conversation", async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const projectStore = useProjectStore();
  projectStore.activeProject = {
    id: "one",
    name: "One",
    createdAt: "",
    updatedAt: "",
    schemaVersion: 1,
    defaultFolderId: "folder",
    folders: [],
  };
  const sidebarStore = useProjectSidebarStore();
  sidebarStore.setTab("one", "files");
  sidebarStore.setTab("two", "files");
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/projects/:projectId", component: { template: "<div />" } },
    ],
  });
  await router.push("/projects/one?tab=conversation");
  const slot = { template: "<div><slot /></div>" };
  const wrapper = mount(ProjectSidebar, {
    global: {
      plugins: [pinia, router, createAppI18n("zh-CN")],
      stubs: {
        Sidebar: slot,
        SidebarContent: slot,
        SidebarFooter: slot,
        SidebarHeader: slot,
        SidebarMenu: slot,
        SidebarMenuButton: slot,
        SidebarMenuItem: slot,
        SidebarRail: true,
        ProjectFileTree: true,
        ProjectSessionList: true,
      },
    },
  });
  const tabs = wrapper.findAll('[role="tab"]');
  expect(tabs[0].attributes("data-state")).toBe("active");
  await tabs[1].trigger("mousedown", { button: 0 });
  await flushPromises();
  expect(router.currentRoute.value.query).toEqual({
    tab: "conversation",
    sidebar: "sessions",
  });
  expect(sidebarStore.stateFor("one").tab).toBe("sessions");
  projectStore.activeProject = { ...projectStore.activeProject, id: "two" };
  await router.push("/projects/two");
  await flushPromises();
  expect(tabs[0].attributes("data-state")).toBe("active");
  expect(sidebarStore.stateFor("two").tab).toBe("files");
  wrapper.unmount();
});
