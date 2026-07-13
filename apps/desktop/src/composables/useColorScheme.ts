import { onMounted, onUnmounted, readonly, ref, type Ref } from 'vue';

export const THEME_PREFERENCE_STORAGE_KEY = 'pine.theme-preference';

export type ColorScheme = 'light' | 'dark';
export type ThemePreference = 'system' | ColorScheme;

export interface ColorSchemeController {
  colorScheme: Readonly<Ref<ColorScheme>>;
  setThemePreference: (preference: ThemePreference) => void;
  themePreference: Readonly<Ref<ThemePreference>>;
}

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function readStoredThemePreference(): ThemePreference {
  try {
    const storedPreference = window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
    return isThemePreference(storedPreference) ? storedPreference : 'system';
  } catch {
    return 'system';
  }
}

export function useColorScheme(): ColorSchemeController {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const themePreference = ref<ThemePreference>(readStoredThemePreference());
  const colorScheme = ref<ColorScheme>('light');

  function applyColorScheme(): void {
    const isDark =
      themePreference.value === 'dark' ||
      (themePreference.value === 'system' && mediaQuery.matches);
    const nextColorScheme: ColorScheme = isDark ? 'dark' : 'light';

    colorScheme.value = nextColorScheme;
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = nextColorScheme;
  }

  function setThemePreference(preference: ThemePreference): void {
    themePreference.value = preference;
    applyColorScheme();

    try {
      window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
    } catch {
      // The selected theme still applies for this session if storage is unavailable.
    }
  }

  function handleSystemColorSchemeChange(): void {
    if (themePreference.value === 'system') applyColorScheme();
  }

  applyColorScheme();

  onMounted(() => {
    mediaQuery.addEventListener('change', handleSystemColorSchemeChange);
  });

  onUnmounted(() => {
    mediaQuery.removeEventListener('change', handleSystemColorSchemeChange);
  });

  return {
    colorScheme: readonly(colorScheme),
    setThemePreference,
    themePreference: readonly(themePreference),
  };
}
