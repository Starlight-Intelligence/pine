<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { useElementSize } from "@vueuse/core";
import VuePdfEmbed, {
  GlobalWorkerOptions,
} from "vue-pdf-embed/dist/index.essential.mjs";
import PdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { cn } from "@/lib/utils";
import { documentPreviewSelection } from "@/lib/filePreviewSelection";
import type { AttachmentSelection } from "@/shared/attachments";
import "vue-pdf-embed/dist/styles/textLayer.css";

GlobalWorkerOptions.workerSrc = PdfWorker;

const props = defineProps<{
  source: string;
  inverted?: boolean;
  selectionLabel: string;
  zoom?: number;
  renderZoom?: number;
}>();
const emit = defineEmits<{
  failed: [];
  loaded: [pageCount: number];
  selectionChange: [selection: AttachmentSelection | undefined];
}>();

const viewport = useTemplateRef<HTMLDivElement>("viewport");
const sizer = useTemplateRef<HTMLDivElement>("sizer");
const { width } = useElementSize(sizer);
const renderedPageWidth = computed(() =>
  Math.max(1, width.value * ((props.renderZoom ?? 100) / 100)),
);
const scaledPageWidth = computed(() =>
  Math.max(1, width.value * ((props.zoom ?? 100) / 100)),
);
const transientScale = computed(
  () => (props.zoom ?? 100) / (props.renderZoom ?? 100),
);

function documentLoaded(document: { numPages: number }): void {
  emit("loaded", document.numPages);
}

function updateSelection(): void {
  emit(
    "selectionChange",
    viewport.value
      ? documentPreviewSelection(viewport.value, props.selectionLabel)
      : undefined,
  );
}
</script>

<template>
  <div
    ref="viewport"
    class="scroll-fade h-full w-full overflow-auto p-6"
    @pointerup="updateSelection"
    @keyup="updateSelection"
  >
    <div
      ref="sizer"
      aria-hidden="true"
      class="mx-auto h-0 w-full max-w-[var(--session-content-max-width)]"
    />
    <div class="flex min-w-full w-max justify-center">
      <div :style="{ width: `${scaledPageWidth}px` }">
        <VuePdfEmbed
          :class="cn(inverted && 'pdf-inverted')"
          :source="source"
          :width="renderedPageWidth"
          :style="{ zoom: transientScale }"
          text-layer
          @loaded="documentLoaded"
          @loading-failed="emit('failed')"
          @rendering-failed="emit('failed')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.vue-pdf-embed__page) {
  margin-inline: auto;
  background: white;
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
}

:deep(.vue-pdf-embed) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

:deep(.vue-pdf-embed > div) {
  width: fit-content;
}

:deep(.pdf-inverted .vue-pdf-embed__page) {
  filter: invert(1) hue-rotate(180deg);
}
</style>
