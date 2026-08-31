import { describe, expect, it } from "vitest";
import { resolveProviderIcon } from "@/lib/provider-icons";

describe("resolveProviderIcon", () => {
  it.each([
    "deepseek",
    "amazon-bedrock",
    "openai-codex",
    "google-vertex",
    "cloudflare-workers-ai",
    "xiaomi-token-plan-sgp",
    "zai-coding-cn",
  ])("maps Pine provider %s to a LobeHub icon", (providerId) => {
    expect(resolveProviderIcon(providerId)?.src).toMatch(
      /^data:image\/svg\+xml,/,
    );
  });

  it("falls back to the provider display name", () => {
    expect(resolveProviderIcon("custom-provider", "Z.AI")?.src).toBe(
      resolveProviderIcon("zai")?.src,
    );
  });

  it("leaves unknown providers without a brand icon", () => {
    expect(resolveProviderIcon("custom-provider", "Acme AI")).toBeUndefined();
  });
});
