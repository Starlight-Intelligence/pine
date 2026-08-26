<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  useId,
  useTemplateRef,
  watch,
} from "vue";
import { useI18n } from "vue-i18n";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import type { PineTranscriptMessage } from "@/stores/session";

const props = defineProps<{
  message: PineTranscriptMessage;
}>();
const { locale, t } = useI18n();
const contentId = useId();
const thinkingContent = useTemplateRef<HTMLElement>("thinkingContent");
const isExpanded = ref(false);
const isFollowingThinking = ref(true);
const now = ref(Date.now());
let elapsedTimer: number | undefined;

const isStreaming = computed(
  () => props.message.thinkingStatus === "streaming",
);
const hasResponseAfterThinking = computed(
  () =>
    Boolean(props.message.text.trim()) ||
    Boolean(props.message.toolCalls?.length),
);

function formatDuration(durationMs?: number): string | undefined {
  if (durationMs === undefined) return undefined;
  if (durationMs < 1_000) {
    return t("project.transcript.thinkingDuration.lessThanSecond");
  }
  const totalSeconds = Math.max(1, Math.round(durationMs / 1_000));
  if (totalSeconds < 60) {
    return t("project.transcript.thinkingDuration.seconds", {
      value: new Intl.NumberFormat(locale.value, {
        maximumFractionDigits: 1,
      }).format(durationMs < 10_000 ? durationMs / 1_000 : totalSeconds),
    });
  }
  return t("project.transcript.thinkingDuration.minutes", {
    minutes: new Intl.NumberFormat(locale.value).format(
      Math.floor(totalSeconds / 60),
    ),
    seconds: new Intl.NumberFormat(locale.value).format(totalSeconds % 60),
  });
}

const elapsedDurationMs = computed(() =>
  Math.max(0, now.value - (props.message.thinkingStartedAt ?? now.value)),
);
const summaryLabel = computed(() => {
  const duration = formatDuration(
    isStreaming.value
      ? elapsedDurationMs.value
      : props.message.thinkingDurationMs,
  );
  if (isStreaming.value) {
    return t("project.transcript.thinkingActive", { duration });
  }
  return duration
    ? t("project.transcript.thinkingComplete", { duration })
    : t("project.transcript.thinkingCompleteWithoutDuration");
});

function stopElapsedTimer(): void {
  if (elapsedTimer === undefined) return;
  window.clearInterval(elapsedTimer);
  elapsedTimer = undefined;
}

function syncElapsedTimer(streaming: boolean): void {
  stopElapsedTimer();
  now.value = Date.now();
  if (!streaming) return;
  elapsedTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 250);
}

function scrollThinkingToBottom(): void {
  const content = thinkingContent.value;
  if (content) content.scrollTop = content.scrollHeight;
}

async function toggleExpanded(): Promise<void> {
  isExpanded.value = !isExpanded.value;
  if (!isExpanded.value) return;
  isFollowingThinking.value = true;
  await nextTick();
  scrollThinkingToBottom();
}

function handleThinkingScroll(event: Event): void {
  const content = event.currentTarget as HTMLElement;
  isFollowingThinking.value =
    content.scrollHeight - content.clientHeight - content.scrollTop <= 24;
}

watch(
  isStreaming,
  (streaming) => {
    syncElapsedTimer(streaming);
  },
  { immediate: true },
);
watch(
  [
    () => props.message.id,
    () => Boolean(props.message.thinking),
    hasResponseAfterThinking,
  ],
  ([messageId, hasThinking, hasResponse], previous) => {
    const messageChanged = messageId !== previous?.[0];
    const thinkingStarted = hasThinking && !previous?.[1];
    if (messageChanged) {
      isExpanded.value = false;
      isFollowingThinking.value = true;
    }
    if (hasResponse) {
      isExpanded.value = false;
      return;
    }
    if (isStreaming.value && (messageChanged || thinkingStarted)) {
      isExpanded.value = true;
      isFollowingThinking.value = true;
      void nextTick(scrollThinkingToBottom);
    }
  },
  { immediate: true },
);
watch(
  () => props.message.thinking,
  async () => {
    if (!isStreaming.value || !isExpanded.value || !isFollowingThinking.value) {
      return;
    }
    await nextTick();
    scrollThinkingToBottom();
  },
);
onBeforeUnmount(stopElapsedTimer);
</script>

<template>
  <div class="group/thinking">
    <Marker
      as="button"
      type="button"
      class="w-fit cursor-pointer rounded-sm select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      :aria-controls="contentId"
      :aria-expanded="isExpanded"
      @click="toggleExpanded"
    >
      <MarkerIcon>
        <ChevronRightIcon
          class="transition-transform duration-300 ease-out motion-reduce:transition-none"
          :class="isExpanded && 'rotate-90'"
        />
      </MarkerIcon>
      <MarkerContent>{{ summaryLabel }}</MarkerContent>
    </Marker>

    <div
      :id="contentId"
      class="grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none"
      :class="
        isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      "
      :aria-hidden="!isExpanded"
    >
      <div class="min-h-0 overflow-hidden">
        <div
          ref="thinkingContent"
          v-scroll-fade
          data-thinking-content
          class="scroll-fade mt-2 max-h-64 overflow-y-auto overscroll-contain pl-6 pr-3 text-sm text-muted-foreground whitespace-pre-wrap"
          @scroll.passive="handleThinkingScroll"
        >
          {{ message.thinking }}
        </div>
      </div>
    </div>
  </div>
</template>
