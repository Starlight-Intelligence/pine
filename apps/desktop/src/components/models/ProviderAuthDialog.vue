<script setup lang="ts">
import { ExternalLinkIcon, KeyRoundIcon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PineAuthType, PineProviderDescriptor } from "@/shared/models";
import { useModelsStore } from "@/stores/models";

const props = defineProps<{
  open: boolean;
  provider: PineProviderDescriptor | null;
}>();
const emit = defineEmits<{
  connected: [];
  "update:open": [open: boolean];
}>();

const { t } = useI18n();
const modelsStore = useModelsStore();
const { login } = storeToRefs(modelsStore);
const authType = ref<PineAuthType | undefined>();
const response = ref("");
const isStarting = ref(false);
const activePrompt = computed(() => login.value?.prompt);
const isComplete = computed(
  () => login.value && !login.value.isRunning && !login.value.error,
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    authType.value =
      props.provider?.authMethods.length === 1
        ? props.provider.authMethods[0]?.type
        : undefined;
    response.value = "";
    modelsStore.clearLogin();
    if (authType.value) void startLogin();
  },
);

watch(
  () => activePrompt.value?.promptId,
  () => {
    response.value = "";
  },
);

async function startLogin(): Promise<void> {
  if (!props.provider || !authType.value || isStarting.value) return;
  isStarting.value = true;
  try {
    await modelsStore.beginLogin(props.provider, authType.value);
    emit("connected");
  } catch {
    // The store exposes the provider error in the dialog.
  } finally {
    isStarting.value = false;
  }
}

async function submitPrompt(): Promise<void> {
  if (!activePrompt.value || !response.value) return;
  await modelsStore.respondToPrompt(response.value);
  response.value = "";
}

async function updateOpen(open: boolean): Promise<void> {
  if (!open) await modelsStore.cancelLogin();
  emit("update:open", open);
}

function openUrl(url: string): void {
  void window.pine.openProviderAuthUrl(url);
}
</script>

<template>
  <Dialog :open="open" @update:open="updateOpen">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {{ t("providers.auth.title", { provider: provider?.name ?? "" }) }}
        </DialogTitle>
      </DialogHeader>

      <FieldGroup v-if="provider && !login && provider.authMethods.length > 1">
        <Field>
          <FieldLabel>{{ t("providers.auth.method") }}</FieldLabel>
          <ToggleGroup
            v-model="authType"
            type="single"
            variant="outline"
            class="justify-start"
          >
            <ToggleGroupItem
              v-for="method in provider.authMethods"
              :key="method.type"
              :value="method.type"
            >
              <KeyRoundIcon />
              {{ method.label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </FieldGroup>

      <div v-else-if="login" class="flex flex-col gap-4">
        <div
          v-for="(notice, index) in login.notices"
          :key="index"
          class="flex flex-col gap-2 text-sm"
        >
          <p v-if="notice.type === 'info' || notice.type === 'progress'">
            {{ notice.message }}
          </p>
          <template v-if="notice.type === 'info'">
            <Button
              v-for="link in notice.links"
              :key="link.url"
              type="button"
              variant="outline"
              class="self-start"
              @click="openUrl(link.url)"
            >
              <ExternalLinkIcon data-icon="inline-start" />
              {{ link.label ?? t("providers.auth.openBrowser") }}
            </Button>
          </template>
          <template v-else-if="notice.type === 'auth_url'">
            <p v-if="notice.instructions">{{ notice.instructions }}</p>
            <Button
              type="button"
              variant="outline"
              class="self-start"
              @click="openUrl(notice.url)"
            >
              <ExternalLinkIcon data-icon="inline-start" />
              {{ t("providers.auth.openBrowser") }}
            </Button>
          </template>
          <template v-else-if="notice.type === 'device_code'">
            <p>{{ t("providers.auth.deviceCode") }}</p>
            <Badge variant="secondary">{{ notice.userCode }}</Badge>
            <Button
              type="button"
              variant="outline"
              class="self-start"
              @click="openUrl(notice.verificationUri)"
            >
              <ExternalLinkIcon data-icon="inline-start" />
              {{ t("providers.auth.openBrowser") }}
            </Button>
          </template>
        </div>

        <Field v-if="activePrompt">
          <FieldLabel>{{ activePrompt.message }}</FieldLabel>
          <Select v-if="activePrompt.type === 'select'" v-model="response">
            <SelectTrigger>
              <SelectValue :placeholder="t('providers.auth.chooseOption')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem
                  v-for="option in activePrompt.options"
                  :key="option.id"
                  :value="option.id"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input
            v-else
            v-model="response"
            :type="activePrompt.type === 'secret' ? 'password' : 'text'"
            :placeholder="activePrompt.placeholder"
            autocomplete="off"
            autofocus
            @keydown.enter.prevent="submitPrompt"
          />
          <FieldDescription v-if="activePrompt.type === 'manual_code'">
            {{ t("providers.auth.manualCodeDescription") }}
          </FieldDescription>
        </Field>

        <p v-if="login.error" class="text-sm text-destructive">
          {{ login.error }}
        </p>
        <p v-else-if="isComplete" class="text-sm">
          {{ t("providers.auth.connected") }}
        </p>
        <span
          v-else-if="login.isRunning && !activePrompt"
          class="inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Spinner />
          {{ t("providers.auth.waiting") }}
        </span>
      </div>

      <DialogFooter>
        <Button
          v-if="!login && provider && provider.authMethods.length > 1"
          type="button"
          :disabled="!authType || isStarting"
          @click="startLogin"
        >
          <Spinner v-if="isStarting" data-icon="inline-start" />
          {{ t("providers.auth.continue") }}
        </Button>
        <Button
          v-else-if="activePrompt"
          type="button"
          :disabled="!response"
          @click="submitPrompt"
        >
          {{ t("providers.auth.continue") }}
        </Button>
        <Button
          v-else-if="isComplete || login?.error"
          type="button"
          @click="updateOpen(false)"
        >
          {{ t("common.done") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
