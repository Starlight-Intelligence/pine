<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import { useSessionStore } from "@/stores/session";
import ProjectSessionComposer from "./ProjectSessionComposer.vue";
import ProjectTranscriptMessage from "./ProjectTranscriptMessage.vue";
import ProjectTranscriptOutline from "./ProjectTranscriptOutline.vue";

const { t } = useI18n();
const sessionStore = useSessionStore();
const { hasEarlierMessages, isLoadingMessages, isRunning, messages } =
  storeToRefs(sessionStore);
const draft = ref("");

onMounted(() => sessionStore.connectAgentEvents());

function submit(message: string): void {
  draft.value = "";
  void sessionStore.prompt(message).catch(() => {
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
    <div class="flex h-full min-h-0 flex-col">
      <div class="relative mx-auto min-h-0 w-full max-w-[864px] flex-1">
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent
              class="mx-auto w-full max-w-[768px] px-4 py-8"
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
                  <EmptyTitle>{{
                    t("project.transcript.emptyTitle")
                  }}</EmptyTitle>
                  <EmptyDescription>
                    {{ t("project.transcript.emptyDescription") }}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>

              <MessageScrollerItem
                v-for="message in messages"
                :key="message.id"
                :message-id="message.id"
                :scroll-anchor="message.role === 'user'"
              >
                <ProjectTranscriptMessage :message="message" />
              </MessageScrollerItem>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="end" />
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
