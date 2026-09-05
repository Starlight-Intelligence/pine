<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";
import type { Component } from "vue";
import { useElementSize } from "@vueuse/core";
import { documentPreviewSelection } from "@/lib/filePreviewSelection";
import type { AttachmentSelection } from "@/shared/attachments";
import type { OfficeDocumentFormat } from "@/shared/projectFiles";

interface ExcelCell {
  text?: unknown;
}

interface ExcelRow {
  height?: number;
  cells?: Record<string, ExcelCell>;
}

interface ExcelColumn {
  width?: number;
}

interface ExcelStyle {
  font?: { size?: number };
}

interface ExcelSheet {
  name?: string;
  rows?: Record<string, ExcelRow>;
  cols?: Record<string, ExcelColumn>;
  styles?: ExcelStyle[];
}

interface ExcelSelectionEvent {
  startRowIndex: number;
  startColumnIndex: number;
  endRowIndex: number;
  endColumnIndex: number;
}

const props = defineProps<{
  format: OfficeDocumentFormat;
  source: string;
  inverted?: boolean;
  selectionLabel: string;
  zoom?: number;
  renderZoom?: number;
}>();
const emit = defineEmits<{
  failed: [];
  selectionChange: [selection: AttachmentSelection | undefined];
}>();

const VueOfficeExcel = defineAsyncComponent(async () => {
  const [module] = await Promise.all([
    import("@vue-office/excel"),
    import("@vue-office/excel/lib/index.css"),
  ]);
  return module.default as Component;
});
const officeComponents: Record<OfficeDocumentFormat, Component> = {
  docx: defineAsyncComponent(async () => {
    const [module] = await Promise.all([
      import("@vue-office/docx"),
      import("@vue-office/docx/lib/index.css"),
    ]);
    return module.default as Component;
  }),
  xls: VueOfficeExcel,
  xlsx: VueOfficeExcel,
  pptx: defineAsyncComponent(async () => {
    const module = await import("@vue-office/pptx");
    return module.default as Component;
  }),
};
const previewComponent = computed(() => officeComponents[props.format]);
const isSpreadsheet = computed(
  () => props.format === "xls" || props.format === "xlsx",
);
const viewport = useTemplateRef<HTMLDivElement>("viewport");
const sizer = useTemplateRef<HTMLDivElement>("sizer");
const { width: availableWidth } = useElementSize(sizer);
const excelSheets = shallowRef<ExcelSheet[]>([]);
const activeSheetIndex = ref(0);
const zoomScale = computed(() => (props.zoom ?? 100) / 100);
const spreadsheetZoom = computed(() => props.renderZoom ?? props.zoom ?? 100);
const scaledWidth = computed(() =>
  Math.max(1, availableWidth.value * zoomScale.value),
);

function captureExcelSheets(value: unknown, zoom: number): unknown {
  const sheets = Array.isArray(value) ? (value as ExcelSheet[]) : [];
  excelSheets.value = sheets;
  const scale = zoom / 100;
  if (scale === 1) return value;
  for (const sheet of sheets) {
    for (const row of Object.values(sheet.rows ?? {})) {
      if (typeof row.height === "number") row.height *= scale;
    }
    for (const column of Object.values(sheet.cols ?? {})) {
      if (typeof column.width === "number") column.width *= scale;
    }
    for (const style of sheet.styles ?? []) {
      if (typeof style.font?.size === "number") style.font.size *= scale;
    }
  }
  return value;
}

const previewOptions = computed(() => {
  if (props.format === "docx") return { ignoreWidth: true };
  if (!isSpreadsheet.value) return undefined;
  const zoom = spreadsheetZoom.value;
  return {
    ...(props.format === "xls" ? { xls: true } : {}),
    transformData: (value: unknown) => captureExcelSheets(value, zoom),
  };
});

function updateDocumentSelection(): void {
  if (isSpreadsheet.value) return;
  emit(
    "selectionChange",
    viewport.value
      ? documentPreviewSelection(viewport.value, props.selectionLabel)
      : undefined,
  );
}

