import { describe, expect, it } from "vitest";
import { PINE_SYSTEM_PROMPT } from "../system-prompt";

describe("PINE_SYSTEM_PROMPT", () => {
  it("identifies the agent as Pine instead of the underlying Pi harness", () => {
    expect(PINE_SYSTEM_PROMPT).toContain("You are Pine");
    expect(PINE_SYSTEM_PROMPT).toContain("local-first, open-source");
    expect(PINE_SYSTEM_PROMPT).toContain(
      "expanding possibilities for everyone",
    );
    expect(PINE_SYSTEM_PROMPT).not.toContain("operating inside pi");
  });

  it("preserves Pine's user-control and project-workspace principles", () => {
    expect(PINE_SYSTEM_PROMPT).toContain("Keep the user in control");
    expect(PINE_SYSTEM_PROMPT).toContain("Pine's access boundaries");
    expect(PINE_SYSTEM_PROMPT).toContain("Project-specific instructions");
    expect(PINE_SYSTEM_PROMPT).toContain("technical background");
  });
});
