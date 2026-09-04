import { PROJECT_ENTRY_DRAG_TYPE } from "@/lib/projectFileDrag";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { useSessionStore } from "@/stores/session";
import { useContentTabsStore } from "@/stores/contentTabs";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import ProjectSessionView from "../ProjectSessionView.vue";

const activeTabId = ref("session-1");

vi.mock("@/composables/useContentTabNavigation", () => ({
  useContentTabNavigation: () => ({
    activeTabId: computed(() => activeTabId.value),
    bindSession: vi.fn(),
    failPrompt: vi.fn(),
  }),
}));

function fileTransfer(files: File[] = []): DataTransfer {
  return {
    dropEffect: "none",
    files,
    types: ["Files"],
  } as unknown as DataTransfer;
}

function mountView() {
  activeTabId.value = "session-1";
  const pinia = createPinia();
  setActivePinia(pinia);
  const inspectAttachments = vi.fn().mockResolvedValue({
    attachments: [
      {
        extension: "md",
        modifiedAt: "2026-09-02T12:00:00.000Z",
        name: "notes.md",
        path: "/tmp/notes.md",
        size: 1_024,
      },
    ],
  });
  Object.defineProperty(window, "pine", {
    configurable: true,
    value: {
      getPathForFile: (file: File) => `/tmp/${file.name}`,
      inspectAttachments,
      onSessionEvent: () => () => undefined,
    },
  });

  const slotStub = { template: "<div><slot /></div>" };
  const wrapper = mount(ProjectSessionView, {
    props: { tabId: "session-1" },
    global: {
      plugins: [pinia, createAppI18n("zh-CN")],
      stubs: {
        MessageScrollerProvider: slotStub,
        MessageScroller: slotStub,
        MessageScrollerViewport: slotStub,
        MessageScrollerContent: slotStub,
        MessageScrollerItem: slotStub,
        PineCharacter: true,
        ProjectSessionComposer: {
          props: ["attachments"],
          template:
            '<div data-slot="composer-stub" :data-attachment-count="attachments?.length ?? 0" />',
        },
        ProjectTranscriptMessage: true,
        ProjectTranscriptOutline: true,
      },
    },
  });
  return { inspectAttachments, wrapper };
}

