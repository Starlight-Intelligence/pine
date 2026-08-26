import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import ProjectThinkingMarker from "../ProjectThinkingMarker.vue";
import ProjectToolCallMarker from "../ProjectToolCallMarker.vue";

describe("project transcript markers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a stable elapsed-time summary and expands streaming thinking", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);
    const wrapper = mount(ProjectThinkingMarker, {
      props: {
        message: {
          createdAt: "2026-08-26T00:00:00.000Z",
          id: "assistant-1",
          role: "assistant",
          status: "streaming",
          text: "",
          thinking: "Inspect the request.",
          thinkingStartedAt: 1_000,
          thinkingStatus: "streaming",
        },
      },
      global: {
        directives: { "scroll-fade": {} },
        plugins: [createAppI18n("en-US")],
      },
    });

    const trigger = wrapper.get('button[data-slot="marker"]');
    expect(trigger.text()).toContain("Thinking (1s)");
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(wrapper.find(".shimmer").exists()).toBe(false);

    await trigger.trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("false");
    await trigger.trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("[data-thinking-content]").text()).toBe(
      "Inspect the request.",
    );

    await wrapper.setProps({
      message: {
        ...wrapper.props("message"),
        thinking: "Inspect the request.\nCheck the active session.",
      },
    });
    expect(wrapper.get("[data-thinking-content]").text()).toContain(
      "Check the active session.",
    );
    expect(wrapper.get("[data-thinking-content]").classes()).toContain(
      "overflow-y-auto",
    );

    vi.setSystemTime(3_250);
    await vi.advanceTimersByTimeAsync(250);
    expect(trigger.text()).toContain("Thinking (2.5s)");
    wrapper.unmount();
  });

  it("auto-collapses when assistant output begins after thinking", async () => {
    const wrapper = mount(ProjectThinkingMarker, {
      props: {
        message: {
          createdAt: "2026-08-26T00:00:00.000Z",
          id: "assistant-1",
          role: "assistant",
          status: "streaming",
          text: "",
          thinking: "Inspect the request.",
          thinkingStartedAt: Date.now(),
          thinkingStatus: "streaming",
        },
      },
      global: {
        directives: { "scroll-fade": {} },
        plugins: [createAppI18n("en-US")],
      },
    });

    const trigger = wrapper.get('button[data-slot="marker"]');
    expect(trigger.attributes("aria-expanded")).toBe("true");

    await wrapper.setProps({
      message: {
        ...wrapper.props("message"),
        thinkingStatus: "complete",
      },
    });
    expect(trigger.attributes("aria-expanded")).toBe("true");

    await wrapper.setProps({
      message: {
        ...wrapper.props("message"),
        text: "Here is the result.",
      },
    });
    expect(trigger.attributes("aria-expanded")).toBe("false");
  });

  it("summarizes completed thinking and keeps the full content expandable", async () => {
    const wrapper = mount(ProjectThinkingMarker, {
      props: {
        message: {
          createdAt: "2026-08-26T00:00:00.000Z",
          id: "assistant-1",
          role: "assistant",
          status: "streaming",
          text: "Working on it",
          thinking: "Inspect the request.\nCheck the active session.",
          thinkingDurationMs: 2_500,
          thinkingStatus: "complete",
        },
      },
      global: {
        directives: { "scroll-fade": {} },
        plugins: [createAppI18n("zh-CN")],
      },
    });

    const trigger = wrapper.get('button[data-slot="marker"]');
    expect(trigger.text()).toContain("已思考 2.5 秒");
    await trigger.trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("[data-thinking-content]").text()).toContain(
      "Inspect the request.",
    );
  });

  it("uses semantic labels for primary tools and truncates commands", () => {
    const command = `bun run ${"very-long-argument ".repeat(8)}`;
    const wrapper = mount(ProjectToolCallMarker, {
      props: {
        toolCall: {
          id: "tool-1",
          input: { command },
          name: "bash",
          status: "running",
        },
      },
      global: { plugins: [createAppI18n("zh-CN")] },
    });

    const content = wrapper.get('[data-slot="marker-content"]');
    expect(content.text()).toMatch(/^正在执行 bun run/);
    expect(content.text()).toContain("…");
    expect(content.text().length).toBeLessThan(command.length);
    expect(wrapper.get('[data-slot="marker"]').attributes("role")).toBe(
      "status",
    );
  });

  it("shows the filename when a read completes", () => {
    const wrapper = mount(ProjectToolCallMarker, {
      props: {
        toolCall: {
          id: "tool-1",
          input: { path: "/Users/kw/project/src/main.ts" },
          name: "read",
          status: "complete",
        },
      },
      global: { plugins: [createAppI18n("zh-CN")] },
    });

    expect(wrapper.get('[data-slot="marker-content"]').text()).toBe(
      "已读取 main.ts",
    );

    const code = wrapper.get('[data-slot="marker-content"] code');
    expect(code.text()).toBe("main.ts");
    expect(code.classes()).toEqual(
      expect.arrayContaining(["font-mono", "bg-muted"]),
    );
  });
});
