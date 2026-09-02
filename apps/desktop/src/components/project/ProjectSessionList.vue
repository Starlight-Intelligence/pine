<script setup lang="ts">
import { Pencil, Plus, Search, Trash2 } from "@lucide/vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { handleError } from "@/app/errors/errorHandler";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import type { PineSessionSummary } from "@/shared/sessions";
import { useContentTabsStore } from "@/stores/contentTabs";
import { useProjectStore } from "@/stores/project";
import { useSessionStore } from "@/stores/session";

const { locale, t } = useI18n();
const emit = defineEmits<{
  search: [];
}>();
const tabNavigation = useContentTabNavigation();
const projectStore = useProjectStore();
const sessionStore = useSessionStore();
const contentTabsStore = useContentTabsStore();
const { activeSessionTab } = tabNavigation;
const { activeProject } = storeToRefs(projectStore);
const { isLoadingRecent, recentSessions } = storeToRefs(sessionStore);
const scrollHost = ref<HTMLElement | null>(null);
const sessionPendingDelete = ref<PineSessionSummary | null>(null);
const isDeleteDialogOpen = ref(false);
const isDeleting = ref(false);
const sessionPendingRename = ref<PineSessionSummary | null>(null);
const isRenameDialogOpen = ref(false);
const renameName = ref("");
const isRenaming = ref(false);
const canRename = computed(
  () => renameName.value.trim().length > 0 && !isRenaming.value,
);

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
  renameName.value = sessionTitle(session);
  isRenameDialogOpen.value = true;
}

function setRenameDialogOpen(open: boolean): void {
  isRenameDialogOpen.value = open;
  if (open) return;
  sessionPendingRename.value = null;
  renameName.value = "";
}

async function renameRequestedSession(): Promise<void> {
  const session = sessionPendingRename.value;
  const name = renameName.value.trim();
  if (!session || !name || isRenaming.value) return;

  isRenaming.value = true;
  try {
    const renamed = await sessionStore.renameSession(session.id, name);
    contentTabsStore.updateSession(renamed);
    setRenameDialogOpen(false);
  } catch (error) {
    handleError(error, {
      id: "sessions.sidebar.rename",
      title: t("errors.sessionRename.title"),
      description: t("errors.sessionRename.description"),
    });
  } finally {
    isRenaming.value = false;
  }
}

async function deleteRequestedSession(): Promise<void> {
  const session = sessionPendingDelete.value;
  if (!session || isDeleting.value) return;

  isDeleting.value = true;
  try {
    await sessionStore.deleteSession(session.id);
    tabNavigation.removeSession(session.id);
    isDeleteDialogOpen.value = false;
    sessionPendingDelete.value = null;
  } catch (error) {
    handleError(error, {
      id: "sessions.sidebar.delete",
      title: t("errors.sessionDelete.title"),
      description: t("errors.sessionDelete.description"),
    });
  } finally {
    isDeleting.value = false;
  }
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

    <AlertDialog v-model:open="isDeleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t("sessions.deleteTitle") }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{
              t("sessions.deleteDescription", {
                name: sessionPendingDelete
                  ? sessionTitle(sessionPendingDelete)
                  : "",
              })
            }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="isDeleting">
            {{ t("common.cancel") }}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            :disabled="isDeleting"
            @click="deleteRequestedSession"
          >
            {{ t("common.delete") }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog :open="isRenameDialogOpen" @update:open="setRenameDialogOpen">
      <DialogContent>
        <form
          class="flex flex-col gap-6"
          @submit.prevent="renameRequestedSession"
        >
          <DialogHeader>
            <DialogTitle>{{ t("sessions.renameTitle") }}</DialogTitle>
            <DialogDescription>
              {{ t("sessions.renameDescription") }}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel for="session-name">
                {{ t("sessions.nameLabel") }}
              </FieldLabel>
              <Input
                id="session-name"
                v-model="renameName"
                maxlength="200"
                autocomplete="off"
                required
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              :disabled="isRenaming"
              @click="setRenameDialogOpen(false)"
            >
              {{ t("common.cancel") }}
            </Button>
            <Button type="submit" :disabled="!canRename">
              {{ t("common.save") }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
