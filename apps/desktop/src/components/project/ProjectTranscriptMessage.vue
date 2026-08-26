<script setup lang="ts">
import { computed } from "vue";
import MarkdownContent from "@/components/markdown/MarkdownContent.vue";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import type { PineTranscriptMessage } from "@/stores/session";
import ProjectThinkingMarker from "./ProjectThinkingMarker.vue";
import ProjectToolCallMarker from "./ProjectToolCallMarker.vue";

const props = defineProps<{
  message: PineTranscriptMessage;
}>();

const isUser = computed(() => props.message.role === "user");
</script>

<template>
  <Message :align="isUser ? 'end' : 'start'">
    <MessageContent>
      <div
        v-if="!isUser && (message.thinking || message.toolCalls?.length)"
        class="mb-2 flex flex-col gap-2"
      >
        <ProjectThinkingMarker v-if="message.thinking" :message="message" />
        <ProjectToolCallMarker
          v-for="toolCall in message.toolCalls"
          :key="toolCall.id"
          :tool-call="toolCall"
        />
      </div>
      <Bubble
        v-if="isUser || message.text"
        :variant="isUser ? 'secondary' : 'ghost'"
      >
        <BubbleContent
          v-if="isUser || message.status === 'streaming'"
          class="whitespace-pre-wrap"
        >
          {{ message.text }}
          <span
            v-if="message.status === 'streaming'"
            class="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-current align-[-0.12em]"
            aria-hidden="true"
          />
        </BubbleContent>
        <BubbleContent v-else>
          <MarkdownContent :source="message.text" />
        </BubbleContent>
      </Bubble>
    </MessageContent>
  </Message>
</template>
