import { describe, expect, it } from "vitest";
import { shouldAnimateFollow } from "../useMessageScroller";

describe("shouldAnimateFollow", () => {
  it("only glides when the caller asks for animation and the turn is live", () => {
    expect(shouldAnimateFollow(true, true)).toBe(true);
  });

  it("snaps (no animation) when a finished conversation is entered/returned", () => {
    expect(shouldAnimateFollow(true, false)).toBe(false);
  });

  it("never animates when the caller passes animated=false", () => {
    expect(shouldAnimateFollow(false, true)).toBe(false);
    expect(shouldAnimateFollow(false, false)).toBe(false);
  });
});
