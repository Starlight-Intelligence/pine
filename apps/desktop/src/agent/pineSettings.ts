import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PineUtilityModelSelection } from "../shared/models";

const PINE_SETTINGS_FILE = "pine-settings.json";

interface PineAgentSettings {
  utilityModel?: PineUtilityModelSelection;
}

function isUtilityModelSelection(
  value: unknown,
): value is PineUtilityModelSelection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const selection = value as Record<string, unknown>;
  return (
    typeof selection.providerId === "string" &&
    selection.providerId.length > 0 &&
    typeof selection.modelId === "string" &&
    selection.modelId.length > 0
  );
}

function settingsPath(agentDir: string): string {
  return path.join(agentDir, PINE_SETTINGS_FILE);
}

export async function readPineAgentSettings(
  agentDir: string,
): Promise<PineAgentSettings> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(settingsPath(agentDir), "utf8"),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const utilityModel = (parsed as Record<string, unknown>).utilityModel;
    return isUtilityModelSelection(utilityModel) ? { utilityModel } : {};
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {};
    }
    return {};
  }
}

export async function writeUtilityModelSelection(
  agentDir: string,
  utilityModel: PineUtilityModelSelection,
): Promise<void> {
  await mkdir(agentDir, { recursive: true });
  const destination = settingsPath(agentDir);
  await writeFile(
    destination,
    `${JSON.stringify({ utilityModel } satisfies PineAgentSettings, null, 2)}\n`,
    "utf8",
  );
}
