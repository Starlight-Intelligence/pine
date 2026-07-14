import { acceptHMRUpdate, defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import type { PineWorkspaceSummary } from "@/shared/projects";
import { useSessionStore } from "./session";

export const useWorkspaceStore = defineStore("workspace", () => {
  const sessionStore = useSessionStore();
  const currentWorkspace = shallowRef<PineWorkspaceSummary | null>(null);
  const isOpeningWorkspace = ref(false);

  async function openWorkspace(): Promise<PineWorkspaceSummary | null> {
    if (isOpeningWorkspace.value) return null;

    isOpeningWorkspace.value = true;

    try {
      const result = await window.pine.openWorkspace();
      if (result.workspace) {
        sessionStore.reset();
        currentWorkspace.value = result.workspace;
      }
      return result.workspace;
    } finally {
      isOpeningWorkspace.value = false;
    }
  }

  function closeWorkspace(): void {
    currentWorkspace.value = null;
    sessionStore.reset();
  }

  return {
    closeWorkspace,
    currentWorkspace,
    isOpeningWorkspace,
    openWorkspace,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useWorkspaceStore, import.meta.hot));
}
