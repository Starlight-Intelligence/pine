import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { PineSessionSummary } from "@/shared/sessions";
import { useContentTabsStore } from "@/stores/contentTabs";

const CONTENT_TAB_QUERY = "tab";

export function useContentTabNavigation() {
  const route = useRoute();
  const router = useRouter();
  const store = useContentTabsStore();
  const { tabs } = storeToRefs(store);

  const activeTabId = computed(() => {
    const queryValue = route.query[CONTENT_TAB_QUERY];
    const requestedId = Array.isArray(queryValue) ? queryValue[0] : queryValue;
    if (requestedId && tabs.value.some((tab) => tab.id === requestedId)) {
      return requestedId;
    }
    const fallbackId = store.fallbackActiveTabId;
    if (
      requestedId &&
      fallbackId &&
      tabs.value.some((tab) => tab.id === fallbackId)
    ) {
      return fallbackId;
    }
    return (
      tabs.value.find((tab) => tab.kind === "session")?.id ??
      tabs.value[0]?.id ??
      ""
    );
  });

  const activeTab = computed(
    () => tabs.value.find((tab) => tab.id === activeTabId.value) ?? null,
  );
  const activeSessionTab = computed(() =>
    activeTab.value?.kind === "session" ? activeTab.value : null,
  );

  function navigate(tabId: string, replace = false): void {
    if (!tabs.value.some((tab) => tab.id === tabId)) return;
    const location = {
      query: { ...route.query, [CONTENT_TAB_QUERY]: tabId },
    };
    void (replace ? router.replace(location) : router.push(location));
  }

  function createSessionTab(): void {
    navigate(store.createSessionTab().id);
  }

  function openSession(session: PineSessionSummary): void {
    navigate(store.openSession(session, activeTabId.value).id);
  }

  function bindSession(tabId: string, session: PineSessionSummary): void {
    const wasActive = activeTabId.value === tabId;
    const tab = store.bindSession(tabId, session);
    if (tab && wasActive && tab.id !== tabId) {
      navigate(tab.id, true);
    }
  }

  function failPrompt(tabId: string): void {
    const wasActive = activeTabId.value === tabId;
    const fallbackTabId = store.failPrompt(tabId);
    if (fallbackTabId && wasActive && fallbackTabId !== tabId) {
      navigate(fallbackTabId, true);
    }
  }

  function close(tabId: string): void {
    const currentActiveTabId = activeTabId.value;
    const nextActiveTabId = store.close(tabId, currentActiveTabId);
    if (tabId === currentActiveTabId) navigate(nextActiveTabId, true);
  }

  function removeSession(sessionId: string): void {
    const currentActiveTabId = activeTabId.value;
    const nextActiveTabId = store.removeSession(sessionId, currentActiveTabId);
    if (nextActiveTabId !== currentActiveTabId) {
      navigate(nextActiveTabId, true);
    }
  }

  return {
    activate: navigate,
    activeSessionTab,
    activeTab,
    activeTabId,
    bindSession,
    close,
    createSessionTab,
    failPrompt,
    openSession,
    removeSession,
    tabs,
  };
}
