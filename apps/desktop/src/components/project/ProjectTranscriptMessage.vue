<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  Message,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
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
      <MessageHeader>
        {{
          isUser
            ? t("project.transcript.userLabel")
            : t("project.transcript.assistantLabel")
        }}
      </MessageHeader>
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
