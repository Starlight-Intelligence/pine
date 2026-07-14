<script setup lang="ts">
import { Files, MessagesSquare, Settings2 } from "@lucide/vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WorkspaceFileTree from "./WorkspaceFileTree.vue";
import WorkspaceSessionList from "./WorkspaceSessionList.vue";

type SidebarTab = "files" | "sessions";

const { t } = useI18n();
const emit = defineEmits<{
  searchSessions: [];
}>();
const activeTab = ref<SidebarTab>("sessions");
</script>

<template>
  <Sidebar collapsible="offcanvas">
    <div
      aria-hidden="true"
      class="h-[var(--window-titlebar-height)] shrink-0"
    />
    <Tabs v-model="activeTab" class="flex min-h-0 flex-1 flex-col">
      <SidebarHeader>
        <TabsList class="w-full">
          <TabsTrigger value="files">
            <Files data-icon="inline-start" aria-hidden="true" />
            {{ t("workspace.tabs.files") }}
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <MessagesSquare data-icon="inline-start" aria-hidden="true" />
            {{ t("workspace.tabs.sessions") }}
          </TabsTrigger>
        </TabsList>
      </SidebarHeader>

      <SidebarContent class="overflow-hidden">
        <TabsContent value="files" class="mt-0 min-h-0 overflow-hidden">
          <WorkspaceFileTree />
        </TabsContent>
        <TabsContent value="sessions" class="mt-0 min-h-0 overflow-hidden">
          <WorkspaceSessionList @search="emit('searchSessions')" />
        </TabsContent>
      </SidebarContent>
    </Tabs>

    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton>
            <Settings2 aria-hidden="true" />
            <span>{{ t("workspace.preferences") }}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>

    <SidebarRail />
  </Sidebar>
</template>
