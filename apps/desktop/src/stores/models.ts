import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import type {
  PineAuthType,
  PineModelCatalog,
  PineModelDescriptor,
  PineModelSelection,
  PineProviderAuthNotice,
  PineProviderAuthPrompt,
  PineProviderDescriptor,
} from "@/shared/models";

interface ProviderLoginState {
  authType: PineAuthType;
  error?: string;
  isRunning: boolean;
  loginId: string;
  notices: PineProviderAuthNotice[];
  prompt?: PineProviderAuthPrompt & { promptId: string };
  providerId: string;
}

export const useModelsStore = defineStore("models", () => {
  const catalog = shallowRef<PineModelCatalog>({ models: [], providers: [] });
  const isLoading = ref(false);
  const login = ref<ProviderLoginState | null>(null);
  let stopAuthEvents: (() => void) | null = null;

  const models = computed(() => catalog.value.models);
  const providers = computed(() => catalog.value.providers);
  const selection = computed(() => catalog.value.selection);
  const selectedModel = computed(() => {
    const selected = selection.value;
    return selected
      ? models.value.find(
          (model) =>
            model.providerId === selected.providerId &&
            model.id === selected.modelId,
        )
      : undefined;
  });
  const configuredProviders = computed(() =>
    providers.value.filter((provider) => provider.configured),
  );

  function connectAuthEvents(): void {
    if (stopAuthEvents) return;
    stopAuthEvents = window.pine.onProviderAuthEvent((event) => {
      if (!login.value || event.loginId !== login.value.loginId) return;
      if (event.type === "provider-auth-prompt") {
        login.value.prompt = {
          ...event.prompt,
          promptId: event.promptId,
        };
      } else {
        login.value.notices.push(event.notice);
      }
    });
  }

  async function load(): Promise<void> {
    isLoading.value = true;
    try {
      catalog.value = await window.pine.getModelCatalog();
    } finally {
      isLoading.value = false;
    }
  }

  async function select(
    model: PineModelDescriptor,
    thinkingLevel?: PineModelSelection["thinkingLevel"],
  ): Promise<void> {
    const nextThinkingLevel =
      thinkingLevel ??
      (model.supportedThinkingLevels.includes(
        selection.value?.thinkingLevel ?? "off",
      )
        ? (selection.value?.thinkingLevel ?? "off")
        : (model.supportedThinkingLevels.at(-1) ?? "off"));
    await window.pine.selectModel({
      providerId: model.providerId,
      modelId: model.id,
      thinkingLevel: nextThinkingLevel,
    });
    catalog.value = {
      ...catalog.value,
      selection: {
        providerId: model.providerId,
        modelId: model.id,
        thinkingLevel: nextThinkingLevel,
      },
    };
  }

  async function setThinkingLevel(
    thinkingLevel: PineModelSelection["thinkingLevel"],
  ): Promise<void> {
    const model = selectedModel.value;
    if (!model) return;
    await select(model, thinkingLevel);
  }

  async function beginLogin(
    provider: PineProviderDescriptor,
    authType: PineAuthType,
  ): Promise<void> {
    connectAuthEvents();
    const loginId = crypto.randomUUID();
    login.value = {
      authType,
      isRunning: true,
      loginId,
      notices: [],
      providerId: provider.id,
    };
    try {
      await window.pine.loginProvider({
        authType,
        loginId,
        providerId: provider.id,
      });
      await load();
      if (login.value?.loginId === loginId) login.value.isRunning = false;
    } catch (error) {
      if (login.value?.loginId === loginId) {
        login.value.isRunning = false;
        login.value.error =
          error instanceof Error ? error.message : String(error);
      }
      throw error;
    }
  }

  async function respondToPrompt(value: string): Promise<void> {
    const activeLogin = login.value;
    const prompt = activeLogin?.prompt;
    if (!activeLogin || !prompt) return;
    const result = await window.pine.respondToProviderAuth({
      loginId: activeLogin.loginId,
      promptId: prompt.promptId,
      value,
    });
    if (result.accepted && login.value?.loginId === activeLogin.loginId) {
      login.value.prompt = undefined;
    }
  }

  async function cancelLogin(): Promise<void> {
    const activeLogin = login.value;
    login.value = null;
    if (activeLogin?.isRunning) {
      await window.pine.cancelProviderAuth({ loginId: activeLogin.loginId });
    }
  }

  function clearLogin(): void {
    if (!login.value?.isRunning) login.value = null;
  }

  async function logout(providerId: string): Promise<void> {
    await window.pine.logoutProvider({ providerId });
    await load();
  }

  return {
    beginLogin,
    cancelLogin,
    catalog,
    clearLogin,
    configuredProviders,
    connectAuthEvents,
    isLoading,
    load,
    login,
    logout,
    models,
    providers,
    respondToPrompt,
    select,
    selectedModel,
    selection,
    setThinkingLevel,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useModelsStore, import.meta.hot));
}
