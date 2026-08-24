<script setup lang="ts">
import { FolderOpen, FolderPlus, RefreshCw, Trash2 } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type {
  PineProject,
  ProjectFolderAccess,
  ProjectFolderInput,
  ProjectMutationInput,
} from "@/shared/projects";
import ProjectFolderItem from "./ProjectFolderItem.vue";

interface Props {
  isSaving?: boolean;
  project?: PineProject | null;
}

interface EditorProjectFolder extends ProjectFolderInput {
  isAvailable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isSaving: false,
  project: null,
});
const emit = defineEmits<{
  cancel: [];
  submit: [input: ProjectMutationInput];
}>();
const { t } = useI18n();
const name = ref("");
const folders = ref<EditorProjectFolder[]>([]);
const defaultFolderId = ref("");

const defaultFolder = computed(() =>
  folders.value.find((folder) => folder.id === defaultFolderId.value),
);
const contextFolders = computed(() =>
  folders.value.filter((folder) => folder.id !== defaultFolderId.value),
);

const canSubmit = computed(
  () =>
    name.value.trim().length > 0 &&
    folders.value.length > 0 &&
    folders.value.some(
      (folder) =>
        folder.id === defaultFolderId.value &&
        folder.access === "read-write" &&
        folder.isAvailable !== false,
    ) &&
    folders.value.every((folder) => folder.name.trim().length > 0),
);

function reset(): void {
  name.value = props.project?.name ?? "";
  folders.value = props.project?.folders.map((folder) => ({ ...folder })) ?? [];
  defaultFolderId.value = props.project?.defaultFolderId ?? "";
  const selectedDefaultFolder = folders.value.find(
    (folder) => folder.id === defaultFolderId.value,
  );
  if (selectedDefaultFolder) selectedDefaultFolder.access = "read-write";
}

function mergeContextFolders(selectedFolders: ProjectFolderInput[]): void {
  const existingPaths = new Set(folders.value.map((folder) => folder.path));
  const additions = selectedFolders
    .filter((folder) => !existingPaths.has(folder.path))
    .map((folder) => ({ ...folder, isAvailable: true }));
  folders.value = [...folders.value, ...additions];
}

async function chooseDefaultFolder(): Promise<void> {
  const [selectedFolder] = (
    await window.pine.pickProjectFolders({ mode: "default" })
  ).folders;
  if (!selectedFolder) return;

  const existingFolder = folders.value.find(
    (folder) => folder.path === selectedFolder.path,
  );
  if (existingFolder) {
    existingFolder.access = "read-write";
    existingFolder.isAvailable = true;
    defaultFolderId.value = existingFolder.id;
    return;
  }

  folders.value = [...folders.value, { ...selectedFolder, isAvailable: true }];
  defaultFolderId.value = selectedFolder.id;
}

async function addContextFolders(): Promise<void> {
  mergeContextFolders(
    (await window.pine.pickProjectFolders({ mode: "context" })).folders,
  );
}

function removeFolder(folderId: string): void {
  folders.value = folders.value.filter((folder) => folder.id !== folderId);
  if (defaultFolderId.value === folderId) {
    defaultFolderId.value = folders.value[0]?.id ?? "";
  }
}

function updateFolderName(folder: EditorProjectFolder, name: string): void {
  folder.name = name;
}

function updateFolderAccess(
  folder: EditorProjectFolder,
  access: ProjectFolderAccess,
): void {
  folder.access = access;
}

function toFolderInput(folder: EditorProjectFolder): ProjectFolderInput {
  return {
    access: folder.access,
    id: folder.id,
    name: folder.name.trim(),
    path: folder.path,
  };
}

function submit(): void {
  if (!canSubmit.value || props.isSaving) return;
  emit("submit", {
    defaultFolderId: defaultFolderId.value,
    folders: folders.value.map(toFolderInput),
    name: name.value.trim(),
  });
}

watch(() => props.project, reset, { immediate: true });
</script>

<template>
  <form class="flex min-h-0 flex-col gap-6" @submit.prevent="submit">
    <FieldGroup>
      <Field>
        <FieldLabel for="project-name">
          {{ t("projects.editor.nameLabel") }}
        </FieldLabel>
        <Input
          id="project-name"
          v-model="name"
          maxlength="100"
          autocomplete="off"
          :placeholder="t('projects.editor.namePlaceholder')"
        />
      </Field>

      <Field>
        <FieldTitle id="default-folder-label">
          {{ t("projects.editor.defaultFolderLabel") }}
        </FieldTitle>
        <FieldDescription id="default-folder-description">
          {{ t("projects.editor.defaultFolderDescription") }}
        </FieldDescription>

        <ProjectFolderItem
          v-if="defaultFolder"
          :folder="defaultFolder"
          :show-access="false"
          data-testid="default-folder-row"
          aria-labelledby="default-folder-label"
          aria-describedby="default-folder-description"
          @update:name="updateFolderName(defaultFolder, $event)"
        >
          <template #action>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="change-default-folder"
              @click="chooseDefaultFolder"
            >
              <RefreshCw data-icon="inline-start" />
              {{ t("projects.editor.changeDefaultFolder") }}
            </Button>
          </template>
        </ProjectFolderItem>

        <Button
          v-else
          type="button"
          variant="outline"
          class="w-full"
          data-testid="choose-default-folder"
          aria-describedby="default-folder-description"
          @click="chooseDefaultFolder"
        >
          <FolderOpen data-icon="inline-start" />
          {{ t("projects.editor.chooseDefaultFolder") }}
        </Button>
      </Field>

      <Field>
        <div class="flex items-center justify-between gap-4">
          <FieldTitle>
            {{ t("projects.editor.contextFoldersLabel") }}
          </FieldTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="add-context-folders"
            @click="addContextFolders"
          >
            <FolderPlus data-icon="inline-start" />
            {{ t("projects.editor.addContextFolders") }}
          </Button>
        </div>

        <div v-if="contextFolders.length > 0" class="flex flex-col gap-2">
          <ProjectFolderItem
            v-for="folder in contextFolders"
            :key="folder.id"
            :folder="folder"
            data-testid="context-folder-row"
            @update:name="updateFolderName(folder, $event)"
            @update:access="updateFolderAccess(folder, $event)"
          >
            <template #action>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :aria-label="t('projects.editor.removeFolder')"
                :title="t('projects.editor.removeFolder')"
                @click="removeFolder(folder.id)"
              >
                <Trash2 />
              </Button>
            </template>
          </ProjectFolderItem>
        </div>
      </Field>
    </FieldGroup>

    <DialogFooter>
      <Button type="button" variant="outline" @click="emit('cancel')">
        {{ t("common.cancel") }}
      </Button>
      <Button type="submit" :disabled="!canSubmit || isSaving">
        <Spinner v-if="isSaving" data-icon="inline-start" />
        {{
          isSaving
            ? t("common.saving")
            : project
              ? t("common.save")
              : t("projects.createAction")
        }}
      </Button>
    </DialogFooter>
  </form>
</template>
