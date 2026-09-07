import { createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import { ToggleGroup } from "@/components/ui/toggle-group";
import {
  createDefaultPineUserProfile,
  type PineUserProfile,
} from "@/shared/userProfile";
import UserProfileDialog from "../UserProfileDialog.vue";

const passthroughStub = { template: "<div><slot /></div>" };
const getUserProfile = vi.fn();
const setUserProfile = vi.fn();

function installPineApi(): void {
  window.pine = {
    getUserProfile,
    setUserProfile,
  } as unknown as Window["pine"];
}

function mountDialog() {
  const pinia = createPinia();
  const wrapper = mount(UserProfileDialog, {
    global: {
      plugins: [pinia, createAppI18n("zh-CN")],
      stubs: {
        Dialog: passthroughStub,
        DialogContent: passthroughStub,
        DialogDescription: passthroughStub,
        DialogFooter: passthroughStub,
        DialogHeader: passthroughStub,
        DialogTitle: passthroughStub,
      },
    },
  });
  return wrapper;
}

describe("UserProfileDialog", () => {
  beforeEach(() => {
    const defaultProfile = createDefaultPineUserProfile();
    getUserProfile.mockReset();
    getUserProfile.mockResolvedValue(defaultProfile);
    setUserProfile.mockReset();
    setUserProfile.mockResolvedValue({ updated: true });
    installPineApi();
  });

  it("uses the calm professional and enthusiast defaults", async () => {
    const wrapper = mountDialog();
    await vi.waitFor(() => expect(getUserProfile).toHaveBeenCalledOnce());

    expect(wrapper.get(".scroll-fade").classes()).toContain("overflow-y-auto");

    const groups = wrapper.findAllComponents(ToggleGroup);
    expect(groups[0]?.props("modelValue")).toBe("calm-professional");
    expect(groups[1]?.props("modelValue")).toBe("enthusiast");
  });

  it("saves the nickname, selections, details, and custom instructions", async () => {
    getUserProfile.mockResolvedValue({
      ...createDefaultPineUserProfile(),
      nickname: "Loaded nickname",
    });
    const wrapper = mountDialog();
    await vi.waitFor(() =>
      expect(
        (wrapper.get("#pine-user-profile-nickname").element as HTMLInputElement)
          .value,
      ).toBe("Loaded nickname"),
    );

    await wrapper.get("#pine-user-profile-nickname").setValue("  小 Pine  ");
    await wrapper
      .get("#pine-user-profile-details")
      .setValue("正在学习桌面应用开发");
    await wrapper
      .get("#pine-user-profile-instructions")
      .setValue("先给出结论，再解释关键原因。");

    const groups = wrapper.findAllComponents(ToggleGroup);
    groups[0]?.vm.$emit("update:modelValue", "warm-friendly");
    groups[1]?.vm.$emit("update:modelValue", "professional-user");
    await wrapper.vm.$nextTick();
    await wrapper.get("form").trigger("submit");

    const expected: PineUserProfile = {
      communicationStyle: "warm-friendly",
      customInstructions: "先给出结论，再解释关键原因。",
      nickname: "小 Pine",
      personalDetails: "正在学习桌面应用开发",
      technicalBackground: "professional-user",
    };
    await vi.waitFor(() =>
      expect(setUserProfile).toHaveBeenCalledWith(expected),
    );
  });
});
