import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "@/app/i18n";
import type { PineTranscriptMessage } from "@/stores/session";
import ProjectErrorMarker from "../ProjectErrorMarker.vue";
import ProjectTranscriptMessage from "../ProjectTranscriptMessage.vue";
import ProjectToolCallGroup from "../ProjectToolCallGroup.vue";
import ProjectToolCallMarker from "../ProjectToolCallMarker.vue";

function mountMessage(message: PineTranscriptMessage) {
  return mount(ProjectTranscriptMessage, {
    props: { message },
    global: {
      plugins: [createAppI18n("zh-CN")],
    },
  });
}

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

  it("renders a single tool call in full instead of folding it", () => {
    const wrapper = mountMessage({
      createdAt: "2026-08-26T00:00:00.000Z",
      id: "assistant-single-tool",
      role: "assistant",
      status: "complete",
      blocks: [
        {
          type: "toolCall",
          toolCall: {
            id: "call-read",
            name: "read",
            status: "complete",
            input: { path: "/project/src/main.ts" },
          },
        },
      ],
    });

    expect(wrapper.findComponent(ProjectToolCallGroup).exists()).toBe(false);
    expect(wrapper.findComponent(ProjectToolCallMarker).exists()).toBe(true);
  });

  it("renders session errors as destructive markers", () => {
    const wrapper = mountMessage({
      createdAt: "2026-08-26T00:00:00.000Z",
      id: "assistant-error",
      role: "assistant",
      status: "complete",
      blocks: [
        {
          type: "error",
          error: { message: "Provider request failed" },
        },
      ],
    });

    const marker = wrapper.getComponent(ProjectErrorMarker);
    expect(marker.get('[data-slot="marker-content"]').classes()).toContain(
      "text-destructive",
    );
    expect(marker.get('[data-slot="marker-content"]').text()).toBe(
      "错误: Provider request failed",
    );
    expect(marker.get('[data-slot="marker-icon"] svg').classes()).toContain(
      "text-destructive",
    );
  });

  it("folds consecutive tool calls into a step group", () => {
    const wrapper = mountMessage({
      createdAt: "2026-08-26T00:00:00.000Z",
      id: "assistant-multi-tool",
      role: "assistant",
      status: "complete",
      blocks: [
        {
          type: "toolCall",
          toolCall: {
            id: "call-bash",
            name: "bash",
            status: "complete",
            input: { command: "bun run check" },
          },
        },
        {
          type: "toolCall",
          toolCall: {
            id: "call-read",
            name: "read",
            status: "complete",
            input: { path: "/project/src/main.ts" },
          },
        },
      ],
    });

    expect(wrapper.findComponent(ProjectToolCallGroup).exists()).toBe(true);
  });
});
