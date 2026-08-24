import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PineProject } from "../../shared/projects";
import { ProjectRuntimeRegistry } from "../projectRuntime";

const temporaryDirectories: string[] = [];

async function createRuntimeFixture(): Promise<{
  dataRoot: string;
  project: PineProject;
}> {
  const folderPath = await mkdtemp(
    path.join(os.tmpdir(), "pine-runtime-folder-"),
  );
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "pine-runtime-data-"));
  temporaryDirectories.push(folderPath, dataRoot);
  const now = new Date().toISOString();
  return {
    dataRoot,
    project: {
      createdAt: now,
      defaultFolderId: "cde9a86c-7632-43ac-96d6-c41ddeddce0e",
      folders: [
        {
          access: "read-write",
          id: "cde9a86c-7632-43ac-96d6-c41ddeddce0e",
          isAvailable: true,
          name: "source",
          path: folderPath,
        },
      ],
      id: "7f48c81c-f1dc-4be6-a8ee-55729ef647ba",
      name: "runtime-test",
      schemaVersion: 1,
      updatedAt: now,
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("ProjectRuntimeRegistry", () => {
  it("creates a project-scoped Pi session lazily and only once", async () => {
    const registry = new ProjectRuntimeRegistry();
    const { dataRoot, project } = await createRuntimeFixture();

    try {
      await registry.open(1, project, {
        cacheRoot: path.join(dataRoot, "cache"),
        projectRoot: dataRoot,
        sessionsRoot: path.join(dataRoot, "sessions"),
      });
      const first = await registry.getOrCreateActiveSession(1);
      const second = await registry.getOrCreateActiveSession(1);
      expect(second.session).toBe(first.session);
    } finally {
      await registry.dispose(1);
    }
  });

  it("lists files through a folder ID from the active project", async () => {
    const registry = new ProjectRuntimeRegistry();
    const { dataRoot, project } = await createRuntimeFixture();
    await writeFile(path.join(project.folders[0].path, "README.md"), "Pine");

    try {
      await registry.open(2, project, {
        cacheRoot: path.join(dataRoot, "cache"),
        projectRoot: dataRoot,
        sessionsRoot: path.join(dataRoot, "sessions"),
      });
      await expect(
        registry.listDirectory(2, project.folders[0].id, ""),
      ).resolves.toEqual([
        { kind: "file", name: "README.md", relativePath: "README.md" },
      ]);
      await expect(
        registry.listDirectory(2, crypto.randomUUID(), ""),
      ).rejects.toThrow("Folder not found in the active project.");
    } finally {
      await registry.dispose(2);
    }
  });
});
