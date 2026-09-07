import { defineStore } from "pinia";
import { ref } from "vue";
import {
  createDefaultPineUserProfile,
  normalizePineUserProfile,
  type PineUserProfile,
} from "@/shared/userProfile";

export const useUserProfileStore = defineStore("userProfile", () => {
  const profile = ref<PineUserProfile>(createDefaultPineUserProfile());
  const isLoaded = ref(false);
  const isSaving = ref(false);
  let loadPromise: Promise<void> | null = null;

  function load(): Promise<void> {
    if (isLoaded.value) return Promise.resolve();
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        if (typeof window.pine?.getUserProfile === "function") {
          profile.value = normalizePineUserProfile(
            await window.pine.getUserProfile(),
          );
        }
      } finally {
        isLoaded.value = true;
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  async function save(nextProfile: PineUserProfile): Promise<void> {
    const normalized = normalizePineUserProfile(nextProfile);
    isSaving.value = true;
    try {
      if (typeof window.pine?.setUserProfile === "function") {
        await window.pine.setUserProfile(normalized);
      }
      profile.value = normalized;
      isLoaded.value = true;
    } finally {
      isSaving.value = false;
    }
  }

  return { isLoaded, isSaving, load, profile, save };
});
