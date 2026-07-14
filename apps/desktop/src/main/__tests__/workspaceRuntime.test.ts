import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PineWorkspaceSummary } from "../../shared/projects";
import { WorkspaceRuntimeRegistry } from "../workspaceRuntime";

const temporaryDirectories: string[] = [];

async function createTemporaryWorkspace(): Promise<PineWorkspaceSummary> {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "pine-runtime-"));
  temporaryDirectories.push(rootPath);
  return {
    id: "7f48c81c-f1dc-4be6-a8ee-55729ef647ba",
    name: "runtime-test",
    rootPath,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("WorkspaceRuntimeRegistry", () => {
  it("creates a Pi session lazily and only once", async () => {
    const registry = new WorkspaceRuntimeRegistry();
    const workspace = await createTemporaryWorkspace();

    try {
      await registry.open(1, workspace);
      await expect(registry.search(1, "")).resolves.toEqual([]);

      const first = await registry.getOrCreateActiveSession(1);
      const second = await registry.getOrCreateActiveSession(1);

      expect(second.session).toBe(first.session);
      await expect(registry.search(1, "")).resolves.toEqual([]);
    } finally {
      await registry.dispose(1);
    }
  });

  it("lists files only for the active workspace", async () => {
    const registry = new WorkspaceRuntimeRegistry();
    const workspace = await createTemporaryWorkspace();
    await writeFile(path.join(workspace.rootPath, "README.md"), "Pine");

    try {
      await registry.open(2, workspace);

      await expect(registry.listDirectory(2, "")).resolves.toEqual([
        {
          kind: "file",
          name: "README.md",
          relativePath: "README.md",
        },
      ]);
      await expect(registry.listDirectory(3, "")).rejects.toThrow(
        "No workspace is open in this window.",
      );
    } finally {
      await registry.dispose(2);
    }
  });
});
