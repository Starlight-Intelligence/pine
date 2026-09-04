import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { installWindowShortcuts } from "../windowShortcuts";
import {
  CLOSE_TAB_REQUESTED_CHANNEL,
  NEW_TAB_REQUESTED_CHANNEL,
} from "../../shared/window";

describe("native close shortcut", () => {
  it.each([
    ["w", CLOSE_TAB_REQUESTED_CHANNEL],
    ["t", NEW_TAB_REQUESTED_CHANNEL],
  ])(
    "intercepts Ctrl/Cmd+%s before the menu and ignores repeats and other shortcuts",
    (key, channel) => {
      const contents = Object.assign(new EventEmitter(), { send: vi.fn() });
      installWindowShortcuts(contents as unknown as WebContents);
      for (const modifiers of [{ control: true }, { meta: true }]) {
        const event = { preventDefault: vi.fn() };
        contents.emit("before-input-event", event, {
          type: "keyDown",
          key: key.toUpperCase(),
          ...modifiers,
        });
        expect(event.preventDefault).toHaveBeenCalledOnce();
      }
      expect(contents.send).toHaveBeenCalledTimes(2);
      expect(contents.send).toHaveBeenCalledWith(channel);
      const repeated = { preventDefault: vi.fn() };
      contents.emit("before-input-event", repeated, {
        type: "keyDown",
        key,
        control: true,
        isAutoRepeat: true,
      });
      expect(repeated.preventDefault).toHaveBeenCalledOnce();
      for (const override of [
        { shift: true },
        { alt: true },
        { control: false },
        { type: "keyUp" },
        { key: "q" },
      ]) {
        const event = { preventDefault: vi.fn() };
        contents.emit("before-input-event", event, {
          type: "keyDown",
          key,
          control: true,
          ...override,
        });
        expect(event.preventDefault).not.toHaveBeenCalled();
      }
      expect(contents.send).toHaveBeenCalledTimes(2);
    },
  );
});
