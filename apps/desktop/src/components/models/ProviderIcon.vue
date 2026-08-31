<script setup lang="ts">
import { CpuIcon } from "@lucide/vue";
import { computed } from "vue";
import { resolveProviderIcon } from "@/lib/provider-icons";
import { cn } from "@/lib/utils";

const props = defineProps<{
  providerId: string;
  providerName?: string;
}>();

const icon = computed(() =>
  resolveProviderIcon(props.providerId, props.providerName),
);
</script>

<template>
  <img
    v-if="icon"
    aria-hidden="true"
    :src="icon.src"
    alt=""
    :class="cn('size-4 shrink-0', { 'dark:invert': icon.monochrome })"
  />
  <CpuIcon v-else aria-hidden="true" />
</template>
