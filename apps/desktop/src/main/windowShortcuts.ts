import type { WebContents } from "electron";
import { CLOSE_TAB_REQUESTED_CHANNEL } from "../shared/window";

export function installWindowShortcuts(contents: WebContents): void {
  contents.on("before-input-event", (event, input) => {
    if (
      input.type !== "keyDown" ||
      input.key.toLowerCase() !== "w" ||
      !(input.control || input.meta) ||
      input.alt ||
      input.shift
    )
      return;
    // Prevent Electron's native Close Window menu accelerator as well as the DOM event.
    event.preventDefault();
    if (!input.isAutoRepeat) contents.send(CLOSE_TAB_REQUESTED_CHANNEL);
  });
}
