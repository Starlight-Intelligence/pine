import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PineLogo from "../PineLogo.vue";

describe("PineLogo", () => {
  it("forwards component attributes to the svg element", () => {
    const wrapper = mount(PineLogo, {
      attrs: {
        "aria-hidden": "true",
        class: "size-64 text-muted-foreground/10",
        focusable: "false",
      },
    });
    const logo = wrapper.get("svg");

    expect(logo.classes()).toEqual(["size-64", "text-muted-foreground/10"]);
    expect(logo.attributes("aria-hidden")).toBe("true");
    expect(logo.attributes("focusable")).toBe("false");
  });
});
