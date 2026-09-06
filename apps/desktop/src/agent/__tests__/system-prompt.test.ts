import { describe, expect, it } from "vitest";
import {
  PINE_YOLO_SYSTEM_PROMPT,
  PINE_SYSTEM_PROMPT,
  systemPromptWithCurrentMonth,
  systemPromptForApprovalMode,
} from "../system-prompt";

describe("systemPromptWithCurrentMonth", () => {
  it("appends the current year and month after the stable prompt prefix", () => {
    const prompt = systemPromptWithCurrentMonth(
      `${PINE_SYSTEM_PROMPT}\n\n<project_context>stable context</project_context>`,
      new Date("2026-09-06T12:00:00"),
    );

    expect(
      prompt.startsWith(
        `${PINE_SYSTEM_PROMPT}\n\n<project_context>stable context</project_context>`,
      ),
    ).toBe(true);
    expect(prompt).toContain("The current year and month are 2026-09.");
    expect(prompt).not.toContain("2026-09-06");
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
