import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  AddCustomModelRequest,
  PineThinkingLevel,
} from "../shared/models";

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

interface ModelsFile {
  providers: Record<string, Record<string, unknown>>;
}

function stripJsonComments(input: string): string {
  return input
    .replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g, (match) =>
      match[0] === '"' ? match : "",
    )
    .replace(
      /"(?:\\.|[^"\\])*"|,(\s*[}\]])/g,
      (match, tail: string) => tail ?? (match[0] === '"' ? match : ""),
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readModelsFile(destination: string): Promise<ModelsFile> {
  try {
    const parsed: unknown = JSON.parse(
      stripJsonComments(await readFile(destination, "utf8")),
    );
    if (!isRecord(parsed) || !isRecord(parsed.providers)) {
      throw new Error(
        'models.json must contain a top-level "providers" object.',
      );
    }
    return { providers: parsed.providers as ModelsFile["providers"] };
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return { providers: {} };
    throw new Error(
      `Unable to update models.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function addCustomModel(
  agentDir: string,
  input: AddCustomModelRequest,
): Promise<void> {
  await mkdir(agentDir, { recursive: true });
  const destination = path.join(agentDir, "models.json");
  const config = await readModelsFile(destination);
  const currentProvider = config.providers[input.providerId];

  if (currentProvider && !isRecord(currentProvider)) {
    throw new Error(
      `Provider "${input.providerId}" has an invalid configuration.`,
    );
  }

  const currentModels = currentProvider?.models;
  if (currentModels !== undefined && !Array.isArray(currentModels)) {
    throw new Error(
      `Provider "${input.providerId}" has an invalid model list.`,
    );
  }
  if (
    currentModels?.some(
      (model) => isRecord(model) && model.id === input.modelId,
    )
  ) {
    throw new Error(
      `Model "${input.modelId}" already exists on provider "${input.providerId}".`,
    );
  }
  if (input.providerMode === "new" && currentProvider) {
    throw new Error(
      `Provider "${input.providerId}" already exists. Select it as an existing provider instead.`,
    );
  }

  const supportedThinkingLevels = new Set(input.thinkingLevels);
  const reasoning = input.thinkingLevels.some((level) => level !== "off");
  const thinkingLevelMap: Partial<
    Record<PineThinkingLevel, PineThinkingLevel | null>
  > = {};
  if (reasoning) {
    for (const level of THINKING_LEVELS) {
      if (!supportedThinkingLevels.has(level)) thinkingLevelMap[level] = null;
      else if (level === "xhigh" || level === "max") {
        thinkingLevelMap[level] = level;
      }
    }
  }
  const provider = {
    ...currentProvider,
    ...(input.providerMode === "new"
      ? {
          name: input.providerName,
          baseUrl: input.baseUrl,
          apiKey: input.apiKey,
          api: input.api,
        }
      : {}),
    models: [
      ...(currentModels ?? []),
      {
        id: input.modelId,
        ...(input.modelName ? { name: input.modelName } : {}),
        reasoning,
        ...(reasoning ? { thinkingLevelMap } : {}),
        input: input.vision ? ["text", "image"] : ["text"],
        contextWindow: input.contextWindow,
        maxTokens: input.maxTokens,
      },
    ],
  };
  const next = {
    providers: {
      ...config.providers,
      [input.providerId]: provider,
    },
  };
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, destination);
}
