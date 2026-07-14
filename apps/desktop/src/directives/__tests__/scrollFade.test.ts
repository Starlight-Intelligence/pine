import { describe, expect, it, vi } from "vitest";
import { updateScrollFadeAttributes } from "../scrollFade";

function createViewport({
  clientHeight,
  scrollHeight,
  scrollTop,
}: {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}): HTMLElement {
  const viewport = document.createElement("div");
  Object.defineProperties(viewport, {
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: scrollHeight },
    scrollTop: { configurable: true, value: scrollTop, writable: true },
  });
  return viewport;
}

describe("updateScrollFadeAttributes", () => {
  it("disables fades when content does not overflow", () => {
    const viewport = createViewport({
      clientHeight: 200,
      scrollHeight: 200,
      scrollTop: 0,
    });

    updateScrollFadeAttributes(viewport);

    expect(viewport.hasAttribute("data-scroll-overflow")).toBe(false);
    expect(viewport.hasAttribute("data-scroll-start")).toBe(true);
    expect(viewport.hasAttribute("data-scroll-end")).toBe(true);
  });

  it("tracks the start, middle, and end of overflowing content", () => {
    const viewport = createViewport({
      clientHeight: 100,
      scrollHeight: 300,
      scrollTop: 0,
    });

    updateScrollFadeAttributes(viewport);
    expect(viewport.hasAttribute("data-scroll-overflow")).toBe(true);
    expect(viewport.hasAttribute("data-scroll-start")).toBe(true);
    expect(viewport.hasAttribute("data-scroll-end")).toBe(false);

    viewport.scrollTop = 100;
    updateScrollFadeAttributes(viewport);
    expect(viewport.hasAttribute("data-scroll-start")).toBe(false);
    expect(viewport.hasAttribute("data-scroll-end")).toBe(false);

    viewport.scrollTop = 200;
    updateScrollFadeAttributes(viewport);
    expect(viewport.hasAttribute("data-scroll-start")).toBe(false);
    expect(viewport.hasAttribute("data-scroll-end")).toBe(true);
  });

  it("does not rewrite unchanged scroll state", () => {
    const viewport = createViewport({
      clientHeight: 100,
      scrollHeight: 300,
      scrollTop: 100,
    });
    const toggleAttribute = vi.spyOn(viewport, "toggleAttribute");

    updateScrollFadeAttributes(viewport);
    toggleAttribute.mockClear();
    updateScrollFadeAttributes(viewport);

    expect(toggleAttribute).not.toHaveBeenCalled();
  });
});
