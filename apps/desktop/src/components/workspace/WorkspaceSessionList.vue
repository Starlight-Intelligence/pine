<script setup lang="ts">
import { History, Plus, Search } from "@lucide/vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { handleError } from "@/app/errors/errorHandler";
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
import type { PineSessionSummary } from "@/shared/sessions";
import { useSessionStore } from "@/stores/session";

const { locale, t } = useI18n();
const emit = defineEmits<{
  search: [];
}>();
const sessionStore = useSessionStore();
const { activeSession, isLoadingRecent, recentSessions } =
  storeToRefs(sessionStore);
const scrollHost = ref<HTMLElement | null>(null);

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

async function resumeSession(sessionId: string): Promise<void> {
  if (sessionId === activeSession.value?.id) return;

  try {
    await sessionStore.resume(sessionId);
  } catch (error) {
    handleError(error, {
      id: "sessions.sidebar.resume",
      title: t("errors.sessionResume.title"),
      description: t("errors.sessionResume.description"),
    });
  }
}

onMounted(() => {
  void loadRecentSessions();
});
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
              :is-active="activeSession === null"
              @click="sessionStore.startTransientSession"
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
        v-scroll-fade="'[data-slot=scroll-area-viewport]'"
        class="h-full [&_[data-slot=scroll-area-viewport]]:scroll-fade"
      >
        <SidebarMenu
          class="relative px-2 py-1"
          :style="{ height: `${rowVirtualizer.getTotalSize() + 8}px` }"
        >
          <SidebarMenuItem
            v-for="virtualRow in virtualRows"
            :key="recentSessions[virtualRow.index].id"
            class="absolute inset-x-2 top-1"
            :style="{
              transform: `translateY(${virtualRow.start}px)`,
              height: `${virtualRow.size}px`,
            }"
          >
            <SidebarMenuButton
              :is-active="
                recentSessions[virtualRow.index].id === activeSession?.id
              "
              @click="resumeSession(recentSessions[virtualRow.index].id)"
            >
              <History aria-hidden="true" />
              <span>{{ sessionTitle(recentSessions[virtualRow.index]) }}</span>
              <span class="ml-auto shrink-0 text-xs text-muted-foreground">
                {{
                  dateFormatter.format(
                    new Date(recentSessions[virtualRow.index].updatedAt),
                  )
                }}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </ScrollArea>
    </div>
  </div>
</template>
