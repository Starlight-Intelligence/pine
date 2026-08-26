<script setup lang="ts">
import { AlertCircleIcon, CheckIcon } from "@lucide/vue";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import type { PineToolCall } from "@/shared/sessions";

type ToolKind = "bash" | "edit" | "generic" | "read" | "search" | "write";

const props = defineProps<{ toolCall: PineToolCall }>();
const { t } = useI18n();

const isRunning = computed(
  () =>
    props.toolCall.status === "pending" || props.toolCall.status === "running",
);

function inputRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function compactInline(value: string, maxLength = 80): string {
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  const characters = Array.from(normalized);
  return characters.length > maxLength
    ? `${characters.slice(0, maxLength - 1).join("")}…`
    : normalized;
}

function filename(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
}

function toolKind(name: string): ToolKind {
  const normalized = name.toLowerCase().split(/[.:/]/).at(-1) ?? name;
  if (["bash", "exec", "execute", "shell"].includes(normalized)) return "bash";
  if (["edit", "apply_patch", "patch"].includes(normalized)) return "edit";
  if (["read", "read_file", "view"].includes(normalized)) return "read";
  if (["find", "grep", "search"].includes(normalized)) return "search";
  if (["write", "write_file", "create_file"].includes(normalized)) {
    return "write";
  }
  return "generic";
}

const presentation = computed(() => {
  const kind = toolKind(props.toolCall.name);
  const input = inputRecord(props.toolCall.input);
  const path = firstString(input, ["path", "filePath", "file_path"]);
  const command = firstString(input, ["command", "cmd"]);
  const query = firstString(input, ["pattern", "query", "search"]);
  const target =
    kind === "bash" && command
      ? compactInline(command)
      : kind === "search" && query
        ? compactInline(query)
        : path
          ? filename(path)
          : props.toolCall.name;
  const state = isRunning.value
    ? "running"
    : props.toolCall.status === "error"
      ? "error"
      : "complete";
  return t(`project.transcript.tools.${kind}.${state}`, { target });
});
</script>

<template>
  <Marker :role="isRunning ? 'status' : undefined">
    <MarkerIcon>
      <Spinner v-if="isRunning" />
      <AlertCircleIcon v-else-if="toolCall.status === 'error'" />
      <CheckIcon v-else />
    </MarkerIcon>
    <MarkerContent class="truncate" :title="presentation">
      {{ presentation }}
    </MarkerContent>
  </Marker>
</template>
