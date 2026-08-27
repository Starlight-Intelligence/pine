<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue";
import { computed, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import type { PineToolCall } from "@/shared/sessions";
import type { PineTranscriptMessage } from "@/stores/session";
import ProjectToolCallMarker from "./ProjectToolCallMarker.vue";

const props = defineProps<{
  message: PineTranscriptMessage;
  toolCalls: PineToolCall[];
  followedByContent: boolean;
}>();
const { t } = useI18n();
const contentId = useId();
const isExpanded = ref(false);

const count = computed(() => props.toolCalls.length);
const anyRunning = computed(() =>
  props.toolCalls.some(
    (toolCall) =>
      toolCall.status === "pending" || toolCall.status === "running",
  ),
);
const allDone = computed(() => !anyRunning.value);
const summaryLabel = computed(() =>
  t(
    allDone.value
      ? "project.transcript.toolSteps.complete"
      : "project.transcript.toolSteps.active",
    { count: count.value },
  ),
);

/**
 * Expand a tool run while it is the trailing activity in its message, so the
 * running calls stay visible. Collapse it as soon as a later thinking/text
 * block appears, mirroring the thinking marker's auto-collapse.
 */
watch(
  () => props.message.id,
  () => {
    isExpanded.value = !props.followedByContent;
  },
  { immediate: true },
);
watch(
  () => props.followedByContent,
  (followed) => {
    if (followed) isExpanded.value = false;
  },
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
      <MarkerIcon>
        <Spinner v-if="anyRunning && !isExpanded" />
        <ChevronRightIcon
          v-else
          class="transition-transform duration-300 ease-out motion-reduce:transition-none"
          :class="isExpanded && 'rotate-90'"
        />
      </MarkerIcon>
      <MarkerContent>{{ summaryLabel }}</MarkerContent>
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
          />
        </div>
      </div>
    </div>
  </div>
</template>
