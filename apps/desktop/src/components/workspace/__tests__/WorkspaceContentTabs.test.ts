import { mount } from "@vue/test-utils";
import { computed } from "vue";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import WorkspaceContentTabs from "../WorkspaceContentTabs.vue";

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

vi.mock("../WorkspaceSessionView.vue", () => ({
  default: {
    template: "<div />",
  },
}));

const windowControlsPaddingClass =
  "pl-[calc(var(--window-titlebar-leading-offset)+var(--window-titlebar-control-height)+0.75rem)]";

function mountTabs() {
  return mount(WorkspaceContentTabs, {
    global: {
      plugins: [createAppI18n("en-US")],
    },
  });
}

describe("WorkspaceContentTabs", () => {
  it("does not reserve window controls space beside an expanded desktop sidebar", () => {
    sidebar.state = "expanded";
    sidebar.isMobile = false;

    const wrapper = mountTabs();

    expect(
      wrapper.get('[data-slot="workspace-content-tabs-titlebar"]').classes(),
    ).not.toContain(windowControlsPaddingClass);
  });

  it("reserves window controls space when the sidebar is manually collapsed", () => {
    sidebar.state = "collapsed";
    sidebar.isMobile = false;

    const wrapper = mountTabs();

    expect(
      wrapper.get('[data-slot="workspace-content-tabs-titlebar"]').classes(),
    ).toContain(windowControlsPaddingClass);
  });

  it("reserves window controls space when a narrow viewport hides the desktop sidebar", () => {
    sidebar.state = "expanded";
    sidebar.isMobile = true;
    const wrapper = mountTabs();

    expect(
      wrapper.get('[data-slot="workspace-content-tabs-titlebar"]').classes(),
    ).toContain(windowControlsPaddingClass);
  });
});
