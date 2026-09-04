import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
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
  Object.defineProperty(window, "pine", {
    configurable: true,
    value: { readProjectFilePreview: read },
  });
  const wrapper = mount(ProjectFilePreview, {
    props: { file },
    global: { plugins: [createPinia(), createAppI18n("en-US")] },
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
    expect(metadata.text()).toContain("Modified");
    expect(metadata.text()).not.toContain("Read only");
    expect(wrapper.find("textarea, [contenteditable=true]").exists()).toBe(
      false,
    );
    expect(wrapper.find("pre.shiki").exists()).toBe(true);
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
