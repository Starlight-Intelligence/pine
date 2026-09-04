import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { computed, nextTick, onUnmounted } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import type { PineSessionSummary } from "@/shared/sessions";
import { useSessionStore } from "@/stores/session";
import { useContentTabsStore } from "@/stores/contentTabs";
import {
  CONTENT_TAB_DRAG_TYPE,
  FILE_TAB_DRAG_TYPE,
} from "@/lib/contentTabDrag";
import ProjectContentTabs from "../ProjectContentTabs.vue";

const sidebar = vi.hoisted(() => ({
  state: "expanded",
  isMobile: false,
}));
const sessionView = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));
enableAutoUnmount(afterEach);

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({
    state: computed(() => sidebar.state),
    isMobile: computed(() => sidebar.isMobile),
  }),
}));

vi.mock("../ProjectSessionView.vue", () => ({
  default: {
    props: ["tabId"],
    setup() {
      sessionView.mounts += 1;
      onUnmounted(() => {
        sessionView.unmounts += 1;
      });
    },
    template:
      '<div :data-session-view="tabId"><textarea /><div data-scroll /></div>',
  },
}));

const windowControlsPaddingClass =
  "pl-[calc(var(--window-titlebar-leading-offset)+var(--window-titlebar-control-height)+0.75rem)]";
const preferencesPaddingClass =
  "pr-[calc(var(--window-titlebar-control-height)+1.25rem)]";

