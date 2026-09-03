import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { computed, nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { name: "right-clipped", left: 500, target: 520 },
    { name: "left-clipped", left: 20, target: 40 },
    { name: "visible", left: 120, target: null },
  ])("reveals a $name tab on route activation", async ({ left, target }) => {
    const { router, wrapper } = await mountTabs();
    const viewport = wrapper.get<HTMLDivElement>('[role="tablist"]').element;
    const button = wrapper.get<HTMLButtonElement>(
      "#project-content-tab-file-project-view",
    ).element;
    Object.defineProperties(viewport, {
      clientWidth: { value: 320 },
      scrollWidth: { value: 1000 },
      scrollLeft: { value: 200, writable: true },
    });
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 0, 320, 40),
    );
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
      new DOMRect(left, 0, 160, 32),
    );
    const scroll = vi.spyOn(viewport, "scrollTo").mockImplementation(() => {});

    await router.push({ query: { tab: "file-project-view" } });
    await flushPromises();

    if (target === null) {
      expect(scroll).not.toHaveBeenCalled();
    } else {
      expect(scroll).toHaveBeenCalledExactlyOnceWith({
        left: target,
        behavior: "smooth",
      });
    }
    wrapper.unmount();
  });

  it("reveals keyboard-selected tabs without focus scrolling and respects reduced motion", async () => {
    const { wrapper } = await mountTabs();
    const viewport = wrapper.get<HTMLDivElement>('[role="tablist"]').element;
    const button = wrapper.get<HTMLButtonElement>(
      "#project-content-tab-file-project-view",
    ).element;
    Object.defineProperties(viewport, {
      clientWidth: { value: 200 },
      scrollWidth: { value: 400 },
    });
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 200, 40),
    );
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
      new DOMRect(240, 0, 160, 32),
    );
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    const scroll = vi.spyOn(viewport, "scrollTo").mockImplementation(() => {});
    const focus = vi.spyOn(button, "focus");

    await wrapper.get('[role="tab"]').trigger("keydown", { key: "End" });
    await flushPromises();

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scroll).toHaveBeenCalledExactlyOnceWith({
      left: 200,
      behavior: "instant",
    });
    wrapper.unmount();
  });

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

  it("keeps the tab list blank area draggable and tabs interactive", async () => {
    const { wrapper } = await mountTabs();
    const tabList = wrapper.get('[data-slot="project-content-tab-list"]');
    const tab = wrapper.get('[data-slot="project-content-tab"]');
    const addButton = wrapper.get('button[aria-label="Add session tab"]');

    expect(tabList.classes()).toContain("window-drag");
    expect(tabList.classes()).not.toContain("window-no-drag");
    expect(tab.classes()).toContain("window-no-drag");
    expect(addButton.classes()).toContain("window-no-drag");
  });

  it("optically aligns tab separators with the tab hover treatment", async () => {
    const { wrapper } = await mountTabs();

    await wrapper.get('button[aria-label="Add session tab"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-slot="separator"]').classes()).toEqual(
      expect.arrayContaining([
        "project-content-tab-separator",
        "h-7",
        "self-center",
      ]),
    );
    expect(
      wrapper.get('[data-slot="project-content-tab"]').classes(),
    ).toContain("h-8");
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
