import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readPineAgentSettings,
  writeUtilityModelSelection,
} from "../pineSettings";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Pine agent settings", () => {
  it("persists the utility model independently from session settings", async () => {
    const agentDir = await mkdtemp(
      path.join(os.tmpdir(), "pine-agent-settings-"),
    );
    temporaryDirectories.push(agentDir);

    await writeUtilityModelSelection(agentDir, {
      providerId: "provider",
      modelId: "utility-model",
    });
    await writeUtilityModelSelection(agentDir, {
      providerId: "provider",
      modelId: "replacement-model",
    });

    await expect(readPineAgentSettings(agentDir)).resolves.toEqual({
      utilityModel: {
        providerId: "provider",
        modelId: "replacement-model",
      },
    });
  });
});
