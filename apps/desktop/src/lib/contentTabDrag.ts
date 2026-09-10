import type { ProjectContentTab } from "@/stores/contentTabs";
import { SESSION_DRAG_TYPE } from "@/lib/sessionDrag";

export const CONTENT_TAB_DRAG_TYPE = "application/x-pine-content-tab";
export const FILE_TAB_DRAG_TYPE = "application/x-pine-file-tab";

export function hasFileTabDrag(transfer: DataTransfer | null): boolean {
  return Array.from(transfer?.types ?? []).includes(FILE_TAB_DRAG_TYPE);
}

export function writeContentTabDrag(
  transfer: DataTransfer,
  tab: ProjectContentTab,
): void {
  transfer.setData(CONTENT_TAB_DRAG_TYPE, tab.id);
  if (tab.kind === "file") transfer.setData(FILE_TAB_DRAG_TYPE, tab.id);
  if (tab.kind === "session" && tab.state === "bound") {
    transfer.setData(SESSION_DRAG_TYPE, tab.sessionId);
  }
  transfer.effectAllowed =
    tab.kind === "file" || (tab.kind === "session" && tab.state === "bound")
      ? "copyMove"
      : "move";
}
