<script setup lang="ts">
import { Pencil, Plus, Search, Trash2 } from "@lucide/vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { useEventListener } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { handleError } from "@/app/errors/errorHandler";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { useContentTabNavigation } from "@/composables/useContentTabNavigation";
import { useFileToSession } from "@/composables/useFileToSession";
import { FILE_TAB_DRAG_TYPE, hasFileTabDrag } from "@/lib/contentTabDrag";
import type { PineSessionSummary } from "@/shared/sessions";
import { useContentTabsStore } from "@/stores/contentTabs";
import { useProjectStore } from "@/stores/project";
import { useSessionStore } from "@/stores/session";
import SessionDeleteDialog from "@/components/sessions/SessionDeleteDialog.vue";
import SessionRenameDialog from "@/components/sessions/SessionRenameDialog.vue";

const { locale, t } = useI18n();
const emit = defineEmits<{
  search: [];
}>();
const tabNavigation = useContentTabNavigation();
const projectStore = useProjectStore();
const sessionStore = useSessionStore();
const contentTabsStore = useContentTabsStore();
const { sendFile } = useFileToSession();
const dropSessionId = ref<string | null>(null);
useEventListener(window, "dragend", () => {
  dropSessionId.value = null;
});

function dragOverSession(event: DragEvent, session: PineSessionSummary): void {
  if (!hasFileTabDrag(event.dataTransfer)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  dropSessionId.value = session.id;
}

function leaveSession(event: DragEvent): void {
  if (
    event.relatedTarget instanceof Node &&
    (event.currentTarget as HTMLElement).contains(event.relatedTarget)
  )
    return;
  dropSessionId.value = null;
}

function dropOnSession(event: DragEvent, session: PineSessionSummary): void {
  if (!hasFileTabDrag(event.dataTransfer)) return;
  event.preventDefault();
  event.stopPropagation();
  dropSessionId.value = null;
  const tabId = event.dataTransfer?.getData(FILE_TAB_DRAG_TYPE);
  const file = contentTabsStore.tabs.find(
    (tab) => tab.id === tabId && tab.kind === "file",
  );
  if (file?.kind === "file") void sendFile(file, session);
}
const { activeSessionTab } = tabNavigation;
const { activeProject } = storeToRefs(projectStore);
const { isLoadingRecent, recentSessions } = storeToRefs(sessionStore);
const scrollHost = ref<HTMLElement | null>(null);
const sessionPendingDelete = ref<PineSessionSummary | null>(null);
const isDeleteDialogOpen = ref(false);
const sessionPendingRename = ref<PineSessionSummary | null>(null);
const isRenameDialogOpen = ref(false);

watch(isDeleteDialogOpen, (open) => {
  if (!open) sessionPendingDelete.value = null;
});
watch(isRenameDialogOpen, (open) => {
  if (!open) sessionPendingRename.value = null;
});

const dateFormatter = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      month: "short",
      day: "numeric",
    }),
);

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: recentSessions.value.length,
    getScrollElement: () =>
      scrollHost.value?.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]',
      ) ?? null,
    estimateSize: () => 36,
    overscan: 10,
  })),
);

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems());

function sessionTitle(session: PineSessionSummary): string {
  return session.name || session.preview || t("sessions.newSession");
}

async function loadRecentSessions(): Promise<void> {
  try {
    await sessionStore.loadRecent();
  } catch (error) {
    handleError(error, {
      id: "sessions.sidebar.load",
      title: t("errors.sessionSearch.title"),
      description: t("errors.sessionSearch.description"),
    });
  }
}

function openSession(session: PineSessionSummary): void {
  tabNavigation.openSession(session);
}

function requestSessionDeletion(session: PineSessionSummary): void {
  sessionPendingDelete.value = session;
  isDeleteDialogOpen.value = true;
}

function requestSessionRename(session: PineSessionSummary): void {
  sessionPendingRename.value = session;
  isRenameDialogOpen.value = true;
}

watch(
  () => {
    const project = activeProject.value;
    return project ? `${project.id}:${project.updatedAt}` : null;
  },
  (projectVersion) => {
    if (projectVersion) void loadRecentSessions();
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <SidebarGroup class="shrink-0">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton @click="emit('search')">
              <Search aria-hidden="true" />
              <span>{{ t("sessions.searchAction") }}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              :is-active="activeSessionTab?.state === 'draft'"
              @click="tabNavigation.createSessionTab"
            >
              <Plus aria-hidden="true" />
              <span>{{ t("sessions.newSession") }}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>

    <Separator />

    <SidebarGroup v-if="isLoadingRecent" class="flex-1">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem v-for="index in 5" :key="index">
            <SidebarMenuSkeleton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>

    <SidebarGroup v-else-if="recentSessions.length === 0" class="flex-1">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton disabled>
              <span>{{ t("sessions.noSessions") }}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>

    <div v-else ref="scrollHost" class="min-h-0 flex-1">
      <ScrollArea
        class="h-full [&_[data-slot=scroll-area-viewport]]:scroll-fade"
      >
        <SidebarMenu
          class="relative px-2 py-2"
          :style="{ height: `${rowVirtualizer.getTotalSize() + 16}px` }"
        >
          <SidebarMenuItem
            v-for="virtualRow in virtualRows"
            :key="recentSessions[virtualRow.index].id"
            class="absolute inset-x-2 top-2"
            :style="{
              transform: `translateY(${virtualRow.start}px)`,
              height: `${virtualRow.size}px`,
            }"
          >
            <ContextMenu>
              <ContextMenuTrigger as-child>
                <SidebarMenuButton
                  class="min-w-0"
                  :data-session-id="recentSessions[virtualRow.index].id"
                  :class="{
                    'bg-sidebar-accent ring-1 ring-sidebar-ring':
                      dropSessionId === recentSessions[virtualRow.index].id,
                  }"
                  @dragover="
                    dragOverSession($event, recentSessions[virtualRow.index])
                  "
                  @dragleave="leaveSession"
                  @drop="
                    dropOnSession($event, recentSessions[virtualRow.index])
                  "
                  :is-active="
                    activeSessionTab?.state === 'bound' &&
                    recentSessions[virtualRow.index].id ===
                      activeSessionTab.sessionId
                  "
                  @click="openSession(recentSessions[virtualRow.index])"
                >
                  <span class="min-w-0 flex-1 truncate">
                    {{ sessionTitle(recentSessions[virtualRow.index]) }}
                  </span>
                  <span class="ml-auto shrink-0 text-xs text-muted-foreground">
                    {{
                      dateFormatter.format(
                        new Date(recentSessions[virtualRow.index].updatedAt),
                      )
                    }}
                  </span>
                </SidebarMenuButton>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuGroup>
                  <ContextMenuItem
                    @select="
                      requestSessionRename(recentSessions[virtualRow.index])
                    "
                  >
                    <Pencil aria-hidden="true" />
                    {{ t("sessions.renameAction") }}
                  </ContextMenuItem>
                  <ContextMenuItem
                    variant="destructive"
                    @select="
                      requestSessionDeletion(recentSessions[virtualRow.index])
                    "
                  >
                    <Trash2 aria-hidden="true" />
                    {{ t("sessions.deleteAction") }}
                  </ContextMenuItem>
                </ContextMenuGroup>
              </ContextMenuContent>
            </ContextMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </ScrollArea>
    </div>

    <SessionDeleteDialog
      v-model:open="isDeleteDialogOpen"
      :session="sessionPendingDelete"
    />

    <SessionRenameDialog
      v-model:open="isRenameDialogOpen"
      :session="sessionPendingRename"
    />
  </div>
</template>
