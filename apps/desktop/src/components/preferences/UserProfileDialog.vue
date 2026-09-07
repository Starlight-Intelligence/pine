<script setup lang="ts">
import { handleError } from "@/app/errors/errorHandler";
import { computed, onMounted, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  createDefaultPineUserProfile,
  isPineCommunicationStyle,
  isPineTechnicalBackground,
  type PineUserProfile,
} from "@/shared/userProfile";
import { useUserProfileStore } from "@/stores/userProfile";

const open = defineModel<boolean>("open", { default: false });
const { t } = useI18n();
const userProfileStore = useUserProfileStore();
const draft = reactive<PineUserProfile>(createDefaultPineUserProfile());

const communicationStyleDescription = computed(() =>
  t(
    draft.communicationStyle === "calm-professional"
      ? "preferences.userProfileStyleCalmDescription"
      : "preferences.userProfileStyleWarmDescription",
  ),
);
const technicalBackgroundDescription = computed(() =>
  t(
    draft.technicalBackground === "general-user"
      ? "preferences.userProfileTechGeneralDescription"
      : draft.technicalBackground === "enthusiast"
        ? "preferences.userProfileTechEnthusiastDescription"
        : "preferences.userProfileTechProfessionalDescription",
  ),
);

watch(open, (isOpen) => {
  if (isOpen) void loadProfile();
});

onMounted(() => {
  void loadProfile();
});

async function loadProfile(): Promise<void> {
  try {
    await userProfileStore.load();
    Object.assign(draft, userProfileStore.profile);
  } catch (error) {
    handleError(error, {
      id: "user-profile.load",
      title: t("errors.userProfile.title"),
      description: t("errors.userProfile.description"),
    });
  }
}

function updateCommunicationStyle(value: unknown): void {
  if (typeof value === "string" && isPineCommunicationStyle(value)) {
    draft.communicationStyle = value;
  }
}

function updateTechnicalBackground(value: unknown): void {
  if (typeof value === "string" && isPineTechnicalBackground(value)) {
    draft.technicalBackground = value;
  }
}

async function saveProfile(): Promise<void> {
  try {
    await userProfileStore.save({ ...draft });
    open.value = false;
  } catch (error) {
    handleError(error, {
      id: "user-profile.save",
      title: t("errors.userProfile.title"),
      description: t("errors.userProfile.description"),
    });
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent
      data-testid="pine-user-profile-dialog"
      class="h-[min(85vh,52rem)] max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl"
    >
      <form
        class="flex h-full min-h-0 flex-col gap-6"
        @submit.prevent="saveProfile"
      >
        <DialogHeader class="px-6 pt-6 pr-16">
          <DialogTitle>
            {{ t("preferences.userProfileDialogTitle") }}
          </DialogTitle>
          <DialogDescription>
            {{ t("preferences.userProfileDialogDescription") }}
          </DialogDescription>
        </DialogHeader>

        <div class="scroll-fade min-h-0 flex-1 overflow-y-auto px-6">
          <FieldGroup class="gap-5 pb-1">
            <Field>
              <FieldLabel for="pine-user-profile-nickname">
                {{ t("preferences.userProfileNicknameLabel") }}
              </FieldLabel>
              <Input
                id="pine-user-profile-nickname"
                v-model="draft.nickname"
                maxlength="100"
                autocomplete="nickname"
                :placeholder="t('preferences.userProfileNicknamePlaceholder')"
              />
              <FieldDescription>
                {{ t("preferences.userProfileNicknameDescription") }}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel id="pine-user-profile-style-label">
                {{ t("preferences.userProfileStyleLabel") }}
              </FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                :spacing="2"
                class="w-full"
                :model-value="draft.communicationStyle"
                aria-labelledby="pine-user-profile-style-label"
                @update:model-value="updateCommunicationStyle"
              >
                <ToggleGroupItem value="calm-professional" class="flex-1">
                  {{ t("preferences.userProfileStyleCalm") }}
                </ToggleGroupItem>
                <ToggleGroupItem value="warm-friendly" class="flex-1">
                  {{ t("preferences.userProfileStyleWarm") }}
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                {{ communicationStyleDescription }}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel id="pine-user-profile-background-label">
                {{ t("preferences.userProfileTechLabel") }}
              </FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                :spacing="2"
                class="w-full"
                :model-value="draft.technicalBackground"
                aria-labelledby="pine-user-profile-background-label"
                @update:model-value="updateTechnicalBackground"
              >
                <ToggleGroupItem value="general-user" class="flex-1">
                  {{ t("preferences.userProfileTechGeneral") }}
                </ToggleGroupItem>
                <ToggleGroupItem value="enthusiast" class="flex-1">
                  {{ t("preferences.userProfileTechEnthusiast") }}
                </ToggleGroupItem>
                <ToggleGroupItem value="professional-user" class="flex-1">
                  {{ t("preferences.userProfileTechProfessional") }}
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                {{ technicalBackgroundDescription }}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel for="pine-user-profile-details">
                {{ t("preferences.userProfileDetailsLabel") }}
              </FieldLabel>
              <Textarea
                id="pine-user-profile-details"
                v-model="draft.personalDetails"
                maxlength="10000"
                rows="4"
                :placeholder="t('preferences.userProfileDetailsPlaceholder')"
              />
              <FieldDescription>
                {{ t("preferences.userProfileDetailsDescription") }}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel for="pine-user-profile-instructions">
                {{ t("preferences.userProfileInstructionsLabel") }}
              </FieldLabel>
              <Textarea
                id="pine-user-profile-instructions"
                v-model="draft.customInstructions"
                maxlength="20000"
                rows="6"
                :placeholder="
                  t('preferences.userProfileInstructionsPlaceholder')
                "
              />
              <FieldDescription>
                {{ t("preferences.userProfileInstructionsDescription") }}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </div>

        <DialogFooter class="px-6 pb-6">
          <Button
            type="button"
            variant="outline"
            :disabled="userProfileStore.isSaving"
            @click="open = false"
          >
            {{ t("common.cancel") }}
          </Button>
          <Button type="submit" :disabled="userProfileStore.isSaving">
            <Spinner
              v-if="userProfileStore.isSaving"
              data-icon="inline-start"
            />
            {{
              userProfileStore.isSaving
                ? t("common.saving")
                : t("preferences.saveUserProfile")
            }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
