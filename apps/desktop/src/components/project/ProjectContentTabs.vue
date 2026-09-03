<script setup lang="ts">
import {
  FileCode2Icon,
  PlusIcon,
  SquareTerminalIcon,
  XIcon,
} from "@lucide/vue";
import { storeToRefs } from "pinia";
import type { ComponentPublicInstance } from "vue";
import { computed, nextTick, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { handleError } from "@/app/errors/errorHandler";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import { useContentTabNavigation } from "@/composables/useContentTabNavigation";
import { cn } from "@/lib/utils";
import type { ProjectContentTab } from "@/stores/contentTabs";
import { useContentTabsStore } from "@/stores/contentTabs";
import { useSessionStore } from "@/stores/session";
import ProjectSessionView from "./ProjectSessionView.vue";

const { t } = useI18n();
const { state: sidebarState, isMobile } = useSidebar();
const contentTabsStore = useContentTabsStore();
const tabNavigation = useContentTabNavigation();
const sessionStore = useSessionStore();
const { activeTab: activeContentTab, activeTabId, tabs } = tabNavigation;
const { activeSession } = storeToRefs(sessionStore);
const shouldReserveWindowControlsSpace = computed(
  () => sidebarState.value === "collapsed" || isMobile.value,
);

const tabButtons = new Map<string, HTMLButtonElement>();
const tabList = useTemplateRef<HTMLDivElement>("tabList");

function revealActiveTab(): void {
  const viewport = tabList.value;
  const button = tabButtons.get(activeTabId.value);
  if (!viewport || !button || viewport.clientWidth === 0) return;

  const viewportRect = viewport.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const left = viewportRect.left + viewport.clientLeft;
  const right = left + viewport.clientWidth;
  if (buttonRect.left >= left && buttonRect.right <= right) return;

  // Center clipped tabs so the edge fade does not obscure the active label.
  // Scroll only this viewport; scrollIntoView can also move its ancestors.
  const target =
    viewport.scrollLeft +
    (buttonRect.left + buttonRect.right - left - right) / 2;
  viewport.scrollTo({
    left: Math.max(
      0,
      Math.min(target, viewport.scrollWidth - viewport.clientWidth),
    ),
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}

watch([activeTabId, tabList], revealActiveTab, { flush: "post" });

function getTabLabel(tab: ProjectContentTab): string {
  return "label" in tab && tab.label
    ? tab.label
    : t("project.contentTabs.newSession");
}

function tabIcon(tab: ProjectContentTab) {
  return tab.kind === "session" ? SquareTerminalIcon : FileCode2Icon;
}

function shouldShowSeparator(index: number): boolean {
  if (index === 0) return false;

  return (
    tabs.value[index - 1]?.id !== activeTabId.value &&
    tabs.value[index]?.id !== activeTabId.value
  );
}

function setTabButton(
  tabId: string,
  element: Element | ComponentPublicInstance | null,
): void {
  let button: HTMLButtonElement | null = null;
  if (element instanceof HTMLButtonElement) {
    button = element;
  } else if (
    element &&
    "$el" in element &&
    element.$el instanceof HTMLButtonElement
  ) {
    button = element.$el;
  }
  if (button) tabButtons.set(tabId, button);
  else tabButtons.delete(tabId);
}

function activateTab(tabId: string): void {
  tabNavigation.activate(tabId);
}

function moveTabFocus(index: number, event: KeyboardEvent): void {
  let nextIndex: number | null = null;
  if (event.key === "ArrowLeft") nextIndex = index - 1;
  if (event.key === "ArrowRight") nextIndex = index + 1;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.value.length - 1;
  if (nextIndex === null) return;

  event.preventDefault();
  const normalizedIndex = (nextIndex + tabs.value.length) % tabs.value.length;
  const tab = tabs.value[normalizedIndex];
  tabNavigation.activate(tab.id);
  void nextTick(() => tabButtons.get(tab.id)?.focus({ preventScroll: true }));
}

watch(
  activeContentTab,
  (tab) => {
    if (!tab || tab.kind !== "session") return;

    if (tab.state === "draft") {
      sessionStore.startDraft();
      return;
    }
    if (tab.state === "creating") return;
    if (activeSession.value?.id === tab.sessionId) return;

    void sessionStore.resume(tab.sessionId).catch((error) => {
      handleError(error, {
        id: "sessions.tabs.resume",
        title: t("errors.sessionResume.title"),
        description: t("errors.sessionResume.description"),
      });
    });
  },
  { immediate: true },
);

watch(activeSession, (session) => {
  if (!session) return;
  contentTabsStore.updateSession(session);
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <div
      data-slot="project-content-tabs-titlebar"
      :class="
        cn(
          'pointer-events-none relative z-30 flex h-[var(--window-titlebar-height)] shrink-0 items-center gap-2 pr-[calc(var(--window-titlebar-control-height)+1.25rem)] pl-3 transition-[padding] duration-500 ease-out-expo',
          shouldReserveWindowControlsSpace &&
            'pl-[calc(var(--window-titlebar-leading-offset)+var(--window-titlebar-control-height)+0.75rem)]',
        )
      "
    >
      <div
        ref="tabList"
        data-slot="project-content-tab-list"
        role="tablist"
        :aria-label="t('project.contentTabs.tabListLabel')"
        class="window-drag scroll-fade-x pointer-events-auto flex min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto scrollbar-none"
      >
        <template v-for="(tab, index) in tabs" :key="tab.id">
          <Separator
            v-if="index > 0"
            orientation="vertical"
            :class="
              cn(
                'project-content-tab-separator h-7 self-center transition-opacity',
                shouldShowSeparator(index) ? 'opacity-100' : 'opacity-0',
              )
            "
          />

          <div
            data-slot="project-content-tab"
            class="window-no-drag group relative flex h-8 w-40 min-w-40 items-center rounded-2xl"
          >
            <Button
              :id="`project-content-tab-${tab.id}`"
              :ref="(element) => setTabButton(tab.id, element)"
              role="tab"
              :aria-controls="`project-content-panel-${tab.id}`"
              :aria-selected="activeTabId === tab.id"
              :tabindex="activeTabId === tab.id ? 0 : -1"
              :variant="activeTabId === tab.id ? 'secondary' : 'ghost'"
              size="sm"
              class="h-8 w-full min-w-0 justify-start pr-10"
              @click="activateTab(tab.id)"
              @keydown="moveTabFocus(index, $event)"
            >
              <component :is="tabIcon(tab)" data-icon="inline-start" />
              <span class="truncate">{{ getTabLabel(tab) }}</span>
            </Button>

            <Button
              class="pointer-events-none absolute inset-y-0 right-2 my-auto opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
              variant="ghost"
              size="icon-xs"
              :aria-label="
                t('project.contentTabs.closeTab', { name: getTabLabel(tab) })
              "
              @click.stop="tabNavigation.close(tab.id)"
            >
              <XIcon />
            </Button>
          </div>
        </template>
      </div>

      <Button
        class="window-no-drag pointer-events-auto"
        variant="ghost"
        size="icon-sm"
        :aria-label="t('project.contentTabs.addTab')"
        @click="tabNavigation.createSessionTab"
      >
        <PlusIcon />
      </Button>
    </div>

    <div
      v-if="activeContentTab"
      :id="`project-content-panel-${activeContentTab.id}`"
      role="tabpanel"
      :aria-labelledby="`project-content-tab-${activeContentTab.id}`"
      class="min-h-0 flex-1 overflow-hidden"
    >
      <!-- KeepAlive caches each tab's session view so scroll position, expand /
           collapse state and the streaming DOM survive tab switches instead of
           remounting. The :key keeps one cached instance per tab id. -->
      <KeepAlive>
        <ProjectSessionView
          v-if="activeContentTab.kind === 'session'"
          :key="activeContentTab.id"
          :tab-id="activeContentTab.id"
          :session-id="
            activeContentTab.state === 'bound'
              ? activeContentTab.sessionId
              : undefined
          "
        />
      </KeepAlive>
    </div>
  </div>
</template>

<style scoped>
.project-content-tab-separator {
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent,
    black 18%,
    black 82%,
    transparent
  );
  mask-image: linear-gradient(
    to bottom,
    transparent,
    black 18%,
    black 82%,
    transparent
  );
}
</style>
