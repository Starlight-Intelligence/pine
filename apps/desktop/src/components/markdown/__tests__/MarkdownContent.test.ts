import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MarkdownContent from "../MarkdownContent.vue";

describe("MarkdownContent", () => {
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

  it("keeps markdown-it's default raw HTML protection enabled", () => {
    const wrapper = mount(MarkdownContent, {
      props: {
        source: '<script data-test="unsafe">alert(1)</script>',
      },
    });

    expect(wrapper.find("script").exists()).toBe(false);
    expect(wrapper.text()).toContain('<script data-test="unsafe">');
  });

  it("prevents links from navigating the Pine window", () => {
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
});
