<script setup lang="ts">
import { computed, onDeactivated, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { FileQuestion, FileWarning } from "@lucide/vue";
import CodeBlock from "@/components/markdown/CodeBlock.vue";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { fileLanguage } from "@/lib/fileLanguage";
import type {
  ProjectFilePreview,
  ProjectFilePreviewRequest,
} from "@/shared/projectFiles";

const props = defineProps<{ file: ProjectFilePreviewRequest }>();
const { t, locale } = useI18n();
const preview = ref<ProjectFilePreview>();
const failed = ref(false);
const revision = ref(0);
const video = useTemplateRef<HTMLVideoElement>("video");
const fileName = computed(
  () => props.file.relativePath.split("/").at(-1) ?? "",
);
const mediaDetails = ref<{
  width: number;
  height: number;
  duration?: number;
}>();
const fileType = computed(() => {
  const name = fileName.value;
  const extension = name.includes(".") ? name.split(".").at(-1) : undefined;
  return (
    extension?.toUpperCase() ||
    t(`project.preview.${preview.value?.kind === "text" ? "text" : "file"}`)
  );
});
const fileSize = computed(() => {
  const size = preview.value?.size ?? 0;
  const unit =
    size >= 1024 ** 3 ? 3 : size >= 1024 ** 2 ? 2 : size >= 1024 ? 1 : 0;
  return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: unit ? 1 : 0 }).format(size / 1024 ** unit)} ${["B", "KB", "MB", "GB"][unit]}`;
});
const modifiedTime = computed(() =>
  preview.value
    ? new Intl.DateTimeFormat(locale.value, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(preview.value.modifiedAt))
    : "",
);
const lineCount = computed(() =>
  preview.value?.kind === "text"
    ? preview.value.text.split(/\r\n|\r|\n/).length
    : 0,
);
const duration = computed(() => {
  const seconds = mediaDetails.value?.duration;
  if (seconds === undefined || !Number.isFinite(seconds)) return "";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
});

function imageLoaded(event: Event): void {
  const image = event.currentTarget as HTMLImageElement;
  mediaDetails.value = {
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
}

function videoLoaded(): void {
  if (!video.value) return;
  mediaDetails.value = {
    width: video.value.videoWidth,
    height: video.value.videoHeight,
    duration: video.value.duration,
  };
}

watch(
  () =>
    [
      props.file.projectId,
      props.file.folderId,
      props.file.relativePath,
      revision.value,
    ] as const,
  async (_value, _previous, onCleanup) => {
    let active = true;
    onCleanup(() => {
      active = false;
    });
    preview.value = undefined;
    mediaDetails.value = undefined;
    failed.value = false;
    try {
      const result = await window.pine.readProjectFilePreview({
        projectId: props.file.projectId,
        folderId: props.file.folderId,
        relativePath: props.file.relativePath,
      });
      if (active) preview.value = result;
    } catch {
      if (active) failed.value = true;
    }
  },
  { immediate: true },
);

onDeactivated(() => video.value?.pause());
</script>

<template>
  <section class="flex h-full min-h-0 flex-col" :aria-label="fileName">
    <div
      class="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1 border-b px-5 py-2 text-xs text-muted-foreground"
      :title="file.relativePath"
      :aria-label="t('project.preview.metadata')"
    >
      <template v-if="preview">
        <span>{{ fileType }}</span>
        <span>{{ fileSize }}</span>
        <template v-if="preview.kind === 'text'">
          <span>{{ preview.encoding }}</span>
          <span>{{ t("project.preview.lines", { count: lineCount }) }}</span>
        </template>
        <span v-if="mediaDetails"
          >{{ mediaDetails.width }} × {{ mediaDetails.height }}</span
        >
        <span v-if="duration">{{ duration }}</span>
        <span class="ml-auto">{{
          t("project.preview.modified", { time: modifiedTime })
        }}</span>
      </template>
      <Skeleton v-else-if="!failed" class="h-3 w-40" />
    </div>
    <Empty v-if="failed" class="flex-1" role="alert">
      <EmptyHeader>
        <EmptyMedia variant="icon"><FileWarning /></EmptyMedia>
        <EmptyTitle>{{ t("project.preview.failedTitle") }}</EmptyTitle>
        <EmptyDescription>{{
          t("project.preview.failedDescription")
        }}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent
        ><Button variant="outline" @click="revision += 1">{{
          t("project.preview.retry")
        }}</Button></EmptyContent
      >
    </Empty>
    <div
      v-else-if="!preview"
      class="flex flex-col gap-3 p-6"
      role="status"
      :aria-label="t('project.files.loading')"
    >
      <Skeleton class="h-4 w-3/4" /><Skeleton class="h-4 w-1/2" /><Skeleton
        class="h-4 w-2/3"
      />
    </div>
    <Empty v-else-if="preview.kind === 'unsupported'" class="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon"><FileQuestion /></EmptyMedia>
        <EmptyTitle>{{ t("project.preview.unsupportedTitle") }}</EmptyTitle>
        <EmptyDescription>{{
          t(
            preview.reason === "too-large"
              ? "project.preview.tooLarge"
              : "project.preview.unsupportedDescription",
          )
        }}</EmptyDescription>
      </EmptyHeader>
    </Empty>
    <div
      v-else-if="preview.kind === 'text'"
      class="min-h-0 flex-1 overflow-auto px-5"
    >
      <CodeBlock
        :node="{
          type: 'code_block',
          code: preview.text,
          language:
            preview.text.length > 200_000
              ? 'text'
              : fileLanguage(file.relativePath),
        }"
      />
    </div>
    <div
      v-else
      class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6"
    >
      <img
        v-if="preview.kind === 'image'"
        :src="preview.url"
        :alt="fileName"
        class="max-h-full max-w-full object-contain"
        @load="imageLoaded"
        @error="failed = true"
      />
      <video
        v-else
        ref="video"
        :src="preview.url"
        :aria-label="fileName"
        controls
        preload="metadata"
        class="max-h-full max-w-full rounded-lg"
        @loadedmetadata="videoLoaded"
        @error="failed = true"
      />
    </div>
  </section>
</template>
