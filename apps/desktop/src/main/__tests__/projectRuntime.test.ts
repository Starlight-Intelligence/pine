import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PineProject } from "../../shared/projects";
import type { PineSessionSummary } from "../../shared/sessions";
import type { AgentHost } from "../agentProcessHost";
import { ProjectRuntimeRegistry } from "../projectRuntime";

const temporaryDirectories: string[] = [];
const sessionSummary: PineSessionSummary = {
  id: "0198e338-fb55-7e18-a23e-a7028500f123",
  createdAt: "2026-08-24T12:00:00.000Z",
  updatedAt: "2026-08-24T12:00:00.000Z",
  messageCount: 0,
};

function createAgentHost(): AgentHost {
  return {
    abort: vi.fn().mockResolvedValue({ aborted: false }),
    createSession: vi.fn().mockResolvedValue({ session: sessionSummary }),
    disposeSession: vi.fn().mockResolvedValue({ disposed: true }),
    openSession: vi.fn().mockResolvedValue({ session: sessionSummary }),
    prompt: vi.fn().mockResolvedValue({
      accepted: true,
      session: { ...sessionSummary, messageCount: 2 },
    }),
    subscribe: vi.fn().mockReturnValue(() => undefined),
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

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
    const agentHost = createAgentHost();
    const createSession = vi.spyOn(agentHost, "createSession");
    const registry = new ProjectRuntimeRegistry(agentHost, "/pine/agent");
    const { dataRoot, project } = await createRuntimeFixture();

    try {
      await registry.open(1, project, {
        cacheRoot: path.join(dataRoot, "cache"),
        projectRoot: dataRoot,
        sessionsRoot: path.join(dataRoot, "sessions"),
      });
      const first = await registry.getOrCreateActiveSession(1);
      const second = await registry.getOrCreateActiveSession(1);
      expect(second).toBe(first);
      expect(createSession).toHaveBeenCalledOnce();
    } finally {
      await registry.dispose(1);
    }
  });

  it("lists files through a folder ID from the active project", async () => {
    const registry = new ProjectRuntimeRegistry(
      createAgentHost(),
      "/pine/agent",
    );
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

  it("creates the active session before forwarding the first prompt", async () => {
    const agentHost = createAgentHost();
    const createSession = vi.spyOn(agentHost, "createSession");
    const prompt = vi.spyOn(agentHost, "prompt");
    const registry = new ProjectRuntimeRegistry(agentHost, "/pine/agent");
    const { dataRoot, project } = await createRuntimeFixture();

    try {
      await registry.open(3, project, {
        cacheRoot: path.join(dataRoot, "cache"),
        projectRoot: dataRoot,
        sessionsRoot: path.join(dataRoot, "sessions"),
      });

      await expect(
        registry.prompt(3, { message: "Imagine what is possible" }),
      ).resolves.toEqual({
        accepted: true,
        session: { ...sessionSummary, messageCount: 2 },
      });
      expect(createSession).toHaveBeenCalledOnce();
      expect(prompt).toHaveBeenCalledWith(
        sessionSummary.id,
        "Imagine what is possible",
        undefined,
      );
    } finally {
      await registry.dispose(3);
    }
  });

  it("disposes a session that finishes creating after its project closes", async () => {
    const creationDeferred = deferred<{
      session: PineSessionSummary;
    }>();
    const agentHost = createAgentHost();
    const createSession = vi
      .spyOn(agentHost, "createSession")
      .mockReturnValue(creationDeferred.promise);
    const disposeSession = vi.spyOn(agentHost, "disposeSession");
    const registry = new ProjectRuntimeRegistry(agentHost, "/pine/agent");
    const { dataRoot, project } = await createRuntimeFixture();

    await registry.open(4, project, {
      cacheRoot: path.join(dataRoot, "cache"),
      projectRoot: dataRoot,
      sessionsRoot: path.join(dataRoot, "sessions"),
    });
    const creation = registry.getOrCreateActiveSession(4);
    const disposal = registry.dispose(4);
    creationDeferred.resolve({ session: sessionSummary });

    await expect(creation).rejects.toThrow(
      "The active project changed while creating a session.",
    );
    await disposal;
    expect(createSession).toHaveBeenCalledOnce();
    expect(disposeSession).toHaveBeenCalledWith(sessionSummary.id);
  });
});
