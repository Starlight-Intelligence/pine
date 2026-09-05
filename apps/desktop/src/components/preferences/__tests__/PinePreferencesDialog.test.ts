import { createPinia, setActivePinia } from "pinia";
import { SettingsIcon } from "@lucide/vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALE_STORAGE_KEY, createAppI18n } from "@/app/i18n";
import { ToggleGroup } from "@/components/ui/toggle-group";
import type { PineModelCatalog } from "@/shared/models";
import {
  SIDEBAR_VIBRANCY_STORAGE_KEY,
  THEME_PREFERENCE_STORAGE_KEY,
  useAppearanceStore,
} from "@/stores/appearance";
import { useModelsStore } from "@/stores/models";
import PinePreferencesDialog from "../PinePreferencesDialog.vue";

const passthroughStub = { template: "<div><slot /></div>" };
const modelPickerStub = {
  props: ["open", "purpose"],
  emits: ["update:open"],
  template:
    '<div data-model-picker :data-open="open" :data-purpose="purpose" />',
};
const setSidebarVibrancy = vi.fn().mockResolvedValue({ applied: true });
const getTinyFishCredentialStatus = vi
  .fn()
  .mockResolvedValue({ configured: false });
const setTinyFishApiKey = vi.fn().mockResolvedValue({ configured: true });

function installPineApi(platform: string | undefined): void {
  const pineWindow = window as unknown as {
    pine?: {
      platform: string;
      setSidebarVibrancy: typeof setSidebarVibrancy;
      getTinyFishCredentialStatus: typeof getTinyFishCredentialStatus;
      setTinyFishApiKey: typeof setTinyFishApiKey;
    };
  };
  if (platform === undefined) {
    delete pineWindow.pine;
    return;
  }
  pineWindow.pine = {
    platform,
    setSidebarVibrancy,
    getTinyFishCredentialStatus,
    setTinyFishApiKey,
  };
}

function mountDialog() {
  const pinia = createPinia();
  const i18n = createAppI18n("zh-CN");
  setActivePinia(pinia);

  const wrapper = mount(PinePreferencesDialog, {
    global: {
      plugins: [pinia, i18n],
      stubs: {
        Dialog: passthroughStub,
        DialogContent: passthroughStub,
        DialogHeader: passthroughStub,
        DialogTitle: passthroughStub,
        DialogTrigger: passthroughStub,
        ModelPickerDialog: modelPickerStub,
      },
    },
  });

  return { i18n, pinia, wrapper };
}

describe("PinePreferencesDialog", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.remove("sidebar-vibrancy");
    document.documentElement.lang = "zh-CN";
    setSidebarVibrancy.mockClear();
    getTinyFishCredentialStatus.mockClear();
    setTinyFishApiKey.mockClear();
    getTinyFishCredentialStatus.mockResolvedValue({ configured: false });
    setTinyFishApiKey.mockResolvedValue({ configured: true });
    installPineApi(undefined);
  });

  afterEach(() => {
    installPineApi(undefined);
  });

  it("exposes the global settings action without extra descriptive copy", () => {
    const { wrapper } = mountDialog();

    expect(
      wrapper.get('button[aria-label="打开 Pine 设置"]').attributes("title"),
    ).toBe("打开 Pine 设置");
    expect(wrapper.findComponent(SettingsIcon).exists()).toBe(true);
    expect(wrapper.text()).toContain("Pine 设置");
    expect(wrapper.text()).toContain("语言");
    expect(wrapper.text()).toContain("外观");
    expect(wrapper.text()).toContain("标题生成和自动批准模型");
    expect(wrapper.text()).toContain("未选择任何模型");
    expect(wrapper.text()).toContain("选择模型");
    expect(wrapper.find('[data-slot="dialog-description"]').exists()).toBe(
      false,
    );
  });

  it("shows the selected utility model name", async () => {
    const { pinia, wrapper } = mountDialog();
    const catalog: PineModelCatalog = {
      models: [
        {
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
        },
      ],
      providers: [],
      utilitySelection: { modelId: "glm-4.5-air", providerId: "zai" },
    };

    useModelsStore(pinia).catalog = catalog;
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("GLM 4.5 Air");
    expect(wrapper.text()).not.toContain("未选择任何模型");
  });

  it("saves a TinyFish key and changes the action label", async () => {
    installPineApi("linux");
    const { wrapper } = mountDialog();

    await wrapper
      .get('[data-testid="pine-tinyfish-credential-button"]')
      .trigger("click");
    await wrapper.get('input[type="password"]').setValue("tinyfish-secret");
    await wrapper.get("form").trigger("submit");

    await vi.waitFor(() =>
      expect(setTinyFishApiKey).toHaveBeenCalledWith({
        apiKey: "tinyfish-secret",
      }),
    );
    expect(wrapper.text()).toContain("更改密钥");
  });

  it("opens the shared model picker in utility mode", async () => {
    const { wrapper } = mountDialog();
    const picker = wrapper.get("[data-model-picker]");
    const selectButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "选择模型");

    expect(picker.attributes("data-purpose")).toBe("utility");
    expect(picker.attributes("data-open")).toBe("false");

    await selectButton?.trigger("click");

    expect(picker.attributes("data-open")).toBe("true");
  });

  it("applies and persists language and theme selections", async () => {
    const { i18n, pinia, wrapper } = mountDialog();
    const groups = wrapper.findAllComponents(ToggleGroup);

    groups[0]?.vm.$emit("update:modelValue", "en-US");
    groups[1]?.vm.$emit("update:modelValue", "dark");
    await wrapper.vm.$nextTick();

    expect(i18n.global.locale.value).toBe("en-US");
    expect(document.documentElement.lang).toBe("en-US");
    expect(window.localStorage.getItem(APP_LOCALE_STORAGE_KEY)).toBe("en-US");
    expect(useAppearanceStore(pinia).themePreference).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe(
      "dark",
    );
  });

  it("hides the sidebar vibrancy toggle outside macOS", () => {
    const { wrapper } = mountDialog();

    expect(
      wrapper.find('[data-testid="pine-sidebar-vibrancy-toggle"]').exists(),
    ).toBe(false);
  });

  it("toggles the macOS sidebar vibrancy effect", async () => {
    installPineApi("darwin");
    const { wrapper } = mountDialog();
    const toggle = wrapper.get('[data-testid="pine-sidebar-vibrancy-toggle"]');

    expect(wrapper.text()).toContain("\u4fa7\u680f\u6a21\u7cca\u6548\u679c");

    await toggle.trigger("click");

    expect(
      document.documentElement.classList.contains("sidebar-vibrancy"),
    ).toBe(true);
    expect(window.localStorage.getItem(SIDEBAR_VIBRANCY_STORAGE_KEY)).toBe(
      "true",
    );
    expect(setSidebarVibrancy).toHaveBeenCalledWith({ enabled: true });

    await toggle.trigger("click");

    expect(
      document.documentElement.classList.contains("sidebar-vibrancy"),
    ).toBe(false);
    expect(window.localStorage.getItem(SIDEBAR_VIBRANCY_STORAGE_KEY)).toBe(
      "false",
    );
    expect(setSidebarVibrancy).toHaveBeenCalledWith({ enabled: false });
  });
});
