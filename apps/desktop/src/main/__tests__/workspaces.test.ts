import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openWorkspace } from "../workspaces";

const temporaryDirectories: string[] = [];

async function createTemporaryWorkspace(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pine-workspace-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("openWorkspace", () => {
  it("initializes Pine metadata and reuses its project identity", async () => {
    const rootPath = await createTemporaryWorkspace();

    const firstOpen = await openWorkspace(rootPath);
    const secondOpen = await openWorkspace(rootPath);
    const metadata = JSON.parse(
      await readFile(path.join(rootPath, ".pine", "project.json"), "utf8"),
    ) as unknown;

    expect(firstOpen).toEqual(secondOpen);
    expect(firstOpen.name).toBe(path.basename(rootPath));
    expect(firstOpen.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(metadata).toMatchObject({ schemaVersion: 1, id: firstOpen.id });
  });

  it("rejects invalid existing metadata", async () => {
    const rootPath = await createTemporaryWorkspace();
    const metadataDirectory = path.join(rootPath, ".pine");
    await mkdir(metadataDirectory, { recursive: true });
    await writeFile(
      path.join(metadataDirectory, "project.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "not-a-uuid",
        createdAt: "today",
      }),
    );

    await expect(openWorkspace(rootPath)).rejects.toThrow(
      "The Pine project metadata is invalid or unsupported.",
    );
  });
});
