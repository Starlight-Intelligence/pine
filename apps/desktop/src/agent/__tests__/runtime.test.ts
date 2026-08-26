import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PineAgentRuntime, projectSessionDirectory } from "../runtime";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("PineAgentRuntime", () => {
  it("creates persistent SDK sessions in the project session directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pine-agent-runtime-"));
    temporaryDirectories.push(root);
    const location = {
      agentDir: path.join(root, "agent"),
      cwd: path.join(root, "source"),
      folders: [
        {
          access: "read-write" as const,
          path: path.join(root, "source"),
        },
      ],
      sessionsRoot: path.join(root, "sessions"),
    };
    await mkdir(location.cwd, { recursive: true });
    const runtime = new PineAgentRuntime({ emit: () => undefined });

    try {
      const result = await runtime.createSession(location);

      expect(result.session.messageCount).toBe(0);
      expect(result.sessionFile).toContain(
        projectSessionDirectory(location.sessionsRoot, location.cwd),
      );
      expect(result.sessionFile).toMatch(/\.jsonl$/);
    } finally {
      await runtime.dispose();
    }
  });
});
