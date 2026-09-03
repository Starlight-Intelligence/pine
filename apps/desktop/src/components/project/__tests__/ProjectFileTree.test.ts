import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { injectTreeRootContext } from "reka-ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import { useProjectStore } from "@/stores/project";
import { PROJECT_ENTRY_DRAG_TYPE } from "@/lib/projectFileDrag";
import ProjectFileTree from "../ProjectFileTree.vue";

// happy-dom has no layout. Keep the real tree and menus, rendering the visible
// tree items in place of viewport measurements only.
const virtualizer = defineComponent({
  setup(_, { slots }) {
    const context = injectTreeRootContext();
    return () =>
      h(
        "div",
        context.expandedItems.value.flatMap(
          (item) => slots.default?.({ item }) ?? [],
        ),
      );
  },
});
const wrappers: ReturnType<typeof mount>[] = [];
beforeEach(() => localStorage.clear());
function mountTree(access: "read-only" | "read-write" = "read-write") {
  const pinia = createPinia();
  setActivePinia(pinia);
  const folderId = "cde9a86c-7632-43ac-96d6-c41ddeddce0e";
  useProjectStore().activeProject = {
    id: "p1",
    name: "Project",
    schemaVersion: 1,
    createdAt: "",
    updatedAt: "",
    defaultFolderId: folderId,
    folders: [
      {
        id: folderId,
        name: "project",
        path: "/project",
        access,
        isAvailable: true,
      },
    ],
  };
  const listProjectDirectory = vi.fn(
    ({ relativePath }: { relativePath: string }) =>
      Promise.resolve({
        entries: relativePath
          ? []
          : [
              { name: "docs", relativePath: "docs", kind: "directory" },
              { name: "notes.md", relativePath: "notes.md", kind: "file" },
            ],
      }),
  );
  const operateProjectFile = vi.fn(() => Promise.resolve());
  Object.defineProperty(window, "pine", {
    configurable: true,
    value: {
      listProjectDirectory,
      operateProjectFile,
      getPathForFile: (file: File) => `/external/${file.name}`,
    },
  });
  const wrapper = mount(ProjectFileTree, {
    attachTo: document.body,
    global: {
      plugins: [pinia, createAppI18n("zh-CN")],
      stubs: { TreeVirtualizer: virtualizer },
    },
  });
  wrappers.push(wrapper);
  return { wrapper, folderId, listProjectDirectory, operateProjectFile };
}
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = "";
});

function menuItem(text: string) {
  const item = [...document.querySelectorAll('[role="menuitem"]')].find(
    (element) => element.textContent?.includes(text),
  );
  if (!item) throw new Error(`Missing menu item: ${text}`);
  return new DOMWrapper(item);
}

async function expandRoot(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-path=""]').trigger("click");
  await flushPromises();
}

describe("ProjectFileTree", () => {
  it("restores expanded folders after remounting with a fresh store", async () => {
    const first = mountTree();
    await expandRoot(first.wrapper);
    await first.wrapper.get('[data-path="docs"]').trigger("click");
    await flushPromises();
    first.wrapper.unmount();
    wrappers.pop();
    const restored = mountTree();
    await flushPromises();
    expect(
      restored.wrapper.get('[data-path=""]').attributes("aria-expanded"),
    ).toBe("true");
    expect(restored.listProjectDirectory).toHaveBeenCalledWith({
      folderId: restored.folderId,
      relativePath: "docs",
    });
    expect(restored.wrapper.find('[data-path="notes.md"]').exists()).toBe(true);
  });

  it("drags an internal reference and moves it onto a folder", async () => {
    const { wrapper, folderId, operateProjectFile, listProjectDirectory } =
      mountTree();
    await expandRoot(wrapper);
    const data = new Map<string, string>();
    const transfer = {
      types: [PROJECT_ENTRY_DRAG_TYPE],
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type),
      effectAllowed: "none",
      dropEffect: "none",
    };
    await wrapper
      .get('[data-path="notes.md"]')
      .trigger("dragstart", { dataTransfer: transfer });
    expect(transfer.effectAllowed).toBe("copyMove");
    expect(JSON.parse(data.get(PROJECT_ENTRY_DRAG_TYPE)!)).toEqual([
      { folderId, relativePath: "notes.md" },
    ]);
    await wrapper
      .get('[data-path="docs"]')
      .trigger("dragover", { dataTransfer: transfer });
    expect(transfer.dropEffect).toBe("move");
    await wrapper
      .get('[data-path="docs"]')
      .trigger("drop", { dataTransfer: transfer });
    await flushPromises();
    expect(operateProjectFile).toHaveBeenCalledWith({
      action: "move",
      target: { folderId, relativePath: "docs" },
      sources: [{ folderId, relativePath: "notes.md" }],
    });
    expect(listProjectDirectory).toHaveBeenCalledWith({
      folderId,
      relativePath: "docs",
    });
  });

  it("moves external drops into the target folder", async () => {
    const { wrapper, folderId, operateProjectFile } = mountTree();
    await expandRoot(wrapper);
    await wrapper.get('[data-path="docs"]').trigger("drop", {
      dataTransfer: {
        types: ["Files"],
        files: [new File(["data"], "notes.md")],
      },
    });
    await flushPromises();
    expect(operateProjectFile).toHaveBeenCalledWith({
      action: "move-external",
      target: { folderId, relativePath: "docs" },
      paths: ["/external/notes.md"],
    });
  });

  it("opens the shadcn menu and renames through the name dialog", async () => {
    const { wrapper, folderId, operateProjectFile } = mountTree();
    await expandRoot(wrapper);
    await wrapper
      .get('[data-path="notes.md"] [data-slot="context-menu-trigger"]')
      .trigger("contextmenu", { button: 2, clientX: 20, clientY: 20 });
    await flushPromises();
    expect(
      wrapper.get('[data-path="notes.md"]').attributes("data-context-open"),
    ).toBe("");
    expect(document.body.textContent).not.toContain("新建文件\n");
    await menuItem("重命名").trigger("click");
    await flushPromises();
    const input = new DOMWrapper(
      document.querySelector<HTMLInputElement>("#project-entry-name"),
    );
    await input.setValue("renamed.md");
    await new DOMWrapper(
      document.querySelector('[role="dialog"] form'),
    ).trigger("submit");
    await flushPromises();
    expect(operateProjectFile).toHaveBeenCalledWith({
      action: "rename",
      target: { folderId, relativePath: "notes.md" },
      name: "renamed.md",
    });
  });

  it("disables mutations and rejects drops in read-only folders while allowing attachment drags", async () => {
    const { wrapper, operateProjectFile } = mountTree("read-only");
    await expandRoot(wrapper);
    expect(wrapper.get('[data-path="notes.md"]').attributes("draggable")).toBe(
      "true",
    );
    const transfer = {
      types: ["Files"],
      files: [new File([], "notes.md")],
      dropEffect: "move",
    };
    await wrapper
      .get('[data-path="docs"]')
      .trigger("dragover", { dataTransfer: transfer });
    expect(transfer.dropEffect).toBe("none");
    await wrapper
      .get('[data-path="docs"]')
      .trigger("drop", { dataTransfer: transfer });
    await wrapper
      .get('[data-path="notes.md"] [data-slot="context-menu-trigger"]')
      .trigger("contextmenu", { button: 2 });
    await flushPromises();
    expect(menuItem("重命名").attributes("data-disabled")).toBeDefined();
    expect(operateProjectFile).not.toHaveBeenCalled();
  });
});