async function mountTabs(withFile = false) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }],
  });
  await router.push({ path: "/", query: { tab: "session-1" } });
  await router.isReady();
  sessionView.mounts = 0;
  sessionView.unmounts = 0;
  Object.defineProperty(window, "pine", {
    configurable: true,
    value: {
      readProjectFilePreview: vi.fn().mockResolvedValue({
        kind: "text",
        text: "const n = 1;",
        size: 12,
        modifiedAt: "2026-09-04T12:00:00Z",
        encoding: "UTF-8",
      }),
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
  const file = withFile
    ? useContentTabsStore().openFile({
        projectId: "p1",
        folderId: "f1",
        relativePath: "example.ts",
      })
    : null;
  const wrapper = mount(ProjectContentTabs, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router, createAppI18n("en-US")],
    },
  });
  return { router, wrapper, file };
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
  it("retains connected session and file scrollports and drafts across activation and reorder", async () => {
    const { wrapper, router, file } = await mountTabs(true);
    const store = useContentTabsStore();
    const first = wrapper.get<HTMLElement>(
      '[data-session-view="session-1"] [data-scroll]',
    ).element;
    first.scrollTop = 310;
    await wrapper
      .get('[data-session-view="session-1"] textarea')
      .setValue("draft one");
    const second = store.createSessionTab({ reuseDraft: false });
    await router.push({ query: { tab: second.id } });
    await flushPromises();
    const secondScroll = wrapper.get<HTMLElement>(
      `[data-session-view="${second.id}"] [data-scroll]`,
    ).element;
    secondScroll.scrollTop = 640;

    await router.push({ query: { tab: file!.id } });
    await flushPromises();
    const fileScroll = wrapper.get<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    ).element;
    fileScroll.scrollTop = 480;
    fileScroll.scrollLeft = 120;
    await router.push({ query: { tab: "session-1" } });
    await flushPromises();
    store.moveTab("session-1", file!.id, "after");
    await nextTick();
    expect(first.isConnected).toBe(true);
    expect(secondScroll.isConnected).toBe(true);
    expect(fileScroll.isConnected).toBe(true);
    expect(first.scrollTop).toBe(310);
    expect(
      wrapper.get<HTMLTextAreaElement>(
        '[data-session-view="session-1"] textarea',
      ).element.value,
    ).toBe("draft one");
    expect(
      wrapper.findAll('[role="tabpanel"]:not([aria-hidden])'),
    ).toHaveLength(1);

    await router.push({ query: { tab: second.id } });
    await flushPromises();
    expect(secondScroll.scrollTop).toBe(640);
    await router.push({ query: { tab: file!.id } });
    await flushPromises();
    expect(fileScroll.scrollTop).toBe(480);
    expect(fileScroll.scrollLeft).toBe(120);
    expect(window.pine.readProjectFilePreview).toHaveBeenCalledTimes(1);
  });

  it("reorders dragged tabs without switching selection and marks files for attachment drops", async () => {
    const { router, wrapper, file } = await mountTabs(true);
    const data = new Map<string, string>();
    const transfer = {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? "",
      effectAllowed: "none",
      dropEffect: "none",
    };
    const source = wrapper.get(`[data-tab-id="${file!.id}"]`);
    const target = wrapper.get('[data-tab-id="session-1"]');
    vi.spyOn(target.element, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 160, 32),
    );
    await source.trigger("dragstart", { dataTransfer: transfer });
    expect(data.get(CONTENT_TAB_DRAG_TYPE)).toBe(file!.id);
    expect(data.get(FILE_TAB_DRAG_TYPE)).toBe(file!.id);
    expect(transfer.effectAllowed).toBe("copyMove");
    await target.trigger("dragover", { dataTransfer: transfer, clientX: 10 });
    await target.trigger("drop", { dataTransfer: transfer });
    await flushPromises();
    expect(useContentTabsStore().tabs.map((tab) => tab.id)).toEqual([
      file!.id,
      "session-1",
    ]);
    expect(router.currentRoute.value.query.tab).toBe("session-1");
    expect(wrapper.get('[role="tablist"]').classes()).toContain("window-drag");
    wrapper.unmount();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps separate file previews cached when switching between tabs", async () => {
    const { router, wrapper, file } = await mountTabs(true);
    const store = useContentTabsStore();
    const second = store.openFile({
      projectId: "p1",
      folderId: "f1",
      relativePath: "second.txt",
    });
    await router.push({ query: { tab: file!.id } });
    await flushPromises();
    expect(
      wrapper
        .get('[role="tabpanel"]:not([aria-hidden]) section')
        .attributes("aria-label"),
    ).toBe("example.ts");
    await router.push({ query: { tab: second.id } });
    await flushPromises();
    expect(
      wrapper
        .get('[role="tabpanel"]:not([aria-hidden]) section')
        .attributes("aria-label"),
    ).toBe("second.txt");
    await router.push({ query: { tab: file!.id } });
    await flushPromises();
    expect(window.pine.readProjectFilePreview).toHaveBeenCalledTimes(2);
    await wrapper.get('button[aria-label="Close example.ts"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.tab).toBe(second.id);
    expect(
      wrapper
        .get('[role="tabpanel"]:not([aria-hidden]) section')
        .attributes("aria-label"),
    ).toBe("second.txt");
    wrapper.unmount();
  });

  it.each([
    { name: "right-clipped", left: 500, target: 520 },
    { name: "left-clipped", left: 20, target: 40 },
    { name: "visible", left: 120, target: null },
  ])("reveals a $name tab on route activation", async ({ left, target }) => {
    const { router, wrapper, file } = await mountTabs(true);
    const viewport = wrapper.get<HTMLDivElement>('[role="tablist"]').element;
    const button = wrapper.get<HTMLButtonElement>(
      `#project-content-tab-${file!.id}`,
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

    await router.push({ query: { tab: file!.id } });
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
    const { wrapper, file } = await mountTabs(true);
    const viewport = wrapper.get<HTMLDivElement>('[role="tablist"]').element;
    const button = wrapper.get<HTMLButtonElement>(
      `#project-content-tab-${file!.id}`,
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
    const tabItems = wrapper.get('[data-slot="project-content-tab-items"]');

    expect(titlebar.classes()).toContain(preferencesPaddingClass);
    expect(tabList.classes()).toContain("flex-1");
    expect(tabItems.classes()).toContain("py-1");
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
    const { wrapper } = await mountTabs(true);

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

  it("binds each session tab to its own session and reuses its view", async () => {
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
    expect(sessionView.mounts).toBe(2);
    wrapper.unmount();
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
    expect(
      wrapper.get('[role="tabpanel"]:not([aria-hidden])').attributes("id"),
    ).toBe(`project-content-panel-${selectedId}`);
  });

  it("closes directly to the next draft without briefly resuming the first tab", async () => {
    const { router, wrapper } = await mountTabs();
    const store = useContentTabsStore();
    store.bindSession("session-1", firstSession);
    await flushPromises();
    const second = store.openSession(secondSession);
    await router.push({ query: { tab: second.id } });
    await flushPromises();
    const draft = store.createSessionTab();
    await flushPromises();
    const resume = vi.spyOn(useSessionStore(), "resume");

    await wrapper
      .get('button[aria-label="Close Second prompt"]')
      .trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.query.tab).toBe(draft.id);
    expect(resume).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("releases a closed background view and its transcript cache", async () => {
    const { router, wrapper } = await mountTabs();
    const store = useContentTabsStore();
    store.bindSession("session-1", firstSession);
    await flushPromises();
    const second = store.openSession(secondSession);
    await router.push({ query: { tab: second.id } });
    await flushPromises();
    const resume = vi.spyOn(useSessionStore(), "resume");
    const loadMessages = vi.mocked(window.pine.loadSessionMessages);
    loadMessages.mockClear();

    await wrapper
      .get('button[aria-label="Close First prompt"]')
      .trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.query.tab).toBe(second.id);
    expect(sessionView.unmounts).toBe(1);
    expect(resume).not.toHaveBeenCalled();
    const reopened = store.openSession(firstSession);
    await router.push({ query: { tab: reopened.id } });
    await flushPromises();
    expect(loadMessages).toHaveBeenCalledExactlyOnceWith({
      sessionId: firstSession.id,
      limit: 50,
    });
    wrapper.unmount();
  });

  it("releases closed views instead of accumulating retained panels", async () => {
    const { wrapper } = await mountTabs();
    for (let index = 0; index < 5; index += 1) {
      await wrapper
        .get('button[aria-label="Close New session"]')
        .trigger("click");
      await flushPromises();
      expect(sessionView.mounts - sessionView.unmounts).toBe(0);
      await wrapper
        .get('button[aria-label="Add session tab"]')
        .trigger("click");
      await flushPromises();
    }
    wrapper.unmount();
  });

  it("shows an empty placeholder after closing the final tab and can open a new one", async () => {
    const { router, wrapper } = await mountTabs();
    await wrapper
      .get('button[aria-label="Close New session"]')
      .trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.tab).toBeUndefined();
    expect(useContentTabsStore().tabs).toEqual([]);
    expect(
      wrapper.find('[role="region"][aria-label="No tabs open"]').exists(),
    ).toBe(true);
    expect(wrapper.find('[data-slot="empty"]').exists()).toBe(false);
    expect(wrapper.find('[role="tabpanel"]').exists()).toBe(false);
    await wrapper.get('button[aria-label="Add session tab"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="tabpanel"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
