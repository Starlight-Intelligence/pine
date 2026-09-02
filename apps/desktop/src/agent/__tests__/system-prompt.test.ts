import { describe, expect, it } from "vitest";
import {
  PINE_SYSTEM_PROMPT,
  PINE_YOLO_SYSTEM_PROMPT,
  systemPromptForApprovalMode,
} from "../system-prompt";

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

describe("systemPromptForApprovalMode", () => {
  it("adds privileged bash safety guidance in yolo mode", () => {
    const prompt = systemPromptForApprovalMode("base prompt", "YOLO");

    expect(prompt).toBe(`base prompt\n\n${PINE_YOLO_SYSTEM_PROMPT}`);
    expect(prompt).toContain("call privileged_bash directly");
    expect(prompt).toContain("outside Pine's project sandbox");
    expect(prompt).toContain("without approval");
    expect(prompt).toContain("All other tools also run without");
    expect(prompt).toContain("avoid destructive or irreversible actions");
  });

  it("does not override the system prompt outside yolo mode", () => {
    expect(
      systemPromptForApprovalMode("base prompt", "auto-approve"),
    ).toBeUndefined();
    expect(
      systemPromptForApprovalMode("base prompt", "let-me-review"),
    ).toBeUndefined();
  });
});
