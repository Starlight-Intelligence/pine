import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "@/app/i18n";
import type { PineToolCall } from "@/shared/sessions";
import type { PineTranscriptMessage } from "@/stores/session";
import ProjectToolCallGroup from "../ProjectToolCallGroup.vue";
import ProjectToolCallMarker from "../ProjectToolCallMarker.vue";

const message: PineTranscriptMessage = {
  createdAt: "2026-08-26T00:00:00.000Z",
  id: "assistant-1",
  role: "assistant",
  status: "complete",
  blocks: [],
};

const toolCalls: PineToolCall[] = [
  {
    id: "tool-1",
    input: { command: "bun run check" },
    name: "bash",
    status: "complete",
  },
  {
    id: "tool-2",
    input: { path: "/project/src/main.ts" },
    name: "read",
    status: "complete",
  },
];

function mountGroup(
  overrides: Partial<{
    message: PineTranscriptMessage;
    toolCalls: PineToolCall[];
    followedByContent: boolean;
  }> = {},
) {
  return mount(ProjectToolCallGroup, {
    props: {
      message,
      toolCalls,
      followedByContent: true,
      ...overrides,
    },
    global: {
      directives: { "scroll-fade": {} },
      plugins: [createAppI18n("zh-CN")],
    },
  });
}

describe("ProjectToolCallGroup", () => {
  it("collapses by default when followed by content, then expands on click", async () => {
    const wrapper = mountGroup({ followedByContent: true });

    const trigger = wrapper.get('button[data-slot="marker"]');
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(trigger.text()).toContain("进行了 2 个步骤");

    const content = wrapper.get("[data-tool-calls-content]");
    expect(content.attributes("aria-hidden")).toBe("true");

    await trigger.trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(content.attributes("aria-hidden")).toBe("false");
    expect(wrapper.findAllComponents(ProjectToolCallMarker)).toHaveLength(2);
  });

  it("stays expanded for the trailing activity of a message", () => {
    const wrapper = mountGroup({ followedByContent: false });

    const trigger = wrapper.get('button[data-slot="marker"]');
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(
      wrapper.get("[data-tool-calls-content]").attributes("aria-hidden"),
    ).toBe("false");
    expect(wrapper.findAllComponents(ProjectToolCallMarker)).toHaveLength(2);
  });

  it("auto-collapses when a later block follows the run", async () => {
    const wrapper = mountGroup({ followedByContent: false });
    expect(
      wrapper.get('button[data-slot="marker"]').attributes("aria-expanded"),
    ).toBe("true");

    await wrapper.setProps({ followedByContent: true });
    expect(
      wrapper.get('button[data-slot="marker"]').attributes("aria-expanded"),
    ).toBe("false");
  });

  it("shows the running summary and spinner while a tool is in flight", () => {
    const running: PineToolCall = {
      ...toolCalls[0],
      status: "running",
    };
    const wrapper = mountGroup({ toolCalls: [running] });
    expect(wrapper.get('button[data-slot="marker"]').text()).toContain(
      "正在执行 1 个步骤",
    );
    expect(
      wrapper.get('[data-slot="marker"]').findComponent({ name: "Spinner" }),
    ).not.toBeUndefined();
  });
});
