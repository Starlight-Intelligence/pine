<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    source: string;
    title: string;
    zoom?: number;
  }>(),
  { zoom: 100 },
);

const scale = computed(() => props.zoom / 100);
const frameStyle = computed(() => ({
  height: `${100 / scale.value}%`,
  transform: `scale(${scale.value})`,
  transformOrigin: "top left",
  width: `${100 / scale.value}%`,
}));
</script>

<template>
  <div class="h-full min-h-0 overflow-hidden bg-white">
    <iframe
      class="block border-0 bg-white"
      :srcdoc="source"
      :style="frameStyle"
      :title="title"
      sandbox=""
      referrerpolicy="no-referrer"
    />
  </div>
</template>
