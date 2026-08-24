import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { APP_LOCALE_STORAGE_KEY, createAppI18n } from "@/app/i18n";
import { ToggleGroup } from "@/components/ui/toggle-group";
import {
  THEME_PREFERENCE_STORAGE_KEY,
  useAppearanceStore,
} from "@/stores/appearance";
import PinePreferencesDialog from "../PinePreferencesDialog.vue";

const passthroughStub = { template: "<div><slot /></div>" };

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
    document.documentElement.lang = "zh-CN";
  });

  it("exposes the global settings action without extra descriptive copy", () => {
    const { wrapper } = mountDialog();

    expect(
      wrapper.get('button[aria-label="打开 Pine 设置"]').attributes("title"),
    ).toBe("打开 Pine 设置");
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
});
