import type { WebContents } from "electron";
import {
  CLOSE_TAB_REQUESTED_CHANNEL,
  NEW_TAB_REQUESTED_CHANNEL,
} from "../shared/window";

export function installWindowShortcuts(
  contents: WebContents,
  onNewWindow: () => void,
): void {
  contents.on("before-input-event", (event, input) => {
    if (
      input.type !== "keyDown" ||
      !(input.control || input.meta) ||
      input.alt ||
      input.shift
    )
      return;
    const key = input.key.toLowerCase();
    if (key !== "w" && key !== "t" && key !== "n") return;
    // Prevent Electron's native Close Window menu accelerator as well as the DOM event.
    event.preventDefault();
    if (input.isAutoRepeat) return;
    if (key === "w") {
      contents.send(CLOSE_TAB_REQUESTED_CHANNEL);
    } else if (key === "t") {
      contents.send(NEW_TAB_REQUESTED_CHANNEL);
    } else {
      onNewWindow();
    }
  });
}
