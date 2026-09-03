import { defineStore } from "pinia";
import { reactive } from "vue";

export const PROJECT_SIDEBAR_STORAGE_PREFIX = "pine.project-sidebar.v1:";
export type ProjectSidebarTab = "files" | "sessions";
interface SidebarState {
  tab: ProjectSidebarTab;
  expanded: string[];
}

function readState(projectId: string): SidebarState {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(PROJECT_SIDEBAR_STORAGE_PREFIX + projectId) ??
        "null",
    );
    if (typeof value === "object" && value !== null) {
      return {
        tab: "tab" in value && value.tab === "files" ? "files" : "sessions",
        expanded:
          "expanded" in value && Array.isArray(value.expanded)
            ? value.expanded.filter(
                (key): key is string => typeof key === "string",
              )
            : [],
      };
    }
  } catch {
    // Corrupt or unavailable storage must not prevent opening the project.
  }
  return { tab: "sessions", expanded: [] };
}

export const useProjectSidebarStore = defineStore("project-sidebar", () => {
  const projects = reactive(new Map<string, SidebarState>());

  function stateFor(projectId: string): SidebarState {
    if (!projects.has(projectId)) projects.set(projectId, readState(projectId));
    return projects.get(projectId)!;
  }

  function save(projectId: string, update: Partial<SidebarState>): void {
    const state = { ...stateFor(projectId), ...update };
    projects.set(projectId, state);
    try {
      window.localStorage.setItem(
        PROJECT_SIDEBAR_STORAGE_PREFIX + projectId,
        JSON.stringify(state),
      );
    } catch {
      // Keep the in-memory preference when storage is unavailable.
    }
  }

  function setTab(projectId: string, tab: ProjectSidebarTab): void {
    save(projectId, { tab });
  }

  function setExpanded(projectId: string, expanded: string[]): void {
    save(projectId, { expanded: [...new Set(expanded)] });
  }

  return { stateFor, setTab, setExpanded };
});
