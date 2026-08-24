<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent } from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ProjectFolderAccess,
  ProjectFolderInput,
} from "@/shared/projects";

interface ProjectFolderItemValue extends ProjectFolderInput {
  isAvailable?: boolean;
}

interface Props {
  folder: ProjectFolderItemValue;
  showAccess?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showAccess: true,
});
const emit = defineEmits<{
  "update:access": [access: ProjectFolderAccess];
  "update:name": [name: string];
}>();
const { t } = useI18n();
const originalName = ref("");

function updateName(value: string | number): void {
  emit("update:name", String(value));
}

function setAccess(access: unknown): void {
  if (access === "read-only" || access === "read-write") {
    emit("update:access", access);
  }
}

function startRenaming(): void {
  originalName.value = props.folder.name;
}

function finishRenaming(): void {
  const trimmedName = props.folder.name.trim();
  emit("update:name", trimmedName || originalName.value);
  originalName.value = "";
}

function cancelRenaming(event: KeyboardEvent): void {
  emit("update:name", originalName.value);
  originalName.value = "";
  (event.currentTarget as HTMLInputElement).blur();
}
</script>

<template>
  <Item variant="outline" size="sm">
    <ItemContent class="min-w-0 flex-row items-center gap-3">
      <Input
        :id="`folder-name-${folder.id}`"
        :model-value="folder.name"
        data-testid="folder-name-input"
        class="w-36 shrink-0 bg-transparent px-0 font-medium focus-visible:px-3"
        maxlength="100"
        :aria-label="t('projects.editor.folderName')"
        @update:model-value="updateName"
        @focus="startRenaming"
        @blur="finishRenaming"
        @keydown.enter.prevent="finishRenaming"
        @keydown.esc.prevent="cancelRenaming"
      />
      <div class="flex min-w-0 items-center gap-2">
        <span class="truncate text-sm text-muted-foreground">
          {{ folder.path }}
        </span>
        <Badge v-if="folder.isAvailable === false" variant="destructive">
          {{ t("projects.unavailable") }}
        </Badge>
      </div>
    </ItemContent>

    <ItemActions>
      <Select
        v-if="showAccess"
        :model-value="folder.access"
        @update:model-value="setAccess"
      >
        <SelectTrigger
          :id="`folder-access-${folder.id}`"
          size="sm"
          class="w-24"
          :aria-label="t('projects.editor.folderAccess', { name: folder.name })"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="read-only">
              {{ t("projects.access.readOnly") }}
            </SelectItem>
            <SelectItem value="read-write">
              {{ t("projects.access.readWrite") }}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <slot name="action" />
    </ItemActions>
  </Item>
</template>
