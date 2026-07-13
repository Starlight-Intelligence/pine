import { describe, expect, it } from "vitest";
import { formatWindowTitle } from "../windowTitle";

describe("formatWindowTitle", () => {
  it("uses the product name without a workspace", () => {
    expect(formatWindowTitle({})).toBe("Pine");
  });

  it("includes the workspace name", () => {
    expect(formatWindowTitle({ workspaceName: "pine" })).toBe("Pine @ pine");
  });

  it("includes the session name when available", () => {
    expect(
      formatWindowTitle({ sessionName: "Planning", workspaceName: "pine" }),
    ).toBe("Planning - Pine @ pine");
  });
});
