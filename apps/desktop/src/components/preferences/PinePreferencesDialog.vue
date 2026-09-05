<script setup lang="ts">
import { SettingsIcon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { isAppLocale, persistAppLocale } from "@/app/i18n";
import ModelPickerDialog from "@/components/models/ModelPickerDialog.vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useModelsStore } from "@/stores/models";
import { isThemePreference, useAppearanceStore } from "@/stores/appearance";

const { locale, t } = useI18n();
const appearanceStore = useAppearanceStore();
const modelsStore = useModelsStore();
const { supportsSidebarVibrancy, themePreference } =
  storeToRefs(appearanceStore);
const { utilitySelectedModel } = storeToRefs(modelsStore);
const isOpen = ref(false);
const isUtilityModelPickerOpen = ref(false);

watch(isOpen, (open) => {
  if (open) void modelsStore.load();
});

function updateLocale(value: unknown): void {
  if (typeof value !== "string" || !isAppLocale(value)) return;

  locale.value = value;
  document.documentElement.lang = value;
  persistAppLocale(value);
}

function updateTheme(value: unknown): void {
  if (typeof value !== "string" || !isThemePreference(value)) return;
  appearanceStore.setThemePreference(value);
}

function updateSidebarVibrancy(value: boolean): void {
  appearanceStore.setSidebarVibrancy(value);
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogTrigger as-child>
      <Button
        data-slot="pine-preferences-trigger"
        variant="ghost"
        size="icon-sm"
        :aria-label="t('preferences.open')"
        :title="t('preferences.open')"
      >
        <SettingsIcon />
      </Button>
    </DialogTrigger>

    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t("preferences.title") }}</DialogTitle>
      </DialogHeader>

      <FieldGroup>
        <Field orientation="horizontal">
          <FieldTitle id="pine-language-setting">
            {{ t("preferences.language") }}
          </FieldTitle>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            :model-value="locale"
            aria-labelledby="pine-language-setting"
            @update:model-value="updateLocale"
          >
            <ToggleGroupItem value="zh-CN">
              {{ t("preferences.languageChinese") }}
            </ToggleGroupItem>
            <ToggleGroupItem value="en-US">
              {{ t("preferences.languageEnglish") }}
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Field orientation="horizontal">
          <FieldTitle id="pine-appearance-setting">
            {{ t("preferences.appearance") }}
          </FieldTitle>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            :model-value="themePreference"
            aria-labelledby="pine-appearance-setting"
            @update:model-value="updateTheme"
          >
            <ToggleGroupItem value="system">
              {{ t("preferences.themeSystem") }}
            </ToggleGroupItem>
            <ToggleGroupItem value="light">
              {{ t("preferences.themeLight") }}
            </ToggleGroupItem>
            <ToggleGroupItem value="dark">
              {{ t("preferences.themeDark") }}
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Field orientation="horizontal">
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <FieldTitle id="pine-utility-model-setting">
              {{ t("preferences.utilityModel") }}
            </FieldTitle>
            <FieldDescription>
              {{
                utilitySelectedModel?.name ??
                t("preferences.noUtilityModelSelected")
              }}
            </FieldDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-labelledby="pine-utility-model-setting"
            @click="isUtilityModelPickerOpen = true"
          >
            {{ t("preferences.selectUtilityModel") }}
          </Button>
        </Field>
        <Field v-if="supportsSidebarVibrancy" orientation="horizontal">
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <FieldTitle id="pine-sidebar-vibrancy-setting">
              {{ t("preferences.sidebarVibrancy") }}
            </FieldTitle>
            <FieldDescription>
              {{ t("preferences.sidebarVibrancyDescription") }}
            </FieldDescription>
          </div>
          <Switch
            data-testid="pine-sidebar-vibrancy-toggle"
            :model-value="appearanceStore.sidebarVibrancy"
            aria-labelledby="pine-sidebar-vibrancy-setting"
            @update:model-value="updateSidebarVibrancy"
          />
        </Field>
      </FieldGroup>
    </DialogContent>
  </Dialog>

  <ModelPickerDialog
    v-model:open="isUtilityModelPickerOpen"
    purpose="utility"
  />
</template>
