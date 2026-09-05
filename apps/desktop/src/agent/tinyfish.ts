import { isIP } from "node:net";

export type TinyFishSearchDomainType = "web" | "news" | "research_paper";
export type TinyFishFetchFormat = "html" | "markdown" | "json";

export interface TinyFishSearchOptions {
  query: string;
  purpose?: string;
  location?: string;
  language?: string;
  include_domains?: string[];
  exclude_domains?: string[];
  recency_minutes?: number;
  after_date?: string;
  before_date?: string;
  domain_type?: TinyFishSearchDomainType;
  pub_year_min?: number;
  pub_year_max?: number;
  page?: number;
}

export interface TinyFishHighlightsOptions {
  query: string;
  max_snippets?: number;
  max_characters?: number;
  include_full_page_text?: boolean;
}

export interface TinyFishFetchOptions {
  urls: string[];
  purpose?: string;
  format?: TinyFishFetchFormat;
  links?: boolean;
  image_links?: boolean;
  ttl?: number;
  per_url_timeout_ms?: number;
  if_none_match?: string;
  if_modified_since?: string;
  include_etag_and_last_modified?: boolean;
  include_selectors?: string[];
  exclude_selectors?: string[];
  highlights?: TinyFishHighlightsOptions;
}

export interface TinyFishClient {
  search(
    options: TinyFishSearchOptions,
    signal?: AbortSignal,
  ): Promise<unknown>;
  fetch(options: TinyFishFetchOptions, signal?: AbortSignal): Promise<unknown>;
}

export class TinyFishApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TinyFishApiError";
  }
}

const SEARCH_ENDPOINT = "https://api.search.tinyfish.ai";
const FETCH_ENDPOINT = "https://api.fetch.tinyfish.ai";
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 150_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.google",
  "instance-data.ec2.internal",
  "host.docker.internal",
  "kubernetes.default.svc",
]);

function invalid(message: string): never {
  throw new Error(`Invalid TinyFish request: ${message}`);
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && second >= 18 && second <= 19)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[/u, "")
    .replace(/\]$/u, "");
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/u.test(normalized)) return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (isPrivateIpv4(mapped) || isPrivateIpv4(mapped.replace(/:/gu, "."))) {
      return true;
    }
    const mappedParts = mapped.split(":");
    if (
      mappedParts.length !== 2 ||
      mappedParts.some((part) => !/^[\da-f]{1,4}$/u.test(part))
    ) {
      return false;
    }
    const high = Number.parseInt(mappedParts[0], 16);
    const low = Number.parseInt(mappedParts[1], 16);
    return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[/u, "")
    .replace(/\]$/u, "")
    .replace(/\.$/u, "");
  return (
    BLOCKED_HOSTNAMES.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    (isIP(normalized) === 4 && isPrivateIpv4(normalized)) ||
    (isIP(normalized) === 6 && isPrivateIpv6(normalized))
  );
}

/** Validate URLs before forwarding them to the remote fetch service. */
export function validateTinyFishUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 16_384) invalid("URL is empty or too long");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    invalid("URL is not valid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    invalid("URL must use http or https");
  }
  if (parsed.username || parsed.password) {
    invalid("URL credentials are not allowed");
  }
  if (isBlockedHostname(parsed.hostname)) {
    invalid("private, local, or metadata hosts are not allowed");
  }
  return parsed.toString();
}

/** Normalize a domain restriction to a single public hostname. */
export function validateTinyFishDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > 253 || trimmed.includes("*")) {
    invalid("domain restrictions must contain a hostname");
  }
  let parsed: URL;
  try {
    parsed = new URL(`https://${trimmed}`);
  } catch {
    invalid("domain restriction is not valid");
  }
  if (
    parsed.hostname !== trimmed ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    invalid("domain restrictions cannot contain a path, port, or credentials");
  }
  if (isBlockedHostname(parsed.hostname)) {
    invalid("private or local domain restrictions are not allowed");
  }
  return parsed.hostname;
}

function validatePurpose(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const purpose = value.trim();
  if (!purpose || purpose.length > 2_000) {
    invalid("purpose must be between 1 and 2000 characters");
  }
  return purpose;
}

function validateOptionalShortString(
  value: string | undefined,
  name: string,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 20) {
    invalid(`${name} must be between 1 and 20 characters`);
  }
  return normalized;
}

function validateDate(
  value: string | undefined,
  name: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (!DATE_PATTERN.test(value)) invalid(`${name} must use YYYY-MM-DD`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    invalid(`${name} is not a real calendar date`);
  }
  return value;
}

