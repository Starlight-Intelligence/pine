<script setup lang="ts">
import type { Component } from "vue";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  SearchIcon,
  ShieldCheckIcon,
  ShieldIcon,
  ShieldOffIcon,
  SquareIcon,
} from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import ModelPickerDialog from "@/components/models/ModelPickerDialog.vue";
import ContextUsageIndicator from "@/components/project/ContextUsageIndicator.vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
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
import type { PineThinkingLevel } from "@/shared/models";
import { pineModelKey, useModelsStore } from "@/stores/models";

type ApprovalMode = "ask-for-permission" | "agent-decides" | "yolo";

const approvalModeColorClasses: Record<ApprovalMode, string> = {
  "ask-for-permission": "text-foreground",
  "agent-decides": "text-foreground",
  yolo: "text-destructive",
};
interface ApprovalModeOption {
  value: ApprovalMode;
  label: string;
  description: string;
  icon: Component;
}

const emit = defineEmits<{
  abort: [];
  submit: [message: string];
}>();

const props = withDefaults(
  defineProps<{
    isRunning?: boolean;
  }>(),
  { isRunning: false },
);

const message = defineModel<string>({ default: "" });
const approvalMode = defineModel<ApprovalMode>("approvalMode", {
  default: "agent-decides",
});
const { t } = useI18n();
const modelsStore = useModelsStore();
const { favoriteModels, featuredModels, selectedModel, selection } =
  storeToRefs(modelsStore);
const messageId = useId();
const isModelPickerOpen = ref(false);
const canSubmit = computed(
  () =>
    props.isRunning ||
    (message.value.trim().length > 0 && selectedModel.value !== undefined),
);
const approvalModes = computed<ApprovalModeOption[]>(() => [
  {
    value: "ask-for-permission",
    label: t("project.composer.approval.askForPermissionLabel"),
    description: t("project.composer.approval.askForPermission"),
    icon: ShieldIcon,
  },
  {
    value: "agent-decides",
    label: t("project.composer.approval.agentDecidesLabel"),
    description: t("project.composer.approval.agentDecides"),
    icon: ShieldCheckIcon,
  },
  {
    value: "yolo",
    label: t("project.composer.approval.yoloLabel"),
    description: t("project.composer.approval.yolo"),
    icon: ShieldOffIcon,
  },
]);
const selectedApprovalMode = computed(
  () =>
    approvalModes.value.find((option) => option.value === approvalMode.value) ??
    approvalModes.value[1],
);
const thinkingLevels = computed(
  () => selectedModel.value?.supportedThinkingLevels ?? [],
);

onMounted(() => void modelsStore.load());

function submitMessage(): void {
  if (props.isRunning) {
    emit("abort");
    return;
  }
  const normalizedMessage = message.value.trim();
  if (!normalizedMessage) return;

  emit("submit", normalizedMessage);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;

  event.preventDefault();
  submitMessage();
}

function updateThinkingLevel(value: unknown): void {
  if (
    typeof value !== "string" ||
    !thinkingLevels.value.includes(value as PineThinkingLevel)
  ) {
    return;
  }
  void modelsStore.setThinkingLevel(value as PineThinkingLevel);
}

function selectFeaturedModel(value: unknown): void {
  if (typeof value !== "string") return;
  const model = featuredModels.value.find(
    (candidate) => pineModelKey(candidate) === value,
  );
  if (model) void modelsStore.select(model);
}

function openModelPicker(): void {
  window.setTimeout(() => {
    isModelPickerOpen.value = true;
  });
}
</script>

<template>
  <form
    class="mx-auto w-full max-w-[var(--session-composer-max-width)] px-[var(--session-composer-gutter)] pb-4"
    @submit.prevent="submitMessage"
  >
    <label class="sr-only" :for="messageId">
      {{ t("project.composer.label") }}
    </label>

    <InputGroup>
      <InputGroupTextarea
        :id="messageId"
        v-model="message"
        class="session-composer-input max-h-48 min-h-12 py-3.5 text-sm"
        :placeholder="t('project.composer.placeholder')"
        @keydown="handleKeydown"
      />

      <InputGroupAddon class="self-end" align="inline-end">
        <Tooltip>
          <TooltipTrigger as-child>
            <InputGroupButton
              size="icon-sm"
              variant="default"
              :disabled="!canSubmit"
              :aria-label="
                props.isRunning
                  ? t('project.composer.stop')
                  : t('project.composer.send')
              "
              @click="submitMessage"
            >
              <SquareIcon v-if="props.isRunning" />
              <ArrowUpIcon v-else />
            </InputGroupButton>
          </TooltipTrigger>
          <TooltipContent side="top">
            {{
              props.isRunning
                ? t("project.composer.stop")
                : t("project.composer.send")
            }}
          </TooltipContent>
        </Tooltip>
      </InputGroupAddon>
    </InputGroup>

    <div class="flex min-w-0 items-center justify-between gap-3 pt-2">
      <div class="flex min-w-0 items-center gap-1">
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

        <ContextUsageIndicator />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            data-slot="model-selector-trigger"
            class="min-w-0"
            type="button"
            variant="ghost"
            size="sm"
          >
            <span class="truncate">
              {{ selectedModel?.name ?? t("project.composer.selectModel") }}
            </span>
            <span
              v-if="selectedModel && selection"
              class="shrink-0 text-muted-foreground"
            >
              · {{ t(`models.thinkingLevels.${selection.thinkingLevel}`) }}
            </span>
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="top" align="end" class="w-72">
          <template v-if="featuredModels.length > 0">
            <DropdownMenuLabel>
              {{
                favoriteModels.length > 0
                  ? t("models.favorites")
                  : t("models.recent")
              }}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              :model-value="selectedModel ? pineModelKey(selectedModel) : ''"
              @update:model-value="selectFeaturedModel"
            >
              <DropdownMenuRadioItem
                v-for="model in featuredModels"
                :key="pineModelKey(model)"
                data-slot="model-option"
                :value="pineModelKey(model)"
              >
                <span class="flex min-w-0 flex-col gap-0.5">
                  <span class="truncate">{{ model.name }}</span>
                  <span class="truncate text-xs text-muted-foreground">
                    {{ model.providerName }}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </template>

          <DropdownMenuGroup>
            <DropdownMenuItem @select="openModelPicker">
              <SearchIcon />
              {{ t("models.picker.browse") }}
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <template v-if="selectedModel && thinkingLevels.length > 1">
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-slot="reasoning-effort-trigger">
                <span class="flex min-w-0 flex-1 justify-between gap-3">
                  <span>{{ t("models.reasoning") }}</span>
                  <span class="text-muted-foreground">
                    {{
                      selection
                        ? t(`models.thinkingLevels.${selection.thinkingLevel}`)
                        : ""
                    }}
                  </span>
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent class="w-36">
                <DropdownMenuRadioGroup
                  :model-value="selection?.thinkingLevel"
                  @update:model-value="updateThinkingLevel"
                >
                  <DropdownMenuRadioItem
                    v-for="level in thinkingLevels"
                    :key="level"
                    data-slot="reasoning-effort-option"
                    :value="level"
                  >
                    {{ t(`models.thinkingLevels.${level}`) }}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </template>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <ModelPickerDialog v-model:open="isModelPickerOpen" />
  </form>
</template>

<style scoped>
.session-composer-input {
  padding-inline: var(--session-input-padding-inline, 0.75rem);
}
</style>
