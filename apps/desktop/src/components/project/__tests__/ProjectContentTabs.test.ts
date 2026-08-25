import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { computed, nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import type { PineSessionSummary } from "@/shared/sessions";
import { useContentTabsStore } from "@/stores/contentTabs";
import ProjectContentTabs from "../ProjectContentTabs.vue";

const sidebar = vi.hoisted(() => ({
  state: "expanded",
  isMobile: false,
}));
const sessionView = vi.hoisted(() => ({ mounts: 0 }));

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({
    state: computed(() => sidebar.state),
    isMobile: computed(() => sidebar.isMobile),
  }),
}));

vi.mock("../ProjectSessionView.vue", () => ({
  default: {
    setup() {
      sessionView.mounts += 1;
    },
    template: "<div />",
  },
}));

const windowControlsPaddingClass =
  "pl-[calc(var(--window-titlebar-leading-offset)+var(--window-titlebar-control-height)+0.75rem)]";
const preferencesPaddingClass =
  "pr-[calc(var(--window-titlebar-control-height)+1.25rem)]";

async function mountTabs() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }],
  });
  await router.push({ path: "/", query: { tab: "session-1" } });
  await router.isReady();
  sessionView.mounts = 0;
  Object.defineProperty(window, "pine", {
    configurable: true,
    value: {
      loadSessionMessages: vi.fn().mockResolvedValue({
        hasMore: false,
        messages: [],
      }),
      resumeSession: vi.fn(({ sessionId }) =>
        Promise.resolve({
          session: sessionId === firstSession.id ? firstSession : secondSession,
        }),
      ),
    },
  });
  const wrapper = mount(ProjectContentTabs, {
    global: {
      plugins: [pinia, router, createAppI18n("en-US")],
    },
  });
  return { router, wrapper };
}

const firstSession: PineSessionSummary = {
  createdAt: "2026-08-25T00:00:00.000Z",
  id: "019cfe51-7166-79b9-a5b9-c652fcca9eab",
  messageCount: 2,
  preview: "First prompt",
  updatedAt: "2026-08-25T00:01:00.000Z",
};

const secondSession: PineSessionSummary = {
  ...firstSession,
  id: "019cfe51-7166-79b9-a5b9-c652fcca9eac",
  preview: "Second prompt",
};

describe("ProjectContentTabs", () => {
  it("does not reserve window controls space beside an expanded desktop sidebar", async () => {
    sidebar.state = "expanded";
    sidebar.isMobile = false;

    const { wrapper } = await mountTabs();

    expect(
      wrapper.get('[data-slot="project-content-tabs-titlebar"]').classes(),
    ).not.toContain(windowControlsPaddingClass);
  });

  it("reserves window controls space when the sidebar is manually collapsed", async () => {
    sidebar.state = "collapsed";
    sidebar.isMobile = false;

    const { wrapper } = await mountTabs();

    expect(
      wrapper.get('[data-slot="project-content-tabs-titlebar"]').classes(),
    ).toContain(windowControlsPaddingClass);
  });

  it("reserves window controls space when a narrow viewport hides the desktop sidebar", async () => {
    sidebar.state = "expanded";
    sidebar.isMobile = true;
    const { wrapper } = await mountTabs();

    expect(
      wrapper.get('[data-slot="project-content-tabs-titlebar"]').classes(),
    ).toContain(windowControlsPaddingClass);
  });

  it("centers close buttons without conflicting with the button pressed state", async () => {
    const { wrapper } = await mountTabs();
    const closeButton = wrapper.get('button[aria-label^="Close"]');

    expect(closeButton.classes()).toContain("inset-y-0");
    expect(closeButton.classes()).toContain("my-auto");
    expect(closeButton.classes()).not.toContain("top-1/2");
    expect(closeButton.classes()).not.toContain("-translate-y-1/2");
  });

  it("keeps tabs and the add action clear of global preferences", async () => {
    const { wrapper } = await mountTabs();
    const titlebar = wrapper.get('[data-slot="project-content-tabs-titlebar"]');
    const tabList = wrapper.get('[data-slot="project-content-tab-list"]');

    expect(titlebar.classes()).toContain(preferencesPaddingClass);
    expect(tabList.classes()).toContain("flex-1");
  });

  it("binds each session tab to its own session and remounts its view", async () => {
    const { router, wrapper } = await mountTabs();
    const tabsStore = useContentTabsStore();
    tabsStore.bindSession("session-1", firstSession);
    await nextTick();

    await wrapper.get('button[aria-label="Add session tab"]').trigger("click");
    await flushPromises();
    const secondTabId = String(router.currentRoute.value.query.tab);
    tabsStore.bindSession(secondTabId, secondSession);
    await flushPromises();

    const tabLabels = wrapper
      .findAll('[role="tab"]')
      .map((trigger) => trigger.text());
    expect(tabLabels).toContain("First prompt");
    expect(tabLabels).toContain("Second prompt");
    expect(sessionView.mounts).toBe(2);

    await wrapper.findAll('[role="tab"]')[0].trigger("click");
    await flushPromises();
    expect(window.pine.resumeSession).toHaveBeenCalledWith({
      sessionId: firstSession.id,
    });
  });

  it("selects exactly one newly created session tab and switches its panel", async () => {
    const { router, wrapper } = await mountTabs();
    const tabsStore = useContentTabsStore();
    tabsStore.bindSession("session-1", firstSession);
    await nextTick();

    await wrapper.get('button[aria-label="Add session tab"]').trigger("click");
    await flushPromises();

    const selectedTabs = wrapper
      .findAll('[role="tab"]')
      .filter((tab) => tab.attributes("aria-selected") === "true");
    const selectedId = String(router.currentRoute.value.query.tab);
    expect(selectedTabs).toHaveLength(1);
    expect(selectedTabs[0].attributes("id")).toBe(
      `project-content-tab-${selectedId}`,
    );
    expect(selectedId).not.toBe("session-1");
    expect(wrapper.get('[role="tabpanel"]').attributes("id")).toBe(
      `project-content-panel-${selectedId}`,
    );
  });

  it("replaces the final closed session tab with a new draft", async () => {
    const { router, wrapper } = await mountTabs();
    const tabsStore = useContentTabsStore();

    await wrapper
      .get('button[aria-label="Close New session"]')
      .trigger("click");
    await flushPromises();

    const activeTabId = String(router.currentRoute.value.query.tab);
    expect(tabsStore.tabs.find((tab) => tab.id === activeTabId)).toEqual(
      expect.objectContaining({ state: "draft" }),
    );
    expect(tabsStore.tabs.filter((tab) => tab.kind === "session")).toHaveLength(
      1,
    );
  });
});