function validateInteger(
  value: number | undefined,
  name: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    invalid(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function validateDomainList(
  values: string[] | undefined,
  name: string,
): string[] | undefined {
  if (values === undefined) return undefined;
  if (values.length < 1 || values.length > 50) {
    invalid(`${name} must contain between 1 and 50 domains`);
  }
  return values.map(validateTinyFishDomain);
}

export function validateSearchOptions(
  options: TinyFishSearchOptions,
): TinyFishSearchOptions {
  const query = options.query.trim();
  if (!query || query.length > 2_000)
    invalid("query must be between 1 and 2000 characters");
  const purpose = validatePurpose(options.purpose);
  const location = validateOptionalShortString(options.location, "location");
  const language = validateOptionalShortString(options.language, "language");
  const includeDomains = validateDomainList(
    options.include_domains,
    "include_domains",
  );
  const excludeDomains = validateDomainList(
    options.exclude_domains,
    "exclude_domains",
  );
  const recency = validateInteger(
    options.recency_minutes,
    "recency_minutes",
    1,
    5_256_000,
  );
  const afterDate = validateDate(options.after_date, "after_date");
  const beforeDate = validateDate(options.before_date, "before_date");
  if (
    recency !== undefined &&
    (afterDate !== undefined || beforeDate !== undefined)
  ) {
    invalid("recency_minutes cannot be combined with date filters");
  }
  if (afterDate && beforeDate && afterDate > beforeDate) {
    invalid("after_date must be before or equal to before_date");
  }
  const domainType = options.domain_type ?? "web";
  if (!["web", "news", "research_paper"].includes(domainType)) {
    invalid("domain_type is not supported");
  }
  if (
    domainType === "research_paper" &&
    (recency !== undefined ||
      afterDate !== undefined ||
      beforeDate !== undefined)
  ) {
    invalid("date and recency filters are not supported for research_paper");
  }
  const pubYearMin = validateInteger(
    options.pub_year_min,
    "pub_year_min",
    0,
    9_999,
  );
  const pubYearMax = validateInteger(
    options.pub_year_max,
    "pub_year_max",
    0,
    9_999,
  );
  if (
    domainType !== "research_paper" &&
    (pubYearMin !== undefined || pubYearMax !== undefined)
  ) {
    invalid("publication year filters require research_paper");
  }
  if (
    pubYearMin !== undefined &&
    pubYearMax !== undefined &&
    pubYearMin > pubYearMax
  ) {
    invalid("pub_year_min must be before or equal to pub_year_max");
  }
  const page = validateInteger(options.page, "page", 0, 10);

  return {
    query,
    ...(purpose !== undefined ? { purpose } : {}),
    ...(location !== undefined ? { location } : {}),
    ...(language !== undefined ? { language } : {}),
    ...(includeDomains ? { include_domains: includeDomains } : {}),
    ...(excludeDomains ? { exclude_domains: excludeDomains } : {}),
    ...(recency !== undefined ? { recency_minutes: recency } : {}),
    ...(afterDate ? { after_date: afterDate } : {}),
    ...(beforeDate ? { before_date: beforeDate } : {}),
    ...(domainType ? { domain_type: domainType } : {}),
    ...(pubYearMin !== undefined ? { pub_year_min: pubYearMin } : {}),
    ...(pubYearMax !== undefined ? { pub_year_max: pubYearMax } : {}),
    ...(page !== undefined ? { page } : {}),
  };
}

function validateSelectorList(
  values: string[] | undefined,
  name: string,
): string[] | undefined {
  if (values === undefined) return undefined;
  if (values.length < 1 || values.length > 20) {
    invalid(`${name} must contain between 1 and 20 selectors`);
  }
  if (values.some((selector) => !selector.trim() || selector.length > 1_000)) {
    invalid(`${name} entries must be between 1 and 1000 characters`);
  }
  return values.map((selector) => selector.trim());
}

export function validateFetchOptions(
  options: TinyFishFetchOptions,
): TinyFishFetchOptions {
  if (options.urls.length < 1 || options.urls.length > 10) {
    invalid("urls must contain between 1 and 10 URLs");
  }
  const urls = options.urls.map(validateTinyFishUrl);
  const purpose = validatePurpose(options.purpose);
  if (
    options.format !== undefined &&
    !["html", "markdown", "json"].includes(options.format)
  ) {
    invalid("format is not supported");
  }
  const ttl = validateInteger(options.ttl, "ttl", 0, Number.MAX_SAFE_INTEGER);
  const timeout = validateInteger(
    options.per_url_timeout_ms,
    "per_url_timeout_ms",
    1,
    110_000,
  );
  const etag = options.if_none_match?.trim();
  const modifiedSince = options.if_modified_since?.trim();
  if (etag === "" || modifiedSince === "") {
    invalid("conditional request validators cannot be empty");
  }
  if (urls.length > 1 && (etag !== undefined || modifiedSince !== undefined)) {
    invalid("conditional request validators require a single URL");
  }
  const includeSelectors = validateSelectorList(
    options.include_selectors,
    "include_selectors",
  );
  const excludeSelectors = validateSelectorList(
    options.exclude_selectors,
    "exclude_selectors",
  );
  const highlights = options.highlights;
  if (highlights) {
    const highlightQuery = highlights.query.trim();
    if (!highlightQuery || highlightQuery.length > 2_000) {
      invalid("highlights.query must be between 1 and 2000 characters");
    }
    const maxSnippets = validateInteger(
      highlights.max_snippets,
      "highlights.max_snippets",
      1,
      20,
    );
    const maxCharacters = validateInteger(
      highlights.max_characters,
      "highlights.max_characters",
      100,
      20_000,
    );
    if (options.format !== undefined && options.format !== "markdown") {
      invalid("highlights requires markdown format");
    }
    return {
      urls,
      ...(purpose !== undefined ? { purpose } : {}),
      format: "markdown",
      ...(options.links !== undefined ? { links: options.links } : {}),
      ...(options.image_links !== undefined
        ? { image_links: options.image_links }
        : {}),
      ...(ttl !== undefined ? { ttl } : {}),
      ...(timeout !== undefined ? { per_url_timeout_ms: timeout } : {}),
      ...(etag !== undefined ? { if_none_match: etag } : {}),
      ...(modifiedSince !== undefined
        ? { if_modified_since: modifiedSince }
        : {}),
      ...(options.include_etag_and_last_modified !== undefined
        ? {
            include_etag_and_last_modified:
              options.include_etag_and_last_modified,
          }
        : {}),
      ...(includeSelectors ? { include_selectors: includeSelectors } : {}),
      ...(excludeSelectors ? { exclude_selectors: excludeSelectors } : {}),
      highlights: {
        query: highlightQuery,
        ...(maxSnippets !== undefined ? { max_snippets: maxSnippets } : {}),
        ...(maxCharacters !== undefined
          ? { max_characters: maxCharacters }
          : {}),
        ...(highlights.include_full_page_text !== undefined
          ? { include_full_page_text: highlights.include_full_page_text }
          : {}),
      },
    };
  }

  return {
    urls,
    ...(purpose !== undefined ? { purpose } : {}),
    ...(options.format !== undefined ? { format: options.format } : {}),
    ...(options.links !== undefined ? { links: options.links } : {}),
    ...(options.image_links !== undefined
      ? { image_links: options.image_links }
      : {}),
    ...(ttl !== undefined ? { ttl } : {}),
    ...(timeout !== undefined ? { per_url_timeout_ms: timeout } : {}),
    ...(etag !== undefined ? { if_none_match: etag } : {}),
    ...(modifiedSince !== undefined
      ? { if_modified_since: modifiedSince }
      : {}),
    ...(options.include_etag_and_last_modified !== undefined
      ? {
          include_etag_and_last_modified:
            options.include_etag_and_last_modified,
        }
      : {}),
    ...(includeSelectors ? { include_selectors: includeSelectors } : {}),
    ...(excludeSelectors ? { exclude_selectors: excludeSelectors } : {}),
  };
}

async function readResponseText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new TinyFishApiError("TinyFish response exceeded the size limit.");
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new TinyFishApiError(
          "TinyFish response exceeded the size limit.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function requestJson(
  endpoint: string,
  apiKey: string,
  fetcher: typeof fetch,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    const headers = new Headers(init.headers);
    headers.set("X-API-Key", apiKey);
    const response = await fetcher(endpoint, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const body = await readResponseText(response, MAX_RESPONSE_BYTES);
    if (!response.ok) {
      throw new TinyFishApiError(
        `TinyFish API request failed with HTTP ${response.status}.`,
        response.status,
      );
    }
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new TinyFishApiError("TinyFish API returned invalid JSON.");
    }
  } catch (error) {
    if (signal?.aborted) throw new Error("TinyFish request was aborted.");
    if (timedOut)
      throw new Error("TinyFish request timed out after 150 seconds.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function createTinyFishClient(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): TinyFishClient {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) throw new Error("TinyFish API key is not configured.");

  return {
    search: (options, signal) => {
      const validated = validateSearchOptions(options);
      const params = new URLSearchParams({ query: validated.query });
      const stringParams: Array<[string, string | undefined]> = [
        ["purpose", validated.purpose],
        ["location", validated.location],
        ["language", validated.language],
        [
          "include_domains",
          validated.include_domains?.map(validateTinyFishDomain).join(","),
        ],
        [
          "exclude_domains",
          validated.exclude_domains?.map(validateTinyFishDomain).join(","),
        ],
        ["recency_minutes", validated.recency_minutes?.toString()],
        ["after_date", validated.after_date],
        ["before_date", validated.before_date],
        ["domain_type", validated.domain_type],
        ["pub_year_min", validated.pub_year_min?.toString()],
        ["pub_year_max", validated.pub_year_max?.toString()],
        ["page", validated.page?.toString()],
      ];
      for (const [name, value] of stringParams) {
        if (value !== undefined) params.set(name, value);
      }
      return requestJson(
        `${SEARCH_ENDPOINT}?${params.toString()}`,
        normalizedKey,
        fetcher,
        { method: "GET" },
        signal,
      );
    },
    fetch: (options, signal) => {
      const validated = validateFetchOptions(options);
      return requestJson(
        FETCH_ENDPOINT,
        normalizedKey,
        fetcher,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validated),
        },
        signal,
      );
    },
  };
}
