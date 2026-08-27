import { JsonlSessionRepo } from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import {
  fauxAssistantMessage,
  fauxThinking,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
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

function textOf(message: {
  blocks: { type: "text" | "thinking" | "toolCall"; text?: string }[];
}): string {
  return message.blocks
    .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
    .join("");
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

  it("keeps sessions visible after the project's default folder changes", async () => {
    const rootPath = await createTemporaryProjectData();
    const previousCwd = path.join(rootPath, "previous-source");
    const nextCwd = path.join(rootPath, "next-source");
    const sessionsRoot = path.join(rootPath, "sessions");
    await Promise.all([
      mkdir(previousCwd, { recursive: true }),
      mkdir(nextCwd, { recursive: true }),
    ]);
    const environment = new NodeExecutionEnv({ cwd: previousCwd });
    const repository = new JsonlSessionRepo({ fs: environment, sessionsRoot });
    const previousSession = await repository.create({ cwd: previousCwd });
    await previousSession.appendMessage({
      role: "user",
      content: "Conversation from the previous default folder",
      timestamp: Date.now(),
    });
    const metadata = await previousSession.getMetadata();
    const service = await ProjectSessionService.create({
      cacheRoot: path.join(rootPath, "cache"),
      cwd: nextCwd,
      sessionsRoot,
    });

    try {
      await expect(service.search("")).resolves.toEqual([
        expect.objectContaining({ id: metadata.id }),
      ]);
      await expect(service.loadMessages(metadata.id)).resolves.toEqual(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              blocks: [
                {
                  type: "text",
                  text: "Conversation from the previous default folder",
                },
              ],
            }),
          ],
        }),
      );
    } finally {
      await service.dispose();
      await environment.cleanup();
    }
  });

  it("loads text messages backwards with a stable cursor", async () => {
    const rootPath = await createTemporaryProjectData();
    const options = serviceOptions(rootPath);
    await mkdir(options.cwd, { recursive: true });
    const environment = new NodeExecutionEnv({ cwd: options.cwd });
    const repository = new JsonlSessionRepo({
      fs: environment,
      sessionsRoot: options.sessionsRoot,
    });
    const session = await repository.create({ cwd: options.cwd });
    for (const content of ["one", "two", "three", "four"]) {
      await session.appendMessage({
        role: "user",
        content,
        timestamp: Date.now(),
      });
    }
    const metadata = await session.getMetadata();
    const service = await ProjectSessionService.create(options);

    try {
      const newest = await service.loadMessages(metadata.id, undefined, 2);
      expect(newest.messages.map((message) => textOf(message))).toEqual([
        "three",
        "four",
      ]);
      expect(newest.hasMore).toBe(true);

      const earlier = await service.loadMessages(
        metadata.id,
        newest.nextBefore,
        2,
      );
      expect(earlier.messages.map((message) => textOf(message))).toEqual([
        "one",
        "two",
      ]);
      expect(earlier.hasMore).toBe(false);
    } finally {
      await service.dispose();
      await environment.cleanup();
    }
  });

  it("restores thinking duration and completed tool calls", async () => {
    const rootPath = await createTemporaryProjectData();
    const options = serviceOptions(rootPath);
    await mkdir(options.cwd, { recursive: true });
    const environment = new NodeExecutionEnv({ cwd: options.cwd });
    const repository = new JsonlSessionRepo({
      fs: environment,
      sessionsRoot: options.sessionsRoot,
    });
    const session = await repository.create({ cwd: options.cwd });
    const toolCallId = "call-read-main";
    await session.appendMessage(
      fauxAssistantMessage(
        [
          fauxThinking("Find the relevant file."),
          fauxToolCall(
            "read",
            { path: "/project/src/main.ts" },
            {
              id: toolCallId,
            },
          ),
        ],
        { stopReason: "toolUse", timestamp: Date.now() - 1_500 },
      ),
    );
    await session.appendMessage({
      role: "toolResult",
      toolCallId,
      toolName: "read",
      content: [{ type: "text", text: "export {}" }],
      isError: false,
      timestamp: Date.now(),
    });
    const metadata = await session.getMetadata();
    const service = await ProjectSessionService.create(options);

    try {
      const result = await service.loadMessages(metadata.id);

      expect(result.messages).toEqual([
        expect.objectContaining({
          thinkingDurationMs: expect.any(Number),
          blocks: [
            { type: "thinking", thinking: "Find the relevant file." },
            {
              type: "toolCall",
              toolCall: expect.objectContaining({
                id: toolCallId,
                name: "read",
                status: "complete",
              }),
            },
          ],
        }),
      ]);
    } finally {
      await service.dispose();
      await environment.cleanup();
    }
  });

  it("deletes a session and removes it from search", async () => {
    const rootPath = await createTemporaryProjectData();
    const options = serviceOptions(rootPath);
    await mkdir(options.cwd, { recursive: true });
    const environment = new NodeExecutionEnv({ cwd: options.cwd });
    const repository = new JsonlSessionRepo({
      fs: environment,
      sessionsRoot: options.sessionsRoot,
    });
    const session = await repository.create({ cwd: options.cwd });
    await session.appendMessage({
      role: "user",
      content: "Delete this conversation",
      timestamp: Date.now(),
    });
    const metadata = await session.getMetadata();
    const service = await ProjectSessionService.create(options);

    try {
      await expect(service.search("")).resolves.toHaveLength(1);
      await expect(service.deleteSession(metadata.id)).resolves.toBe(true);
      await expect(service.search("")).resolves.toEqual([]);
      await expect(service.deleteSession(metadata.id)).resolves.toBe(false);
    } finally {
      await service.dispose();
      await environment.cleanup();
    }
  });
});
