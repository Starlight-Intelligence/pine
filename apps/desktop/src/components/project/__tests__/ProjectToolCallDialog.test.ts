import { mount } from "@vue/test-utils";
import { AlertCircleIcon, ShieldBanIcon } from "@lucide/vue";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "@/app/i18n";
import ProjectToolCallMarker from "../ProjectToolCallMarker.vue";

function mountMarker(decidedBy: "judge" | "user" | "sandbox" | null = "judge") {
  return mount(ProjectToolCallMarker, {
    attachTo: document.body,
    props: {
      toolCall: {
        id: "call-bash-1",
        name: "bash",
        status: "error",
        approval: decidedBy
          ? {
              state: "denied",
              decidedBy,
              reason: "请改用不会覆盖现有文件的命令。",
            }
          : undefined,
        input: {
          command: "dangerous-command",
          description: "覆盖现有文件",
        },
        output: [
          {
            type: "text",
            text: "First paragraph\n\nSecond paragraph",
          },
        ],
        durationMs: 1_250,
      },
    },
    global: {
      plugins: [createAppI18n("zh-CN")],
    },
  });
}

describe("ProjectToolCallDialog", () => {
  it.each(["judge", "user"] as const)(
    "distinguishes %s denials from execution failures",
    async (decidedBy) => {
      const wrapper = mountMarker(decidedBy);
      expect(wrapper.findComponent(ShieldBanIcon).exists()).toBe(true);
      expect(wrapper.findComponent(AlertCircleIcon).exists()).toBe(false);
      expect(wrapper.text()).toContain("已拒绝");
      expect(wrapper.get('[data-slot="marker-content"]').classes()).toContain(
        "text-warning",
      );
      await wrapper.setProps({
        reviewing: true,
        toolCall: { ...wrapper.props("toolCall"), status: "running" },
      });
      expect(wrapper.text()).toContain("已拒绝");
      expect(wrapper.text()).not.toContain("正在审核");
      expect(
        wrapper.get('[data-slot="marker-content"]').classes(),
      ).not.toContain("shimmer");
      await wrapper.get('button[data-slot="marker"]').trigger("click");
      const badges = document.body.querySelectorAll(
        '[data-slot="dialog-content"] [data-slot="badge"]',
      );
      expect(badges).toHaveLength(2);
      for (const badge of badges) {
        expect(badge.classList).toContain("text-warning");
        expect(badge.classList).not.toContain("text-destructive");
      }
      expect(document.body.textContent).toContain(
        decidedBy === "judge" ? "自动审批驳回" : "用户已拒绝",
      );
      wrapper.unmount();
    },
  );

  it("labels sandbox denials as sandbox-rejected warnings", async () => {
    const wrapper = mountMarker("sandbox");
    expect(wrapper.findComponent(ShieldBanIcon).exists()).toBe(true);
    expect(wrapper.findComponent(AlertCircleIcon).exists()).toBe(false);
    await wrapper.get('button[data-slot="marker"]').trigger("click");
    expect(document.body.textContent).toContain("沙箱拒绝");
    const badges = document.body.querySelectorAll(
      '[data-slot="dialog-content"] [data-slot="badge"]',
    );
    for (const badge of badges) {
      expect(badge.classList).toContain("text-warning");
      expect(badge.classList).not.toContain("text-destructive");
    }
    wrapper.unmount();
  });

  it("keeps execution failures destructive", async () => {
    const wrapper = mountMarker(null);
    expect(wrapper.findComponent(AlertCircleIcon).exists()).toBe(true);
    expect(wrapper.findComponent(ShieldBanIcon).exists()).toBe(false);
    expect(wrapper.get('[data-slot="marker-content"]').classes()).toContain(
      "text-destructive",
    );
    await wrapper.get('button[data-slot="marker"]').trigger("click");
    const badge = document.body.querySelector(
      '[data-slot="dialog-content"] [data-slot="badge"]',
    );
    expect(badge?.classList).toContain("text-destructive");
    wrapper.unmount();
  });

  it("makes every tool marker visibly interactive", () => {
    const wrapper = mountMarker();
    const trigger = wrapper.get('button[data-slot="marker"]');

    expect(trigger.classes()).toContain("cursor-pointer");
    expect(trigger.classes()).toContain("hover:bg-muted/60");
    wrapper.unmount();
  });

  it("shows status, parameters, result, and auto-review rejection reason", async () => {
    const wrapper = mountMarker();
    await wrapper.get('button[data-slot="marker"]').trigger("click");

    const dialogText = document.body.textContent ?? "";
    expect(dialogText).toContain("工具调用详情");
    expect(dialogText).toContain("自动审批驳回");
    expect(dialogText).toContain("请改用不会覆盖现有文件的命令。");
    const dialog = document.body.querySelector('[data-slot="dialog-content"]');
    expect(dialog?.classList).toContain("sm:max-w-4xl");

    const tables = document.body.querySelectorAll("[data-tool-value-table]");
    expect(tables).toHaveLength(2);
    expect(dialogText).toContain("command");
    expect(dialogText).toContain("dangerous-command");
    expect(dialogText).toContain("[0].type");
    expect(dialogText).toContain("[0].text");
    expect(dialogText).toContain("First paragraph\n\nSecond paragraph");
    expect(dialogText).not.toContain("\\n\\n");
    expect(dialogText).toContain("1.3 秒");
    wrapper.unmount();
  });

  it("shows a live line count for an in-progress write", async () => {
    const wrapper = mount(ProjectToolCallMarker, {
      attachTo: document.body,
      props: {
        toolCall: {
          id: "call-write-1",
          name: "write",
          status: "running",
          input: {
            path: "src/main.ts",
            content: "line1\nline2\nline3",
          },
        },
      },
      global: {
        plugins: [createAppI18n("zh-CN")],
      },
    });
    const count = wrapper.get("[data-write-lines]");
    expect(count.text()).toContain("已写入 3 行");
    // The content argument grows as the model streams it.
    await wrapper.setProps({
      toolCall: {
        ...wrapper.props("toolCall"),
        input: {
          path: "src/main.ts",
          content: "line1\nline2\nline3\nline4",
        },
      },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.get("[data-write-lines]").text()).toContain("已写入 4 行");
    wrapper.unmount();
  });
});
