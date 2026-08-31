import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { WrenchIcon } from "@lucide/vue";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import type { PineModelCatalog } from "@/shared/models";
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

const connectedCatalog: PineModelCatalog = {
  models: [],
  providers: [
    {
      authMethods: [{ label: "API key", type: "api_key" }],
      configured: true,
      id: "zai",
      modelCount: 10,
      name: "Z.AI",
    },
  ],
};

function mountPicker() {
  const logoutProvider = vi.fn().mockResolvedValue({ disposed: true });
  const getModelCatalog = vi.fn().mockResolvedValue({
    ...connectedCatalog,
    providers: connectedCatalog.providers.map((provider) => ({
      ...provider,
      configured: false,
    })),
  });
  Object.defineProperty(window, "pine", {
    configurable: true,
    value: { getModelCatalog, logoutProvider },
  });

  const pinia = createPinia();
  setActivePinia(pinia);
  useModelsStore().catalog = connectedCatalog;

  const wrapper = mount(ModelPickerDialog, {
    props: { open: false },
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

  return { getModelCatalog, logoutProvider, wrapper };
}

describe("ModelPickerDialog provider management", () => {
  it("aligns provider actions right and confirms credential removal", async () => {
    const { getModelCatalog, logoutProvider, wrapper } = mountPicker();
    const manageItem = wrapper.get(
      '[data-command-item][data-value="manage configure provider service model"]',
    );

    expect(manageItem.text()).toContain("管理服务或模型");
    expect(manageItem.findComponent(WrenchIcon).exists()).toBe(true);

    await manageItem.trigger("click");

    const actions = wrapper.get('[data-slot="provider-actions"]');
    expect(actions.classes()).toContain("ml-auto");

    const disconnectButton = wrapper.get('[data-testid="provider-disconnect"]');
    expect(disconnectButton.attributes("data-variant")).toBe("ghost");
    expect(disconnectButton.attributes("data-size")).toBe("icon-sm");
    expect(disconnectButton.attributes("aria-label")).toBe("解绑 Z.AI");
    expect(disconnectButton.text()).toBe("");

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
