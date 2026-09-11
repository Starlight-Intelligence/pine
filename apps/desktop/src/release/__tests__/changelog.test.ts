import { describe, expect, it } from "vitest";
import { extractChangelogSection, isReleaseVersion } from "../changelog";

describe("release changelog", () => {
  it("extracts one dated release without including the next release", () => {
    const changelog = `# Changelog

## [Unreleased]

## [1.2.0] - 2026-09-10

### Added

- New release flow.

## [1.1.0] - 2026-08-01

- Older entry.
`;

    expect(extractChangelogSection(changelog, "1.2.0")).toEqual({
      body: "### Added\n\n- New release flow.",
      date: "2026-09-10",
      version: "1.2.0",
    });
  });

  it("rejects missing, undated, and empty release sections", () => {
    expect(() => extractChangelogSection("# Changelog\n", "1.0.0")).toThrow(
      "no release section",
    );
    expect(() =>
      extractChangelogSection("## [1.0.0]\n\n- Entry\n", "1.0.0"),
    ).toThrow("must include a release date");
    expect(() =>
      extractChangelogSection(
        "## [1.0.0] - 2026-09-10\n\n## [0.9.0] - 2026-08-01\n",
        "1.0.0",
      ),
    ).toThrow("is empty");
  });

  it("accepts semantic release versions", () => {
    expect(isReleaseVersion("1.2.3")).toBe(true);
    expect(isReleaseVersion("1.2.3-rc.1+build.4")).toBe(true);
    expect(isReleaseVersion("26w36a")).toBe(false);
  });
});
