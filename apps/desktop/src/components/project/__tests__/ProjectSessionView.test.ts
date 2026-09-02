import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import ProjectSessionView from "../ProjectSessionView.vue";

vi.mock("@/composables/useContentTabNavigation", () => ({
  useContentTabNavigation: () => ({
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
