import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import type { PineModelCatalog, PineModelDescriptor } from "@/shared/models";
import { useModelsStore } from "@/stores/models";
import ModelPickerDialog from "../ModelPickerDialog.vue";

const passthroughStub = { template: "<div><slot /></div>" };
const commandItemStub = {
  props: ["disabled", "value"],
  emits: ["select"],
  template: `
    <div
      data-command-item
      :data-value="value"
      @click="!disabled && $emit('select')"
    >
      <slot />
    </div>
  `,
};
const alertDialogStub = {
  name: "AlertDialogStub",
  props: ["open"],
  emits: ["update:open"],
  template: '<div data-alert-dialog :data-open="open"><slot /></div>',
};
const buttonStub = {
  props: ["disabled"],
  emits: ["click"],
  template:
    '<button :disabled="disabled" v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
};
const alertDialogActionStub = {
  name: "AlertDialogActionStub",
  props: ["disabled"],
  emits: ["click"],
  template:
    '<button :disabled="disabled" v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
};

const utilityModel: PineModelDescriptor = {
  api: "test",
  contextWindow: 128_000,
  id: "glm-4.5-air",
  input: ["text"],
  maxTokens: 8_192,
  name: "GLM 4.5 Air",
  providerId: "zai",
  providerName: "Z.AI",
  reasoning: false,
  supportedThinkingLevels: ["off"],
};

const connectedCatalog: PineModelCatalog = {
  models: [utilityModel],
  providers: [
    {
      authMethods: [{ label: "API key", type: "api_key" }],
      configured: true,
      id: "zai",
      modelCount: 1,
      name: "Z.AI",
    },
  ],
  recommendedModelIds: [utilityModel.id],
};

function mountPicker(purpose: "session" | "utility" = "session") {
  const logoutProvider = vi.fn().mockResolvedValue({ disposed: true });
  const selectModel = vi.fn().mockResolvedValue(undefined);
  const selectUtilityModel = vi.fn().mockResolvedValue(undefined);
  const getModelCatalog = vi.fn().mockResolvedValue({
    ...connectedCatalog,
    providers: connectedCatalog.providers.map((provider) => ({
      ...provider,
      configured: false,
    })),
  });
  Object.defineProperty(window, "pine", {
    configurable: true,
    value: {
      getModelCatalog,
      logoutProvider,
      selectModel,
      selectUtilityModel,
    },
  });

  const pinia = createPinia();
  setActivePinia(pinia);
  useModelsStore().catalog = connectedCatalog;

  const wrapper = mount(ModelPickerDialog, {
    props: { open: false, purpose },
    global: {
      plugins: [pinia, createAppI18n("zh-CN")],
      stubs: {
        AlertDialog: alertDialogStub,
        AlertDialogAction: alertDialogActionStub,
        AlertDialogCancel: buttonStub,
        AlertDialogContent: passthroughStub,
        AlertDialogDescription: passthroughStub,
        AlertDialogFooter: passthroughStub,
        AlertDialogHeader: passthroughStub,
        AlertDialogTitle: passthroughStub,
        CommandDialog: passthroughStub,
        CommandEmpty: passthroughStub,
        CommandGroup: passthroughStub,
        CommandInput: passthroughStub,
        CommandItem: commandItemStub,
        CommandList: passthroughStub,
        CommandSeparator: passthroughStub,
        ProviderAuthDialog: passthroughStub,
        ProviderIcon: passthroughStub,
      },
    },
  });

  return {
    getModelCatalog,
    logoutProvider,
    selectModel,
    selectUtilityModel,
    wrapper,
  };
}

describe("ModelPickerDialog provider management", () => {
  it("confirms credential removal", async () => {
    const { getModelCatalog, logoutProvider, wrapper } = mountPicker();
    const manageItem = wrapper.get(
      '[data-command-item][data-value="manage configure provider service model"]',
    );

    await manageItem.trigger("click");

    const disconnectButton = wrapper.get('[data-testid="provider-disconnect"]');
    await disconnectButton.trigger("click");

    expect(wrapper.get("[data-alert-dialog]").attributes("data-open")).toBe(
      "true",
    );
    expect(wrapper.text()).toContain("解绑 Z.AI？");
    expect(wrapper.text()).toContain("删除 Pine 保存的 Z.AI 凭据");

    wrapper
      .findComponent({ name: "AlertDialogStub" })
      .vm.$emit("update:open", false);
    wrapper
      .findComponent({ name: "AlertDialogActionStub" })
      .vm.$emit("click", new MouseEvent("click", { cancelable: true }));
    await flushPromises();

    expect(logoutProvider).toHaveBeenCalledWith({ providerId: "zai" });
    expect(getModelCatalog).toHaveBeenCalledOnce();
    expect(wrapper.get("[data-alert-dialog]").attributes("data-open")).toBe(
      "false",
    );
  });
});

describe("ModelPickerDialog utility model selection", () => {
  it("selects the utility model without changing the session model", async () => {
    const { selectModel, selectUtilityModel, wrapper } = mountPicker("utility");
    const modelItem = wrapper
      .findAll("[data-command-item]")
      .find((item) => item.attributes("data-value")?.includes(utilityModel.id));

    expect(modelItem).toBeDefined();
    await modelItem?.trigger("click");
    await flushPromises();

    expect(selectUtilityModel).toHaveBeenCalledWith({
      modelId: utilityModel.id,
      providerId: utilityModel.providerId,
    });
    expect(selectModel).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:open")).toContainEqual([false]);
  });
});
