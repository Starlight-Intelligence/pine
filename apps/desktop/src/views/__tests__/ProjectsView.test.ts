import { createPinia, setActivePinia } from "pinia";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import { InputGroupInput } from "@/components/ui/input-group";
import type { PineProject } from "@/shared/projects";
import ProjectsView from "../ProjectsView.vue";

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/project/ProjectDialog.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("@/components/window/WindowTitleBar.vue", () => ({
  default: {
    template:
      '<header><slot name="leading" /><slot name="trailing" /></header>',
  },
}));

const project: PineProject = {
  createdAt: "2026-08-19T12:00:00.000Z",
  defaultFolderId: "cde9a86c-7632-43ac-96d6-c41ddeddce0e",
  folders: [
    {
      access: "read-write",
      id: "cde9a86c-7632-43ac-96d6-c41ddeddce0e",
      isAvailable: true,
      name: "pine",
      path: "/projects/pine",
    },
  ],
  id: "9ab0b15f-331f-4aa6-8056-cd2be3bf7414",
  name: "pine",
  schemaVersion: 1,
  updatedAt: "2026-08-19T12:00:00.000Z",
};

async function mountView(projects: PineProject[]) {
  Object.defineProperty(window, "pine", {
    configurable: true,
    value: {
      listProjects: vi.fn().mockResolvedValue({ projects }),
      platform: "darwin",
    },
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = shallowMount(ProjectsView, {
    global: {
      plugins: [pinia, createAppI18n("zh-CN")],
      stubs: {
        InputGroup: false,
        Item: false,
        ItemContent: false,
        ItemDescription: false,
        ItemGroup: false,
        ItemMedia: false,
        ItemTitle: false,
        Primitive: {
          props: ["as"],
          template: '<component :is="as"><slot /></component>',
        },
        WindowTitleBar: false,
      },
    },
  });

  await flushPromises();
  return wrapper;
}

describe("ProjectsView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders the project row as the open action without a separate button", async () => {
    const wrapper = await mountView([project]);
    const projectCard = wrapper.get('[data-testid="project-card"]');
    expect(projectCard.element.tagName).toBe("BUTTON");
    expect(projectCard.text()).toContain("/projects/pine");
    expect(projectCard.text()).not.toContain("打开");
  });

  it("hides the create item while searching by project name", async () => {
    const wrapper = await mountView([project]);

    expect(wrapper.findAll('[data-testid="project-card"]')).toHaveLength(1);

    wrapper.getComponent(InputGroupInput).vm.$emit("update:modelValue", "pine");
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="create-project-card"]').exists()).toBe(
      false,
    );
    expect(wrapper.findAll('[data-testid="project-card"]')).toHaveLength(1);

    wrapper
      .getComponent(InputGroupInput)
      .vm.$emit("update:modelValue", "missing");
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('[data-testid="project-card"]')).toHaveLength(0);
  });
});
