import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "@/app/i18n";
import zhCN from "@/app/i18n/locales/zh-CN";
import type { Model, ReasoningEffort } from "../projectSessionComposerOptions";
import {
  modelOptions,
  reasoningEfforts,
} from "../projectSessionComposerOptions";
import ProjectSessionComposer from "../ProjectSessionComposer.vue";

interface ComposerProps {
  approvalMode?: "ask-for-permission" | "agent-decides" | "yolo";
  model?: Model;
  reasoningEffort?: ReasoningEffort;
}

function mountComposer(props: ComposerProps = {}) {
  return mount(ProjectSessionComposer, {
    props,
    global: {
      plugins: [createAppI18n("zh-CN")],
      stubs: {
        Tooltip: { template: "<div><slot /></div>" },
        TooltipContent: { template: "<div><slot /></div>" },
        TooltipTrigger: {
          template: '<div data-slot="tooltip-trigger"><slot /></div>',
        },
      },
    },
  });
}

describe("ProjectSessionComposer", () => {
  it("uses theme-native composer sizing and inline actions", () => {
    const wrapper = mountComposer();
    const form = wrapper.get("form");
    const textarea = wrapper.get("textarea");
    const addons = wrapper.findAll('[data-slot="input-group-addon"]');
    const actionButtons = wrapper.findAll(
      '[data-slot="input-group-addon"] button',
    );

    expect(form.classes()).toContain("max-w-[768px]");
    expect(textarea.classes()).toContain("min-h-12");
    expect(textarea.classes()).toContain("py-3.5");
    expect(textarea.classes()).toContain("text-sm");
    expect(textarea.classes()).not.toContain("text-base");
    expect(textarea.classes()).toContain("field-sizing-content");
    expect(textarea.attributes("placeholder")).toBe("不妨大胆想象……");
    expect(addons.map((addon) => addon.attributes("data-align"))).toEqual([
      "inline-end",
    ]);
    expect(
      actionButtons.map((button) => button.attributes("data-variant")),
    ).toEqual(["default"]);
    expect(
      actionButtons.map((button) => button.attributes("data-size")),
    ).toEqual(["icon-sm"]);
    expect(wrapper.findAll('[data-slot="tooltip-trigger"]')).toHaveLength(1);
    expect(addons.every((addon) => addon.classes().includes("self-end"))).toBe(
      true,
    );
    expect(
      wrapper
        .get('[data-slot="approval-mode-trigger"]')
        .attributes("data-size"),
    ).toBe("sm");
    expect(
      wrapper
        .get('[data-slot="model-selector-trigger"]')
        .attributes("data-size"),
    ).toBe("sm");
  });

  it("shows the default approval mode, model, and reasoning effort", () => {
    const wrapper = mountComposer();
    const approvalTrigger = wrapper.get('[data-slot="approval-mode-trigger"]');
    const modelTrigger = wrapper.get('[data-slot="model-selector-trigger"]');

    expect(approvalTrigger.text()).toContain("帮我决定");
    expect(approvalTrigger.get("span").classes()).toContain("text-foreground");
    expect(modelTrigger.text()).toContain("Folio");
    expect(modelTrigger.get("span").classes()).toContain("text-foreground");
    expect(modelTrigger.text()).toContain("auto");
  });

  it("reflects an externally selected approval mode", () => {
    const wrapper = mountComposer({ approvalMode: "ask-for-permission" });

    expect(wrapper.get('[data-slot="approval-mode-trigger"]').text()).toContain(
      "让我审批",
    );
    expect(
      wrapper.get('[data-slot="approval-mode-trigger"] span').classes(),
    ).toContain("text-foreground");

    const yoloWrapper = mountComposer({ approvalMode: "yolo" });

    expect(
      yoloWrapper.get('[data-slot="approval-mode-trigger"]').text(),
    ).toContain("干就完了");
    expect(
      yoloWrapper.get('[data-slot="approval-mode-trigger"] span').classes(),
    ).toContain("text-destructive");
    expect(
      yoloWrapper.get('[data-slot="approval-mode-trigger"] svg').classes(),
    ).toContain("text-destructive");
  });

  it("reflects externally selected model settings", () => {
    const wrapper = mountComposer({
      model: "advanced",
      reasoningEffort: "high",
    });
    const trigger = wrapper.get('[data-slot="model-selector-trigger"]');

    expect(trigger.text()).toContain("Lore");
    expect(trigger.get("span").classes()).toContain(
      "text-composer-model-advanced",
    );
    expect(trigger.text()).toContain("high");

    const lightweightWrapper = mountComposer({ model: "lightweight" });

    expect(
      lightweightWrapper
        .get('[data-slot="model-selector-trigger"] span')
        .classes(),
    ).toContain("text-composer-model-lightweight");
  });

  it("keeps model and reasoning options in their specified order", () => {
    expect(modelOptions.map((option) => option.value)).toEqual([
      "lightweight",
      "balanced",
      "advanced",
    ]);
    expect(modelOptions.map((option) => option.label)).toEqual([
      "Quill",
      "Folio",
      "Lore",
    ]);
    expect(zhCN.project.composer.models).toEqual({
      lightweight: "轻快响应，适合简单和日常任务",
      balanced: "速度与能力均衡，适合大多数任务",
      advanced: "深入分析，适合复杂和高要求任务",
    });
    expect(reasoningEfforts).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "auto",
    ]);
  });

  it("disables sending while the message is blank", async () => {
    const wrapper = mountComposer();
    const sendButton = wrapper.get('button[aria-label="发送消息"]');

    expect(sendButton.attributes("disabled")).toBeDefined();

    await wrapper.get("textarea").setValue("  检查当前项目  ");

    expect(sendButton.attributes("disabled")).toBeUndefined();
  });

  it("submits a normalized message with Enter", async () => {
    const wrapper = mountComposer();
    const textarea = wrapper.get("textarea");
    await textarea.setValue("  检查当前项目  ");

    await textarea.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("submit")).toEqual([["检查当前项目"]]);
  });

  it("keeps Shift+Enter and IME Enter available for text input", async () => {
    const wrapper = mountComposer();
    const textarea = wrapper.get("textarea");
    await textarea.setValue("正在输入");

    await textarea.trigger("keydown", { key: "Enter", shiftKey: true });
    await textarea.trigger("keydown", { key: "Enter", isComposing: true });

    expect(wrapper.emitted("submit")).toBeUndefined();
  });
});
