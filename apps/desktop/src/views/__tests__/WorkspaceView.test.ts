import { createTestingPinia } from "@pinia/testing";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import WorkspaceView from "../WorkspaceView.vue";

describe("WorkspaceView", () => {
  it("shows the active workspace path", () => {
    const wrapper = mount(WorkspaceView, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            initialState: {
              workspace: {
                currentWorkspace: {
                  id: "9ab0b15f-331f-4aa6-8056-cd2be3bf7414",
                  name: "pine",
                  rootPath: "/workspace/pine",
                },
              },
            },
          }),
        ],
      },
    });

    expect(wrapper.text()).toContain("/workspace/pine");
  });
});
