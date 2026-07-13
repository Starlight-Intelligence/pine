<script setup lang="ts">
import { FolderOpen, Loader2, Monitor, Moon, Settings2, Sun } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { isAppLocale, persistAppLocale } from '@/app/i18n';
import { PineCharacter } from '@/components/pine';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import {
  isThemePreference,
  type ThemePreference,
} from '@/composables/useColorScheme';

interface Props {
  isOpening: boolean;
  themePreference: ThemePreference;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  openFolder: [];
  'update:themePreference': [preference: ThemePreference];
}>();

const { locale, t } = useI18n();

function selectLocale(value: unknown): void {
  if (typeof value !== 'string' || !isAppLocale(value)) return;

  locale.value = value;
  document.documentElement.lang = value;
  persistAppLocale(value);
}

function selectTheme(value: unknown): void {
  if (typeof value === 'string' && isThemePreference(value)) {
    emit('update:themePreference', value);
  }
}
</script>

<template>
  <section class="relative flex min-h-full bg-background" aria-labelledby="welcome-title">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button
          class="absolute top-4 right-4"
          variant="ghost"
          size="icon"
          :aria-label="t('welcome.settings')"
          :title="t('welcome.settings')"
        >
          <Settings2 aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent class="w-56" align="end">
        <DropdownMenuLabel>{{ t('welcome.language') }}</DropdownMenuLabel>
        <DropdownMenuRadioGroup :model-value="locale" @update:model-value="selectLocale">
          <DropdownMenuRadioItem value="zh-CN">
            {{ t('welcome.languageChinese') }}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en-US">
            {{ t('welcome.languageEnglish') }}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>{{ t('welcome.appearance') }}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          :model-value="props.themePreference"
          @update:model-value="selectTheme"
        >
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden="true" />
            {{ t('welcome.themeSystem') }}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden="true" />
            {{ t('welcome.themeLight') }}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden="true" />
            {{ t('welcome.themeDark') }}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>

    <Empty class="mx-auto max-w-md px-6">
      <EmptyHeader>
        <PineCharacter decorative size="lg" />
        <EmptyTitle id="welcome-title" role="heading" aria-level="1">
          {{ t('welcome.title') }}
        </EmptyTitle>
      </EmptyHeader>

      <EmptyContent>
        <div class="flex w-full flex-col items-center gap-2">
          <Button
            class="w-full sm:w-auto"
            size="lg"
            :aria-busy="props.isOpening"
            :disabled="props.isOpening"
            @click="emit('openFolder')"
          >
            <Loader2 v-if="props.isOpening" class="animate-spin" aria-hidden="true" />
            <FolderOpen v-else aria-hidden="true" />
            {{ t('welcome.openFolder') }}
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  </section>
</template>
