<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue";
import { computed, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import type { PineToolCall } from "@/shared/sessions";
import type { PineTranscriptMessage } from "@/stores/session";
import ProjectToolCallMarker from "./ProjectToolCallMarker.vue";
import {
  countToolKinds,
  isRunningTool,
  toolKind,
  TOOL_KIND_ICON,
  TOOL_KIND_ORDER,
} from "./toolKinds";

const props = defineProps<{
  message: PineTranscriptMessage;
  toolCalls: PineToolCall[];
  followedByContent: boolean;
}>();
const { locale, t } = useI18n();
const contentId = useId();
const isExpanded = ref(false);

const anyRunning = computed(() =>
  props.toolCalls.some((toolCall) => isRunningTool(toolCall)),
);
const allDone = computed(() => !anyRunning.value);

/**
 * Summarize a tool run by grouping its calls by kind, e.g. "Read 3 files,
 * edited 2 files, ran 5 commands". Kinds are emitted in a fixed order and
 * joined with a separator, and each uses the active or complete tense
 * depending on whether the run is still in flight.
 */
const summaryLabel = computed(() => {
  const counts = countToolKinds(props.toolCalls);
  const parts = TOOL_KIND_ORDER.flatMap((kind): string[] => {
    const count = counts.get(kind);
    if (!count) return [];
    const tense = allDone.value ? "complete" : "active";
    return [t(`project.transcript.toolSteps.${kind}.${tense}`, { count })];
  });
  const separator = locale.value.startsWith("zh") ? "，" : ", ";
  return parts.join(separator);
});

const iconByToolCall = computed(() =>
  props.toolCalls.map((toolCall) => toolKind(toolCall.name)),
);

const isStreaming = computed(() => props.message.status === "streaming");

/**
 * Auto-expand a tool run only while it is the trailing activity of a live
 * (still streaming) message, so the running calls stay visible. Anything
 * else — a later thinking/text block, or a completed message loaded from
 * history — stays collapsed, mirroring the thinking marker's auto-collapse.
 */
watch(
  [() => props.message.id, isStreaming, () => props.followedByContent],
  ([, streaming, followed]) => {
    isExpanded.value = streaming && !followed;
  },
  { immediate: true },
);

function toggleExpanded(): void {
  isExpanded.value = !isExpanded.value;
}
</script>

<template>
  <div class="group/tool-steps">
    <Marker
      as="button"
      type="button"
      class="w-fit cursor-pointer rounded-sm select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      :aria-controls="contentId"
      :aria-expanded="isExpanded"
      @click="toggleExpanded"
    >
      <span class="flex shrink-0 items-center gap-1" data-tool-icons>
        <component
          :is="TOOL_KIND_ICON[iconByToolCall[index]]"
          v-for="(_, index) in iconByToolCall"
          :key="index"
          class="size-4"
          :aria-hidden="true"
        />
      </span>

      <MarkerContent>{{ summaryLabel }}</MarkerContent>

      <MarkerIcon>
        <Spinner v-if="anyRunning && !isExpanded" />
        <ChevronRightIcon
          v-else
          class="transition-transform duration-300 ease-out motion-reduce:transition-none"
          :class="isExpanded && 'rotate-90'"
        />
      </MarkerIcon>
    </Marker>

    <div
      :id="contentId"
      data-tool-calls-content
      class="grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none"
      :class="
        isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      "
      :aria-hidden="!isExpanded"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="mt-2 flex flex-col gap-1.5 pl-6">
          <ProjectToolCallMarker
            v-for="toolCall in toolCalls"
            :key="toolCall.id"
            :tool-call="toolCall"
            nested
          />
        </div>
      </div>
    </div>
  </div>
</template>
