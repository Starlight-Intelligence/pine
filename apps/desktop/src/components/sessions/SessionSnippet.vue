<script setup lang="ts">
import { computed } from "vue";

interface SnippetPart {
  highlighted: boolean;
  text: string;
}

const props = defineProps<{
  query: string;
  text: string;
}>();

const MARKER_PATTERN = /(\u0001[^\u0002]*\u0002)/g;

const parts = computed<SnippetPart[]>(() => {
  if (props.text.includes("\u0001")) {
    return props.text
      .split(MARKER_PATTERN)
      .filter(Boolean)
      .map((part) => ({
        highlighted: part.startsWith("\u0001"),
        text: part.replaceAll("\u0001", "").replaceAll("\u0002", ""),
      }));
  }

  const query = props.query.trim();
  if (!query) return [{ highlighted: false, text: props.text }];

  const start = props.text
    .toLocaleLowerCase()
    .indexOf(query.toLocaleLowerCase());
  if (start < 0) return [{ highlighted: false, text: props.text }];

  return [
    { highlighted: false, text: props.text.slice(0, start) },
    {
      highlighted: true,
      text: props.text.slice(start, start + query.length),
    },
    {
      highlighted: false,
      text: props.text.slice(start + query.length),
    },
  ].filter((part) => part.text);
});
</script>

<template>
  <span>
    <template v-for="(part, index) in parts" :key="index">
      <mark
        v-if="part.highlighted"
        class="bg-transparent font-medium text-foreground"
      >
        {{ part.text }}
      </mark>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>
