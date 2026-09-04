<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  useId,
  useTemplateRef,
  watch,
} from "vue";
import { useI18n } from "vue-i18n";
import { useEventListener } from "@vueuse/core";
import { getMarkdown, parseMarkdownToStructure } from "markstream-vue";
import {
  FileQuestion,
  FileWarning,
  Plus,
  Send,
  SquareTerminal,
} from "@lucide/vue";
import CodeBlock from "@/components/markdown/CodeBlock.vue";
import MarkdownContent from "@/components/markdown/MarkdownContent.vue";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useContentTabsStore } from "@/stores/contentTabs";
import { useFileToSession } from "@/composables/useFileToSession";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fileLanguage } from "@/lib/fileLanguage";
import { filePreviewSelection } from "@/lib/filePreviewSelection";
import type { AttachmentSelection } from "@/shared/attachments";
import type {
  ProjectFilePreview,
  ProjectFilePreviewRequest,
} from "@/shared/projectFiles";

const props = withDefaults(
  defineProps<{ file: ProjectFilePreviewRequest; active?: boolean }>(),
  { active: true },
);
const { t, locale } = useI18n();
const preview = ref<ProjectFilePreview>();
const viewMode = ref<"code" | "rendered">("code");
const renderSwitchId = useId();
const isMarkdown = computed(
  () =>
    preview.value?.kind === "text" &&
    fileLanguage(props.file.relativePath) === "markdown",
);
const rendered = computed(
  () => isMarkdown.value && viewMode.value === "rendered",
);
const markdownNodes = computed(() =>
  rendered.value && preview.value?.kind === "text"
    ? parseMarkdownToStructure(
        preview.value.text,
        getMarkdown("pine-preview"),
        {
          final: true,
          includeSourceMap: true,
        },
      )
    : undefined,
);
const content = useTemplateRef<HTMLDivElement>("content");
const selectedRange = ref<AttachmentSelection>();
const menuOpen = ref(false);
const menuSelection = ref<AttachmentSelection>();

function updateSelection(): void {
  if (menuOpen.value) return;
  selectedRange.value =
    props.active && content.value && preview.value?.kind === "text"
      ? filePreviewSelection(
          content.value,
          preview.value.text,
          markdownNodes.value,
        )
      : undefined;
}

function updateMenu(open: boolean): void {
  if (open) {
    updateSelection();
    menuSelection.value = selectedRange.value;
  }
  menuOpen.value = open;
  if (!open) updateSelection();
}

useEventListener(document, "selectionchange", updateSelection);
watch(viewMode, () => {
  selectedRange.value = undefined;
  menuSelection.value = undefined;
});
const tabsStore = useContentTabsStore();
const sessionTabs = computed(() =>
  tabsStore.tabs.filter((tab) => tab.kind === "session"),
);
const { isSending, sendFile, sendFileToNewSession } = useFileToSession();
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
    viewMode.value = "code";
    selectedRange.value = undefined;
    menuSelection.value = undefined;
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

watch(
  () => props.active,
  (active) => {
    if (!active) video.value?.pause();
    if (!active) selectedRange.value = undefined;
  },
);
onBeforeUnmount(() => video.value?.pause());
</script>

<template>
  <section class="flex h-full min-h-0 flex-col" :aria-label="fileName">
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
      class="flex flex-1 flex-col gap-3 p-6"
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
    <ScrollArea
      v-else-if="preview.kind === 'text'"
      class="min-h-0 min-w-0 flex-1 [&_[data-slot=scroll-area-viewport]]:scroll-fade"
    >
      <div
        ref="content"
        class="min-w-0 px-4 pb-4"
        @pointerup="updateSelection"
        @keyup="updateSelection"
      >
        <MarkdownContent
          v-if="rendered"
          class="py-4"
          :source="preview.text"
          :nodes="markdownNodes"
          final
        />
        <CodeBlock
          v-else
          layout="preview"
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
    </ScrollArea>
    <div
      v-else
      class="scroll-fade flex min-h-0 flex-1 items-center justify-center overflow-auto p-6"
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
    <footer
      class="mt-auto flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t pl-5 pr-2 py-2 text-sm text-muted-foreground"
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
      </template>
      <Skeleton v-else-if="!failed" class="h-3 w-40" />
      <div class="ml-auto flex items-center gap-3">
        <div v-if="isMarkdown" class="flex items-center gap-2">
          <Switch
            :id="renderSwitchId"
            size="sm"
            :model-value="rendered"
            @update:model-value="viewMode = $event ? 'rendered' : 'code'"
          />
          <Label :for="renderSwitchId">{{
            t("project.preview.rendered")
          }}</Label>
        </div>
        <DropdownMenu :open="menuOpen" @update:open="updateMenu">
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              :disabled="isSending"
              @pointerdown.prevent="updateSelection"
            >
              <Send data-icon="inline-start" />{{
                t(
                  selectedRange
                    ? "project.preview.sendSelectionToTab"
                    : "project.preview.sendToTab",
                )
              }}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            class="w-64"
            @close-auto-focus.prevent
          >
            <DropdownMenuGroup>
              <DropdownMenuItem
                v-for="tab in sessionTabs"
                :key="tab.id"
                @select="sendFile(file, tab.id, menuSelection)"
              >
                <SquareTerminal />
                <span class="truncate">{{
                  "label" in tab && tab.label
                    ? tab.label
                    : t("project.contentTabs.newSession")
                }}</span>
              </DropdownMenuItem>
              <DropdownMenuItem v-if="!sessionTabs.length" disabled>{{
                t("project.preview.noSessionTabs")
              }}</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                data-action="new-session"
                @select="sendFileToNewSession(file, menuSelection)"
              >
                <Plus />{{ t("project.preview.newSession") }}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </footer>
  </section>
</template>
