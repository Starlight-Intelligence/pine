<script setup lang="ts">
import { nextTick, watch } from "vue";
import { CommandInput, useCommand } from "@/components/ui/command";

const props = defineProps<{
  placeholder: string;
  query: string;
  refreshToken: string;
}>();

const emit = defineEmits<{
  "update:query": [query: string];
}>();

const { filterState } = useCommand();

// Command filters synchronously, while Pine replaces its results asynchronously.
// Re-run the local visibility pass after the server-backed result set is rendered.
watch(
  () => props.refreshToken,
  async () => {
    await nextTick();

    if (!props.query) {
      filterState.search = "";
      return;
    }

    filterState.search = `${props.query}\u200B`;
    await nextTick();
    filterState.search = props.query;
  },
  { flush: "post" },
);

function updateQuery(value: string | number | undefined): void {
  emit("update:query", value === undefined ? "" : String(value));
}
</script>

<template>
  <CommandInput :placeholder="placeholder" @update:model-value="updateQuery" />
</template>
