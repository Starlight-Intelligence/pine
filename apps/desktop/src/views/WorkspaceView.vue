<script setup lang="ts">
import { onKeyStroke } from "@vueuse/core";
import { ref } from "vue";
import SessionSearchOverlay from "@/components/sessions/SessionSearchOverlay.vue";
import WorkspaceContentTabs from "@/components/workspace/WorkspaceContentTabs.vue";
import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar.vue";
import WindowTitleBar from "@/components/window/WindowTitleBar.vue";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const isSessionSearchOpen = ref(false);

onKeyStroke("k", (event) => {
  if (!(event.metaKey || event.ctrlKey)) return;
  event.preventDefault();
  isSessionSearchOpen.value = true;
});
</script>

<template>
  <SidebarProvider
    class="relative h-full min-h-0 [&_[data-slot=sidebar-container]]:duration-500 [&_[data-slot=sidebar-container]]:ease-out-expo [&_[data-slot=sidebar-gap]]:duration-500 [&_[data-slot=sidebar-gap]]:ease-out-expo"
    :default-open="true"
  >
    <WindowTitleBar>
      <template #leading>
        <SidebarTrigger />
      </template>
    </WindowTitleBar>

    <WorkspaceSidebar @search-sessions="isSessionSearchOpen = true" />

    <SidebarInset class="min-h-0 overflow-hidden">
      <WorkspaceContentTabs />
    </SidebarInset>

    <SessionSearchOverlay v-model:open="isSessionSearchOpen" />
  </SidebarProvider>
</template>
