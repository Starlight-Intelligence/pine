import { onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { useContentTabNavigation } from "./useContentTabNavigation";
import { useContentTabsStore } from "@/stores/contentTabs";

export function useWindowTabShortcuts(): void {
  const route = useRoute();
  const navigation = useContentTabNavigation();
  const tabs = useContentTabsStore();
  let unsubscribe: (() => void) | undefined;
  let unsubscribeNewTab: (() => void) | undefined;
  onMounted(() => {
    unsubscribeNewTab = window.pine.onNewTabRequested(() => {
      if (!route.meta.requiresProject) return;
      navigation.activate(tabs.createSessionTab({ reuseDraft: false }).id);
    });
    unsubscribe = window.pine.onCloseTabRequested(() => {
      if (route.meta.requiresProject && navigation.activeTab.value) {
        navigation.close(navigation.activeTabId.value);
      } else {
        void window.pine.closeWindow();
      }
    });
  });
  onUnmounted(() => {
    unsubscribe?.();
    unsubscribeNewTab?.();
  });
}
