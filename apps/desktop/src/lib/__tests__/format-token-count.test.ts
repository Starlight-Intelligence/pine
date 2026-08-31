import { describe, expect, it } from "vitest";
import { formatTokenCount } from "../format-token-count";

describe("formatTokenCount", () => {
  it.each([
    [512, "512"],
    [128_000, "128K"],
    [1_500_000, "1.5M"],
  ])("formats %i tokens as %s", (tokens, expected) => {
    expect(formatTokenCount(tokens)).toBe(expected);
  });
});
