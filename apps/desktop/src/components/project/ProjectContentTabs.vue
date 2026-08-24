<script setup lang="ts">
import type { Component } from "vue";
import {
  FileCode2Icon,
  PlusIcon,
  SquareTerminalIcon,
  XIcon,
} from "@lucide/vue";
import { computed, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import ProjectSessionView from "./ProjectSessionView.vue";

interface ProjectContentTab {
  id: string;
  icon: Component;
  label?: string;
  sessionNumber?: number;
}

const { t } = useI18n();
const { state: sidebarState, isMobile } = useSidebar();
const shouldReserveWindowControlsSpace = computed(
  () => sidebarState.value === "collapsed" || isMobile.value,
);

const tabs = shallowRef<ProjectContentTab[]>([
  {
    id: "session-1",
    icon: SquareTerminalIcon,
    sessionNumber: 1,
  },
  {
    id: "file-project-view",
    icon: FileCode2Icon,
    label: "ProjectView.vue",
  },
]);
const activeTab = ref("session-1");
const nextSessionNumber = ref(2);

function getTabLabel(tab: ProjectContentTab): string {
  if (tab.label) return tab.label;
  if (tab.sessionNumber === 1) return t("project.contentTabs.newSession");

  return t("project.contentTabs.sessionNumber", {
    number: tab.sessionNumber,
  });
}

function shouldShowSeparator(index: number): boolean {
  if (index === 0) return false;

  return (
    tabs.value[index - 1]?.id !== activeTab.value &&
    tabs.value[index]?.id !== activeTab.value
  );
}

function addSessionTab(): void {
  const number = nextSessionNumber.value;
  const id = `session-${number}`;

  tabs.value = [
    ...tabs.value,
    {
      id,
      icon: SquareTerminalIcon,
      sessionNumber: number,
    },
  ];
  nextSessionNumber.value += 1;
  activeTab.value = id;
}

function closeTab(tabId: string): void {
  if (tabs.value.length === 1) return;

  const tabIndex = tabs.value.findIndex((tab) => tab.id === tabId);
  if (tabIndex < 0) return;

  const wasActive = activeTab.value === tabId;
  const nextTabs = tabs.value.filter((tab) => tab.id !== tabId);
  tabs.value = nextTabs;

  if (wasActive) {
    activeTab.value = nextTabs[Math.min(tabIndex, nextTabs.length - 1)].id;
  }
}
</script>

<template>
  <Tabs v-model="activeTab" class="h-full min-h-0 gap-0 bg-background">
    <div
      data-slot="project-content-tabs-titlebar"
      :class="
        cn(
          'pointer-events-none relative z-30 flex h-[var(--window-titlebar-height)] shrink-0 items-center gap-2 pr-[calc(var(--window-titlebar-control-height)+1.25rem)] pl-2 transition-[padding] duration-500 ease-out-expo',
          shouldReserveWindowControlsSpace &&
            'pl-[calc(var(--window-titlebar-leading-offset)+var(--window-titlebar-control-height)+0.75rem)]',
        )
      "
    >
      <TabsList
        variant="line"
        class="window-no-drag pointer-events-auto min-w-0 flex-1 justify-start overflow-x-auto scrollbar-none"
      >
        <template v-for="(tab, index) in tabs" :key="tab.id">
          <Separator
            v-if="index > 0"
            orientation="vertical"
            :class="
              cn(
                'transition-opacity',
                shouldShowSeparator(index) ? 'opacity-100' : 'opacity-0',
              )
            "
          />

          <div
            :class="
              cn(
                'group relative flex h-8 w-40 min-w-40 items-center rounded-2xl',
                activeTab === tab.id && 'bg-muted',
              )
            "
          >
            <TabsTrigger
              :value="tab.id"
              class="h-8 w-full max-w-none flex-none justify-start gap-2 px-3 py-2 pr-10 after:hidden has-data-[icon=inline-start]:pl-3 data-active:bg-transparent"
            >
              <component :is="tab.icon" data-icon="inline-start" />
              <span class="truncate">{{ getTabLabel(tab) }}</span>
            </TabsTrigger>

            <Button
              class="pointer-events-none absolute inset-y-0 right-2 my-auto opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
              variant="ghost"
              size="icon-xs"
              :disabled="tabs.length === 1"
              :aria-label="
                t('project.contentTabs.closeTab', { name: getTabLabel(tab) })
              "
              @click.stop="closeTab(tab.id)"
            >
              <XIcon />
            </Button>
          </div>
        </template>
      </TabsList>

      <Button
        class="window-no-drag pointer-events-auto"
        variant="ghost"
        size="icon-sm"
        :aria-label="t('project.contentTabs.addTab')"
        @click="addSessionTab"
      >
        <PlusIcon />
      </Button>
    </div>

    <TabsContent
      v-for="tab in tabs"
      :key="tab.id"
      :value="tab.id"
      class="min-h-0 overflow-hidden"
    >
      <ProjectSessionView v-if="tab.sessionNumber !== undefined" />
    </TabsContent>
  </Tabs>
</template>
