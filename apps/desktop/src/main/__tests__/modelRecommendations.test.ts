import { describe, expect, it, vi } from "vitest";
import { ModelRecommendationService } from "../modelRecommendations";

describe("ModelRecommendationService", () => {
  it("loads, validates, deduplicates, and caches model IDs", async () => {
    let now = 1_000;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify(["glm-5.3-flash", "glm-5.3-flash", "deepseek-v4"]),
          { status: 200 },
        ),
      );
    const service = new ModelRecommendationService({
      fetch,
      now: () => now,
      ttlMs: 1_000,
    });

    await expect(service.get()).resolves.toEqual([
      "glm-5.3-flash",
      "deepseek-v4",
    ]);
    now += 999;
    await service.get();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the last successful list when a refresh fails", async () => {
    let now = 1_000;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(["glm-5.3-flash"]), { status: 200 }),
      )
      .mockRejectedValueOnce(new Error("offline"));
    const service = new ModelRecommendationService({
      fetch,
      now: () => now,
      ttlMs: 1_000,
    });

    await service.get();
    now += 1_000;

    await expect(service.get()).resolves.toEqual(["glm-5.3-flash"]);
  });

  it("rejects malformed payloads without affecting model loading", async () => {
    const service = new ModelRecommendationService({
      fetch: vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ id: "glm" }))),
    });

    await expect(service.get()).resolves.toEqual([]);
  });
});
