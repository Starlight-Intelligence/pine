import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { useContentTabsStore } from "@/stores/contentTabs";
import { useProjectStore } from "@/stores/project";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import { codeToHtml } from "@/lib/codeHighlight";
import type { ProjectFilePreview as Preview } from "@/shared/projectFiles";
import ProjectFilePreview from "../ProjectFilePreview.vue";

vi.mock("@/lib/codeHighlight", () => ({
  codeToHtml: vi
    .fn()
    .mockResolvedValue('<pre class="shiki"><code>highlighted</code></pre>'),
}));
const info = { size: 2048, modifiedAt: "2026-09-04T12:00:00Z" };
const file = { projectId: "p1", folderId: "f1", relativePath: "src/main.py" };
const wrappers: ReturnType<typeof mount>[] = [];
function render(read: (request: unknown) => Promise<Preview>) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: {} }],
  });
  Object.defineProperty(window, "pine", {
    configurable: true,
    value: { readProjectFilePreview: read },
  });
  const wrapper = mount(ProjectFilePreview, {
    props: { file },
    attachTo: document.body,
    global: { plugins: [pinia, router, createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

describe("ProjectFilePreview", () => {
  it("shows file metadata and highlights read-only text", async () => {
    const read = vi.fn().mockResolvedValue({
      ...info,
      kind: "text",
      text: "print(1)\n",
      encoding: "UTF-8",
    });
    const wrapper = render(read);
    await flushPromises();
    expect(read).toHaveBeenCalledWith(file);
    expect(codeToHtml).toHaveBeenCalledWith(
      "print(1)\n",
      expect.objectContaining({ lang: "python" }),
    );
    const metadata = wrapper.get('[aria-label="File metadata"]');
    expect(metadata.text()).toContain("PY");
    expect(metadata.text()).toContain("2 KB");
    expect(metadata.text()).toContain("UTF-8");
    expect(metadata.text()).toContain("2 lines");
    expect(metadata.text()).not.toContain("Modified");
    expect(wrapper.element.lastElementChild).toBe(metadata.element);
    expect(metadata.text()).not.toContain("Read only");
    expect(wrapper.find("textarea, [contenteditable=true]").exists()).toBe(
      false,
    );
    expect(wrapper.find("pre.shiki").exists()).toBe(true);
    expect(wrapper.get('[data-slot="code-block"]').classes()).toContain(
      "w-full",
    );
    expect(
      Array.from(
        wrapper.get('[data-slot="code-block"]').element.parentElement
          ?.classList ?? [],
      ),
    ).toEqual(expect.arrayContaining(["min-w-0", "px-4", "pb-4"]));
  });

  it("lists only open session tabs and attaches the file through the footer menu", async () => {
    const wrapper = render(
      vi.fn().mockResolvedValue({
        ...info,
        kind: "text",
        text: "hi",
        encoding: "UTF-8",
      }),
    );
    const store = useContentTabsStore();
    const session = {
      id: "s1",
      name: "Review",
      createdAt: "",
      updatedAt: "",
      messageCount: 0,
    };
    store.bindSession("session-1", session);
    const draft = store.createSessionTab();
    store.openFile(file);
    useProjectStore().activeProject = {
      id: "p1",
      name: "Project",
      schemaVersion: 1,
      createdAt: "",
      updatedAt: "",
      defaultFolderId: "f1",
      folders: [],
    };
    const attachment = {
      name: "main.py",
      path: "/project/src/main.py",
      extension: "py",
      size: 2,
      modifiedAt: "",
    };
    window.pine.inspectProjectAttachments = vi
      .fn()
      .mockResolvedValue({ attachments: [attachment] });
    await flushPromises();
    await wrapper.get("footer button").trigger("click");
    await flushPromises();
    const choices = Array.from(document.querySelectorAll('[role="menuitem"]'));
    expect(choices.map((item) => item.textContent?.trim())).toEqual([
      "Review",
      "New session",
      "Create session",
    ]);
    await new DOMWrapper(choices[1]).trigger("click");
    await flushPromises();
    expect(store.attachmentsFor(draft.id)).toEqual([attachment]);
    expect(store.attachmentsFor("session-1")).toEqual([]);
    expect(store.fallbackActiveTabId).toBe(draft.id);
    await wrapper.get("footer button").trigger("click");
    await flushPromises();
    const separator = document.querySelector(
      '[data-slot="dropdown-menu-separator"]',
    );
    const createAction = document.querySelector('[data-action="new-session"]');
    expect(separator).not.toBeNull();
    expect(createAction).not.toBeNull();
    await new DOMWrapper(createAction).trigger("click");
    await flushPromises();
    const createdId = store.fallbackActiveTabId!;
    expect(createdId).not.toBe(draft.id);
    expect(store.tabs.find((tab) => tab.id === createdId)).toMatchObject({
      state: "draft",
    });
    expect(store.attachmentsFor(createdId)).toEqual([attachment]);
  });

  it("ignores stale reads when switching files", async () => {
    let first!: (preview: Preview) => void;
    const read = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Preview>((resolve) => {
            first = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ...info,
        kind: "image",
        url: "pine-project-media://preview/image",
      });
    const wrapper = render(read);
    await wrapper.setProps({ file: { ...file, relativePath: "photo.png" } });
    await flushPromises();
    first({ ...info, kind: "text", text: "old", encoding: "UTF-8" });
    await flushPromises();
    expect(wrapper.get("img").attributes("src")).toBe(
      "pine-project-media://preview/image",
    );
    expect(wrapper.find("pre").exists()).toBe(false);
    Object.defineProperties(wrapper.get("img").element, {
      naturalWidth: { value: 640 },
      naturalHeight: { value: 480 },
    });
    await wrapper.get("img").trigger("load");
    expect(wrapper.text()).toContain("640 × 480");
  });

  it("renders video controls and dimensions with duration", async () => {
    const wrapper = render(
      vi.fn().mockResolvedValue({
        ...info,
        kind: "video",
        url: "pine-project-media://preview/video",
      }),
    );
    await flushPromises();
    const video = wrapper.get("video");
    expect(video.attributes()).toMatchObject({
      controls: "",
      preload: "metadata",
    });
    expect(video.attributes("autoplay")).toBeUndefined();
    Object.defineProperties(video.element, {
      videoWidth: { value: 1920 },
      videoHeight: { value: 1080 },
      duration: { value: 65 },
    });
    await video.trigger("loadedmetadata");
    expect(wrapper.text()).toContain("1920 × 1080");
    expect(wrapper.text()).toContain("1:05");
    await video.trigger("error");
    expect(wrapper.text()).toContain("Unable to preview file");
  });

  it("pauses background video without resetting its playback position", async () => {
    const wrapper = render(
      vi.fn().mockResolvedValue({
        ...info,
        kind: "video",
        url: "pine-project-media://preview/video",
      }),
    );
    await flushPromises();
    const video = wrapper.get("video").element;
    const pause = vi.spyOn(video, "pause");
    video.currentTime = 42;
    await wrapper.setProps({ active: false });
    expect(pause).toHaveBeenCalledTimes(1);
    await wrapper.setProps({ active: true });
    expect(wrapper.get("video").element).toBe(video);
    expect(video.currentTime).toBe(42);
    expect(pause).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it("shows unsupported and error states and allows retrying", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce({
        ...info,
        kind: "unsupported",
        reason: "too-large",
      });
    const wrapper = render(read);
    await flushPromises();
    expect(wrapper.text()).toContain("Unable to preview file");
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("2 MB");
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });
});
