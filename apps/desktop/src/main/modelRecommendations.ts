import { z } from "zod";

export const MODEL_RECOMMENDATIONS_URL =
  "https://gist.githubusercontent.com/kev1nweng/a9a2fd18d8fb238f4c9ecbe7d6a64643/raw/pine-recommended-models.json";

const RecommendedModelIdsSchema = z
  .array(z.string().trim().min(1).max(200))
  .max(1_000);

interface ModelRecommendationServiceOptions {
  fetch?: typeof fetch;
  now?: () => number;
  retryDelayMs?: number;
  timeoutMs?: number;
  ttlMs?: number;
  url?: string;
}

export class ModelRecommendationService {
  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;
  private readonly ttlMs: number;
  private readonly url: string;
  private cachedIds: readonly string[] = [];
  private expiresAt = 0;
  private pending: Promise<readonly string[]> | undefined;

  constructor(options: ModelRecommendationServiceOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.retryDelayMs = options.retryDelayMs ?? 60_000;
    this.timeoutMs = options.timeoutMs ?? 3_000;
    this.ttlMs = options.ttlMs ?? 15 * 60_000;
    this.url = options.url ?? MODEL_RECOMMENDATIONS_URL;
  }

  get(): Promise<readonly string[]> {
    if (this.now() < this.expiresAt) return Promise.resolve(this.cachedIds);
    if (this.pending) return this.pending;

    this.pending = this.refresh().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async refresh(): Promise<readonly string[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetch(this.url, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Recommendation API returned ${response.status}.`);
      }

      const ids = RecommendedModelIdsSchema.parse(await response.json());
      this.cachedIds = [...new Set(ids)];
      this.expiresAt = this.now() + this.ttlMs;
    } catch {
      this.expiresAt = this.now() + this.retryDelayMs;
    } finally {
      clearTimeout(timeout);
    }

    return this.cachedIds;
  }
}
