import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PineProjectFolder } from "../../shared/projects";
import { listProjectDirectory } from "../projectFiles";

const temporaryDirectories: string[] = [];

async function createFolder(): Promise<PineProjectFolder> {
  const folderPath = await mkdtemp(path.join(os.tmpdir(), "pine-files-"));
  temporaryDirectories.push(folderPath);
  return {
    access: "read-write",
    id: "cde9a86c-7632-43ac-96d6-c41ddeddce0e",
    isAvailable: true,
    name: "files",
    path: folderPath,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("listProjectDirectory", () => {
  it("lists and sorts entries within one selected folder", async () => {
    const folder = await createFolder();
    await writeFile(path.join(folder.path, "file10.ts"), "");
    await writeFile(path.join(folder.path, "file2.ts"), "");

    await expect(listProjectDirectory(folder, "")).resolves.toEqual([
      { kind: "file", name: "file2.ts", relativePath: "file2.ts" },
      { kind: "file", name: "file10.ts", relativePath: "file10.ts" },
    ]);
  });

  it("rejects paths outside the selected folder", async () => {
    const folder = await createFolder();
    await expect(listProjectDirectory(folder, "../outside")).rejects.toThrow(
      "Directory is outside the selected project folder.",
    );
  });

  it("rejects unavailable folders", async () => {
    const folder = await createFolder();
    await expect(
      listProjectDirectory({ ...folder, isAvailable: false }, ""),
    ).rejects.toThrow("Project folder is unavailable.");
  });
});
