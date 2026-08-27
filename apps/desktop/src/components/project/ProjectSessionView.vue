<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { PineCharacter } from "@/components/pine";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import { useContentTabNavigation } from "@/composables/useContentTabNavigation";
import { useToolActivityExpansion } from "@/composables/useToolActivityExpansion";
import { useContentTabsStore } from "@/stores/contentTabs";
import { useSessionStore } from "@/stores/session";
import ProjectSessionComposer from "./ProjectSessionComposer.vue";
import ProjectTranscriptMessage from "./ProjectTranscriptMessage.vue";
import ProjectTranscriptOutline from "./ProjectTranscriptOutline.vue";
import { collapsesTranscriptGap } from "./transcriptLayout";

const { t } = useI18n();
const props = defineProps<{
  sessionId?: string;
  tabId: string;
}>();
const contentTabsStore = useContentTabsStore();
const tabNavigation = useContentTabNavigation();
const sessionStore = useSessionStore();
const { hasEarlierMessages, isLoadingMessages, isRunning, messages } =
  storeToRefs(sessionStore);
const draft = ref("");

/** While a response runs, its last two tool units (folded groups and
 * standalone calls alike) stay expanded; everything folds when it ends. */
const expandedToolRuns = useToolActivityExpansion({ messages, isRunning });

/**
 * Turn gap collapses to the in-turn tool spacing (gap-2.5) when the model
 * skips thinking and starts a turn directly with a tool call, cancelling the
 * MessageScrollerContent `gap-8` down to that rhythm.
 */
const TOOL_CALL_TURN_MARGIN_CLASS = "-mt-[1.375rem]";

onMounted(() => sessionStore.connectAgentEvents());

function submit(message: string): void {
  const sessionId = props.sessionId;
  if (!contentTabsStore.beginPrompt(props.tabId, message)) return;
  draft.value = "";
  void sessionStore
    .prompt(message, sessionId)
    .then((session) => tabNavigation.bindSession(props.tabId, session))
    .catch(() => {
      tabNavigation.failPrompt(props.tabId);
      toast.error(t("errors.sessionPrompt.title"), {
        description: t("errors.sessionPrompt.description"),
      });
    });
}

function abort(): void {
  void sessionStore.abort().catch(() => {
    toast.error(t("errors.sessionAbort.title"), {
      description: t("errors.sessionAbort.description"),
    });
  });
}
</script>

<template>
  <MessageScrollerProvider
    auto-scroll
    default-scroll-position="last-anchor"
    :scroll-previous-item-peek="64"
  >
    <div class="session-layout flex h-full min-h-0 flex-col">
      <div class="relative min-h-0 w-full flex-1">
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent
              class="session-transcript-content mx-auto py-8"
              spacer-class="h-16"
            >
              <div
                v-if="hasEarlierMessages || isLoadingMessages"
                class="flex justify-center"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  :disabled="isLoadingMessages"
                  @click="sessionStore.loadEarlierMessages"
                >
                  <Spinner v-if="isLoadingMessages" data-icon="inline-start" />
                  {{
                    isLoadingMessages
                      ? t("project.transcript.loadingHistory")
                      : t("project.transcript.loadHistory")
                  }}
                </Button>
              </div>

              <Empty v-if="!messages.length && !isLoadingMessages">
                <EmptyHeader>
                  <PineCharacter decorative size="lg" />
                  <EmptyTitle>{{
                    t("project.transcript.emptyTitle")
                  }}</EmptyTitle>
                  <EmptyDescription>
                    {{ t("project.transcript.emptyDescription") }}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>

              <MessageScrollerItem
                v-for="(message, index) in messages"
                :key="message.id"
                :message-id="message.id"
                :scroll-anchor="message.role === 'user'"
                :class="
                  collapsesTranscriptGap(messages, index)
                    ? TOOL_CALL_TURN_MARGIN_CLASS
                    : undefined
                "
              >
                <ProjectTranscriptMessage
                  :message="message"
                  :expanded-tool-runs="expandedToolRuns"
                />
              </MessageScrollerItem>
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>

        <ProjectTranscriptOutline :messages="messages" />
      </div>

      <ProjectSessionComposer
        v-model="draft"
        :is-running="isRunning"
        @abort="abort"
        @submit="submit"
      />
    </div>
  </MessageScrollerProvider>
</template>

<style scoped>
.session-layout {
  --session-composer-max-width: 48rem;
  --session-composer-gutter: 1rem;
  --session-input-padding-inline: 0.75rem;
}

.session-transcript-content {
  width: calc(
    100% - var(--session-composer-gutter) - var(--session-composer-gutter) -
      var(--session-input-padding-inline) - var(--session-input-padding-inline)
  );
  max-width: calc(
    var(--session-composer-max-width) - var(--session-composer-gutter) -
      var(--session-composer-gutter) - var(--session-input-padding-inline) -
      var(--session-input-padding-inline)
  );
}
</style>
