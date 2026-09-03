import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n, type AppLocale } from "@/app/i18n";
import type { PineAttachment } from "@/shared/attachments";
import type { PineThinkingLevel } from "@/shared/models";
import { useModelsStore } from "@/stores/models";
import type { PinePendingApproval } from "@/stores/session";
import ProjectSessionComposer from "../ProjectSessionComposer.vue";

interface ComposerProps {
  approvalMode?: "let-me-review" | "auto-approve" | "YOLO";
  isRunning?: boolean;
  pendingApproval?: PinePendingApproval | null;
}

function mountComposer(
  props: ComposerProps = {},
  thinkingLevel: PineThinkingLevel = "high",
  locale: AppLocale = "zh-CN",
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
      pickAttachmentFolders: () => Promise.resolve({ attachments: [] }),
      pickAttachments: () => Promise.resolve({ attachments: [] }),
    },
  });
  useModelsStore().catalog = catalog;
  return mount(ProjectSessionComposer, {
    props,
    global: {
      plugins: [pinia, createAppI18n(locale)],
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
    const inputGroup = wrapper.get('[data-slot="input-group"]');
    const textarea = wrapper.get("textarea");
    const addons = wrapper.findAll('[data-slot="input-group-addon"]');
    const actionButtons = wrapper.findAll(
      '[data-slot="input-group-addon"] button',
    );

    expect(form.classes()).toContain(
      "max-w-[var(--session-composer-max-width)]",
    );
    expect(form.classes()).toContain("px-[var(--session-composer-gutter)]");
    expect(form.classes()).toContain("pb-3");
    expect(form.classes()).not.toContain("pb-2");
    expect(form.classes()).not.toContain("pb-4");
    expect(inputGroup.classes()).toEqual(
      expect.arrayContaining([
        "session-composer-control",
        "min-h-[var(--session-composer-control-height)]",
        "rounded-[var(--session-composer-control-radius)]",
        "has-[textarea]:rounded-[var(--session-composer-control-radius)]",
      ]),
    );
    expect(textarea.classes()).toContain("session-composer-input");
    expect(textarea.classes()).toContain(
      "min-h-[var(--session-composer-control-height)]",
    );
    expect(textarea.classes()).toContain("pt-3.5");
    expect(textarea.classes()).toContain("pb-3.5");
    expect(textarea.classes()).toContain("text-sm");
    expect(textarea.classes()).toContain("leading-5");
    expect(textarea.classes()).not.toContain("min-h-12");
    expect(textarea.classes()).not.toContain("py-4");
    expect(textarea.classes()).toContain("field-sizing-content");
    expect(textarea.attributes("placeholder")).toBe("描述任务、明确需求……");
    expect(addons.map((addon) => addon.attributes("data-align"))).toEqual([
      "inline-start",
      "inline-end",
    ]);
    expect(
      actionButtons.map((button) => button.attributes("data-variant")),
    ).toEqual(["secondary", "default"]);
    expect(
      actionButtons.map((button) => button.attributes("data-size")),
    ).toEqual(["icon-sm", "icon-sm"]);
    expect(
      actionButtons.every(
        (button) =>
          button
            .classes()
            .includes("size-[var(--session-composer-action-size)]") &&
          button.classes().includes("rounded-full"),
      ),
    ).toBe(true);
    expect(actionButtons[0].attributes("aria-label")).toBe("添加附件");
    expect(actionButtons[0].attributes("data-slot")).toBe(
      "attachment-menu-trigger",
    );
    expect(wrapper.findAll('[data-slot="tooltip-trigger"]')).toHaveLength(1);
    expect(addons.every((addon) => addon.classes().includes("self-end"))).toBe(
      true,
    );
    expect(addons.every((addon) => addon.classes().includes("py-1.5"))).toBe(
      true,
    );
    expect(addons[0].classes()).toContain("pl-2.5");
    expect(addons[1].classes()).toContain("pr-2.5");
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

  it("restores the original bottom spacing while approval is pending", () => {
    const wrapper = mountComposer({
      pendingApproval: {
        requestId: "approval-1",
        toolCallId: "tool-1",
        toolName: "bash",
        trigger: "sandbox-denied",
        subject: "ls -la ~/Desktop",
      },
    });
    const form = wrapper.get("form");

    expect(form.classes()).toContain("pb-4");
    expect(form.classes()).not.toContain("pb-3");
    expect(wrapper.find("textarea").exists()).toBe(false);
  });

  it("shows the default approval mode and configured Pi model", () => {
    const wrapper = mountComposer();
    const approvalTrigger = wrapper.get('[data-slot="approval-mode-trigger"]');
    const modelTrigger = wrapper.get('[data-slot="model-selector-trigger"]');

    expect(approvalTrigger.text()).toContain("自动审批");
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
    const wrapper = mountComposer({ approvalMode: "let-me-review" });

    expect(wrapper.get('[data-slot="approval-mode-trigger"]').text()).toContain(
      "让我过目",
    );
    expect(
      wrapper.get('[data-slot="approval-mode-trigger"] span').classes(),
    ).toContain("text-warning");

    const yoloWrapper = mountComposer({ approvalMode: "YOLO" });

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

  it("describes the three approval modes accurately", async () => {
    const wrapper = mountComposer();

    await wrapper.get('[data-slot="approval-mode-trigger"]').trigger("click");
    await flushPromises();

    const menuItems = Array.from(
      document.querySelectorAll('[role="menuitemradio"]'),
    ).map((item) => item.textContent?.replaceAll(/\s+/g, " ").trim());
    expect(menuItems).toEqual([
      "让我过目对工作区外的未授权操作请求确认。",
      "自动审批由 AI 自动判断。",
      "干就完了关闭一切权限约束。不推荐该选项。",
    ]);

    wrapper.unmount();
  });

  it("requires confirmation every time yolo mode is selected", async () => {
    const wrapper = mountComposer();
    const trigger = wrapper.get('[data-slot="approval-mode-trigger"]');

    await trigger.trigger("click");
    await flushPromises();
    const yoloOption = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    ).find((item) => item.textContent?.includes("干就完了"));
    yoloOption?.click();
    await flushPromises();

    expect(trigger.text()).toContain("自动审批");
    expect(wrapper.emitted("update:approvalMode")).toBeUndefined();
    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(dialog?.textContent).toContain("启用“干就完了”？");
    expect(dialog?.textContent).toContain(
      "即使现代大模型能力已显著提升，其输出仍可能不可预测。启用此选项意味着你需自行承担数据不可逆损失及其他潜在风险。",
    );

    document
      .querySelector<HTMLElement>('[data-slot="yolo-confirm-action"]')
      ?.click();
    await flushPromises();
    expect(wrapper.emitted("update:approvalMode")).toContainEqual(["YOLO"]);
    expect(trigger.text()).toContain("干就完了");

    await trigger.trigger("click");
    await flushPromises();
    const selectedYoloOption = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    ).find((item) => item.textContent?.includes("干就完了"));
    selectedYoloOption?.click();
    await flushPromises();
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();

    wrapper.unmount();
  });

  it("keeps the English approval copy aligned with the Chinese UI", async () => {
    const wrapper = mountComposer({}, "high", "en-US");

    await wrapper.get('[data-slot="approval-mode-trigger"]').trigger("click");
    await flushPromises();
    const menuItems = Array.from(
      document.querySelectorAll('[role="menuitemradio"]'),
    ).map((item) => item.textContent?.replaceAll(/\s+/g, " ").trim());
    expect(menuItems).toEqual([
      "Let Me ReviewAsk for confirmation for unauthorized operations outside the workspace.",
      "Auto ApproveLet AI decide.",
      "YOLORemove all permission constraints. Not recommended.",
    ]);

    const yoloOption = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    ).find((item) => item.textContent?.includes("YOLO"));
    yoloOption?.click();
    await flushPromises();
    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain("Enable “YOLO”?");

    wrapper.unmount();
  });

  it("disables sending while the message is blank", async () => {
    const wrapper = mountComposer();
    const sendButton = wrapper.get('button[aria-label="发送消息"]');

    expect(sendButton.attributes("disabled")).toBeDefined();

    await wrapper.get("textarea").setValue("  检查当前项目  ");

    expect(sendButton.attributes("disabled")).toBeUndefined();
  });

  it("selects, removes, and submits file metadata above the prompt", async () => {
    const wrapper = mountComposer();
    const selectedAttachments = [
      {
        extension: "md",
        modifiedAt: "2026-09-02T12:00:00.000Z",
        name: "notes.md",
        path: "/Users/example/notes.md",
        size: 1_024,
      },
      {
        extension: "png",
        modifiedAt: "2026-09-02T12:01:00.000Z",
        name: "diagram.png",
        path: "/Users/example/diagram.png",
        size: 2_048,
      },
    ];
    window.pine.pickAttachments = () =>
      Promise.resolve({ attachments: selectedAttachments });

    await wrapper.get('button[aria-label="添加附件"]').trigger("click");
    await flushPromises();
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes("添加文件"))
      ?.click();
    await flushPromises();

    expect(wrapper.findAll('[data-slot="attachment"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("notes.md");
    expect(wrapper.text()).not.toContain("/Users/example/notes.md");
    expect(
      wrapper.get('[data-slot="attachment"]').attributes("title"),
    ).toBeUndefined();
    expect(wrapper.get("textarea").classes()).toContain("pt-3.5");
    expect(wrapper.get("textarea").classes()).not.toContain(
      "session-composer-input-with-attachments",
    );
    const attachmentGroup = wrapper.get('[data-slot="attachment-group"]');
    expect(attachmentGroup.classes()).toContain("session-composer-attachments");
    expect(attachmentGroup.classes()).toContain(
      "px-[var(--session-composer-control-inset)]",
    );
    expect(attachmentGroup.classes()).toContain("pb-0");
    expect(wrapper.get('[data-slot="attachment"]').classes()).toContain(
      "rounded-[var(--session-composer-attachment-radius)]",
    );
    expect(wrapper.get('[data-slot="attachment"]').classes()).not.toContain(
      "rounded-3xl",
    );
    expect(wrapper.find('[data-slot="attachment-trigger"]').exists()).toBe(
      false,
    );

    await wrapper
      .get('button[aria-label="移除附件 notes.md"]')
      .trigger("click");
    expect(wrapper.findAll('[data-slot="attachment"]')).toHaveLength(1);

    await wrapper.get("textarea").setValue("Inspect the diagram.");
    await wrapper.get("form").trigger("submit");

    const submitted = wrapper.emitted("submit")?.[0]?.[0];
    expect(submitted).toBeTypeOf("string");
    expect(submitted).toContain('<pine_attachments version="1">');
    expect(submitted).toContain('"path":"/Users/example/diagram.png"');
    expect(submitted).toMatch(/<\/pine_attachments>\n\nInspect the diagram\.$/);
    expect(wrapper.findAll('[data-slot="attachment"]')).toHaveLength(0);
  });

  it("allows sending attachments without prompt text", async () => {
    const wrapper = mountComposer();
    window.pine.pickAttachments = () =>
      Promise.resolve({
        attachments: [
          {
            extension: "txt",
            modifiedAt: "2026-09-02T12:00:00.000Z",
            name: "context.txt",
            path: "/tmp/context.txt",
            size: 12,
          },
        ],
      });

    await wrapper.get('button[aria-label="添加附件"]').trigger("click");
    await flushPromises();
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes("添加文件"))
      ?.click();
    await flushPromises();
    const send = wrapper.get('button[aria-label="发送消息"]');
    expect(send.attributes("disabled")).toBeUndefined();

    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatch(
      /<\/pine_attachments>$/,
    );
  });

  it("selects a folder as one read-only path attachment", async () => {
    const wrapper = mountComposer();
    window.pine.pickAttachmentFolders = () =>
      Promise.resolve({
        attachments: [
          {
            extension: "",
            kind: "directory",
            modifiedAt: "2026-09-02T12:00:00.000Z",
            name: "references",
            path: "/Users/example/references",
            size: 96,
          },
        ],
      });

    await wrapper.get('button[aria-label="添加附件"]').trigger("click");
    await flushPromises();
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes("添加文件夹"))
      ?.click();
    await flushPromises();

    expect(wrapper.text()).toContain("references");
    expect(wrapper.text()).toContain("文件夹");
    expect(wrapper.get('[data-slot="attachment"] svg')).toBeDefined();

    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toContain('"kind":"directory"');
    expect(wrapper.emitted("submit")?.[0]?.[0]).toContain(
      '"path":"/Users/example/references"',
    );
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

  it("saves pathless pasted images into Pine-managed attachment storage", async () => {
    const wrapper = mountComposer();
    const savedAttachment: PineAttachment = {
      extension: "png",
      kind: "file",
      modifiedAt: "2026-09-02T12:02:00.000Z",
      name: "image.png",
      path: "/pine/projects/p1/attachments/uuid.png",
      size: 4,
    };
    const savePastedAttachment = vi.fn(() =>
      Promise.resolve({ attachment: savedAttachment }),
    );
    window.pine.savePastedAttachment = savePastedAttachment;
    window.pine.getPathForFile = () => {
      throw new Error("Clipboard file has no filesystem path.");
    };
    const pastedImage = {
      name: "image.png",
      type: "image/png",
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
    } as unknown as File;

    await wrapper
      .get("textarea")
      .trigger("paste", { clipboardData: { files: [pastedImage] } });
    await flushPromises();

    expect(savePastedAttachment).toHaveBeenCalledWith({
      bytes: expect.any(Uint8Array),
      mimeType: "image/png",
      name: "image.png",
    });
    expect(wrapper.emitted("update:attachments")).toContainEqual([
      [savedAttachment],
    ]);
  });

  it("reuses the inspect flow for pasted files with real paths", async () => {
    const wrapper = mountComposer();
    const inspectedAttachment: PineAttachment = {
      extension: "md",
      modifiedAt: "2026-09-02T12:00:00.000Z",
      name: "notes.md",
      path: "/Users/example/notes.md",
      size: 1_024,
    };
    const inspectAttachments = vi.fn(() =>
      Promise.resolve({ attachments: [inspectedAttachment] }),
    );
    const savePastedAttachment = vi.fn();
    window.pine.inspectAttachments = inspectAttachments;
    window.pine.savePastedAttachment = savePastedAttachment;
    window.pine.getPathForFile = () => "/Users/example/notes.md";
    const copiedFile = {
      name: "notes.md",
      type: "",
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as File;

    await wrapper
      .get("textarea")
      .trigger("paste", { clipboardData: { files: [copiedFile] } });
    await flushPromises();

    expect(inspectAttachments).toHaveBeenCalledWith({
      paths: ["/Users/example/notes.md"],
    });
    expect(savePastedAttachment).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:attachments")).toContainEqual([
      [inspectedAttachment],
    ]);
  });

  it("ignores paste events without clipboard files", async () => {
    const wrapper = mountComposer();
    const inspectAttachments = vi.fn();
    const savePastedAttachment = vi.fn();
    window.pine.inspectAttachments = inspectAttachments;
    window.pine.savePastedAttachment = savePastedAttachment;

    await wrapper
      .get("textarea")
      .trigger("paste", { clipboardData: { files: [] } });
    await flushPromises();

    expect(inspectAttachments).not.toHaveBeenCalled();
    expect(savePastedAttachment).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:attachments")).toBeUndefined();
  });
});
