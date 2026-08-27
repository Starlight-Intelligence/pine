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

/**
 * The message body text is the concatenation of every `text` block, so user
 * messages and markdown rendering keep working regardless of where thinking /
 * tool-call markers sit in the block order.
 */
const text = computed(() =>
  props.message.blocks
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n"),
);

const blocks = computed(() => props.message.blocks);
</script>

<template>
  <Message :align="isUser ? 'end' : 'start'">
    <MessageContent>
      <!-- Non-user messages render blocks in their original order so a tool
           call that happens after body text appears after that text. -->
      <template v-if="!isUser">
        <template v-for="(block, index) in blocks" :key="index">
          <ProjectThinkingMarker
            v-if="block.type === 'thinking'"
            :message="message"
          />
          <div v-else-if="block.type === 'toolCall'" class="mb-2">
            <ProjectToolCallMarker :tool-call="block.toolCall" />
          </div>
          <Bubble v-else-if="block.type === 'text'" :variant="'ghost'">
            <BubbleContent
              v-if="message.status === 'streaming'"
              class="whitespace-pre-wrap"
            >
              {{ block.text }}
              <span
                class="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-current align-[-0.12em]"
                aria-hidden="true"
              />
            </BubbleContent>
            <BubbleContent v-else>
              <MarkdownContent :source="block.text" />
            </BubbleContent>
          </Bubble>
        </template>
      </template>

      <!-- User messages are plain text in a secondary bubble. -->
      <Bubble v-else variant="secondary">
        <BubbleContent class="whitespace-pre-wrap">
          {{ text }}
        </BubbleContent>
      </Bubble>
    </MessageContent>
  </Message>
</template>
