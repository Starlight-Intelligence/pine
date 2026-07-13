<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useWorkspaceStore } from "@/stores/workspace";

const workspaceStore = useWorkspaceStore();
const { currentWorkspace } = storeToRefs(workspaceStore);
</script>

<template>
  <section
    class="flex min-h-full items-center justify-center bg-background px-6"
  >
    <p class="break-all text-center text-sm text-muted-foreground">
      {{ currentWorkspace?.rootPath }}
    </p>
  </section>
</template>
