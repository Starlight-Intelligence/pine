<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "@/lib/markdown";

const props = defineProps<{
  source: string;
}>();

const rendered = computed(() => renderMarkdown(props.source));
</script>

<template>
  <!-- markdown-it keeps raw HTML disabled by default. -->
  <div
    data-slot="markdown-content"
    class="markdown-content"
    v-html="rendered"
  />
</template>

<style scoped>
@reference "../../index.css";

.markdown-content {
  overflow-wrap: anywhere;
}

.markdown-content :deep(:first-child) {
  margin-top: 0;
}

.markdown-content :deep(:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(h1) {
  @apply mt-8 scroll-m-20 text-2xl font-semibold tracking-tight text-balance;
}

.markdown-content :deep(h2) {
  @apply mt-8 scroll-m-20 border-b pb-2 text-xl font-semibold tracking-tight first:mt-0;
}

.markdown-content :deep(h3) {
  @apply mt-6 scroll-m-20 text-lg font-semibold tracking-tight;
}

.markdown-content :deep(h4) {
  @apply mt-6 scroll-m-20 text-base font-semibold tracking-tight;
}

.markdown-content :deep(p) {
  @apply leading-7;
}

.markdown-content :deep(p + p) {
  @apply mt-4;
}

.markdown-content :deep(blockquote) {
  @apply my-6 border-l-2 pl-6 italic;
}

.markdown-content :deep(ul) {
  @apply my-6 ml-6 list-disc;
}

.markdown-content :deep(ol) {
  @apply my-6 ml-6 list-decimal;
}

.markdown-content :deep(li) {
  @apply mt-2;
}

.markdown-content :deep(a) {
  @apply font-medium underline underline-offset-4;
}

.markdown-content :deep(code) {
  @apply rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold;
}

.markdown-content :deep(pre) {
  @apply my-6 overflow-x-auto rounded-lg bg-muted px-4 py-3;
}

.markdown-content :deep(pre code) {
  @apply bg-transparent p-0 font-normal;
}

.markdown-content :deep(table) {
  @apply my-6 block w-full overflow-x-auto border-collapse;
}

.markdown-content :deep(tr) {
  @apply border-b;
}

.markdown-content :deep(th) {
  @apply border px-4 py-2 text-left font-bold;
}

.markdown-content :deep(td) {
  @apply border px-4 py-2 text-left;
}

.markdown-content :deep(hr) {
  @apply my-6 border-border;
}
</style>
