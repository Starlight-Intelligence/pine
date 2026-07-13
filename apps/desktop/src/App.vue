<script setup lang="ts">
import { ref, shallowRef, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { handleError } from '@/app/errors/errorHandler';
import { Toaster } from '@/components/ui/sonner';
import { useColorScheme } from '@/composables/useColorScheme';
import type { PineWorkspaceSummary } from '@/shared/projects';
import WelcomeView from '@/views/WelcomeView.vue';
import WorkspaceView from '@/views/WorkspaceView.vue';

const { colorScheme, setThemePreference, themePreference } = useColorScheme();
const { t } = useI18n();
const currentWorkspace = shallowRef<PineWorkspaceSummary | null>(null);
const isOpeningWorkspace = ref(false);

watchEffect(() => {
  document.title = currentWorkspace.value
    ? `Pine @ ${currentWorkspace.value.name}`
    : 'Pine';
});

async function openWorkspace(): Promise<void> {
  if (isOpeningWorkspace.value) return;

  isOpeningWorkspace.value = true;

  try {
    const result = await window.pine.openWorkspace();
    if (result.workspace) currentWorkspace.value = result.workspace;
  } catch (error) {
    handleError(error, {
      id: 'workspace.open',
      title: t('errors.workspaceOpen.title'),
      description: t('errors.workspaceOpen.description'),
    });
  } finally {
    isOpeningWorkspace.value = false;
  }
}
</script>

<template>
  <main id="pine-root" class="h-full">
    <WelcomeView
      v-if="!currentWorkspace"
      :is-opening="isOpeningWorkspace"
      :theme-preference="themePreference"
      @open-folder="openWorkspace"
      @update:theme-preference="setThemePreference"
    />
    <WorkspaceView v-else :workspace="currentWorkspace" />
    <Toaster :theme="colorScheme" />
  </main>
</template>
