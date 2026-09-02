<script setup lang="ts">
import { computed } from "vue";
import MarkdownContent from "@/components/markdown/MarkdownContent.vue";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import type { PineContentBlock, PineToolCall } from "@/shared/sessions";
import type { PineTranscriptMessage } from "@/stores/session";
import ProjectErrorMarker from "./ProjectErrorMarker.vue";
import ProjectThinkingMarker from "./ProjectThinkingMarker.vue";
import ProjectToolCallGroup from "./ProjectToolCallGroup.vue";
import ProjectToolCallMarker from "./ProjectToolCallMarker.vue";

const props = defineProps<{
  message: PineTranscriptMessage;
  /** Keys of the tool runs currently held open by the transcript-level
   * expansion policy; absent for static history reads. */
  expandedToolRuns?: ReadonlySet<string>;
  /** Tool calls held by the auto-reviewer (agent-decides mode). */
  reviewingToolCallIds?: ReadonlySet<string>;
  /** Tool calls waiting for the user's decision (ask mode). */
  awaitingApprovalToolCallIds?: ReadonlySet<string>;
}>();

const isUser = computed(() => props.message.role === "user");

/** Stable key shared with useToolActivityExpansion's transcript-level scan. */
function runKey(toolCalls: PineToolCall[]): string {
  return `${props.message.id}:${toolCalls[0]?.id ?? ""}`;
}

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

/**
 * Collapse ordering for a message's blocks: consecutive `toolCall` blocks
 * merge into a single tool run whose expansion is driven by the transcript
 * level (the last two runs of an active response stay open). Single
 * thinking/text/tool-call blocks pass through unchanged.
 */
type RenderItem =
  | { kind: "block"; block: PineContentBlock }
  | { kind: "toolCall"; toolCall: PineToolCall }
  | { kind: "toolRun"; toolCalls: PineToolCall[] };

const renderItems = computed<RenderItem[]>(() => {
  const blocks = props.message.blocks;
  const items: RenderItem[] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    if (block.type === "toolCall") {
      const start = index;
      while (index < blocks.length && blocks[index].type === "toolCall") {
        index++;
      }
      const toolCalls = blocks
        .slice(start, index)
        .map((item): PineToolCall | undefined =>
          item.type === "toolCall" ? item.toolCall : undefined,
        )
        .filter((item): item is PineToolCall => item !== undefined);
      // A single tool call renders in full instead of being folded away.
      if (toolCalls.length === 1) {
        items.push({ kind: "toolCall", toolCall: toolCalls[0] });
      } else {
        items.push({ kind: "toolRun", toolCalls });
      }
    } else {
      items.push({ kind: "block", block });
      index++;
    }
  }
  return items;
});
</script>
<template>
  <Message :align="isUser ? 'end' : 'start'">
    <MessageContent>
      <!-- Non-user messages render blocks in their original order so a tool
           call that happens after body text appears after that text. -->
      <template v-if="!isUser">
        <template v-for="(item, index) in renderItems" :key="index">
          <ProjectThinkingMarker
            v-if="item.kind === 'block' && item.block.type === 'thinking'"
            :message="message"
          />
          <ProjectErrorMarker
            v-else-if="item.kind === 'block' && item.block.type === 'error'"
            :error="item.block.error"
          />
          <ProjectToolCallMarker
            v-else-if="item.kind === 'toolCall'"
            :tool-call="item.toolCall"
            :reviewing="reviewingToolCallIds?.has(item.toolCall.id) ?? false"
            :awaiting-approval="
              awaitingApprovalToolCallIds?.has(item.toolCall.id) ?? false
            "
          />
          <ProjectToolCallGroup
            v-else-if="item.kind === 'toolRun'"
            :message="message"
            :tool-calls="item.toolCalls"
            :expanded="expandedToolRuns?.has(runKey(item.toolCalls))"
            :reviewing-tool-call-ids="reviewingToolCallIds"
            :awaiting-approval-tool-call-ids="awaitingApprovalToolCallIds"
          />
          <Bubble
            v-else-if="item.kind === 'block' && item.block.type === 'text'"
            :variant="'ghost'"
          >
            <BubbleContent
              v-if="message.status === 'streaming'"
              class="whitespace-pre-wrap"
            >
              {{ item.block.text }}
              <span
                class="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-current align-[-0.12em]"
                aria-hidden="true"
              />
            </BubbleContent>
            <BubbleContent v-else>
              <MarkdownContent :source="item.block.text" />
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
