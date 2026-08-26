import { defineStore } from "pinia";
import { ref } from "vue";

export const THEME_PREFERENCE_STORAGE_KEY = "pine.theme-preference";
export const SIDEBAR_VIBRANCY_STORAGE_KEY = "pine.sidebar-vibrancy";
export const SIDEBAR_VIBRANCY_CLASS = "sidebar-vibrancy";

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

function readStoredSidebarVibrancy(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_VIBRANCY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function isMacOSPlatform(): boolean {
  return window.pine?.platform === "darwin";
}

export const useAppearanceStore = defineStore("appearance", () => {
  const themePreference = ref<ThemePreference>(readStoredThemePreference());
  const colorScheme = ref<ColorScheme>("light");
  const supportsSidebarVibrancy = ref(isMacOSPlatform());
  const sidebarVibrancy = ref(false);

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

  function applySidebarVibrancy(): void {
    document.documentElement.classList.toggle(
      SIDEBAR_VIBRANCY_CLASS,
      sidebarVibrancy.value,
    );
    void window.pine?.setSidebarVibrancy({ enabled: sidebarVibrancy.value });
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
    if (supportsSidebarVibrancy.value) {
      sidebarVibrancy.value = readStoredSidebarVibrancy();
      applySidebarVibrancy();
    }
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

  function setSidebarVibrancy(enabled: boolean): void {
    if (!supportsSidebarVibrancy.value) return;

    sidebarVibrancy.value = enabled;
    applySidebarVibrancy();

    try {
      window.localStorage.setItem(
        SIDEBAR_VIBRANCY_STORAGE_KEY,
        enabled ? "true" : "false",
      );
    } catch {
      // The selected vibrancy state still applies for this session if storage
      // is unavailable.
    }
  }

  return {
    colorScheme,
    initialize,
    setThemePreference,
    sidebarVibrancy,
    setSidebarVibrancy,
    supportsSidebarVibrancy,
    themePreference,
  };
});
