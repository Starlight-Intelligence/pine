import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PineModelCatalog, PineModelDescriptor } from "@/shared/models";
import {
  MODEL_FAVORITES_STORAGE_KEY,
  MODEL_RECENTS_STORAGE_KEY,
  defaultThinkingLevel,
  pineModelKey,
  useModelsStore,
} from "../models";

const alpha: PineModelDescriptor = {
  api: "test",
  contextWindow: 128_000,
  id: "alpha",
  input: ["text"],
  maxTokens: 8_192,
  name: "Alpha",
  providerId: "provider",
  providerName: "Provider",
  reasoning: true,
  supportedThinkingLevels: ["off", "high"],
};

const beta: PineModelDescriptor = {
  ...alpha,
  id: "beta",
  name: "Beta",
};

const catalog: PineModelCatalog = {
  models: [alpha, beta],
  providers: [
    {
      authMethods: [{ label: "API key", type: "api_key" }],
      configured: true,
      id: "provider",
      modelCount: 2,
      name: "Provider",
    },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  setActivePinia(createPinia());
  Object.defineProperty(window, "pine", {
    configurable: true,
    value: {
      selectModel: vi.fn().mockResolvedValue(undefined),
    },
  });
});

describe("models store lists", () => {
  it("shows recent models until the user has favorites", async () => {
    const store = useModelsStore();
    store.catalog = catalog;

    await store.select(alpha);
    await store.select(beta);

    expect(store.recentModels).toEqual([beta, alpha]);
    expect(store.featuredModels).toEqual([beta, alpha]);
    expect(
      JSON.parse(localStorage.getItem(MODEL_RECENTS_STORAGE_KEY) ?? "[]"),
    ).toEqual([pineModelKey(beta), pineModelKey(alpha)]);

    store.toggleFavorite(alpha);

    expect(store.favoriteModels).toEqual([alpha]);
    expect(store.featuredModels).toEqual([alpha]);
    expect(
      JSON.parse(localStorage.getItem(MODEL_FAVORITES_STORAGE_KEY) ?? "[]"),
    ).toEqual([pineModelKey(alpha)]);
  });

  it("restores favorites from Pine local storage", () => {
    localStorage.setItem(
      MODEL_FAVORITES_STORAGE_KEY,
      JSON.stringify([pineModelKey(beta)]),
    );
    const store = useModelsStore();
    store.catalog = catalog;

    expect(store.favoriteModels).toEqual([beta]);

    store.toggleFavorite(beta);

    expect(store.favoriteModels).toEqual([]);
  });
});

describe("defaultThinkingLevel", () => {
  it.each([
    [["off", "high", "medium"], "medium"],
    [["off", "low", "high"], "high"],
    [["off", "low", "xhigh"], "low"],
    [["off", "max", "xhigh"], "xhigh"],
    [["off", "max"], "max"],
    [["off", "minimal"], "off"],
    [["off"], "off"],
  ] as const)("chooses %s as %s", (supported, expected) => {
    expect(defaultThinkingLevel(supported)).toBe(expected);
  });
});
