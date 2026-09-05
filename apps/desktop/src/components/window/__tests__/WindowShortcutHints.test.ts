import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { createAppI18n } from "@/app/i18n";
import WindowShortcutHints from "../WindowShortcutHints.vue";

enableAutoUnmount(afterEach);

function mountHints(platform = "darwin") {
  Object.defineProperty(window, "pine", {
    configurable: true,
    value: { platform },
  });
  return mount(WindowShortcutHints, {
    global: { plugins: [createAppI18n("en-US")] },
  });
}

describe("WindowShortcutHints", () => {
  it("renders a row for each window shortcut", () => {
    const wrapper = mountHints();
    expect(wrapper.findAll("li")).toHaveLength(3);
  });

  it("shows the command glyph and keys on macOS", () => {
    const wrapper = mountHints("darwin");
    const keys = wrapper
      .findAll("kbd[data-slot='kbd']")
      .map((node) => node.text());
    expect(keys).toEqual(["⌘", "T", "⌘", "W", "⌘", "N"]);
  });

  it("uses the Ctrl label on non-mac platforms", () => {
    const wrapper = mountHints("win32");
    const keys = wrapper
      .findAll("kbd[data-slot='kbd']")
      .map((node) => node.text());
    expect(keys).toEqual(["Ctrl", "T", "Ctrl", "W", "Ctrl", "N"]);
  });

  it("labels each shortcut in the active locale", () => {
    const wrapper = mountHints();
    const labels = wrapper.findAll("span").map((node) => node.text());
    expect(labels).toEqual(["New tab", "Close tab", "New window"]);
  });
});
