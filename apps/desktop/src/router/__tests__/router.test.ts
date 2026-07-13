import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory } from "vue-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceStore } from "@/stores/workspace";
import { createAppRouter } from "../index";
import { ROUTE_NAMES } from "../routes";

describe("workspace navigation guards", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("redirects protected routes to welcome without a workspace", async () => {
    const pinia = createPinia();
    const router = createAppRouter(pinia, createMemoryHistory());

    await router.push({ name: ROUTE_NAMES.workspace });

    expect(router.currentRoute.value.name).toBe(ROUTE_NAMES.welcome);
  });

  it("redirects welcome to the workspace after one is opened", async () => {
    const pinia = createPinia();
    const store = useWorkspaceStore(pinia);
    store.currentWorkspace = {
      id: "9ab0b15f-331f-4aa6-8056-cd2be3bf7414",
      name: "pine",
      rootPath: "/workspace/pine",
    };
    const router = createAppRouter(pinia, createMemoryHistory());

    await router.push({ name: ROUTE_NAMES.welcome });

    expect(router.currentRoute.value.name).toBe(ROUTE_NAMES.workspace);
  });
});
