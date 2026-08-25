<script setup lang="ts">
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CheckIcon,
  CpuIcon,
  KeyRoundIcon,
  PlusIcon,
  StarIcon,
} from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type {
  PineModelDescriptor,
  PineProviderDescriptor,
} from "@/shared/models";
import { useModelsStore } from "@/stores/models";
import ProviderAuthDialog from "./ProviderAuthDialog.vue";

type PickerView = "models" | "providers";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [open: boolean] }>();

const { t } = useI18n();
const modelsStore = useModelsStore();
const { isLoading, models, providers, selection } = storeToRefs(modelsStore);
const view = ref<PickerView>("models");
const isAuthOpen = ref(false);
const selectedProvider = ref<PineProviderDescriptor | null>(null);
const modelGroups = computed(() =>
  providers.value
    .filter((provider) => provider.configured)
    .map((provider) => ({
      provider,
      models: models.value.filter((model) => model.providerId === provider.id),
    }))
    .filter((group) => group.models.length > 0),
);
const title = computed(() =>
  view.value === "models"
    ? t("models.picker.title")
    : t("providers.picker.title"),
);
const description = computed(() =>
  view.value === "models"
    ? t("models.picker.description")
    : t("providers.picker.description"),
);
const searchPlaceholder = computed(() =>
  view.value === "models"
    ? t("models.picker.searchPlaceholder")
    : t("providers.picker.searchPlaceholder"),
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    view.value = "models";
    void modelsStore.load();
  },
);

function isSelected(model: PineModelDescriptor): boolean {
  return (
    selection.value?.providerId === model.providerId &&
    selection.value.modelId === model.id
  );
}

function canConfigure(provider: PineProviderDescriptor): boolean {
  return provider.authMethods.length > 0;
}

async function openAuth(provider: PineProviderDescriptor): Promise<void> {
  selectedProvider.value = provider;
  emit("update:open", false);
  await nextTick();
  isAuthOpen.value = true;
}

async function selectModel(model: PineModelDescriptor): Promise<void> {
  await modelsStore.select(model);
  emit("update:open", false);
}

function selectProvider(provider: PineProviderDescriptor): void {
  if (!canConfigure(provider)) return;
  void openAuth(provider);
}

async function handleConnected(): Promise<void> {
  isAuthOpen.value = false;
  selectedProvider.value = null;
  await nextTick();
  emit("update:open", true);
}
</script>

<template>
  <CommandDialog
    :open="open"
    :title="title"
    :description="description"
    @update:open="emit('update:open', $event)"
  >
    <CommandInput :placeholder="searchPlaceholder" />
    <CommandList
      class="min-h-72 [&>[role=presentation]]:flex [&>[role=presentation]]:min-h-72 [&>[role=presentation]]:flex-col"
    >
      <CommandEmpty>
        <span v-if="isLoading" class="inline-flex items-center gap-2">
          <Spinner />
          {{ t("models.loading") }}
        </span>
        <template v-else>
          {{
            view === "models"
              ? t("models.picker.empty")
              : t("providers.picker.empty")
          }}
        </template>
      </CommandEmpty>

      <template v-if="view === 'models'">
        <CommandGroup>
          <CommandItem
            value="add configure provider service model"
            @select="view = 'providers'"
          >
            <PlusIcon aria-hidden="true" />
            {{ t("models.picker.addServiceOrModel") }}
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />

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
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              :aria-label="
                modelsStore.isFavorite(model)
                  ? t('models.picker.removeFavorite', { model: model.name })
                  : t('models.picker.addFavorite', { model: model.name })
              "
              :aria-pressed="modelsStore.isFavorite(model)"
              @pointerdown.stop
              @click.stop="modelsStore.toggleFavorite(model)"
            >
              <StarIcon
                :class="cn({ 'fill-current': modelsStore.isFavorite(model) })"
              />
            </Button>
            <CommandShortcut v-if="model.reasoning" class="tracking-normal">
              {{ t("models.reasoning") }}
            </CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </template>

      <template v-else>
        <CommandGroup>
          <CommandItem value="back models" @select="view = 'models'">
            <ArrowLeftIcon aria-hidden="true" />
            {{ t("models.picker.backToModels") }}
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />

        <CommandGroup :heading="t('providers.picker.all')">
          <CommandItem
            v-for="provider in providers"
            :key="provider.id"
            :value="`${provider.name} ${provider.id}`"
            :disabled="!canConfigure(provider)"
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
      </template>
    </CommandList>
  </CommandDialog>

  <ProviderAuthDialog
    v-model:open="isAuthOpen"
    :provider="selectedProvider"
    @connected="handleConnected"
  />
</template>
