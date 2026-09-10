import type {
  LookupModelMetadataRequest,
  PineModelMetadata,
} from "../shared/models";

const MODELS_DEV_URL = "https://models.dev/models.json";
const CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

type FetchModelMetadata = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

export class ModelMetadataService {
  private catalog: Record<string, unknown> | undefined;
  private loadedAt = 0;

  constructor(private readonly fetchMetadata: FetchModelMetadata = fetch) {}

  async lookup(
    request: LookupModelMetadataRequest,
  ): Promise<PineModelMetadata> {
    const catalog = await this.loadCatalog();
    const modelId = request.modelId.trim();
    const providerId = request.providerId?.trim();
    const directCandidates = [
      modelId,
      providerId ? `${providerId}/${modelId}` : "",
    ]
      .filter(Boolean)
      .flatMap((id) => (catalog[id] ? [[id, catalog[id]] as const] : []));
    const uniqueDirect = new Map(directCandidates);
    const suffixMatches = Object.entries(catalog).filter(
      ([id]) => id === modelId || id.endsWith(`/${modelId}`),
    );
    const matches = uniqueDirect.size > 0 ? [...uniqueDirect] : suffixMatches;

    if (matches.length === 0) {
      throw new Error(`No models.dev metadata found for "${modelId}".`);
    }
    if (matches.length > 1) {
      throw new Error(
        `Multiple models.dev entries match "${modelId}". Enter its full provider/model ID.`,
      );
    }

    const [sourceId, value] = matches[0];
    if (!isRecord(value) || typeof value.name !== "string") {
      throw new Error(`Invalid models.dev metadata for "${sourceId}".`);
    }
    const modalities = isRecord(value.modalities) ? value.modalities : {};
    const inputs = Array.isArray(modalities.input) ? modalities.input : [];
    const limits = isRecord(value.limit) ? value.limit : {};
    const reasoning = value.reasoning === true;

    return {
      sourceId,
      modelName: value.name,
      ...(positiveInteger(limits.context)
        ? { contextWindow: positiveInteger(limits.context) }
        : {}),
      ...(positiveInteger(limits.output)
        ? { maxTokens: positiveInteger(limits.output) }
        : {}),
      thinkingLevels: reasoning ? ["off", "low", "high", "max"] : ["off"],
      vision: inputs.includes("image"),
    };
  }

  private async loadCatalog(): Promise<Record<string, unknown>> {
    if (this.catalog && Date.now() - this.loadedAt < CACHE_TTL_MS) {
      return this.catalog;
    }
    const response = await this.fetchMetadata(MODELS_DEV_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`models.dev returned HTTP ${response.status}.`);
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error("models.dev metadata response is too large.");
    }
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) {
      throw new Error("models.dev returned an invalid metadata catalog.");
    }
    this.catalog = parsed;
    this.loadedAt = Date.now();
    return parsed;
  }
}
