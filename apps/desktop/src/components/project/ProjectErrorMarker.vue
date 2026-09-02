<script setup lang="ts">
import { CircleXIcon } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import type { PineSessionError } from "@/shared/sessions";

defineProps<{
  error: PineSessionError;
}>();

const { t } = useI18n();
</script>

<template>
  <Marker>
    <MarkerIcon>
      <CircleXIcon class="text-destructive" />
    </MarkerIcon>
    <MarkerContent class="text-destructive">
      <span class="font-medium">{{ t("project.transcript.error") }}: </span>
      <span>{{ error.message }}</span>
    </MarkerContent>
  </Marker>
</template>
