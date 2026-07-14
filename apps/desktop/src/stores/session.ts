import { acceptHMRUpdate, defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import type {
  PineSessionSummary,
  SessionSearchResult,
} from "@/shared/sessions";

export const useSessionStore = defineStore("session", () => {
  const activeSession = shallowRef<PineSessionSummary | null>(null);
  const recentSessions = shallowRef<SessionSearchResult[]>([]);
  const searchResults = shallowRef<SessionSearchResult[]>([]);
  const isLoadingRecent = ref(false);
  const isSearching = ref(false);
  let searchSequence = 0;
  let recentSequence = 0;

  async function loadRecent(): Promise<SessionSearchResult[]> {
    const sequence = ++recentSequence;
    isLoadingRecent.value = true;

    try {
      const result = await window.pine.searchSessions({ query: "" });
      if (sequence === recentSequence) recentSessions.value = result.sessions;
      return result.sessions;
    } finally {
      if (sequence === recentSequence) isLoadingRecent.value = false;
    }
  }

  async function search(query: string): Promise<SessionSearchResult[]> {
    const sequence = ++searchSequence;
    isSearching.value = true;

    try {
      const sessions = query.trim()
        ? (await window.pine.searchSessions({ query })).sessions
        : await loadRecent();
      if (sequence === searchSequence) searchResults.value = sessions;
      return sessions;
    } finally {
      if (sequence === searchSequence) isSearching.value = false;
    }
  }

  async function resume(sessionId: string): Promise<PineSessionSummary> {
    const result = await window.pine.resumeSession({ sessionId });
    activeSession.value = result.session;
    return result.session;
  }

  function startTransientSession(): void {
    activeSession.value = null;
  }

  function reset(): void {
    searchSequence += 1;
    recentSequence += 1;
    activeSession.value = null;
    recentSessions.value = [];
    searchResults.value = [];
    isLoadingRecent.value = false;
    isSearching.value = false;
  }

  return {
    activeSession,
    isLoadingRecent,
    isSearching,
    loadRecent,
    recentSessions,
    reset,
    resume,
    search,
    searchResults,
    startTransientSession,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSessionStore, import.meta.hot));
}
