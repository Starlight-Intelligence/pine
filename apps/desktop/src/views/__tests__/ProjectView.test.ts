import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectView from "../ProjectView.vue";

vi.mock("@/components/sessions/SessionSearchOverlay.vue", () => ({
  default: {
    props: ["open"],
    emits: ["update:open"],
    template: '<div data-testid="session-search" :data-open="open" />',
  },
}));
vi.mock("@/components/project/ProjectSidebar.vue", () => ({
  default: { template: "<aside />" },
}));
vi.mock("@/components/project/ProjectContentTabs.vue", () => ({
  default: { template: "<section />" },
}));
vi.mock("@/components/project/ProjectDialog.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("@/components/preferences/PinePreferencesDialog.vue", () => ({
  default: { template: '<button data-testid="pine-preferences" />' },
}));
vi.mock("@/components/window/WindowTitleBar.vue", () => ({
  default: {
    template:
      '<header><slot name="leading" /><slot name="trailing" /></header>',
  },
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarInset: { template: "<main><slot /></main>" },
  SidebarProvider: { template: "<div><slot /></div>" },
  SidebarTrigger: { template: "<button />" },
}));

describe("ProjectView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("starts with session search closed", () => {
    const pinia = createPinia();
    const wrapper = mount(ProjectView, { global: { plugins: [pinia] } });

    expect(
      wrapper.get('[data-testid="session-search"]').attributes("data-open"),
    ).toBe("false");
    expect(wrapper.find('[data-testid="pine-preferences"]').exists()).toBe(
      true,
    );
  });
});
