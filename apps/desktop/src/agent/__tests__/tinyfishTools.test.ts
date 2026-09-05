import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTinyFishToolDefinitions,
  MAX_WEB_TOOL_OUTPUT_BYTES,
} from "../tinyfishTools";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

function getTool(name: "web_search" | "web_fetch", outputDirectory: string) {
  const tools = createTinyFishToolDefinitions({
    getApiKey: () => "tinyfish-secret",
    outputDirectory,
    fetcher: vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ results: [] }), { status: 200 }),
      ),
    ),
  });
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`${name} tool is missing`);
  return tool;
}

describe("TinyFish tools", () => {
  it("does not call TinyFish when the credential is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const [search] = createTinyFishToolDefinitions({
      getApiKey: () => undefined,
      outputDirectory: os.tmpdir(),
      fetcher,
    });

    await expect(
      search.execute(
        "search-1",
        { query: "Pine" },
        undefined,
        undefined,
        undefined as never,
      ),
    ).rejects.toThrow("TinyFish is not configured");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("truncates long output and saves the complete untrusted result", async () => {
    const outputDirectory = await mkdtemp(
      path.join(os.tmpdir(), "pine-tinyfish-tool-"),
    );
    temporaryDirectories.push(outputDirectory);
    const fetchTool = getTool("web_fetch", outputDirectory);
    const result = await fetchTool.execute(
      "fetch-1",
      { urls: ["https://example.com"] },
      undefined,
      undefined,
      undefined as never,
    );

    const details = result.details as {
      fullOutputPath?: string;
      outputCharacters: number;
      truncated: boolean;
    };
    expect(details.truncated).toBe(false);
    expect(details.outputCharacters).toBeLessThanOrEqual(
      MAX_WEB_TOOL_OUTPUT_BYTES,
    );
  });

  it("saves oversized provider responses outside the model context", async () => {
    const outputDirectory = await mkdtemp(
      path.join(os.tmpdir(), "pine-tinyfish-tool-"),
    );
    temporaryDirectories.push(outputDirectory);
    const fetcher: typeof fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ results: [{ text: "x".repeat(40_000) }] }),
          { status: 200 },
        ),
      ),
    );
    const [fetchTool] = createTinyFishToolDefinitions({
      getApiKey: () => "tinyfish-secret",
      outputDirectory,
      fetcher,
    }).filter((tool) => tool.name === "web_fetch");

    const result = await fetchTool.execute(
      "fetch-2",
      { urls: ["https://example.com"] },
      undefined,
      undefined,
      undefined as never,
    );
    const details = result.details as {
      fullOutputPath?: string;
      outputCharacters: number;
      truncated: boolean;
    };
    expect(details.truncated).toBe(true);
    expect(details.fullOutputPath).toBeDefined();
    const output = result.content[0];
    if (output.type !== "text") throw new Error("Expected text tool output");
    expect(output.text.length).toBeLessThanOrEqual(MAX_WEB_TOOL_OUTPUT_BYTES);
    const saved = await readFile(details.fullOutputPath!, "utf8");
    expect(saved).toContain("x".repeat(40_000));
    expect(saved).toContain("untrusted external web data");
  });

  it("keeps the first page title and a bounded favicon in tool details", async () => {
    const outputDirectory = await mkdtemp(
      path.join(os.tmpdir(), "pine-tinyfish-tool-"),
    );
    temporaryDirectories.push(outputDirectory);
    const fetcher: typeof fetch = vi.fn((input) => {
      if (String(input) === "https://example.com/favicon.ico") {
        return Promise.resolve(
          new Response(new Uint8Array([137, 80, 78, 71]), {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                url: "[https://example.com/](https://example.com/)",
                title: "Example page title",
              },
            ],
          }),
          { status: 200 },
        ),
      );
    });
    const result = await createTinyFishToolDefinitions({
      getApiKey: () => "tinyfish-secret",
      outputDirectory,
      fetcher,
    })
      .find((candidate) => candidate.name === "web_fetch")!
      .execute(
        "fetch-title-1",
        { urls: ["https://example.com"] },
        undefined,
        undefined,
        undefined as never,
      );

    const details = result.details as {
      faviconDataUrl?: string;
      pageTitle?: string;
    };
    expect(details.pageTitle).toBe("Example page title");
    expect(details.faviconDataUrl).toBe("data:image/png;base64,iVBORw==");
  });
});
