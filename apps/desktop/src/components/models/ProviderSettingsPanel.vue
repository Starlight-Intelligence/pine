<script setup lang="ts">
import { KeyRoundIcon, PlusIcon, UnplugIcon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import type { PineProviderDescriptor } from "@/shared/models";
import { useModelsStore } from "@/stores/models";
import ProviderAuthDialog from "./ProviderAuthDialog.vue";
import ProviderPickerDialog from "./ProviderPickerDialog.vue";

const { t } = useI18n();
const modelsStore = useModelsStore();
const { configuredProviders, isLoading, selection } = storeToRefs(modelsStore);
const isPickerOpen = ref(false);
const isAuthOpen = ref(false);
const selectedProvider = ref<PineProviderDescriptor | null>(null);
const disconnectingProviderId = ref<string | null>(null);
const selectedProviderId = computed(() => selection.value?.providerId);

onMounted(() => {
  modelsStore.connectAuthEvents();
  void modelsStore.load();
});

function configure(provider: PineProviderDescriptor): void {
  selectedProvider.value = provider;
  isAuthOpen.value = true;
}

async function disconnect(providerId: string): Promise<void> {
  disconnectingProviderId.value = providerId;
  try {
    await modelsStore.logout(providerId);
  } finally {
    disconnectingProviderId.value = null;
  }
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col gap-4">
    <header class="flex items-center justify-between gap-4">
      <div>
        <h2 class="text-sm font-medium">{{ t("providers.title") }}</h2>
        <p class="text-sm text-muted-foreground">
          {{ t("providers.description") }}
        </p>
      </div>
      <Button type="button" size="sm" @click="isPickerOpen = true">
        <PlusIcon data-icon="inline-start" />
        {{ t("providers.add") }}
      </Button>
    </header>

    <div v-if="isLoading" class="flex flex-1 items-center justify-center">
      <Spinner />
    </div>

    <Empty v-else-if="configuredProviders.length === 0" class="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon"><KeyRoundIcon /></EmptyMedia>
        <EmptyTitle>{{ t("providers.emptyTitle") }}</EmptyTitle>
        <EmptyDescription>{{
          t("providers.emptyDescription")
        }}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" @click="isPickerOpen = true">
          <PlusIcon data-icon="inline-start" />
          {{ t("providers.add") }}
        </Button>
      </EmptyContent>
    </Empty>

    <ItemGroup v-else v-scroll-fade class="scroll-fade overflow-y-auto">
      <Item
        v-for="provider in configuredProviders"
        :key="provider.id"
        variant="outline"
      >
        <ItemMedia variant="icon"><KeyRoundIcon /></ItemMedia>
        <ItemContent>
          <ItemTitle>
            {{ provider.name }}
            <Badge
              v-if="provider.id === selectedProviderId"
              variant="secondary"
            >
              {{ t("providers.default") }}
            </Badge>
          </ItemTitle>
          <ItemDescription>
            {{ provider.authSource ?? provider.id }} ·
            {{ t("providers.modelCount", { count: provider.modelCount }) }}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            @click="configure(provider)"
          >
            {{ t("providers.reconfigure") }}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            :disabled="disconnectingProviderId === provider.id"
            :aria-label="t('providers.disconnect')"
            :title="t('providers.disconnect')"
            @click="disconnect(provider.id)"
          >
            <Spinner
              v-if="disconnectingProviderId === provider.id"
              data-icon="inline-start"
            />
            <UnplugIcon v-else />
          </Button>
        </ItemActions>
      </Item>
    </ItemGroup>

    <ProviderPickerDialog v-model:open="isPickerOpen" @select="configure" />
    <ProviderAuthDialog
      v-model:open="isAuthOpen"
      :provider="selectedProvider"
    />
  </section>
</template>
