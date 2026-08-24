import { JsonlSessionRepo } from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectSessionService } from "../sessions";

const temporaryDirectories: string[] = [];

async function createTemporaryProjectData(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pine-sessions-"));
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

function serviceOptions(rootPath: string) {
  return {
    cacheRoot: path.join(rootPath, "cache"),
    cwd: path.join(rootPath, "source"),
    sessionsRoot: path.join(rootPath, "sessions"),
  };
}

describe("ProjectSessionService", () => {
  it("creates a new persistent Pi session", async () => {
    const rootPath = await createTemporaryProjectData();
    const options = serviceOptions(rootPath);
    await mkdir(options.cwd, { recursive: true });
    const service = await ProjectSessionService.create(options);

    try {
      const { session, summary } = await service.createSession();

      expect((await session.getMetadata()).id).toBe(summary.id);
      expect(summary.messageCount).toBe(0);
      await expect(service.search("")).resolves.toEqual([]);
    } finally {
      await service.dispose();
    }
  });

  it("searches session names and message content in English and Chinese", async () => {
    const rootPath = await createTemporaryProjectData();
    const options = serviceOptions(rootPath);
    await mkdir(options.cwd, { recursive: true });
    const environment = new NodeExecutionEnv({ cwd: options.cwd });
    const repository = new JsonlSessionRepo({
      fs: environment,
      sessionsRoot: options.sessionsRoot,
    });
    await repository.create({ cwd: path.join(rootPath, "other-source") });
    const session = await repository.create({ cwd: options.cwd });
    await session.appendSessionName("Search architecture");
    await session.appendMessage({
      role: "user",
      content: "Investigate SQLite 全文搜索 for previous sessions",
      timestamp: Date.now(),
    });
    const metadata = await session.getMetadata();
    const service = await ProjectSessionService.create(options);

    try {
      await expect(service.search("")).resolves.toEqual([
        expect.objectContaining({ id: metadata.id }),
      ]);
      await expect(repository.list()).resolves.toEqual([
        expect.objectContaining({ id: metadata.id }),
      ]);
      await expect(service.search("SQLite")).resolves.toEqual([
        expect.objectContaining({
          id: metadata.id,
          name: "Search architecture",
        }),
      ]);
      await expect(service.search("全文搜索")).resolves.toEqual([
        expect.objectContaining({ id: metadata.id }),
      ]);
      await expect(service.search("全")).resolves.toEqual([
        expect.objectContaining({ id: metadata.id }),
      ]);

      const resumed = await service.resumeSession(metadata.id);
      expect((await resumed.session.getMetadata()).path).toBe(metadata.path);
    } finally {
      await service.dispose();
      await environment.cleanup();
    }
  });
});
