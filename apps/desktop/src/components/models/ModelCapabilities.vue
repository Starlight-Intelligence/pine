<script setup lang="ts">
import { EyeIcon, StarIcon } from "@lucide/vue";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatTokenCount } from "@/lib/format-token-count";
import type { PineModelDescriptor } from "@/shared/models";

const props = defineProps<{
  model: PineModelDescriptor;
  recommended: boolean;
}>();

const { t } = useI18n();
const contextTier = computed(() =>
  props.model.contextWindow >= 400_000
    ? 3
    : props.model.contextWindow >= 132_000
      ? 2
      : 1,
);
const indicators = computed(() => [
  ...(props.recommended
    ? [
        {
          id: "recommended",
          icon: StarIcon,
          label: t("models.picker.recommended"),
        },
      ]
    : []),
  ...(props.model.input.includes("image")
    ? [{ id: "vision", icon: EyeIcon, label: t("models.picker.vision") }]
    : []),
  {
    id: "context",
    label: t("models.picker.contextWindow", {
      tokens: formatTokenCount(props.model.contextWindow),
    }),
  },
]);
</script>

<template>
  <span class="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
    <TooltipProvider :delay-duration="300">
      <Tooltip v-for="indicator in indicators" :key="indicator.id">
        <TooltipTrigger as-child>
          <span
            :data-model-capability="indicator.id"
            role="img"
            :aria-label="indicator.label"
            tabindex="0"
            class="inline-flex size-5 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <svg
              v-if="indicator.id === 'context'"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="4" y="3" width="16" height="18" rx="3" />
              <path
                v-for="tier in 3"
                :key="tier"
                :d="`M8 ${20 - tier * 4}h8`"
                :opacity="tier <= contextTier ? 1 : 0.2"
              />
            </svg>
            <component v-else :is="indicator.icon" aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" :side-offset="4">
          {{ indicator.label }}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </span>
</template>
