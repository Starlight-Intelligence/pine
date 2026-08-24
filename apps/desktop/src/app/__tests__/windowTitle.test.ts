import { describe, expect, it } from "vitest";
import { formatWindowTitle } from "../windowTitle";

describe("formatWindowTitle", () => {
  it("uses the product name without a project", () => {
    expect(formatWindowTitle({})).toBe("Pine");
  });

  it("includes the project name", () => {
    expect(formatWindowTitle({ projectName: "pine" })).toBe("Pine @ pine");
  });

  it("includes the session name when available", () => {
    expect(
      formatWindowTitle({ sessionName: "Planning", projectName: "pine" }),
    ).toBe("Planning - Pine @ pine");
  });
});
