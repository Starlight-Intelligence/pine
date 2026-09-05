<script setup lang="ts">
import { AlertCircleIcon, CheckIcon, ShieldBanIcon } from "@lucide/vue";
import { computed, type Component } from "vue";
import { useI18n } from "vue-i18n";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import type { PineToolCall } from "@/shared/sessions";
import ProjectToolCallDialog from "./ProjectToolCallDialog.vue";
import {
  isDeniedTool,
  isRunningTool,
  TOOL_KIND_ICON,
  toolKind,
} from "./toolKinds";

const props = defineProps<{
  toolCall: PineToolCall;
  /** Nested rows repeat the folded header's kind icons, so they fall back
   * to a plain check once the call succeeds. */
  nested?: boolean;
  /** The call is being held by the auto-reviewer (auto-approve). */
  reviewing?: boolean;
  /** The call is waiting for the user's decision (Let Me Review mode). */
  awaitingApproval?: boolean;
}>();
const { t } = useI18n();

const kindIcon: Component = TOOL_KIND_ICON[toolKind(props.toolCall.name)];

const isRunning = computed(() => isRunningTool(props.toolCall));
const isDenied = computed(() => isDeniedTool(props.toolCall));

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

function nonEmptyLineCount(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  return value.split("\n").filter((line) => line.trim()).length;
}

