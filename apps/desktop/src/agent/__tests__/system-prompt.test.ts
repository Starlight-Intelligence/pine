import { describe, expect, it } from "vitest";
import {
  PINE_YOLO_SYSTEM_PROMPT,
  systemPromptForApprovalMode,
} from "../system-prompt";

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
