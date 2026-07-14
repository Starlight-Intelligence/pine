import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listWorkspaceDirectory } from "../workspaceFiles";

const temporaryDirectories: string[] = [];

async function createTemporaryWorkspace(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pine-files-"));
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

describe("listWorkspaceDirectory", () => {
  it("lists direct children with directories first and hides Pine metadata", async () => {
    const rootPath = await createTemporaryWorkspace();
    await mkdir(path.join(rootPath, ".pine"));
    await mkdir(path.join(rootPath, "src"));
    await writeFile(path.join(rootPath, "file10.ts"), "");
    await writeFile(path.join(rootPath, "file2.ts"), "");

    await expect(listWorkspaceDirectory(rootPath, "")).resolves.toEqual([
      { kind: "directory", name: "src", relativePath: "src" },
      { kind: "file", name: "file2.ts", relativePath: "file2.ts" },
      { kind: "file", name: "file10.ts", relativePath: "file10.ts" },
    ]);
  });

  it("lists nested directories without following symbolic links", async () => {
    const rootPath = await createTemporaryWorkspace();
    const externalPath = await createTemporaryWorkspace();
    await mkdir(path.join(rootPath, "src"));
    await writeFile(path.join(rootPath, "src", "main.ts"), "");
    await symlink(externalPath, path.join(rootPath, "external"));

    await expect(listWorkspaceDirectory(rootPath, "src")).resolves.toEqual([
      { kind: "file", name: "main.ts", relativePath: "src/main.ts" },
    ]);
    await expect(
      listWorkspaceDirectory(rootPath, ""),
    ).resolves.not.toContainEqual(
      expect.objectContaining({ name: "external" }),
    );
  });

  it("rejects paths outside the workspace", async () => {
    const rootPath = await createTemporaryWorkspace();

    await expect(
      listWorkspaceDirectory(rootPath, "../outside"),
    ).rejects.toThrow("Directory is outside the active workspace.");
  });
});
