import type { WebContents } from "electron";
import {
  CLOSE_TAB_REQUESTED_CHANNEL,
  NEW_TAB_REQUESTED_CHANNEL,
} from "../shared/window";

export function installWindowShortcuts(contents: WebContents): void {
  contents.on("before-input-event", (event, input) => {
    if (
      input.type !== "keyDown" ||
      !["w", "t"].includes(input.key.toLowerCase()) ||
      !(input.control || input.meta) ||
      input.alt ||
      input.shift
    )
      return;
    // Prevent Electron's native Close Window menu accelerator as well as the DOM event.
    event.preventDefault();
    if (!input.isAutoRepeat) {
      contents.send(
        input.key.toLowerCase() === "w"
          ? CLOSE_TAB_REQUESTED_CHANNEL
          : NEW_TAB_REQUESTED_CHANNEL,
      );
    }
  });
}
