<script setup lang="ts">
import {
  containsFileDrag,
  externalFilePaths,
  readProjectEntryDrag,
} from "@/lib/projectFileDrag";
import { FilesIcon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import type { PineApprovalAction, PineApprovalMode } from "@/shared/agent";
import {
  attachmentMessagePreview,
  type PineAttachment,
} from "@/shared/attachments";
import { PineCharacter } from "@/components/pine";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
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
const liveState = storeToRefs(sessionStore);

// Retaining a panel does not stop reactive updates. A hidden tab
// must retain its own projection instead of rendering every newly active
// session's transcript (and reparsing its Markdown) in the hidden DOM.
function tabValue<T>(source: Ref<T>) {
  return computed<T>((previous) =>
    tabNavigation.activeTabId.value === props.tabId || previous === undefined
      ? source.value
      : previous,
  );
}

const hasEarlierMessages = tabValue(liveState.hasEarlierMessages);
const isLoadingMessages = tabValue(liveState.isLoadingMessages);
const isRunning = tabValue(liveState.isRunning);
const messages = tabValue(liveState.messages);
const pendingApprovals = tabValue(liveState.pendingApprovals);
const reviewingToolCallIds = tabValue(liveState.reviewingToolCallIds);
const draft = ref("");
const attachments = computed<PineAttachment[]>({
  get: () => contentTabsStore.attachmentsFor(props.tabId),
  set: (value) => {
    contentTabsStore.setAttachments(props.tabId, value);
  },
});
const approvalMode = ref<PineApprovalMode>("auto-approve");
const isDraggingFiles = ref(false);
let fileDragDepth = 0;
/** The oldest pending approval renders above the composer. */
const pendingApproval = computed(() => pendingApprovals.value[0]);
/** Tool calls waiting for the user's decision (Let Me Review mode). */
const awaitingApprovalToolCallIds = computed(
  () => new Set(pendingApprovals.value.map((approval) => approval.toolCallId)),
);

/** While a response runs, its last two tool units (folded groups and
 * standalone calls alike) stay expanded; everything folds when it ends. */
const expandedToolRuns = useToolActivityExpansion({ messages, isRunning });

/**
 * Turn gap collapses to the in-turn tool spacing (gap-3) when the model
 * skips thinking and starts a turn directly with a tool call, cancelling the
 * MessageScrollerContent `gap-8` down to that rhythm.
 */
const TOOL_CALL_TURN_MARGIN_CLASS = "-mt-5";

onMounted(() => sessionStore.connectAgentEvents());

watch(approvalMode, (value) => {
  // Prompt requests carry the same value as a fallback; this eager update
  // makes the new policy apply to later tool calls in an already-running turn.
  void sessionStore.setApprovalMode(value).catch(() => undefined);
});

function submit(message: string): void {
  const sessionId = props.sessionId;
  if (
    !contentTabsStore.beginPrompt(
      props.tabId,
      attachmentMessagePreview(message),
    )
  ) {
    return;
  }
  draft.value = "";
  void sessionStore
    .prompt(message, sessionId, approvalMode.value)
    .then((session) => tabNavigation.bindSession(props.tabId, session))
    .catch(() => {
      tabNavigation.failPrompt(props.tabId);
      toast.error(t("errors.sessionPrompt.title"), {
        description: t("errors.sessionPrompt.description"),
      });
    });
}

function respondToApproval(
  action: PineApprovalAction,
  guidance?: string,
): void {
  void sessionStore.respondApproval(action, guidance);
}

function abort(): void {
  void sessionStore.abort().catch(() => {
    toast.error(t("errors.sessionAbort.title"), {
      description: t("errors.sessionAbort.description"),
    });
  });
}

function loadEarlierMessages(): void {
  void sessionStore.loadEarlierMessages().catch(() => {
    toast.error(t("errors.sessionHistory.title"), {
      description: t("errors.sessionHistory.description"),
    });
  });
}

function dragContainsFiles(event: DragEvent): boolean {
  return containsFileDrag(event.dataTransfer);
}

function handleDragEnter(event: DragEvent): void {
  if (!dragContainsFiles(event)) return;
  event.preventDefault();
  fileDragDepth += 1;
  isDraggingFiles.value = true;
}

function handleDragOver(event: DragEvent): void {
  if (!dragContainsFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function handleDragLeave(event: DragEvent): void {
  if (!isDraggingFiles.value) return;
  event.preventDefault();
  fileDragDepth = Math.max(0, fileDragDepth - 1);
  if (fileDragDepth === 0) isDraggingFiles.value = false;
}

async function handleDrop(event: DragEvent): Promise<void> {
  if (!dragContainsFiles(event)) return;
  event.preventDefault();
  fileDragDepth = 0;
  isDraggingFiles.value = false;

  try {
    const transfer = event.dataTransfer;
    if (!transfer) return;
    const entries = readProjectEntryDrag(transfer);
    const paths = entries ? [] : externalFilePaths(transfer);
    if (!entries && !paths.length) return;
    const result = entries
      ? await window.pine.inspectProjectAttachments(entries)
      : await window.pine.inspectAttachments({ paths });
    const byPath = new Map(
      attachments.value.map((attachment) => [attachment.path, attachment]),
    );
    for (const attachment of result.attachments) {
      byPath.set(attachment.path, attachment);
    }
    attachments.value = [...byPath.values()];
  } catch {
    toast.error(t("project.composer.attachmentDropFailed"));
  }
}
</script>

<template>
  <MessageScrollerProvider
    auto-scroll
    default-scroll-position="last-anchor"
    :scroll-previous-item-peek="64"
    :follow-animated="isRunning"
  >
    <div
      class="session-layout relative flex h-full min-h-0 flex-col"
      @dragenter="handleDragEnter"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
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
                  @click="loadEarlierMessages"
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
                  :reviewing-tool-call-ids="reviewingToolCallIds"
                  :awaiting-approval-tool-call-ids="awaitingApprovalToolCallIds"
                />
              </MessageScrollerItem>
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>

        <ProjectTranscriptOutline :messages="messages" />
      </div>

      <ProjectSessionComposer
        v-model="draft"
        v-model:attachments="attachments"
        v-model:approvalMode="approvalMode"
        :is-running="isRunning"
        :pending-approval="pendingApproval"
        @abort="abort"
        @respond="respondToApproval"
        @submit="submit"
      />

      <Empty
        v-if="isDraggingFiles"
        data-slot="attachment-drop-overlay"
        class="pointer-events-none absolute inset-3 z-20 w-auto border bg-background/95 shadow-sm backdrop-blur-sm"
        role="status"
      >
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FilesIcon />
          </EmptyMedia>
          <EmptyTitle>
            {{ t("project.composer.dropAttachmentsTitle") }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t("project.composer.dropAttachmentsDescription") }}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
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
