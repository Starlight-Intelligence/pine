<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const props = defineProps<{
  value: unknown;
  emptyLabel: string;
}>();

interface ValueRow {
  key: string;
  value: string;
}

const { t } = useI18n();

const rows = computed(() => {
  if (props.value === undefined) return [];
  return flattenValue(parseJsonString(props.value));
});

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const candidate = value.trim();
  if (!(
    (candidate.startsWith("{") && candidate.endsWith("}")) ||
    (candidate.startsWith("[") && candidate.endsWith("]"))
  )) {
    return value;
  }
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return value;
  }
}

function childPath(path: string, key: string, isArrayIndex: boolean): string {
  if (isArrayIndex) return `${path}[${key}]`;
  return path ? `${path}.${key}` : key;
}

function scalarText(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return `${value}`;
  }
  return Object.prototype.toString.call(value);
}

function flattenValue(
  value: unknown,
  path = "",
  rows: ValueRow[] = [],
  ancestors = new WeakSet<object>(),
): ValueRow[] {
  const parsed = parseJsonString(value);
  if (typeof parsed !== "object" || parsed === null) {
    rows.push({
      key: path || t("project.transcript.toolDetails.rootValue"),
      value: scalarText(parsed),
    });
    return rows;
  }

  if (ancestors.has(parsed)) {
    rows.push({
      key: path || t("project.transcript.toolDetails.rootValue"),
      value: t("project.transcript.toolDetails.circularValue"),
    });
    return rows;
  }

  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    rows.push({
      key: path || t("project.transcript.toolDetails.rootValue"),
      value: Array.isArray(parsed) ? "[]" : "{}",
    });
    return rows;
  }

  ancestors.add(parsed);
  for (const [key, child] of entries) {
    flattenValue(
      child,
      childPath(path, key, Array.isArray(parsed)),
      rows,
      ancestors,
    );
  }
  ancestors.delete(parsed);
  return rows;
}
</script>

<template>
  <Table data-tool-value-table class="table-fixed">
    <TableHeader>
      <TableRow>
        <TableHead class="w-40">
          {{ t("project.transcript.toolDetails.field") }}
        </TableHead>
        <TableHead>{{ t("project.transcript.toolDetails.value") }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty
        v-if="rows.length === 0"
        :colspan="2"
        class="whitespace-normal"
      >
        {{ emptyLabel }}
      </TableEmpty>
      <TableRow v-for="row in rows" v-else :key="row.key">
        <TableCell data-tool-value-key class="w-40 align-top whitespace-normal">
          <code class="break-all text-xs">{{ row.key }}</code>
        </TableCell>
        <TableCell
          data-tool-value-value
          class="min-w-0 align-top whitespace-normal"
        >
          <div
            class="max-h-80 overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap break-words"
          >
            {{ row.value }}
          </div>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
