import { afterEach, describe, expect, it } from "vitest";
import { filePreviewSelection } from "../filePreviewSelection";

afterEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

function select(
  start: Node,
  startOffset: number,
  end: Node,
  endOffset: number,
) {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

describe("file preview selections", () => {
  it.each(["\n", "\r\n", "\r"])(
    "counts source lines with %j line endings and excludes the next line at offset zero",
    (newline) => {
      const root = document.createElement("div");
      const code = document.createElement("code");
      const pre = document.createElement("pre");
      pre.append(code);
      root.append(pre);
      document.body.append(root);
      const source = ["first", "second", "third"].join(newline);
      code.textContent = source;
      const text = code.firstChild!;
      const start = "first".length + newline.length;
      select(text, start, text, start + "second".length + newline.length);
      expect(filePreviewSelection(root, source)).toEqual({
        startLine: 2,
        endLine: 2,
        text: `second${newline}`,
      });
    },
  );

  it("ignores collapsed, unrelated, and gutter selections", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<span aria-hidden="true">1</span><pre><code>first</code></pre>';
    const outside = document.createTextNode("outside");
    document.body.append(root, outside);
    const code = root.querySelector("code")!.firstChild!;
    select(code, 2, code, 2);
    expect(filePreviewSelection(root, "first")).toBeUndefined();
    select(outside, 0, outside, 3);
    expect(filePreviewSelection(root, "first")).toBeUndefined();
    select(root.firstChild!.firstChild!, 0, code, 3);
    expect(filePreviewSelection(root, "first")).toBeUndefined();
  });

  it("maps formatted text to the correct line within a multiline Markdown block", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<div class="markdown-renderer"><div data-node-index="0"><p>first <strong>bold</strong> line.\nsecond <em>bold</em> line.</p></div></div>';
    document.body.append(root);
    const text = root.querySelector("em")!.firstChild!;
    select(text, 0, text, 4);
    expect(
      filePreviewSelection(root, "first **bold** line.\nsecond *bold* line.", [
        { type: "paragraph", raw: "", sourceMap: { startLine: 0, endLine: 2 } },
      ]),
    ).toEqual({ startLine: 2, endLine: 2, text: "bold" });
  });
});
