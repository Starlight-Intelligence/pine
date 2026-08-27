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
    expanded: boolean;
  }> = {},
) {
  return mount(ProjectToolCallGroup, {
    props: {
      message,
      toolCalls,
      ...overrides,
    },
    global: {
      directives: { "scroll-fade": {} },
      plugins: [createAppI18n("zh-CN")],
    },
  });
}

describe("ProjectToolCallGroup", () => {
  it("collapses by default and expands on click", async () => {
    const wrapper = mountGroup();

    const trigger = wrapper.get('button[data-slot="marker"]');
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(trigger.text()).toContain("读取了 1 个文件，运行了 1 条命令");

    const content = wrapper.get("[data-tool-calls-content]");
    expect(content.attributes("aria-hidden")).toBe("true");

    await trigger.trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(content.attributes("aria-hidden")).toBe("false");
    expect(wrapper.findAllComponents(ProjectToolCallMarker)).toHaveLength(2);
  });

  it("follows the transcript-level expansion policy while active", () => {
    const wrapper = mountGroup({ expanded: true });

    const trigger = wrapper.get('button[data-slot="marker"]');
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(
      wrapper.get("[data-tool-calls-content]").attributes("aria-hidden"),
    ).toBe("false");
    expect(wrapper.findAllComponents(ProjectToolCallMarker)).toHaveLength(2);
  });

  it("collapses static history runs by default", () => {
    const wrapper = mountGroup();

    expect(
      wrapper.get('button[data-slot="marker"]').attributes("aria-expanded"),
    ).toBe("false");
    expect(
      wrapper.get("[data-tool-calls-content]").attributes("aria-hidden"),
    ).toBe("true");
  });

  it("folds when the run drops out of the window or the response ends", async () => {
    const wrapper = mountGroup({ expanded: true });
    expect(
      wrapper.get('button[data-slot="marker"]').attributes("aria-expanded"),
    ).toBe("true");

    await wrapper.setProps({ expanded: false });
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
      "正在运行 1 条命令",
    );
    expect(
      wrapper.get('[data-slot="marker"]').findComponent({ name: "Spinner" }),
    ).not.toBeUndefined();
  });

  it("shows icons in actual call order, before the label", () => {
    const ordered: PineToolCall[] = [
      { id: "t-bash", input: {}, name: "bash", status: "complete" },
      {
        id: "t-read",
        input: { path: "/a.ts" },
        name: "read",
        status: "complete",
      },
      {
        id: "t-read-2",
        input: { path: "/b.ts" },
        name: "read",
        status: "complete",
      },
    ];
    const wrapper = mountGroup({ toolCalls: ordered });

    const iconNames = wrapper
      .get("[data-tool-icons]")
      .findAll("svg")
      .map((icon) => icon.attributes("class") ?? "");

    expect(iconNames.filter((name) => name.includes("file-text")).length).toBe(
      2,
    );
    // Every icon keeps its own fixed size so multiple icons never share width.
    for (const name of iconNames) {
      expect(name).toContain("size-4");
    }
    const firstFileText = iconNames.findIndex((name) =>
      name.includes("file-text"),
    );
    const firstTerminal = iconNames.findIndex((name) =>
      name.includes("terminal"),
    );
    // bash (terminal) happens before the read (file-text) calls in actual order.
    expect(firstTerminal).toBeLessThan(firstFileText);
  });
});