function excelColumnName(index: number): string {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function excelCellText(value: unknown): string {
  if (value === undefined || value === null) return "";
  let text = "";
  if (typeof value === "string") {
    text = value;
  } else if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    text = String(value);
  } else if (typeof value === "object") {
    try {
      text = JSON.stringify(value) ?? "";
    } catch {
      text = "";
    }
  }
  return /[\t\r\n"]/.test(text) ? JSON.stringify(text) : text;
}

function updateExcelSelection(selection: ExcelSelectionEvent): void {
  const { startRowIndex, startColumnIndex, endRowIndex, endColumnIndex } =
    selection;
  if (
    ![startRowIndex, startColumnIndex, endRowIndex, endColumnIndex].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    endRowIndex < startRowIndex ||
    endColumnIndex < startColumnIndex
  ) {
    emit("selectionChange", undefined);
    return;
  }
  const sheet = excelSheets.value[activeSheetIndex.value];
  const rows: string[] = [];
  for (let row = startRowIndex; row <= endRowIndex; row += 1) {
    const cells: string[] = [];
    for (let column = startColumnIndex; column <= endColumnIndex; column += 1) {
      cells.push(excelCellText(sheet?.rows?.[row]?.cells?.[column]?.text));
    }
    rows.push(cells.join("\t"));
  }
  const text = rows.join("\n");
  if (!text.trim()) {
    emit("selectionChange", undefined);
    return;
  }
  const start = `${excelColumnName(startColumnIndex)}${startRowIndex + 1}`;
  const end = `${excelColumnName(endColumnIndex)}${endRowIndex + 1}`;
  const range = start === end ? start : `${start}:${end}`;
  const location = sheet?.name ? `${sheet.name}!${range}` : range;
  emit("selectionChange", {
    startLine: startRowIndex + 1,
    endLine: endRowIndex + 1,
    label: `${props.selectionLabel} · ${location}`,
    text,
  });
}

function updateSingleCellSelection(selection: {
  rowIndex: number;
  columnIndex: number;
}): void {
  updateExcelSelection({
    startRowIndex: selection.rowIndex,
    startColumnIndex: selection.columnIndex,
    endRowIndex: selection.rowIndex,
    endColumnIndex: selection.columnIndex,
  });
}

watch(
  () => [props.source, props.format],
  () => {
    excelSheets.value = [];
    activeSheetIndex.value = 0;
    emit("selectionChange", undefined);
  },
);
</script>

<template>
  <div
    ref="viewport"
    class="scroll-fade h-full w-full overflow-auto"
    :data-office-format="format"
    @pointerup="updateDocumentSelection"
    @keyup="updateDocumentSelection"
  >
    <component
      :is="previewComponent"
      v-if="isSpreadsheet"
      :key="`${format}-${spreadsheetZoom}`"
      :class="['min-h-full min-w-full', inverted && 'office-preview-inverted']"
      :src="source"
      :options="previewOptions"
      @error="emit('failed')"
      @cell-selected="updateSingleCellSelection"
      @cells-selected="updateExcelSelection"
      @switch-sheet="activeSheetIndex = $event"
    />
    <template v-else>
      <div
        ref="sizer"
        data-slot="office-preview-sizer"
        aria-hidden="true"
        class="mx-auto h-0 w-full max-w-[var(--session-content-max-width)]"
      />
      <div class="flex min-w-full w-max justify-center">
        <div
          class="office-preview-content"
          :style="{ width: `${scaledWidth}px` }"
        >
          <component
            :is="previewComponent"
            :key="format"
            :class="[
              'min-h-full min-w-full',
              inverted && 'office-preview-inverted',
            ]"
            :style="{
              width: `${Math.max(1, availableWidth)}px`,
              zoom: zoomScale,
            }"
            :src="source"
            :options="previewOptions"
            @error="emit('failed')"
            @cell-selected="updateSingleCellSelection"
            @cells-selected="updateExcelSelection"
            @switch-sheet="activeSheetIndex = $event"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
:deep(.vue-office-docx .docx-wrapper) {
  background: transparent;
  padding: 1.5rem 0 0;
}

:deep(.vue-office-docx .docx-wrapper > section.docx) {
  width: 100% !important;
}

:deep(.vue-office-excel),
:deep(.vue-office-excel-main),
:deep(.vue-office-pptx),
:deep(.vue-office-pptx-main) {
  background: transparent;
}

:deep(.vue-office-pptx .pptx-preview-wrapper) {
  background: transparent !important;
}

.office-preview-inverted {
  filter: invert(1) hue-rotate(180deg);
}
</style>
