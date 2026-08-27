import type { PineContentBlock, PineToolCall } from "@/shared/sessions";
import { describe, expect, it } from "vitest";
import { collapsesTranscriptGap } from "../transcriptLayout";

type TranscriptMessage = Parameters<typeof collapsesTranscriptGap>[0][number];

function toolCall(id: string): PineToolCall {
  return { id, name: "bash", status: "complete" };
}

function assistant(blocks: PineContentBlock[]): TranscriptMessage {
  return { role: "assistant", blocks };
}

function user(): TranscriptMessage {
  return { role: "user", blocks: [] };
}

describe("collapsesTranscriptGap", () => {
  it("collapses a tool-call-only turn following an assistant turn", () => {
    const messages = [
      assistant([{ type: "text", text: "Working on it." }]),
      assistant([{ type: "toolCall", toolCall: toolCall("t1") }]),
    ];
    expect(collapsesTranscriptGap(messages, 1)).toBe(true);
  });

  it("keeps the gap when the turn starts with thinking or text", () => {
    const messages = [
      assistant([{ type: "text", text: "Working on it." }]),
      assistant([
        { type: "thinking", thinking: "Let me check." },
        { type: "toolCall", toolCall: toolCall("t1") },
      ]),
    ];
    expect(collapsesTranscriptGap(messages, 1)).toBe(false);
  });

  it("keeps the gap after a user message", () => {
    const messages = [
      user(),
      assistant([{ type: "toolCall", toolCall: toolCall("t1") }]),
    ];
    expect(collapsesTranscriptGap(messages, 1)).toBe(false);
  });

  it("never collapses the first message", () => {
    expect(
      collapsesTranscriptGap(
        [assistant([{ type: "toolCall", toolCall: toolCall("t1") }])],
        0,
      ),
    ).toBe(false);
  });
});
