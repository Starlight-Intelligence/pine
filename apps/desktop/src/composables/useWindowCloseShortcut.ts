import { onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { useContentTabNavigation } from "./useContentTabNavigation";

export function useWindowCloseShortcut(): void {
  const route = useRoute();
  const navigation = useContentTabNavigation();
  let unsubscribe: (() => void) | undefined;
  onMounted(() => {
    unsubscribe = window.pine.onCloseTabRequested(() => {
      if (route.meta.requiresProject && navigation.activeTab.value) {
        navigation.close(navigation.activeTabId.value);
      } else {
        void window.pine.closeWindow();
      }
    });
  });
  onUnmounted(() => unsubscribe?.());
}
