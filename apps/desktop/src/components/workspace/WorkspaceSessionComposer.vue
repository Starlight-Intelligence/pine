<script setup lang="ts">
import type { Component } from "vue";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  PlusIcon,
  ShieldCheckIcon,
  ShieldIcon,
  ShieldOffIcon,
} from "@lucide/vue";
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Model, ReasoningEffort } from "./workspaceSessionComposerOptions";
import {
  modelOptions,
  reasoningEfforts,
} from "./workspaceSessionComposerOptions";

type ApprovalMode = "ask-for-permission" | "agent-decides" | "yolo";

const approvalModeColorClasses: Record<ApprovalMode, string> = {
  "ask-for-permission": "text-foreground",
  "agent-decides": "text-foreground",
  yolo: "text-destructive",
};
const modelColorClasses: Record<Model, string> = {
  lightweight: "text-composer-model-lightweight",
  balanced: "text-foreground",
  advanced: "text-composer-model-advanced",
};

interface ApprovalModeOption {
  value: ApprovalMode;
  label: string;
  description: string;
  icon: Component;
}

const emit = defineEmits<{
  addContext: [];
  submit: [message: string];
}>();

const message = defineModel<string>({ default: "" });
const approvalMode = defineModel<ApprovalMode>("approvalMode", {
  default: "agent-decides",
});
const model = defineModel<Model>("model", { default: "balanced" });
const reasoningEffort = defineModel<ReasoningEffort>("reasoningEffort", {
  default: "auto",
});

const { t } = useI18n();
const messageId = useId();
const canSubmit = computed(() => message.value.trim().length > 0);
const approvalModes = computed<ApprovalModeOption[]>(() => [
  {
    value: "ask-for-permission",
    label: t("workspace.composer.approval.askForPermissionLabel"),
    description: t("workspace.composer.approval.askForPermission"),
    icon: ShieldIcon,
  },
  {
    value: "agent-decides",
    label: t("workspace.composer.approval.agentDecidesLabel"),
    description: t("workspace.composer.approval.agentDecides"),
    icon: ShieldCheckIcon,
  },
  {
    value: "yolo",
    label: t("workspace.composer.approval.yoloLabel"),
    description: t("workspace.composer.approval.yolo"),
    icon: ShieldOffIcon,
  },
]);
const localizedModelOptions = computed(() =>
  modelOptions.map((option) => ({
    ...option,
    description: t(`workspace.composer.models.${option.value}`),
  })),
);
const selectedApprovalMode = computed(
  () =>
    approvalModes.value.find((option) => option.value === approvalMode.value) ??
    approvalModes.value[1],
);
const selectedModel = computed(
  () =>
    localizedModelOptions.value.find(
      (option) => option.value === model.value,
    ) ?? localizedModelOptions.value[1],
);

function submitMessage(): void {
  const normalizedMessage = message.value.trim();
  if (!normalizedMessage) return;

  emit("submit", normalizedMessage);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;

  event.preventDefault();
  submitMessage();
}
</script>

<template>
  <form
    class="mx-auto w-full max-w-[768px] px-4 pb-4"
    @submit.prevent="submitMessage"
  >
    <label class="sr-only" :for="messageId">
      {{ t("workspace.composer.label") }}
    </label>

    <InputGroup>
      <InputGroupTextarea
        :id="messageId"
        v-model="message"
        class="max-h-48 min-h-12 py-3.5 text-sm"
        :placeholder="t('workspace.composer.placeholder')"
        @keydown="handleKeydown"
      />

      <InputGroupAddon class="self-end" align="inline-start">
        <Tooltip>
          <TooltipTrigger as-child>
            <InputGroupButton
              size="icon-sm"
              variant="outline"
              :aria-label="t('workspace.composer.addContext')"
              @click="emit('addContext')"
            >
              <PlusIcon />
            </InputGroupButton>
          </TooltipTrigger>
          <TooltipContent side="top">
            {{ t("workspace.composer.addContext") }}
          </TooltipContent>
        </Tooltip>
      </InputGroupAddon>

      <InputGroupAddon class="self-end" align="inline-end">
        <Tooltip>
          <TooltipTrigger as-child>
            <InputGroupButton
              size="icon-sm"
              variant="default"
              :disabled="!canSubmit"
              :aria-label="t('workspace.composer.send')"
              @click="submitMessage"
            >
              <ArrowUpIcon />
            </InputGroupButton>
          </TooltipTrigger>
          <TooltipContent side="top">
            {{ t("workspace.composer.send") }}
          </TooltipContent>
        </Tooltip>
      </InputGroupAddon>
    </InputGroup>

    <div class="flex min-w-0 items-center justify-between gap-3 pt-2">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            data-slot="approval-mode-trigger"
            class="min-w-0"
            type="button"
            variant="ghost"
            size="sm"
          >
            <component
              :is="selectedApprovalMode.icon"
              :class="approvalModeColorClasses[selectedApprovalMode.value]"
              data-icon="inline-start"
            />
            <span
              :class="
                cn(
                  'truncate',
                  approvalModeColorClasses[selectedApprovalMode.value],
                )
              "
            >
              {{ selectedApprovalMode.label }}
            </span>
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="top" align="start" class="w-72">
          <DropdownMenuRadioGroup v-model="approvalMode">
            <DropdownMenuRadioItem
              v-for="option in approvalModes"
              :key="option.value"
              :value="option.value"
            >
              <component
                :is="option.icon"
                :class="approvalModeColorClasses[option.value]"
              />
              <span class="flex min-w-0 flex-col gap-0.5">
                <span :class="approvalModeColorClasses[option.value]">
                  {{ option.label }}
                </span>
                <span
                  class="whitespace-normal text-xs font-normal text-muted-foreground"
                >
                  {{ option.description }}
                </span>
              </span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            data-slot="model-selector-trigger"
            class="min-w-0"
            type="button"
            variant="ghost"
            size="sm"
          >
            <span
              :class="cn('truncate', modelColorClasses[selectedModel.value])"
            >
              {{ selectedModel.label }}
            </span>
            <span class="shrink-0 text-muted-foreground">
              · {{ reasoningEffort }}
            </span>
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="top" align="end" class="w-72">
          <DropdownMenuLabel>
            {{ t("workspace.composer.model") }}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup v-model="model">
            <DropdownMenuRadioItem
              v-for="option in localizedModelOptions"
              :key="option.value"
              data-slot="model-option"
              :value="option.value"
            >
              <span class="flex min-w-0 flex-col gap-0.5">
                <span :class="modelColorClasses[option.value]">
                  {{ option.label }}
                </span>
                <span
                  class="whitespace-normal text-xs font-normal text-muted-foreground"
                >
                  {{ option.description }}
                </span>
              </span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-slot="reasoning-effort-trigger">
              <span
                class="flex min-w-0 flex-1 items-center justify-between gap-3"
              >
                <span>{{ t("workspace.composer.reasoningEffort") }}</span>
                <span class="text-muted-foreground">
                  {{ reasoningEffort }}
                </span>
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent class="w-36">
              <DropdownMenuRadioGroup v-model="reasoningEffort">
                <DropdownMenuRadioItem
                  v-for="effort in reasoningEfforts"
                  :key="effort"
                  data-slot="reasoning-effort-option"
                  :value="effort"
                >
                  {{ effort }}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </form>
</template>
