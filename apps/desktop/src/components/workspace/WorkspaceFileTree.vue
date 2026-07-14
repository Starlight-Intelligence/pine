<script setup lang="ts">
import { ChevronRight, File, Folder, FolderOpen } from "@lucide/vue";
import { TreeItem, TreeRoot, TreeVirtualizer } from "reka-ui";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { handleError } from "@/app/errors/errorHandler";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkspaceEntry } from "@/shared/workspaceFiles";

interface WorkspaceTreeNode extends WorkspaceEntry {
  children?: WorkspaceTreeNode[];
  isPlaceholder?: boolean;
}

const { t } = useI18n();
const items = ref<WorkspaceTreeNode[]>([]);
const isLoadingRoot = ref(true);
const loadingDirectories = new Set<string>();

function loadingPlaceholder(relativePath: string): WorkspaceTreeNode {
  return {
    kind: "file",
    name: t("workspace.files.loading"),
    relativePath: `${relativePath}/.__pine_loading__`,
    isPlaceholder: true,
  };
}

function toTreeNode(entry: WorkspaceEntry): WorkspaceTreeNode {
  return {
    ...entry,
    ...(entry.kind === "directory"
      ? { children: [loadingPlaceholder(entry.relativePath)] }
      : {}),
  };
}

async function readDirectory(
  relativePath: string,
): Promise<WorkspaceTreeNode[]> {
  const result = await window.pine.listWorkspaceDirectory({ relativePath });
  return result.entries.map(toTreeNode);
}

async function loadRoot(): Promise<void> {
  isLoadingRoot.value = true;
  try {
    items.value = await readDirectory("");
  } catch (error) {
    handleError(error, {
      id: "workspace.files.root",
      title: t("errors.workspaceFiles.title"),
      description: t("errors.workspaceFiles.description"),
    });
  } finally {
    isLoadingRoot.value = false;
  }
}

async function loadChildren(node: WorkspaceTreeNode): Promise<void> {
  if (
    node.kind !== "directory" ||
    !node.children?.some((child) => child.isPlaceholder) ||
    loadingDirectories.has(node.relativePath)
  ) {
    return;
  }

  loadingDirectories.add(node.relativePath);
  try {
    const children = await readDirectory(node.relativePath);
    node.children = children.length > 0 ? children : undefined;
  } catch (error) {
    handleError(error, {
      id: `workspace.files.${node.relativePath}`,
      title: t("errors.workspaceFiles.title"),
      description: t("errors.workspaceFiles.description"),
    });
  } finally {
    loadingDirectories.delete(node.relativePath);
  }
}

function isWorkspaceTreeNode(node: unknown): node is WorkspaceTreeNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "kind" in node &&
    (node.kind === "directory" || node.kind === "file") &&
    "name" in node &&
    typeof node.name === "string" &&
    "relativePath" in node &&
    typeof node.relativePath === "string"
  );
}

function loadTreeNode(node: unknown): void {
  if (isWorkspaceTreeNode(node)) void loadChildren(node);
}

onMounted(() => {
  void loadRoot();
});
</script>

<template>
  <div v-if="isLoadingRoot" class="flex flex-col gap-2 p-3">
    <Skeleton v-for="index in 6" :key="index" class="h-7 w-full" />
  </div>

  <Empty v-else-if="items.length === 0" class="p-6">
    <EmptyHeader>
      <EmptyTitle>{{ t("workspace.files.emptyTitle") }}</EmptyTitle>
      <EmptyDescription>
        {{ t("workspace.files.emptyDescription") }}
      </EmptyDescription>
    </EmptyHeader>
  </Empty>

  <TreeRoot
    v-else
    v-scroll-fade
    :items="items"
    :get-key="(item) => item.relativePath"
    :get-children="(item) => item.children"
    class="scroll-fade h-full overflow-y-auto p-2 outline-none"
  >
    <TreeVirtualizer
      v-slot="{ item }"
      :estimate-size="28"
      :overscan="12"
      :text-content="(node) => node.name"
    >
      <TreeItem
        v-bind="item.bind"
        v-slot="{ isExpanded }"
        class="flex h-7 w-full items-center gap-1 rounded-lg px-2 text-sm outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[selected]:bg-sidebar-accent"
        :disabled="item.value.isPlaceholder"
        :style="{ paddingInlineStart: `${(item.level - 1) * 12 + 8}px` }"
        @toggle="loadTreeNode(item.value)"
      >
        <template v-if="item.value.isPlaceholder">
          <Skeleton class="h-4 w-24" />
        </template>
        <template v-else>
          <ChevronRight
            v-if="item.value.kind === 'directory'"
            aria-hidden="true"
            class="size-4 shrink-0 transition-transform"
            :class="{ 'rotate-90': isExpanded }"
          />
          <span v-else class="size-4 shrink-0" aria-hidden="true" />
          <FolderOpen
            v-if="item.value.kind === 'directory' && isExpanded"
            aria-hidden="true"
            class="size-4 shrink-0"
          />
          <Folder
            v-else-if="item.value.kind === 'directory'"
            aria-hidden="true"
            class="size-4 shrink-0"
          />
          <File v-else aria-hidden="true" class="size-4 shrink-0" />
          <span class="truncate">{{ item.value.name }}</span>
        </template>
      </TreeItem>
    </TreeVirtualizer>
  </TreeRoot>
</template>
