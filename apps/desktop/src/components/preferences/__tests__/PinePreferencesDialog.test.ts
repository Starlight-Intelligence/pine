import { createPinia, setActivePinia } from "pinia";
import { SettingsIcon } from "@lucide/vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALE_STORAGE_KEY, createAppI18n } from "@/app/i18n";
import { ToggleGroup } from "@/components/ui/toggle-group";
import {
  SIDEBAR_VIBRANCY_STORAGE_KEY,
  THEME_PREFERENCE_STORAGE_KEY,
  useAppearanceStore,
} from "@/stores/appearance";
import PinePreferencesDialog from "../PinePreferencesDialog.vue";

const passthroughStub = { template: "<div><slot /></div>" };
const setSidebarVibrancy = vi.fn().mockResolvedValue({ applied: true });

function installPineApi(platform: string | undefined): void {
  const pineWindow = window as unknown as {
    pine?: {
      platform: string;
      setSidebarVibrancy: typeof setSidebarVibrancy;
    };
  };
  if (platform === undefined) {
    delete pineWindow.pine;
    return;
  }
  pineWindow.pine = { platform, setSidebarVibrancy };
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
    expect(wrapper.find('[data-slot="dialog-description"]').exists()).toBe(
      false,
    );
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
