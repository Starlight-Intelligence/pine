import { describe, expect, it } from "vitest";
import { formatSessionAsMarkdown } from "../sessionExport";

describe("formatSessionAsMarkdown", () => {
  it("keeps settings, message order, and tool payloads readable", () => {
    const markdown = formatSessionAsMarkdown({
      approvalMode: "let-me-review",
      messages: [
        {
          createdAt: "2026-09-08T12:00:00.000Z",
          id: "user-1",
          role: "user",
          blocks: [{ type: "text", text: "Read the project file." }],
        },
        {
          createdAt: "2026-09-08T12:00:01.000Z",
          id: "assistant-1",
          role: "assistant",
          blocks: [
            { type: "text", text: "I will inspect it." },
            {
              type: "toolCall",
              toolCall: {
                id: "call-1",
                name: "read",
                status: "complete",
                input: { path: "/project/src/main.ts" },
                output: { content: "export {}" },
              },
            },
          ],
        },
      ],
      models: [{ modelId: "gpt-test", providerId: "openai" }],
      summary: {
        createdAt: "2026-09-08T12:00:00.000Z",
        id: "session-1",
        messageCount: 2,
        preview: "Read the project file.",
        updatedAt: "2026-09-08T12:00:01.000Z",
      },
    });

    expect(markdown).toContain("- Approval mode: let-me-review");
    expect(markdown).toContain("- Models used:\n  - openai/gpt-test");
    expect(markdown.indexOf("Read the project file.")).toBeLessThan(
      markdown.indexOf("I will inspect it."),
    );
    expect(markdown).toContain('"path": "/project/src/main.ts"');
    expect(markdown).toContain('"content": "export {}"');
  });
});
