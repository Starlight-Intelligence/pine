import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import {
  judgeStreamOptions,
  parseJudgeRulings,
  PineAgentRuntime,
  projectSessionDirectory,
} from "../runtime";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("judgeStreamOptions", () => {
  const signal = new AbortController().signal;
  const modelWithApi = (api: Api) => ({ api }) as unknown as Model<Api>;

  it("disables reasoning wherever the API exposes a switch", () => {
    expect(
      judgeStreamOptions(modelWithApi("anthropic-messages"), signal),
    ).toEqual({ signal, thinkingEnabled: false });
    expect(
      judgeStreamOptions(modelWithApi("openai-responses"), signal),
    ).toEqual({ signal, reasoningEffort: "minimal" });
    // Omitting options is the off state for completions-family formats;
    // passing an effort would enable thinking.
    expect(
      judgeStreamOptions(modelWithApi("openai-completions"), signal),
    ).toEqual({ signal });
  });
});

describe("parseJudgeRulings", () => {
  it("parses one ordered ruling for every expected tool call", () => {
    expect(
      parseJudgeRulings(
        {
          rulings: [
            {
              toolCallId: "p2",
              verdict: "deny",
              reason: " unsafe ",
            },
            {
              toolCallId: "p1",
              verdict: "allow",
              reason: " expected ",
              scope: "once",
            },
          ],
        },
        ["p1", "p2"],
      ),
    ).toEqual([
      { toolCallId: "p2", verdict: "deny", reason: "unsafe" },
      {
        toolCallId: "p1",
        verdict: "allow",
        reason: "expected",
        scope: "once",
      },
    ]);
  });

  it("rejects omitted, duplicate, and unknown tool call IDs", () => {
    expect(() =>
      parseJudgeRulings({ rulings: [{ toolCallId: "p1", verdict: "allow" }] }, [
        "p1",
        "p2",
      ]),
    ).toThrow("one ruling per tool call");
    expect(() =>
      parseJudgeRulings(
        {
          rulings: [
            { toolCallId: "p1", verdict: "allow" },
            { toolCallId: "p1", verdict: "deny" },
          ],
        },
        ["p1", "p2"],
      ),
    ).toThrow("malformed");
    expect(() =>
      parseJudgeRulings(
        { rulings: [{ toolCallId: "unknown", verdict: "allow" }] },
        ["p1"],
      ),
    ).toThrow("malformed");
  });
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

  it("renames a live session through its session manager", async () => {
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
      const created = await runtime.createSession(location);
      const renamed = runtime.renameSession(
        created.session.id,
        "Renamed session",
      );

      expect(renamed.session.name).toBe("Renamed session");
    } finally {
      await runtime.dispose();
    }
  });
});
