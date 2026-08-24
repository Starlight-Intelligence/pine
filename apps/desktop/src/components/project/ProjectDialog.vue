<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { handleError } from "@/app/errors/errorHandler";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PineProject, ProjectMutationInput } from "@/shared/projects";
import { useProjectStore } from "@/stores/project";
import ProjectEditor from "./ProjectEditor.vue";

interface Props {
  project?: PineProject | null;
}

const props = withDefaults(defineProps<Props>(), { project: null });
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{
  saved: [project: PineProject];
}>();
const { t } = useI18n();
const projectStore = useProjectStore();

async function save(input: ProjectMutationInput): Promise<void> {
  try {
    const project = props.project
      ? await projectStore.updateProject({ id: props.project.id, ...input })
      : await projectStore.createProject(input);
    emit("saved", project);
    open.value = false;
  } catch (error) {
    handleError(error, {
      id: props.project ? "project.update" : "project.create",
      title: t(
        props.project
          ? "errors.projectUpdate.title"
          : "errors.projectCreate.title",
      ),
      description: t(
        props.project
          ? "errors.projectUpdate.description"
          : "errors.projectCreate.description",
      ),
    });
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {{ project ? t("projects.editTitle") : t("projects.createTitle") }}
        </DialogTitle>
      </DialogHeader>
      <ProjectEditor
        :key="project?.updatedAt ?? String(open)"
        :project="project"
        :is-saving="projectStore.isSavingProject"
        @cancel="open = false"
        @submit="save"
      />
    </DialogContent>
  </Dialog>
</template>
