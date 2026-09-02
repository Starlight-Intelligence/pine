export const PICK_ATTACHMENTS_CHANNEL = "attachments:pick" as const;
export const PICK_ATTACHMENT_FOLDERS_CHANNEL =
  "attachment-folders:pick" as const;
export const INSPECT_ATTACHMENTS_CHANNEL = "attachments:inspect" as const;
export const OPEN_ATTACHMENT_CHANNEL = "attachments:open" as const;

export type PineAttachmentKind = "directory" | "file";

export interface PineAttachment {
  extension: string;
  /** Missing on attachment blocks created before folder support. */
  kind?: PineAttachmentKind;
  modifiedAt: string;
  name: string;
  path: string;
  size: number;
}

export interface PickAttachmentsResult {
  attachments: PineAttachment[];
}

export interface InspectAttachmentsRequest {
  paths: string[];
}

export interface OpenAttachmentRequest {
  path: string;
}

export interface OpenAttachmentResult {
  error?: string;
  opened: boolean;
}

export interface ParsedAttachmentMessage {
  attachments: PineAttachment[];
  prompt: string;
}

const ATTACHMENT_BLOCK_START = '<pine_attachments version="1">';
const ATTACHMENT_BLOCK_END = "</pine_attachments>";

function isAttachment(value: unknown): value is PineAttachment {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const attachment = value as Record<string, unknown>;
  return (
    typeof attachment.extension === "string" &&
    (attachment.kind === undefined ||
      attachment.kind === "directory" ||
      attachment.kind === "file") &&
    typeof attachment.modifiedAt === "string" &&
    typeof attachment.name === "string" &&
    typeof attachment.path === "string" &&
    typeof attachment.size === "number" &&
    Number.isFinite(attachment.size) &&
    attachment.size >= 0
  );
}

export function serializeAttachmentMessage(
  attachments: readonly PineAttachment[],
  prompt: string,
): string {
  const normalizedPrompt = prompt.trim();
  if (attachments.length === 0) return normalizedPrompt;

  const block = [
    ATTACHMENT_BLOCK_START,
    JSON.stringify({ attachments }),
    ATTACHMENT_BLOCK_END,
  ].join("\n");
  return normalizedPrompt ? `${block}\n\n${normalizedPrompt}` : block;
}

export function parseAttachmentMessage(
  message: string,
): ParsedAttachmentMessage {
  if (!message.startsWith(`${ATTACHMENT_BLOCK_START}\n`)) {
    return { attachments: [], prompt: message };
  }

  const blockEnd = message.indexOf(`\n${ATTACHMENT_BLOCK_END}`);
  if (blockEnd < 0) return { attachments: [], prompt: message };

  try {
    const payload = JSON.parse(
      message.slice(ATTACHMENT_BLOCK_START.length + 1, blockEnd),
    ) as unknown;
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload)
    ) {
      return { attachments: [], prompt: message };
    }
    const attachments = (payload as Record<string, unknown>).attachments;
    if (!Array.isArray(attachments) || !attachments.every(isAttachment)) {
      return { attachments: [], prompt: message };
    }

    const promptStart = blockEnd + ATTACHMENT_BLOCK_END.length + 1;
    const prompt = message.slice(promptStart).replace(/^\r?\n\r?\n/, "");
    return { attachments, prompt };
  } catch {
    return { attachments: [], prompt: message };
  }
}

export function attachmentMessagePreview(message: string): string {
  const { attachments, prompt } = parseAttachmentMessage(message);
  return (
    prompt.trim() || attachments.map((attachment) => attachment.name).join(", ")
  );
}
