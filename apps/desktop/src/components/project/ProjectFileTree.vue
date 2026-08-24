<script setup lang="ts">
import { ChevronRight, File, Folder, FolderOpen } from "@lucide/vue";
import { TreeItem, TreeRoot, TreeVirtualizer } from "reka-ui";
import { storeToRefs } from "pinia";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { handleError } from "@/app/errors/errorHandler";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectEntry } from "@/shared/projectFiles";
import { useProjectStore } from "@/stores/project";

interface ProjectTreeNode extends ProjectEntry {
  children?: ProjectTreeNode[];
  folderId: string;
  isPlaceholder?: boolean;
  isRoot?: boolean;
  isUnavailable?: boolean;
}

const { t } = useI18n();
const projectStore = useProjectStore();
const { activeProject } = storeToRefs(projectStore);
const items = ref<ProjectTreeNode[]>([]);
const loadingDirectories = new Set<string>();

function nodeKey(node: ProjectTreeNode): string {
  return `${node.folderId}:${node.relativePath}`;
}

function loadingPlaceholder(
  folderId: string,
  relativePath: string,
): ProjectTreeNode {
  return {
    folderId,
    kind: "file",
    name: t("project.files.loading"),
    relativePath: `${relativePath}/.__pine_loading__`,
    isPlaceholder: true,
  };
}

function toTreeNode(folderId: string, entry: ProjectEntry): ProjectTreeNode {
  return {
    ...entry,
    folderId,
    ...(entry.kind === "directory"
      ? { children: [loadingPlaceholder(folderId, entry.relativePath)] }
      : {}),
  };
}

function resetRoots(): void {
  items.value =
    activeProject.value?.folders.map((folder) => ({
      children: folder.isAvailable
        ? [loadingPlaceholder(folder.id, "")]
        : undefined,
      folderId: folder.id,
      isRoot: true,
      isUnavailable: !folder.isAvailable,
      kind: "directory",
      name: folder.name,
      relativePath: "",
    })) ?? [];
}

async function readDirectory(
  folderId: string,
  relativePath: string,
): Promise<ProjectTreeNode[]> {
  const result = await window.pine.listProjectDirectory({
    folderId,
    relativePath,
  });
  return result.entries.map((entry) => toTreeNode(folderId, entry));
}

async function loadChildren(node: ProjectTreeNode): Promise<void> {
  const key = nodeKey(node);
  if (
    node.kind !== "directory" ||
    node.isUnavailable ||
    !node.children?.some((child) => child.isPlaceholder) ||
    loadingDirectories.has(key)
  ) {
    return;
  }

  loadingDirectories.add(key);
  try {
    const children = await readDirectory(node.folderId, node.relativePath);
    node.children = children.length > 0 ? children : undefined;
  } catch (error) {
    handleError(error, {
      id: `project.files.${key}`,
      title: t("errors.projectFiles.title"),
      description: t("errors.projectFiles.description"),
    });
  } finally {
    loadingDirectories.delete(key);
  }
}

function isProjectTreeNode(node: unknown): node is ProjectTreeNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "folderId" in node &&
    typeof node.folderId === "string" &&
    "relativePath" in node &&
    typeof node.relativePath === "string"
  );
}

function loadTreeNode(node: unknown): void {
  if (isProjectTreeNode(node)) void loadChildren(node);
}

watch(activeProject, resetRoots, { immediate: true });
</script>

<template>
  <Empty v-if="items.length === 0" class="p-6">
    <EmptyHeader>
      <EmptyTitle>{{ t("project.files.emptyTitle") }}</EmptyTitle>
      <EmptyDescription>
        {{ t("project.files.emptyDescription") }}
      </EmptyDescription>
    </EmptyHeader>
  </Empty>

  <TreeRoot
    v-else
    v-scroll-fade
    :items="items"
    :get-key="nodeKey"
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
        :disabled="item.value.isPlaceholder || item.value.isUnavailable"
        :style="{ paddingInlineStart: `${(item.level - 1) * 12 + 8}px` }"
        @toggle="loadTreeNode(item.value)"
      >
        <template v-if="item.value.isPlaceholder">
          <Skeleton class="h-4 w-24" />
        </template>
        <template v-else>
          <ChevronRight
            v-if="item.value.kind === 'directory' && !item.value.isUnavailable"
            class="size-4 shrink-0 transition-transform"
            :class="{ 'rotate-90': isExpanded }"
          />
          <span v-else class="size-4 shrink-0" />
          <FolderOpen
            v-if="item.value.kind === 'directory' && isExpanded"
            class="size-4 shrink-0"
          />
          <Folder
            v-else-if="item.value.kind === 'directory'"
            class="size-4 shrink-0"
          />
          <File v-else class="size-4 shrink-0" />
          <span class="truncate">{{ item.value.name }}</span>
          <Badge
            v-if="item.value.isUnavailable"
            class="ml-auto"
            variant="destructive"
          >
            {{ t("projects.unavailable") }}
          </Badge>
        </template>
      </TreeItem>
    </TreeVirtualizer>
  </TreeRoot>
</template>
