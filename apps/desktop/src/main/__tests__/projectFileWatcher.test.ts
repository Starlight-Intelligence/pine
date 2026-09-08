import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectFileWatcherRegistry } from "../projectFileWatcher";

describe("ProjectFileWatcherRegistry", () => {
  let root: string;
  let registry: ProjectFileWatcherRegistry;
  let changes: Array<{
    senderId: number;
    folders: Array<{ folderId: string; changedDirs: string[] }>;
  }>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "pine-watch-"));
    changes = [];
    registry = new ProjectFileWatcherRegistry(
      (senderId, folders) => changes.push({ senderId, folders }),
      { changeDebounceMs: 30 },
    );
  });

  afterEach(async () => {
    registry.dispose();
    await rm(root, { recursive: true, force: true });
  });

  async function waitForChange(): Promise<void> {
    for (let i = 0; i < 100 && changes.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(changes.length).toBeGreaterThan(0);
  }

  it("reports changes in watched directories", async () => {
    await registry.setWatchedDirectories(1, {
      folders: [{ folderId: "f1", rootPath: root, directories: [""] }],
    });
    await writeFile(path.join(root, "new.txt"), "data");
    await waitForChange();
    expect(changes.at(-1)?.senderId).toBe(1);
    expect(changes.at(-1)?.folders).toEqual([
      { folderId: "f1", changedDirs: [""] },
    ]);
  }, 10_000);

  it("ignores directories outside the folder root", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "pine-outside-"));
    try {
      await registry.setWatchedDirectories(1, {
        folders: [{ folderId: "f1", rootPath: root, directories: ["../"] }],
      });
      await writeFile(path.join(outside, "new.txt"), "data");
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(changes).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  }, 10_000);

  it("replaces the watch set for a folder and drops removed folders", async () => {
    const sub = path.join(root, "sub");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(sub);
    await registry.setWatchedDirectories(1, {
      folders: [{ folderId: "f1", rootPath: root, directories: ["", "sub"] }],
    });
    // Full-state sync without "f1" closes its watchers; changes are ignored.
    await registry.setWatchedDirectories(1, { folders: [] });
    await writeFile(path.join(root, "after.txt"), "data");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(changes).toEqual([]);
  }, 10_000);

  it("is safe to dispose twice", async () => {
    await registry.setWatchedDirectories(1, {
      folders: [{ folderId: "f1", rootPath: root, directories: [""] }],
    });
    registry.dispose();
    expect(() => registry.dispose()).not.toThrow();
  });
});
