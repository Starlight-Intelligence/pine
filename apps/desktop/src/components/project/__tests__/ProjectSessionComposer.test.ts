import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "@/app/i18n";
import type { PineThinkingLevel } from "@/shared/models";
import { useModelsStore } from "@/stores/models";
import ProjectSessionComposer from "../ProjectSessionComposer.vue";

interface ComposerProps {
  approvalMode?: "ask-for-permission" | "agent-decides" | "yolo";
  isRunning?: boolean;
}

function mountComposer(
  props: ComposerProps = {},
  thinkingLevel: PineThinkingLevel = "high",
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const catalog = {
    providers: [
      {
        authMethods: [{ type: "api_key" as const, label: "API key" }],
        configured: true,
        id: "anthropic",
        modelCount: 1,
        name: "Anthropic",
      },
    ],
    models: [
      {
        api: "anthropic-messages",
        contextWindow: 200_000,
        id: "claude-sonnet",
        input: ["text" as const],
        maxTokens: 32_000,
        name: "Claude Sonnet",
        providerId: "anthropic",
        providerName: "Anthropic",
        reasoning: true,
        supportedThinkingLevels: [
          "off" as const,
          "high" as const,
          "max" as const,
        ],
      },
    ],
    selection: {
      modelId: "claude-sonnet",
      providerId: "anthropic",
      thinkingLevel,
    },
    recommendedModelIds: ["claude-sonnet"],
  };
  Object.defineProperty(window, "pine", {
    configurable: true,
    value: {
      getModelCatalog: () => Promise.resolve(catalog),
    },
  });
  useModelsStore().catalog = catalog;
  return mount(ProjectSessionComposer, {
    props,
    global: {
      plugins: [pinia, createAppI18n("zh-CN")],
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

    expect(form.classes()).toContain(
      "max-w-[var(--session-composer-max-width)]",
    );
    expect(form.classes()).toContain("px-[var(--session-composer-gutter)]");
    expect(textarea.classes()).toContain("session-composer-input");
    expect(textarea.classes()).toContain("min-h-12");
    expect(textarea.classes()).toContain("py-3.5");
    expect(textarea.classes()).toContain("text-sm");
    expect(textarea.classes()).not.toContain("text-base");
    expect(textarea.classes()).toContain("field-sizing-content");
    expect(textarea.attributes("placeholder")).toBe("描述任务、明确需求……");
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
    expect(
      wrapper.findAll(
        '[data-slot="model-selector-trigger"], [data-slot="reasoning-effort-trigger"]',
      ),
    ).toHaveLength(1);
  });

  it("shows the default approval mode and configured Pi model", () => {
    const wrapper = mountComposer();
    const approvalTrigger = wrapper.get('[data-slot="approval-mode-trigger"]');
    const modelTrigger = wrapper.get('[data-slot="model-selector-trigger"]');

    expect(approvalTrigger.text()).toContain("帮我决定");
    expect(approvalTrigger.get("span").classes()).toContain("text-foreground");
    expect(modelTrigger.text()).toContain("Claude Sonnet");
    expect(modelTrigger.text()).toContain("高");
  });

  it("colors maximum and disabled reasoning levels", () => {
    const maximumWrapper = mountComposer({}, "max");
    expect(
      maximumWrapper
        .get('[data-slot="model-selector-thinking-level"]')
        .classes(),
    ).toContain("text-thinking-max!");
    maximumWrapper.unmount();

    const disabledWrapper = mountComposer({}, "off");
    expect(
      disabledWrapper
        .get('[data-slot="model-selector-thinking-level"]')
        .classes(),
    ).toContain("text-destructive!");
  });

  it("keeps recommended badge text readable when the model option is focused", async () => {
    const wrapper = mountComposer();

    await wrapper.get('[data-slot="model-selector-trigger"]').trigger("click");
    await flushPromises();

    const badge = document.querySelector("[data-recommended-model]");
    expect(badge).not.toBeNull();
    expect(badge?.classList.contains("text-primary-foreground!")).toBe(true);

    wrapper.unmount();
  });

  it("reflects an externally selected approval mode", () => {
    const wrapper = mountComposer({ approvalMode: "ask-for-permission" });

    expect(wrapper.get('[data-slot="approval-mode-trigger"]').text()).toContain(
      "让我审批",
    );
    expect(
      wrapper.get('[data-slot="approval-mode-trigger"] span').classes(),
    ).toContain("text-warning");

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

  it("turns the send action into a stop action while running", async () => {
    const wrapper = mountComposer({ isRunning: true });
    const stopButton = wrapper.get('button[aria-label="停止回答"]');

    await stopButton.trigger("click");

    expect(wrapper.emitted("abort")).toEqual([[]]);
    expect(wrapper.emitted("submit")).toBeUndefined();
  });
});
