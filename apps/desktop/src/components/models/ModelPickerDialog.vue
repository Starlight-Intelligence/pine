<script setup lang="ts">
import { CheckIcon, CpuIcon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import type { PineModelDescriptor } from "@/shared/models";
import { useModelsStore } from "@/stores/models";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [open: boolean] }>();

const { t } = useI18n();
const modelsStore = useModelsStore();
const { isLoading, models, providers, selection } = storeToRefs(modelsStore);
const modelGroups = computed(() =>
  providers.value
    .filter((provider) => provider.configured)
    .map((provider) => ({
      provider,
      models: models.value.filter((model) => model.providerId === provider.id),
    }))
    .filter((group) => group.models.length > 0),
);

watch(
  () => props.open,
  (open) => {
    if (open) void modelsStore.load();
  },
);

function isSelected(model: PineModelDescriptor): boolean {
  return (
    selection.value?.providerId === model.providerId &&
    selection.value.modelId === model.id
  );
}

async function selectModel(model: PineModelDescriptor): Promise<void> {
  await modelsStore.select(model);
  emit("update:open", false);
}
</script>

<template>
  <CommandDialog
    :open="open"
    :title="t('models.picker.title')"
    :description="t('models.picker.description')"
    @update:open="emit('update:open', $event)"
  >
    <CommandInput :placeholder="t('models.picker.searchPlaceholder')" />
    <CommandList class="min-h-80 max-h-[min(32rem,65vh)]">
      <CommandEmpty>
        <span v-if="isLoading" class="inline-flex items-center gap-2">
          <Spinner />
          {{ t("models.loading") }}
        </span>
        <template v-else>{{ t("models.picker.empty") }}</template>
      </CommandEmpty>

      <CommandGroup
        v-for="group in modelGroups"
        :key="group.provider.id"
        :heading="group.provider.name"
      >
        <CommandItem
          v-for="model in group.models"
          :key="`${model.providerId}:${model.id}`"
          :value="`${model.providerName} ${model.name} ${model.id}`"
          @select="selectModel(model)"
        >
          <CheckIcon v-if="isSelected(model)" aria-hidden="true" />
          <CpuIcon v-else aria-hidden="true" />
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="truncate">{{ model.name }}</span>
            <span class="truncate text-xs font-normal text-muted-foreground">
              {{ model.id }}
            </span>
          </span>
          <CommandShortcut v-if="model.reasoning" class="tracking-normal">
            {{ t("models.reasoning") }}
          </CommandShortcut>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