function firstKey(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/**
 * Mirrors read's line-window semantics: offset-only means "from this line
 * onward", while a supplied limit makes the inclusive end line knowable.
 */
function readRangeSuffix(input: Record<string, unknown>): string {
  const offset = input.offset;
  const limit = input.limit;
  if (typeof offset !== "number" && typeof limit !== "number") return "";
  const start =
    typeof offset === "number" ? Math.max(1, Math.round(offset)) : 1;
  const end =
    typeof limit === "number" && limit > 0
      ? start + Math.round(limit) - 1
      : undefined;
  return end === undefined ? `:${start}` : `:${start}-${end}`;
}

/** Per-hunk tally of touched lines (streaming-safe). */
function editDiff(
  input: Record<string, unknown>,
): { added: number; removed: number } | undefined {
  const edits = input.edits;
  if (!Array.isArray(edits)) return undefined;
  let added = 0;
  let removed = 0;
  for (const edit of edits) {
    if (typeof edit !== "object" || edit === null) continue;
    const record = edit as Record<string, unknown>;
    added += nonEmptyLineCount(
      firstKey(record, ["newText", "newStr", "new_string"]),
    );
    removed += nonEmptyLineCount(
      firstKey(record, ["oldText", "oldStr", "old_string"]),
    );
  }
  return added || removed ? { added, removed } : undefined;
}

const editDiffCount = computed(() =>
  toolKind(props.toolCall.name) === "edit"
    ? editDiff(inputRecord(props.toolCall.input))
    : undefined,
);

// The write tool streams its `content` argument as the model generates it, so
// counting the newlines already in the argument shows a live "lines written"
// progress count that climbs as the file is composed.
const writeLineCount = computed(() => {
  if (toolKind(props.toolCall.name) !== "write") return undefined;
  const content = inputRecord(props.toolCall.input).content;
  return typeof content === "string" && content
    ? content.split("\n").length
    : undefined;
});

const presentation = computed(() => {
  const kind = toolKind(props.toolCall.name);
  const input = inputRecord(props.toolCall.input);
  const description = firstString(input, ["description", "summary"]);
  const path = firstString(input, ["path", "filePath", "file_path"]);
  const command = firstString(input, ["command", "cmd"]);
  const query = firstString(input, ["pattern", "query", "search"]);
  const suffix = kind === "read" ? readRangeSuffix(input) : "";
  const target =
    kind === "bash" && command
      ? compactInline(command)
      : kind === "search" && query
        ? compactInline(query)
        : path
          ? `${filename(path)}${suffix}`
          : props.toolCall.name;
  // Review holds replace the tense label entirely: the reader must see that
  // the call is gated, not that it is running.
  const state = isDenied.value
    ? "denied"
    : props.reviewing
      ? "reviewing"
      : props.awaitingApproval
        ? "awaiting"
        : isRunning.value
          ? "running"
          : props.toolCall.status === "error"
            ? "error"
            : "complete";
  if (state === "reviewing" || state === "awaiting" || state === "denied") {
    // The state name differs from its i18n key ("awaiting" →
    // "awaitingApproval"), so map it explicitly.
    const stateKey = state === "awaiting" ? "awaitingApproval" : state;
    return {
      // The gate label carries its own trailing separator so the target
      // reads as one sentence, e.g. "正在审核 读取文档目录：ls ~/Documents".
      before: t(`project.transcript.tools.${stateKey}`, {
        tool:
          kind === "bash" && description
            ? compactInline(description)
            : t(`project.transcript.toolKinds.${kind}`),
      }),
      operation: undefined,
      separator: "",
      target,
      after: "",
    };
  }
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

const isActive = computed(
  () =>
    !isDenied.value &&
    (props.reviewing || props.awaitingApproval || isRunning.value),
);

// Gate calls get distinct shimmer tones: amber while waiting on the user
// ("needs your attention"), blue while the auto-reviewer deliberates — both
// distinct from the neutral running shimmer.
const shimmerClass = computed(() =>
  props.awaitingApproval
    ? "shimmer shimmer-color-warning"
    : props.reviewing
      ? "shimmer shimmer-color-info"
      : "shimmer",
);

const fullText = computed(() => {
  const before = presentation.value.before;
  const operation = presentation.value.operation;
  const separator = presentation.value.separator;
  const target = presentation.value.target;
  const after = presentation.value.after;
  return `${before}${operation ?? ""}${operation ? separator : ""}${target}${after}`;
});
</script>

<template>
  <ProjectToolCallDialog
    v-slot="{ open }"
    :tool-call="toolCall"
    :reviewing="reviewing"
    :awaiting-approval="awaitingApproval"
  >
    <!-- Offset standalone hit-area padding so the transcript's 12px gap is
         measured between content rows. Nested rows already use 4px + 8px. -->
    <Marker
      as="button"
      type="button"
      class="-mx-1.5 w-[calc(100%+0.75rem)] cursor-pointer rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      :class="!nested && '-my-1'"
      :aria-live="isActive ? 'polite' : undefined"
      @click="open"
    >
      <!-- While running (or held by a gate) the label shimmers instead of
         showing a spinner; on success the kind icon matches the folded group
         header, and failures stay recognizable through the destructive alert
         tint. -->
      <MarkerIcon>
        <ShieldBanIcon v-if="isDenied" class="text-warning" />
        <AlertCircleIcon
          v-else-if="toolCall.status === 'error'"
          class="text-destructive"
        />
        <CheckIcon v-else-if="props.nested" />
        <component :is="kindIcon" v-else />
      </MarkerIcon>
      <MarkerContent
        class="truncate"
        :class="
          isDenied
            ? 'text-warning'
            : isActive
              ? shimmerClass
              : toolCall.status === 'error' && 'text-destructive'
        "
        :title="fullText"
      >
        <span v-if="presentation.before">{{ presentation.before }}</span>
        <span v-if="presentation.operation" class="font-medium"
          >{{ presentation.operation }}{{ presentation.separator }}</span
        >
        <code class="font-mono text-sm font-normal">{{
          presentation.target
        }}</code
        ><span
          v-if="editDiffCount && !isDenied"
          data-edit-diff
          class="ml-1 inline-flex gap-1"
          ><span
            class="font-mono text-xs font-normal text-emerald-600 dark:text-emerald-400"
            >+{{ editDiffCount.added }}</span
          >
          <span class="font-mono text-xs font-normal text-destructive"
            >-{{ editDiffCount.removed }}</span
          ></span
        ><span
          v-if="writeLineCount && !isDenied"
          data-write-lines
          class="ml-1 font-mono text-xs font-normal text-emerald-600 dark:text-emerald-400"
          >{{
            t("project.transcript.tools.writeLines", { count: writeLineCount })
          }}</span
        ><span v-if="presentation.after">{{ presentation.after }}</span>
      </MarkerContent>
    </Marker>
  </ProjectToolCallDialog>
</template>
