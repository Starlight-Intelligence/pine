import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ProjectTranscriptMessage from "../ProjectTranscriptMessage.vue";

describe("ProjectTranscriptMessage", () => {
  it("renders completed assistant output as Markdown", () => {
    const wrapper = mount(ProjectTranscriptMessage, {
      props: {
        message: {
          createdAt: "2026-08-26T00:00:00.000Z",
          id: "assistant-complete",
          role: "assistant",
          status: "complete",
          blocks: [{ type: "text", text: "**Complete** output" }],
        },
      },
    });

    expect(wrapper.get('[data-slot="markdown-content"] strong').text()).toBe(
      "Complete",
    );
  });

  it("keeps streaming assistant output as plain text", () => {
    const wrapper = mount(ProjectTranscriptMessage, {
      props: {
        message: {
          createdAt: "2026-08-26T00:00:00.000Z",
          id: "assistant-streaming",
          role: "assistant",
          status: "streaming",
          blocks: [{ type: "text", text: "**Still streaming**" }],
        },
      },
    });

    expect(wrapper.find('[data-slot="markdown-content"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("**Still streaming**");
  });

  it("keeps user messages as plain text", () => {
    const wrapper = mount(ProjectTranscriptMessage, {
      props: {
        message: {
          createdAt: "2026-08-26T00:00:00.000Z",
          id: "user-complete",
          role: "user",
          status: "complete",
          blocks: [{ type: "text", text: "**Literal prompt**" }],
        },
      },
    });

    expect(wrapper.find('[data-slot="markdown-content"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("**Literal prompt**");
  });
});
