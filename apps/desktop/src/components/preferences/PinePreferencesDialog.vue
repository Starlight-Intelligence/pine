<script setup lang="ts">
import { SettingsIcon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import { isAppLocale, persistAppLocale } from "@/app/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldTitle } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isThemePreference, useAppearanceStore } from "@/stores/appearance";

const { locale, t } = useI18n();
const appearanceStore = useAppearanceStore();
const { themePreference } = storeToRefs(appearanceStore);

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
</script>

<template>
  <Dialog>
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

    <DialogContent class="sm:max-w-md">
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
      </FieldGroup>
    </DialogContent>
  </Dialog>
</template>
