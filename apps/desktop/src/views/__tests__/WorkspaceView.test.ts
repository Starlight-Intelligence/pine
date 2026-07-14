import { shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import WorkspaceView from "../WorkspaceView.vue";

vi.mock("@/components/sessions/SessionSearchOverlay.vue", () => ({
  default: {
    props: ["open"],
    emits: ["update:open"],
    template: '<div data-testid="session-search" :data-open="open" />',
  },
}));
vi.mock("@/components/workspace/WorkspaceSidebar.vue", () => ({
  default: {
    template: "<aside />",
  },
}));
vi.mock("@/components/workspace/WorkspaceContentTabs.vue", () => ({
  default: {
    template: "<section />",
  },
}));
vi.mock("@/components/window/WindowTitleBar.vue", () => ({
  default: {
    template: "<header />",
  },
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarInset: { template: "<main><slot /></main>" },
  SidebarProvider: { template: "<div><slot /></div>" },
  SidebarTrigger: { template: "<button />" },
}));

describe("WorkspaceView", () => {
  it("starts with session search closed", () => {
    const wrapper = shallowMount(WorkspaceView);

    expect(
      wrapper.get('[data-testid="session-search"]').attributes("data-open"),
    ).toBe("false");
  });
});
