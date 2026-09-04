import { open } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { ProjectFilePreview } from "../shared/projectFiles";

export const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;
const mediaTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
};

export async function readProjectFilePreview(
  filePath: string,
  mediaUrl: string,
): Promise<ProjectFilePreview> {
  const file = await open(filePath, "r");
  try {
    const metadata = await file.stat();
    if (!metadata.isFile()) throw new Error("Expected a regular file.");
    const info = {
      size: metadata.size,
      modifiedAt: metadata.mtime.toISOString(),
    };
    const mime = mediaTypes[path.extname(filePath).toLowerCase()];
    if (mime)
      return {
        ...info,
        kind: mime.startsWith("image/") ? "image" : "video",
        url: mediaUrl,
      };
    if (metadata.size > MAX_TEXT_PREVIEW_BYTES)
      return { ...info, kind: "unsupported", reason: "too-large" };

    // Bound the read even if another process grows the file after stat().
    const bytes = Buffer.alloc(
      Math.min(metadata.size + 1, MAX_TEXT_PREVIEW_BYTES + 1),
    );
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(
        bytes,
        length,
        bytes.length - length,
        length,
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > metadata.size)
      return { ...info, kind: "unsupported", reason: "too-large" };
    const contents = bytes.subarray(0, length);
    const encoding =
      contents[0] === 0xff && contents[1] === 0xfe
        ? "utf-16le"
        : contents[0] === 0xfe && contents[1] === 0xff
          ? "utf-16be"
          : "utf-8";
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(contents);
      if (/[\u0000-\u0008\u000e-\u001f]/u.test(text))
        return { ...info, kind: "unsupported", reason: "binary" };
      return { ...info, kind: "text", text, encoding: encoding.toUpperCase() };
    } catch {
      return { ...info, kind: "unsupported", reason: "binary" };
    }
  } finally {
    await file.close();
  }
}

/** Serves only media, with bounded streaming and byte ranges for video seeking. */
export async function serveProjectMedia(
  request: Request,
  filePath: string,
): Promise<Response> {
  const mime = mediaTypes[path.extname(filePath).toLowerCase()];
  if (!mime) return new Response(null, { status: 415 });
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, { status: 405 });
  const file = await open(filePath, "r");
  let streaming = false;
  try {
    const { size } = await file.stat().then((metadata) => {
      if (!metadata.isFile()) throw new Error("Expected a regular file.");
      return metadata;
    });
    const headers = new Headers({
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
    let start = 0;
    let end = size - 1;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match && (match[1] || match[2])) {
        start = match[1]
          ? Number(match[1])
          : Math.max(0, size - Number(match[2]));
        end =
          match[1] && match[2]
            ? Math.min(Number(match[2]), size - 1)
            : size - 1;
      }
      if (
        !match ||
        !(match[1] || match[2]) ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= size
      ) {
        headers.set("Content-Range", `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    }
    headers.set("Content-Length", String(Math.max(0, end - start + 1)));
    const status = range ? 206 : 200;
    if (request.method === "HEAD" || size === 0)
      return new Response(null, { status, headers });
    const stream = file.createReadStream({ start, end, autoClose: true });
    streaming = true;
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status,
      headers,
    });
  } finally {
    if (!streaming) await file.close();
  }
}
