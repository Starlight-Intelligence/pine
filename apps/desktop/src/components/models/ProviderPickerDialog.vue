<script setup lang="ts">
import { CheckCircle2Icon, KeyRoundIcon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { watch } from "vue";
import { useI18n } from "vue-i18n";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import type { PineProviderDescriptor } from "@/shared/models";
import { useModelsStore } from "@/stores/models";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  "update:open": [open: boolean];
  select: [provider: PineProviderDescriptor];
}>();
const { t } = useI18n();
const modelsStore = useModelsStore();
const { isLoading, providers } = storeToRefs(modelsStore);

watch(
  () => props.open,
  (open) => {
    if (open) void modelsStore.load();
  },
);

function selectProvider(provider: PineProviderDescriptor): void {
  emit("select", provider);
  emit("update:open", false);
}
</script>

<template>
  <CommandDialog
    :open="open"
    :title="t('providers.picker.title')"
    :description="t('providers.picker.description')"
    @update:open="emit('update:open', $event)"
  >
    <CommandInput :placeholder="t('providers.picker.searchPlaceholder')" />
    <CommandList class="min-h-80 max-h-[min(32rem,65vh)]">
      <CommandEmpty>
        <span v-if="isLoading" class="inline-flex items-center gap-2">
          <Spinner />
          {{ t("models.loading") }}
        </span>
        <template v-else>{{ t("providers.picker.empty") }}</template>
      </CommandEmpty>
      <CommandGroup :heading="t('providers.picker.all')">
        <CommandItem
          v-for="provider in providers"
          :key="provider.id"
          :value="`${provider.name} ${provider.id}`"
          :disabled="provider.authMethods.length === 0 && !provider.configured"
          @select="selectProvider(provider)"
        >
          <CheckCircle2Icon v-if="provider.configured" aria-hidden="true" />
          <KeyRoundIcon v-else aria-hidden="true" />
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="truncate">{{ provider.name }}</span>
            <span class="truncate text-xs font-normal text-muted-foreground">
              {{ provider.id }} ·
              {{ t("providers.modelCount", { count: provider.modelCount }) }}
            </span>
          </span>
          <Badge v-if="provider.configured" variant="secondary">
            {{ t("providers.connected") }}
          </Badge>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
