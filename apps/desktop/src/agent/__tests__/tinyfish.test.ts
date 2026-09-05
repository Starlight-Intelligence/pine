import { describe, expect, it, vi } from "vitest";
import {
  createTinyFishClient,
  validateFetchOptions,
  validateTinyFishUrl,
} from "../tinyfish";

describe("TinyFish client", () => {
  it("rejects local and credential-bearing fetch URLs", () => {
    expect(() => validateTinyFishUrl("http://127.0.0.1:8080/health")).toThrow(
      "private, local, or metadata hosts",
    );
    expect(() =>
      validateTinyFishUrl("http://[::ffff:c0a8:0101]/health"),
    ).toThrow("private, local, or metadata hosts");
    expect(() => validateTinyFishUrl("https://user:pass@example.com")).toThrow(
      "URL credentials are not allowed",
    );
    expect(validateTinyFishUrl("https://example.com/docs")).toBe(
      "https://example.com/docs",
    );
  });

  it("maps optional search parameters and protects the API key in a header", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher: typeof fetch = vi.fn((input, init) => {
      calls.push({ input, init });
      return Promise.resolve(
        new Response(JSON.stringify({ results: [] }), { status: 200 }),
      );
    });

    const result = await createTinyFishClient(
      "tinyfish-secret",
      fetcher,
    ).search({
      query: "Pine desktop agent",
      purpose: "Find current project information",
      location: "CA",
      language: "en",
      include_domains: ["docs.tinyfish.ai"],
      exclude_domains: ["example.com"],
      recency_minutes: 60,
      domain_type: "news",
      page: 2,
    });

    expect(result).toEqual({ results: [] });
    expect(calls).toHaveLength(1);
    const input = calls[0].input;
    const url =
      typeof input === "string"
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);
    expect(url.origin).toBe("https://api.search.tinyfish.ai");
    expect(url.searchParams.get("query")).toBe("Pine desktop agent");
    expect(url.searchParams.get("include_domains")).toBe("docs.tinyfish.ai");
    expect(url.searchParams.get("exclude_domains")).toBe("example.com");
    expect(url.searchParams.get("recency_minutes")).toBe("60");
    expect(url.searchParams.get("domain_type")).toBe("news");
    expect(url.searchParams.get("page")).toBe("2");
    expect(new Headers(calls[0].init?.headers).get("X-API-Key")).toBe(
      "tinyfish-secret",
    );
  });

  it("forces markdown when highlights are requested and maps fetch options", async () => {
    let requestBody: unknown;
    const fetcher: typeof fetch = vi.fn((_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Promise.resolve(
        new Response(
          JSON.stringify({ results: [{ url: "https://example.com" }] }),
          {
            status: 200,
          },
        ),
      );
    });

    await createTinyFishClient("tinyfish-secret", fetcher).fetch({
      urls: ["https://example.com"],
      purpose: "Answer a focused question",
      format: "markdown",
      links: true,
      ttl: 0,
      per_url_timeout_ms: 30_000,
      include_etag_and_last_modified: true,
      include_selectors: ["main"],
      highlights: {
        query: "What is the key claim?",
        max_snippets: 3,
        max_characters: 1_000,
        include_full_page_text: false,
      },
    });

    expect(requestBody).toEqual({
      urls: ["https://example.com/"],
      purpose: "Answer a focused question",
      format: "markdown",
      links: true,
      ttl: 0,
      per_url_timeout_ms: 30_000,
      include_etag_and_last_modified: true,
      include_selectors: ["main"],
      highlights: {
        query: "What is the key claim?",
        max_snippets: 3,
        max_characters: 1_000,
        include_full_page_text: false,
      },
    });
  });

  it("rejects incompatible date and highlight options", () => {
    expect(() =>
      createTinyFishClient("tinyfish-secret").search({
        query: "current news",
        recency_minutes: 10,
        after_date: "2026-01-01",
      }),
    ).toThrow("cannot be combined");
    expect(() =>
      validateFetchOptions({
        urls: ["https://example.com"],
        format: "html",
        highlights: { query: "claim" },
      }),
    ).toThrow("highlights requires markdown format");
  });
});
