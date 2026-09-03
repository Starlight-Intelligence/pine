import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import MarkdownContent from "../MarkdownContent.vue";

describe("MarkdownContent", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders common Markdown structures", () => {
    const wrapper = mount(MarkdownContent, {
      props: {
        source:
          "## Result\n\nA **strong** result with `code`.\n\n- first\n- second",
      },
    });

    expect(wrapper.get("h2").text()).toBe("Result");
    expect(wrapper.get("strong").text()).toBe("strong");
    expect(wrapper.get("code").text()).toBe("code");
    expect(wrapper.findAll("li").map((item) => item.text())).toEqual([
      "first",
      "second",
    ]);
  });

  it("escapes raw HTML so it is never rendered as an element", () => {
    const wrapper = mount(MarkdownContent, {
      props: {
        source: '<script data-test="unsafe">alert(1)</script>',
      },
    });

    expect(wrapper.find("script").exists()).toBe(false);
    expect(wrapper.text()).toContain('<script data-test="unsafe">');
  });

  it("prevents links from navigating the app window", () => {
    const wrapper = mount(MarkdownContent, {
      props: { source: "[Documentation](https://example.com)" },
    });

    expect(wrapper.get("a").attributes()).toEqual(
      expect.objectContaining({
        href: "https://example.com",
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    );
  });

  it("renders streamed markdown and commits the tail on completion", async () => {
    const wrapper = mount(MarkdownContent, {
      props: { source: "# Hello\n\nFirst paragraph", final: false },
    });

    // A closed heading renders immediately even while the stream is open.
    expect(wrapper.get("h1").text()).toBe("Hello");

    await wrapper.setProps({
      source: "# Hello\n\nFirst paragraph\n\nSecond paragraph",
      final: true,
    });
    // smooth-streaming is disabled, so each update renders synchronously;
    // flush the parent -> child prop propagation microtask before asserting.
    await nextTick();

    expect(wrapper.get("p").text()).toBe("First paragraph");
    expect(wrapper.text()).toContain("Second paragraph");
  });

  it("renders a fenced code block with a copy button", async () => {
    const wrapper = mount(MarkdownContent, {
      props: { source: "```ts\nconst x: number = 1;\n```" },
    });
    // The code text is rendered by shiki asynchronously; the container and its
    // copy button are present synchronously, so assert those.
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-slot="code-block"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="复制代码"]').exists()).toBe(true);
  });

  it("renders rich Markdown and column alignment in shadcn table cells", () => {
    const wrapper = mount(MarkdownContent, {
      props: {
        source:
          "| Name | Count | Details |\n| :--- | ---: | :---: |\n| **Pine** | 2 | [Docs](https://example.com) and `code` |\n| <img src=x onerror=alert(1)> | 3 | Plain text |",
        final: true,
      },
    });

    const table = wrapper.get('[data-slot="table"]');
    expect(table.findAll("th").map((cell) => cell.text())).toEqual([
      "Name",
      "Count",
      "Details",
    ]);
    expect(table.get("strong").text()).toBe("Pine");
    expect(table.get("code").text()).toBe("code");
    expect(table.get("a").attributes("target")).toBe("_blank");
    expect(table.findAll("th")[1].classes()).toContain("text-right");
    expect(table.findAll("td")[2].classes()).toContain("text-center");
    expect(table.find("img").exists()).toBe(false);
    expect(table.text()).toContain("<img src=x onerror=alert(1)>");
    wrapper.unmount();
  });

  it("appends streamed table rows without replacing existing content", async () => {
    const source = "| Name | Count |\n| --- | --- |\n| Pine | 1 |\n";
    const wrapper = mount(MarkdownContent, {
      props: { source, final: false },
    });
    const firstRow = wrapper.get("tbody tr").element;
    await wrapper.setProps({ source: `${source}| Oak | 2 |\n`, final: true });
    await nextTick();

    expect(wrapper.findAll("tbody tr")).toHaveLength(2);
    expect(wrapper.get("tbody tr").element).toBe(firstRow);
    expect(wrapper.findAll("tbody tr")[1].text()).toContain("Oak");
    wrapper.unmount();
  });
});
