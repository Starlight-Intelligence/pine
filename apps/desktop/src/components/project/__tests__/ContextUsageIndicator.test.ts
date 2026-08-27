import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "@/app/i18n";
import { useSessionStore } from "@/stores/session";
import ContextUsageIndicator from "../ContextUsageIndicator.vue";

function mountIndicator() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return {
    store: useSessionStore(),
    wrapper: mount(ContextUsageIndicator, {
      global: { plugins: [pinia, createAppI18n("zh-CN")] },
    }),
  };
}

describe("ContextUsageIndicator", () => {
  it("renders an empty ring with 0% before usage is known", () => {
    const { wrapper } = mountIndicator();
    const trigger = wrapper.get('[data-slot="context-usage-trigger"]');
    expect(trigger.text()).toContain("0%");
    // No progress circle is drawn, leaving only the track ring.
    expect(trigger.find("circle[stroke-dasharray]").exists()).toBe(false);
    expect(trigger.findAll("circle").length).toBe(1);
  });

  it("shows the rounded percentage next to a ring", async () => {
    const { store, wrapper } = mountIndicator();
    store.contextUsage = {
      tokens: 86_400,
      contextWindow: 200_000,
      percent: 43.2,
      cost: 0.1234,
    };
    await nextTick();

    const trigger = wrapper.get('[data-slot="context-usage-trigger"]');
    expect(trigger.text()).toContain("43%");
    // Ring progress is drawn via stroke-dashoffset on the progress circle.
    const progress = trigger.get("circle[stroke-dasharray]");
    const dashArray = Number(progress.attributes("stroke-dasharray"));
    expect(Number(progress.attributes("stroke-dashoffset"))).toBeCloseTo(
      dashArray * (1 - 0.432),
    );
  });

  it("switches to the destructive tone past 80% usage", async () => {
    const { store, wrapper } = mountIndicator();
    store.contextUsage = {
      tokens: 180_000,
      contextWindow: 200_000,
      percent: 90,
      cost: 0.5,
    };
    await nextTick();
    expect(
      wrapper.get('[data-slot="context-usage-trigger"]').classes(),
    ).toContain("text-destructive");
  });
});
