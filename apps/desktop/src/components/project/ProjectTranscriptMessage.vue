<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import type { PineTranscriptMessage } from "@/stores/session";

const props = defineProps<{
  message: PineTranscriptMessage;
}>();

const { t } = useI18n();
const isUser = computed(() => props.message.role === "user");
</script>

<template>
  <Message :align="isUser ? 'end' : 'start'">
    <MessageContent>
      <details
        v-if="!isUser && message.thinking"
        class="group mb-2 text-sm text-muted-foreground"
        :open="message.status === 'streaming'"
      >
        <summary
          class="w-fit cursor-pointer select-none font-medium hover:text-foreground"
        >
          {{ t("project.transcript.thinking") }}
        </summary>
        <div class="mt-2 border-l border-border pl-3 whitespace-pre-wrap">
          {{ message.thinking }}
        </div>
      </details>
      <Bubble :variant="isUser ? 'secondary' : 'ghost'">
        <BubbleContent class="whitespace-pre-wrap">
          {{ message.text }}
          <span
            v-if="message.status === 'streaming'"
            class="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-current align-[-0.12em]"
            aria-hidden="true"
          />
        </BubbleContent>
      </Bubble>
    </MessageContent>
  </Message>
</template>
