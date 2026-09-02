<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Badge, type BadgeVariants } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { PineToolCall } from "@/shared/sessions";
import ProjectToolValueTable from "./ProjectToolValueTable.vue";

const props = defineProps<{
  toolCall: PineToolCall;
  reviewing?: boolean;
  awaitingApproval?: boolean;
}>();

const { t } = useI18n();
const isOpen = ref(false);

type StatusKey =
  | "pending"
  | "running"
  | "complete"
  | "error"
  | "reviewing"
  | "awaitingApproval"
  | "autoApprovalDenied";

const statusKey = computed<StatusKey>(() => {
  if (props.reviewing || props.toolCall.approval?.state === "reviewing") {
    return "reviewing";
  }
  if (
    props.awaitingApproval ||
    props.toolCall.approval?.state === "awaiting-user"
  ) {
    return "awaitingApproval";
  }
  if (
    props.toolCall.approval?.state === "denied" &&
    props.toolCall.approval.decidedBy === "judge"
  ) {
    return "autoApprovalDenied";
  }
  return props.toolCall.status;
});

const statusVariant = computed<BadgeVariants["variant"]>(() =>
  statusKey.value === "error" || statusKey.value === "autoApprovalDenied"
    ? "destructive"
    : statusKey.value === "complete"
      ? "outline"
      : "secondary",
);

const approvalKey = computed(() => {
  const approval = props.toolCall.approval;
  if (!approval || approval.state === "reviewing") return undefined;
  if (approval.state === "awaiting-user") return "awaitingApproval";
  if (approval.decidedBy === "judge") {
    return approval.state === "approved" ? "autoApproved" : "autoDenied";
  }
  return approval.state === "approved" ? "userApproved" : "userDenied";
});

const approvalVariant = computed<BadgeVariants["variant"]>(() =>
  props.toolCall.approval?.state === "denied" ? "destructive" : "secondary",
);

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) {
    return t("project.transcript.toolDetails.durationMilliseconds", {
      value: Math.round(durationMs),
    });
  }
  return t("project.transcript.toolDetails.durationSeconds", {
    value: (durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0),
  });
}

function openDialog(): void {
  isOpen.value = true;
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <slot :open="openDialog" />
    <DialogContent class="w-[calc(100vw-2rem)] sm:max-w-4xl">
      <DialogHeader class="pr-12">
        <DialogTitle>{{
          t("project.transcript.toolDetails.title")
        }}</DialogTitle>
        <DialogDescription>
          {{ t("project.transcript.toolDetails.description") }}
        </DialogDescription>
      </DialogHeader>

      <ScrollArea class="max-h-[70vh] w-full min-w-0 pr-4">
        <div class="flex w-full min-w-0 flex-col gap-5">
          <dl
            class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 text-sm"
          >
            <dt class="text-muted-foreground">
              {{ t("project.transcript.toolDetails.status") }}
            </dt>
            <dd>
              <Badge :variant="statusVariant">
                {{ t(`project.transcript.toolDetails.statuses.${statusKey}`) }}
              </Badge>
            </dd>

            <template v-if="approvalKey">
              <dt class="text-muted-foreground">
                {{ t("project.transcript.toolDetails.approval") }}
              </dt>
              <dd>
                <Badge :variant="approvalVariant">
                  {{
                    t(`project.transcript.toolDetails.approvals.${approvalKey}`)
                  }}
                </Badge>
              </dd>
            </template>

            <dt class="text-muted-foreground">
              {{ t("project.transcript.toolDetails.tool") }}
            </dt>
            <dd class="font-mono">{{ toolCall.name }}</dd>

            <dt class="text-muted-foreground">
              {{ t("project.transcript.toolDetails.callId") }}
            </dt>
            <dd class="truncate font-mono" :title="toolCall.id">
              {{ toolCall.id }}
            </dd>

            <template v-if="toolCall.durationMs !== undefined">
              <dt class="text-muted-foreground">
                {{ t("project.transcript.toolDetails.duration") }}
              </dt>
              <dd>{{ formatDuration(toolCall.durationMs) }}</dd>
            </template>
          </dl>

          <template
            v-if="
              toolCall.approval?.state === 'denied' && toolCall.approval.reason
            "
          >
            <Separator />
            <section class="flex flex-col gap-2">
              <h3 class="text-sm font-medium">
                {{ t("project.transcript.toolDetails.rejectionReason") }}
              </h3>
              <pre
                class="overflow-x-auto rounded-xl bg-muted/60 p-3 font-mono text-xs whitespace-pre-wrap"
                >{{ toolCall.approval.reason }}</pre>
            </section>
          </template>

          <Separator />
          <section class="flex flex-col gap-2">
            <h3 class="text-sm font-medium">
              {{ t("project.transcript.toolDetails.parameters") }}
            </h3>
            <ProjectToolValueTable
              :value="toolCall.input"
              :empty-label="t('project.transcript.toolDetails.noParameters')"
            />
          </section>

          <Separator />
          <section class="flex flex-col gap-2">
            <h3 class="text-sm font-medium">
              {{ t("project.transcript.toolDetails.result") }}
            </h3>
            <ProjectToolValueTable
              :value="toolCall.output"
              :empty-label="t('project.transcript.toolDetails.noResult')"
            />
          </section>
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
</template>