describe("ProjectSessionView file drop", () => {
  it("receives attachments for its own composer while in the background", async () => {
    const { wrapper } = mountView();
    const store = useContentTabsStore();
    activeTabId.value = "file-tab";
    const attachment = {
      name: "notes.md",
      path: "/project/notes.md",
      extension: "md",
      size: 12,
      modifiedAt: "",
    };
    store.addAttachments("session-1", [attachment]);
    await flushPromises();
    expect(
      wrapper
        .get('[data-slot="composer-stub"]')
        .attributes("data-attachment-count"),
    ).toBe("1");
    wrapper.unmount();
  });
  it("keeps a hidden view on its own transcript while the active session changes", async () => {
    const { wrapper } = mountView();
    const store = useSessionStore();
    store.messages = [
      {
        id: "first-message",
        createdAt: "2026-09-03T00:00:00Z",
        role: "assistant",
        status: "complete",
        blocks: [{ type: "text", text: "First session" }],
      },
    ];
    await flushPromises();
    const firstMessages = wrapper
      .findComponent({ name: "ProjectTranscriptOutline" })
      .props("messages");

    activeTabId.value = "session-2";
    store.messages = [
      {
        id: "second-message",
        createdAt: "2026-09-03T00:00:00Z",
        role: "assistant",
        status: "complete",
        blocks: [{ type: "text", text: "Second session" }],
      },
    ];
    await flushPromises();

    expect(
      wrapper
        .findComponent({ name: "ProjectTranscriptOutline" })
        .props("messages"),
    ).toBe(firstMessages);
    expect(
      wrapper
        .findComponent({ name: "ProjectTranscriptMessage" })
        .props("message").id,
    ).toBe("first-message");
    wrapper.unmount();
  });

  it("shows and clears the attachment drop overlay", async () => {
    const { wrapper } = mountView();
    const layout = wrapper.get(".session-layout");

    await layout.trigger("dragenter", { dataTransfer: fileTransfer() });
    const overlay = wrapper.get('[data-slot="attachment-drop-overlay"]');
    expect(overlay.attributes("role")).toBe("status");
    expect(overlay.classes()).toContain("w-auto");
    expect(overlay.classes()).not.toContain("w-full");
    expect(overlay.text()).toContain("松手以添加附件");
    expect(overlay.text()).toContain("可以一次添加多个文件或文件夹");

    await layout.trigger("dragleave", { dataTransfer: fileTransfer() });
    expect(wrapper.find('[data-slot="attachment-drop-overlay"]').exists()).toBe(
      false,
    );
  });

  it("resolves dropped files and adds them to the composer", async () => {
    const { inspectAttachments, wrapper } = mountView();
    const layout = wrapper.get(".session-layout");
    const file = new File(["# Notes"], "notes.md", {
      type: "text/markdown",
    });

    await layout.trigger("dragenter", { dataTransfer: fileTransfer([file]) });
    await layout.trigger("drop", { dataTransfer: fileTransfer([file]) });
    await flushPromises();

    expect(inspectAttachments).toHaveBeenCalledWith({
      paths: ["/tmp/notes.md"],
    });
    expect(
      wrapper
        .get('[data-slot="composer-stub"]')
        .attributes("data-attachment-count"),
    ).toBe("1");
    expect(wrapper.find('[data-slot="attachment-drop-overlay"]').exists()).toBe(
      false,
    );
  });

  it("forwards a dropped folder path to attachment inspection", async () => {
    const { inspectAttachments, wrapper } = mountView();
    const layout = wrapper.get(".session-layout");
    const folder = new File([], "references");

    await layout.trigger("drop", { dataTransfer: fileTransfer([folder]) });
    await flushPromises();

    expect(inspectAttachments).toHaveBeenCalledWith({
      paths: ["/tmp/references"],
    });
  });

  it("adds internal tree entries through the existing attachment system and deduplicates them", async () => {
    const { wrapper } = mountView();
    const entries = [{ folderId: "folder-1", relativePath: "notes.md" }];
    const inspectProjectAttachments = vi.fn().mockResolvedValue({
      attachments: [
        {
          kind: "file",
          name: "notes.md",
          path: "/project/notes.md",
          size: 12,
          extension: "md",
        },
      ],
    });
    window.pine.inspectProjectAttachments = inspectProjectAttachments;
    const transfer = {
      types: [PROJECT_ENTRY_DRAG_TYPE],
      files: [],
      getData: () => JSON.stringify(entries),
    };
    const layout = wrapper.get(".session-layout");
    await layout.trigger("dragenter", { dataTransfer: transfer });
    expect(wrapper.find('[data-slot="attachment-drop-overlay"]').exists()).toBe(
      true,
    );
    await layout.trigger("drop", { dataTransfer: transfer });
    await flushPromises();
    await layout.trigger("drop", { dataTransfer: transfer });
    await flushPromises();
    expect(inspectProjectAttachments).toHaveBeenCalledWith(entries);
    expect(
      wrapper
        .get('[data-slot="composer-stub"]')
        .attributes("data-attachment-count"),
    ).toBe("1");
    expect(wrapper.find('[data-slot="attachment-drop-overlay"]').exists()).toBe(
      false,
    );
  });

  it("rejects malformed internal drags without inspecting arbitrary paths", async () => {
    const { wrapper, inspectAttachments } = mountView();
    const inspectProjectAttachments = vi.fn();
    window.pine.inspectProjectAttachments = inspectProjectAttachments;
    await wrapper.get(".session-layout").trigger("drop", {
      dataTransfer: {
        types: [PROJECT_ENTRY_DRAG_TYPE],
        getData: () => "invalid",
      },
    });
    await flushPromises();
    expect(inspectProjectAttachments).not.toHaveBeenCalled();
    expect(inspectAttachments).not.toHaveBeenCalled();
  });

  it("ignores drags that do not contain files", async () => {
    const { wrapper } = mountView();
    await wrapper.get(".session-layout").trigger("dragenter", {
      dataTransfer: {
        files: [],
        types: ["text/plain"],
      },
    });

    expect(wrapper.find('[data-slot="attachment-drop-overlay"]').exists()).toBe(
      false,
    );
  });
});
