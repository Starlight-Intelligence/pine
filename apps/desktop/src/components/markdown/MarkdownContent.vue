<script lang="ts">
// Register the shadcn-style code block once at module load (not per-instance,
// which would re-register on every mount).
import { setCustomComponents } from "markstream-vue";
import CodeBlock from "./CodeBlock.vue";

setCustomComponents("pine-chat", { code_block: CodeBlock });
</script>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import MarkdownRender from "markstream-vue";
import "markstream-vue/index.css";
import { useAppearanceStore } from "@/stores/appearance";

defineProps<{
  /** Accumulated markdown source. Grows while a message streams. */
  source: string;
  /** True once the stream has completed (message finished). */
  final?: boolean;
}>();

// markstream themes its code block via the `is-dark` prop (its inline style vars
// do not track a `.dark` ancestor), so drive it from the app's color scheme.
const { colorScheme } = storeToRefs(useAppearanceStore());
const isDark = computed(() => colorScheme.value === "dark");
</script>

<template>
  <div class="markdown-content" data-slot="markdown-content">
    <!--
      markstream-vue streams Markdown into the DOM as `content` grows (no per-token
      full re-render, no trailing-character lag). It styles every element through
      its own `--ms-*` themeable CSS variables set on the `.markstream-vue`
      container, so the primary styling knob below is overriding those variables,
      not per-tag `:deep()` rules (which fought markstream's var-based sizing).
      `html-policy="escape"` mirrors markdown-it's previous "raw HTML disabled"
      posture; the built-in `LinkNode` already emits `target="_blank"` +
      `rel="noopener noreferrer"`.
    -->
    <MarkdownRender
      mode="chat"
      :content="source"
      :final="final"
      html-policy="escape"
      custom-id="pine-chat"
      :smooth-streaming="false"
      :is-dark="isDark"
    />
  </div>
</template>

<style scoped>
@reference "../../index.css";

.markdown-content {
  overflow-wrap: anywhere;
}

/* markstream sets the base/heading font sizes through its own CSS variables on
   the `.markstream-vue` container (base `font-size: var(--ms-text-body)` =
   1rem, headings `var(--ms-text-h1..h6)`). Without overriding these, the body
   is pinned to markstream's 1rem (16px) even though the chat message base is
   `text-sm` (14px) — which is what made the prose look oversized. Restore the
   pre-refactor (markdown-it era) sizes here. */
.markdown-content :deep(.markstream-vue) {
  --ms-text-body: 0.875rem; /* text-sm — matches the chat message base */
  --ms-leading-body: 1.75;
  --ms-text-h1: 1.5rem; /* text-2xl */
  --ms-text-h2: 1.25rem; /* text-xl */
  --ms-text-h3: 1.125rem; /* text-lg */
  --ms-text-h4: 1rem; /* text-base */
  --ms-text-h5: 0.875rem; /* text-sm */
  --ms-text-h6: 0.875rem;
  --ms-weight-h1: 600; /* font-semibold */
  --ms-weight-h2: 600;
  --ms-weight-h3: 600;
  --ms-weight-h4: 600;
}

/* App-specific affordances that differ from markstream's defaults (it uses its
   own accent color, no underline, and per-element flow spacing for gaps). */
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  @apply tracking-tight;
}

.markdown-content :deep(h2) {
  @apply border-b pb-2;
}

.markdown-content :deep(a) {
  @apply font-medium underline underline-offset-4;
}

.markdown-content :deep(code.inline-code) {
  @apply rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-normal;
}

.markdown-content :deep(pre code) {
  @apply bg-transparent p-0 font-normal;
}

/* markstream's flow spacing gives each block a top margin; neutralize the very
   first one so the message doesn't start with a gap. */
.markdown-content :deep(.node-slot:first-child .node-content > :first-child) {
  margin-top: 0;
}

/* MessageContent owns the gap to the next tool or text block. Keep paragraph
   spacing inside Markdown, but do not add it again at the message boundary. */
.markdown-content
  > :deep(
    .markdown-renderer > .node-slot:last-child > .node-content > :last-child
  ) {
  margin-bottom: 0;
}
</style>
