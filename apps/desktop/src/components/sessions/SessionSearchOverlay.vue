<script setup lang="ts">
import { History, Plus } from "@lucide/vue";
import { useDebounceFn } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { handleError } from "@/app/errors/errorHandler";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import type { SessionSearchResult } from "@/shared/sessions";
import { useSessionStore } from "@/stores/session";
import SessionCommandInput from "./SessionCommandInput.vue";
import SessionSnippet from "./SessionSnippet.vue";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
}>();

const { locale, t } = useI18n();
const sessionStore = useSessionStore();
const { activeSession, isSearching, searchResults } = storeToRefs(sessionStore);
const query = ref("");
const filterRefreshToken = computed(
  () =>
    `${query.value}:${searchResults.value.map((session) => session.id).join(",")}`,
);

const dateFormatter = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      month: "short",
      day: "numeric",
    }),
);

const runSearch = useDebounceFn(async () => {
  try {
    await sessionStore.search(query.value);
  } catch (error) {
    handleError(error, {
      id: "sessions.search",
      title: t("errors.sessionSearch.title"),
      description: t("errors.sessionSearch.description"),
    });
  }
}, 120);

watch(
  () => props.open,
  (open) => {
    if (open) void runSearch();
  },
  { immediate: true },
);

watch(query, () => {
  if (props.open) void runSearch();
});

function sessionTitle(session: SessionSearchResult): string {
  return session.name || session.preview || t("sessions.newSession");
}

function sessionSnippet(session: SessionSearchResult): string | undefined {
  const snippet = session.snippet || session.preview;
  return snippet?.replaceAll(/\s+/g, " ").trim();
}

async function resumeSession(sessionId: string): Promise<void> {
  if (sessionId === activeSession.value?.id) {
    emit("update:open", false);
    return;
  }

  try {
    await sessionStore.resume(sessionId);
    emit("update:open", false);
  } catch (error) {
    handleError(error, {
      id: "sessions.resume",
      title: t("errors.sessionResume.title"),
      description: t("errors.sessionResume.description"),
    });
  }
}

function startTransientSession(): void {
  sessionStore.startTransientSession();
  emit("update:open", false);
}
</script>

<template>
  <CommandDialog
    :open="open"
    :title="t('sessions.searchTitle')"
    :description="t('sessions.searchDescription')"
    @update:open="emit('update:open', $event)"
  >
    <SessionCommandInput
      :query="query"
      :placeholder="t('sessions.searchPlaceholder')"
      :refresh-token="filterRefreshToken"
      @update:query="query = $event"
    />

    <CommandList
      class="min-h-52 [&>[role=presentation]]:flex [&>[role=presentation]]:min-h-52 [&>[role=presentation]]:flex-col"
    >
      <CommandEmpty class="flex flex-1 items-center justify-center py-0">
        <span v-if="isSearching" class="inline-flex items-center gap-2">
          <Spinner />
          {{ t("sessions.searching") }}
        </span>
        <template v-else>{{ t("sessions.noResults") }}</template>
      </CommandEmpty>

      <CommandGroup
        v-if="!query || searchResults.length > 0"
        :key="filterRefreshToken"
      >
        <CommandItem
          v-if="!query"
          value="pine:new-session"
          class="data-[highlighted]:bg-muted data-[highlighted]:text-foreground data-[highlighted]:*:[svg]:text-foreground"
          @select="startTransientSession"
        >
          <Plus aria-hidden="true" />
          <span>{{ t("sessions.newSession") }}</span>
        </CommandItem>

        <CommandSeparator v-if="!query && searchResults.length > 0" />

        <CommandItem
          v-for="session in searchResults"
          :key="session.id"
          :value="session.id"
          class="data-[highlighted]:bg-muted data-[highlighted]:text-foreground data-[highlighted]:*:[svg]:text-foreground"
          @select="resumeSession(session.id)"
        >
          <History aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <span class="sr-only">{{ query }}&#8203;</span>
            <span class="block truncate">{{ sessionTitle(session) }}</span>
            <p
              v-if="query && sessionSnippet(session)"
              class="mt-0.5 truncate text-xs font-normal text-muted-foreground"
            >
              <SessionSnippet
                :query="query"
                :text="sessionSnippet(session) ?? ''"
              />
            </p>
          </div>
          <CommandShortcut class="tracking-normal">
            {{
              session.id === activeSession?.id
                ? t("sessions.current")
                : dateFormatter.format(new Date(session.updatedAt))
            }}
          </CommandShortcut>
        </CommandItem>
      </CommandGroup>

      <div
        v-if="!query && searchResults.length === 0"
        class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
      >
        <span v-if="isSearching" class="inline-flex items-center gap-2">
          <Spinner />
          {{ t("sessions.searching") }}
        </span>
        <template v-else>{{ t("sessions.noSessions") }}</template>
      </div>
    </CommandList>
  </CommandDialog>
</template>
