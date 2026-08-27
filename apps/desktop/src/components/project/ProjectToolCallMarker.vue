<script setup lang="ts">
import { AlertCircleIcon, CheckIcon } from "@lucide/vue";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import type { PineToolCall } from "@/shared/sessions";
import { isRunningTool, toolKind } from "./toolKinds";

const props = defineProps<{ toolCall: PineToolCall }>();
const { t } = useI18n();

const isRunning = computed(() => isRunningTool(props.toolCall));

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

const presentation = computed(() => {
  const kind = toolKind(props.toolCall.name);
  const input = inputRecord(props.toolCall.input);
  const description = firstString(input, ["description", "summary"]);
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
  const key = `project.transcript.tools.${kind}.${state}`;
  return {
    before: t(`${key}.before`),
    // A bash call shows an imperative operation summary before the command
    // when the agent supplied one, e.g. "Ran {description}: {command}".
    operation:
      kind === "bash" && description && command ? `${description}` : undefined,
    separator: t("project.transcript.tools.operationSeparator"),
    target,
    after: t(`${key}.after`),
  };
});

const fullText = computed(() => {
  const before = presentation.value.before;
  const operation = presentation.value.operation;
  const separator = presentation.value.separator;
  const target = presentation.value.target;
  const after = presentation.value.after;
  return `${before}${operation}${operation ? separator : ""}${target}${after}`;
});
</script>

<template>
  <Marker :role="isRunning ? 'status' : undefined">
    <MarkerIcon>
      <Spinner v-if="isRunning" />
      <AlertCircleIcon v-else-if="toolCall.status === 'error'" />
      <CheckIcon v-else />
    </MarkerIcon>
    <MarkerContent class="truncate" :title="fullText">
      <span v-if="presentation.before">{{ presentation.before }}</span>
      <span v-if="presentation.operation"
        >{{ presentation.operation }}{{ presentation.separator }}</span
      >
      <code class="font-mono text-sm font-normal">{{
        presentation.target
      }}</code
      ><span v-if="presentation.after">{{ presentation.after }}</span>
    </MarkerContent>
  </Marker>
</template>
