import { describe, expect, it, vi } from "vitest";
import { ModelMetadataService } from "../modelMetadata";

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

describe("ModelMetadataService", () => {
  it("maps models.dev capabilities and limits", async () => {
    const fetchMetadata = vi.fn().mockResolvedValue(
      response({
        "openai/gpt-test": {
          id: "openai/gpt-test",
          limit: { context: 200_000, output: 32_000 },
          modalities: { input: ["text", "image"], output: ["text"] },
          name: "GPT Test",
          reasoning: true,
        },
      }),
    );
    const service = new ModelMetadataService(fetchMetadata);

    await expect(
      service.lookup({ modelId: "gpt-test", providerId: "openai" }),
    ).resolves.toEqual({
      contextWindow: 200_000,
      maxTokens: 32_000,
      modelName: "GPT Test",
      sourceId: "openai/gpt-test",
      thinkingLevels: ["off", "low", "high", "max"],
      vision: true,
    });
    expect(fetchMetadata).toHaveBeenCalledOnce();
  });

  it("rejects ambiguous suffix matches", async () => {
    const service = new ModelMetadataService(
      vi.fn().mockResolvedValue(
        response({
          "one/shared": { name: "One", reasoning: false },
          "two/shared": { name: "Two", reasoning: false },
        }),
      ),
    );

    await expect(service.lookup({ modelId: "shared" })).rejects.toThrow(
      "Multiple models.dev entries",
    );
  });
});
