import { defineStore } from "pinia";
import { ref } from "vue";

export const THEME_PREFERENCE_STORAGE_KEY = "pine.theme-preference";

export type ColorScheme = "light" | "dark";
export type ThemePreference = "system" | ColorScheme;

export function isThemePreference(
  value: string | null,
): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function readStoredThemePreference(): ThemePreference {
  try {
    const storedPreference = window.localStorage.getItem(
      THEME_PREFERENCE_STORAGE_KEY,
    );
    return isThemePreference(storedPreference) ? storedPreference : "system";
  } catch {
    return "system";
  }
}

export const useAppearanceStore = defineStore("appearance", () => {
  const themePreference = ref<ThemePreference>(readStoredThemePreference());
  const colorScheme = ref<ColorScheme>("light");

  let isInitialized = false;
  let mediaQuery: MediaQueryList | null = null;

  function applyColorScheme(): void {
    const isDark =
      themePreference.value === "dark" ||
      (themePreference.value === "system" && mediaQuery?.matches === true);
    const nextColorScheme: ColorScheme = isDark ? "dark" : "light";

    colorScheme.value = nextColorScheme;
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = nextColorScheme;
  }

  function handleSystemColorSchemeChange(): void {
    if (themePreference.value === "system") applyColorScheme();
  }

  function initialize(): void {
    if (isInitialized) return;

    isInitialized = true;
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", handleSystemColorSchemeChange);
    applyColorScheme();
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

  return {
    colorScheme,
    initialize,
    setThemePreference,
    themePreference,
  };
});
