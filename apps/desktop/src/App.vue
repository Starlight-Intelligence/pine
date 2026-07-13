<script setup lang="ts">
import { storeToRefs } from "pinia";
import { watchEffect } from "vue";
import { RouterView } from "vue-router";
import { formatWindowTitle } from "@/app/windowTitle";
import { Toaster } from "@/components/ui/sonner";
import { useAppearanceStore } from "@/stores/appearance";
import { useWorkspaceStore } from "@/stores/workspace";

const appearanceStore = useAppearanceStore();
const workspaceStore = useWorkspaceStore();
const { colorScheme } = storeToRefs(appearanceStore);
const { currentWorkspace } = storeToRefs(workspaceStore);

watchEffect(() => {
  document.title = formatWindowTitle({
    workspaceName: currentWorkspace.value?.name,
  });
});
</script>

<template>
  <main id="pine-root" class="h-full">
    <RouterView />
    <Toaster :theme="colorScheme" />
  </main>
</template>
