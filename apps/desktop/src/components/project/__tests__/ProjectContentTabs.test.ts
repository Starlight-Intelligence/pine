import { mount } from "@vue/test-utils";
import { computed } from "vue";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import ProjectContentTabs from "../ProjectContentTabs.vue";

const sidebar = vi.hoisted(() => ({
  state: "expanded",
  isMobile: false,
}));

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({
    state: computed(() => sidebar.state),
    isMobile: computed(() => sidebar.isMobile),
  }),
}));

vi.mock("../ProjectSessionView.vue", () => ({
  default: {
    template: "<div />",
  },
}));

const windowControlsPaddingClass =
  "pl-[calc(var(--window-titlebar-leading-offset)+var(--window-titlebar-control-height)+0.75rem)]";
const preferencesPaddingClass =
  "pr-[calc(var(--window-titlebar-control-height)+1.25rem)]";

function mountTabs() {
  return mount(ProjectContentTabs, {
    global: {
      plugins: [createAppI18n("en-US")],
    },
  });
}

describe("ProjectContentTabs", () => {
  it("does not reserve window controls space beside an expanded desktop sidebar", () => {
    sidebar.state = "expanded";
    sidebar.isMobile = false;

    const wrapper = mountTabs();

    expect(
      wrapper.get('[data-slot="project-content-tabs-titlebar"]').classes(),
    ).not.toContain(windowControlsPaddingClass);
  });

  it("reserves window controls space when the sidebar is manually collapsed", () => {
    sidebar.state = "collapsed";
    sidebar.isMobile = false;

    const wrapper = mountTabs();

    expect(
      wrapper.get('[data-slot="project-content-tabs-titlebar"]').classes(),
    ).toContain(windowControlsPaddingClass);
  });

  it("reserves window controls space when a narrow viewport hides the desktop sidebar", () => {
    sidebar.state = "expanded";
    sidebar.isMobile = true;
    const wrapper = mountTabs();

    expect(
      wrapper.get('[data-slot="project-content-tabs-titlebar"]').classes(),
    ).toContain(windowControlsPaddingClass);
  });

  it("centers close buttons without conflicting with the button pressed state", () => {
    const wrapper = mountTabs();
    const closeButton = wrapper.get('button[aria-label^="Close"]');

    expect(closeButton.classes()).toContain("inset-y-0");
    expect(closeButton.classes()).toContain("my-auto");
    expect(closeButton.classes()).not.toContain("top-1/2");
    expect(closeButton.classes()).not.toContain("-translate-y-1/2");
  });

  it("keeps tabs and the add action clear of global preferences", () => {
    const wrapper = mountTabs();
    const titlebar = wrapper.get('[data-slot="project-content-tabs-titlebar"]');
    const tabList = wrapper.get('[data-slot="tabs-list"]');

    expect(titlebar.classes()).toContain(preferencesPaddingClass);
    expect(tabList.classes()).toContain("flex-1");
  });
});
