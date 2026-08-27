import type { PineContentBlock } from "@/shared/sessions";
import type { PineTranscriptMessage } from "@/stores/session";

/**
 * When the model skips thinking and starts a turn directly with a tool call,
 * the turn reads as a continuation of the previous assistant turn, so the
 * transcript tightens the inter-turn gap down to the in-turn tool spacing
 * rhythm instead of the full message gap.
 */
export function collapsesTranscriptGap(
  messages: readonly Pick<PineTranscriptMessage, "role" | "blocks">[],
  index: number,
): boolean {
  const message = messages[index];
  if (message?.role !== "assistant") return false;
  const firstBlock: PineContentBlock | undefined = message.blocks[0];
  if (firstBlock?.type !== "toolCall") return false;
  return messages[index - 1]?.role === "assistant";
}
