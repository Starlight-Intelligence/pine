import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";
import type { PineSessionSummary } from "@/shared/sessions";

export interface FileContentTab {
  id: string;
  kind: "file";
  label: string;
}

export interface DraftSessionTab {
  id: string;
  kind: "session";
  state: "draft";
}

export interface CreatingSessionTab {
  id: string;
  kind: "session";
  label: string;
  state: "creating";
}

export interface BoundSessionTab {
  id: string;
  kind: "session";
  label?: string;
  sessionId: string;
  state: "bound";
}

export type SessionContentTab =
  DraftSessionTab | CreatingSessionTab | BoundSessionTab;
export type ProjectContentTab = FileContentTab | SessionContentTab;

function sessionLabel(session: PineSessionSummary): string | undefined {
  return session.name || session.preview;
}

export const useContentTabsStore = defineStore("content-tabs", () => {
  let nextSessionTabNumber = 2;

  function initialTabs(): ProjectContentTab[] {
    return [
      { id: "session-1", kind: "session", state: "draft" },
      {
        id: "file-project-view",
        kind: "file",
        label: "ProjectView.vue",
      },
    ];
  }

  const tabs = ref<ProjectContentTab[]>(initialTabs());

  function makeDraftTab(): DraftSessionTab {
    const tab = {
      id: `session-${nextSessionTabNumber}`,
      kind: "session" as const,
      state: "draft" as const,
    };
    nextSessionTabNumber += 1;
    return tab;
  }

  function createSessionTab(): DraftSessionTab {
    const existingDraft = tabs.value.find(
      (tab): tab is DraftSessionTab =>
        tab.kind === "session" && tab.state === "draft",
    );
    if (existingDraft) return existingDraft;

    const tab = makeDraftTab();
    tabs.value = [...tabs.value, tab];
    return tab;
  }

  function beginPrompt(tabId: string, message: string): boolean {
    const target = tabs.value.find((tab) => tab.id === tabId);
    if (!target || target.kind !== "session") return false;
    if (target.state !== "draft") return target.state === "bound";

    const creating: CreatingSessionTab = {
      id: target.id,
      kind: "session",
      label: message,
      state: "creating",
    };
    tabs.value = tabs.value.map((tab) =>
      tab.id === target.id ? creating : tab,
    );
    return true;
  }

  function failPrompt(tabId: string): string | null {
    const target = tabs.value.find((tab) => tab.id === tabId);
    if (!target || target.kind !== "session" || target.state !== "creating") {
      return null;
    }
    const existingDraft = tabs.value.find(
      (tab): tab is DraftSessionTab =>
        tab.kind === "session" && tab.state === "draft" && tab.id !== tabId,
    );
    if (existingDraft) {
      tabs.value = tabs.value.filter((tab) => tab.id !== tabId);
      return existingDraft.id;
    }
    const draft: DraftSessionTab = {
      id: target.id,
      kind: "session",
      state: "draft",
    };
    tabs.value = tabs.value.map((tab) => (tab.id === target.id ? draft : tab));
    return draft.id;
  }

  function openSession(
    session: PineSessionSummary,
    reusableTabId?: string,
  ): BoundSessionTab {
    const existing = tabs.value.find(
      (tab): tab is BoundSessionTab =>
        tab.kind === "session" &&
        tab.state === "bound" &&
        tab.sessionId === session.id,
    );
    if (existing) {
      updateSession(session);
      return existing;
    }

    const current = tabs.value.find(
      (tab): tab is DraftSessionTab =>
        tab.id === reusableTabId &&
        tab.kind === "session" &&
        tab.state === "draft",
    );
    const tab: BoundSessionTab = {
      id: current?.state === "draft" ? current.id : makeDraftTab().id,
      kind: "session",
      state: "bound",
      sessionId: session.id,
      ...(sessionLabel(session) ? { label: sessionLabel(session) } : {}),
    };

    if (current?.state === "draft") {
      tabs.value = tabs.value.map((candidate) =>
        candidate.id === current.id ? tab : candidate,
      );
    } else {
      tabs.value = [...tabs.value, tab];
    }
    return tab;
  }

  function bindSession(
    tabId: string,
    session: PineSessionSummary,
  ): BoundSessionTab | null {
    const target = tabs.value.find((tab) => tab.id === tabId);
    if (!target || target.kind !== "session") return null;

    const existing = tabs.value.find(
      (tab): tab is BoundSessionTab =>
        tab.kind === "session" &&
        tab.state === "bound" &&
        tab.sessionId === session.id &&
        tab.id !== tabId,
    );
    if (existing) {
      tabs.value = tabs.value.filter((tab) => tab.id !== tabId);
      updateSession(session);
      return existing;
    }

    const bound: BoundSessionTab = {
      id: tabId,
      kind: "session",
      state: "bound",
      sessionId: session.id,
      ...(sessionLabel(session) ? { label: sessionLabel(session) } : {}),
    };
    tabs.value = tabs.value.map((tab) => (tab.id === tabId ? bound : tab));
    return bound;
  }

  function updateSession(session: PineSessionSummary): void {
    const label = sessionLabel(session);
    tabs.value = tabs.value.map((tab) => {
      if (
        tab.kind !== "session" ||
        tab.state !== "bound" ||
        tab.sessionId !== session.id
      ) {
        return tab;
      }
      return {
        ...tab,
        ...(label ? { label } : {}),
      };
    });
  }

  function close(tabId: string, activeTabId: string): string {
    const closingIndex = tabs.value.findIndex((tab) => tab.id === tabId);
    if (closingIndex < 0) return activeTabId;

    const wasActive = activeTabId === tabId;
    const closingTab = tabs.value[closingIndex];
    const nextTabs = tabs.value.filter((tab) => tab.id !== tabId);
    let replacement: DraftSessionTab | null = null;

    if (
      closingTab.kind === "session" &&
      !nextTabs.some((tab) => tab.kind === "session")
    ) {
      replacement = makeDraftTab();
      nextTabs.splice(Math.min(closingIndex, nextTabs.length), 0, replacement);
    }

    tabs.value = nextTabs;
    if (!wasActive) return activeTabId;

    return (
      replacement?.id ??
      nextTabs[Math.min(closingIndex, nextTabs.length - 1)]?.id ??
      createSessionTab().id
    );
  }

  function removeSession(sessionId: string, activeTabId: string): string {
    const removedIds = new Set(
      tabs.value
        .filter(
          (tab): tab is BoundSessionTab =>
            tab.kind === "session" &&
            tab.state === "bound" &&
            tab.sessionId === sessionId,
        )
        .map((tab) => tab.id),
    );
    if (removedIds.size === 0) return activeTabId;

    const activeWasRemoved = removedIds.has(activeTabId);
    tabs.value = tabs.value.filter((tab) => !removedIds.has(tab.id));
    if (!tabs.value.some((tab) => tab.kind === "session")) {
      const replacement = makeDraftTab();
      tabs.value = [replacement, ...tabs.value];
      if (activeWasRemoved) return replacement.id;
    } else if (activeWasRemoved) {
      return (
        tabs.value.find((tab) => tab.kind === "session")?.id ?? tabs.value[0].id
      );
    }
    return activeTabId;
  }

  function reset(): void {
    nextSessionTabNumber = 2;
    tabs.value = initialTabs();
  }

  return {
    beginPrompt,
    bindSession,
    close,
    createSessionTab,
    failPrompt,
    openSession,
    removeSession,
    reset,
    tabs,
    updateSession,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useContentTabsStore, import.meta.hot));
}
