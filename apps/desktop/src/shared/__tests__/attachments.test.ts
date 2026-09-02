import { describe, expect, it } from "vitest";
import {
  attachmentMessagePreview,
  parseAttachmentMessage,
  serializeAttachmentMessage,
  type PineAttachment,
} from "../attachments";
import { parseMessageBlocks } from "../sessions";

const attachment: PineAttachment = {
  extension: "md",
  modifiedAt: "2026-09-02T12:00:00.000Z",
  name: "notes.md",
  path: "/Users/example/notes.md",
  size: 1_024,
};

describe("attachment messages", () => {
  it("round-trips attachment metadata without changing the user prompt", () => {
    const message = serializeAttachmentMessage([attachment], "Read this file.");

    expect(message).toMatch(/^<pine_attachments version="1">/);
    expect(parseAttachmentMessage(message)).toEqual({
      attachments: [attachment],
      prompt: "Read this file.",
    });
  });

  it("round-trips folder metadata and accepts legacy blocks without kind", () => {
    const folder: PineAttachment = {
      extension: "",
      kind: "directory",
      modifiedAt: "2026-09-02T12:00:00.000Z",
      name: "references",
      path: "/Users/example/references",
      size: 96,
    };

    expect(
      parseAttachmentMessage(serializeAttachmentMessage([folder], ""))
        .attachments,
    ).toEqual([folder]);
    expect(
      parseAttachmentMessage(serializeAttachmentMessage([attachment], ""))
        .attachments,
    ).toEqual([attachment]);
  });

  it("leaves malformed or ordinary user text untouched", () => {
    const malformed =
      '<pine_attachments version="1">\nnot json\n</pine_attachments>\n\nHello';

    expect(parseAttachmentMessage(malformed)).toEqual({
      attachments: [],
      prompt: malformed,
    });
    expect(parseAttachmentMessage("Hello")).toEqual({
      attachments: [],
      prompt: "Hello",
    });
  });

  it("parses persisted user messages into attachment and visible text blocks", () => {
    const message = serializeAttachmentMessage([attachment], "Read this file.");

    expect(parseMessageBlocks({ role: "user", content: message })).toEqual([
      { type: "attachments", attachments: [attachment] },
      { type: "text", text: "Read this file." },
    ]);
    expect(attachmentMessagePreview(message)).toBe("Read this file.");
    expect(
      attachmentMessagePreview(serializeAttachmentMessage([attachment], "")),
    ).toBe("notes.md");
  });
});
