<script setup lang="ts">
import type { PineWorkspaceSummary } from '@/shared/projects';

interface Props {
  workspace: PineWorkspaceSummary;
}

defineProps<Props>();
</script>

<template>
  <section class="flex min-h-full items-center justify-center bg-background px-6">
    <p class="break-all text-center text-sm text-muted-foreground">
      {{ workspace.rootPath }}
    </p>
  </section>
</template>
