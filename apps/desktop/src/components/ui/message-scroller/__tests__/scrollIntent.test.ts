import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { animateScrollTop } from "@/lib/animateScroll";
import { provideMessageScroller } from "../useMessageScroller";

vi.mock("@/lib/animateScroll", () => ({ animateScrollTop: vi.fn() }));

function createScroller(followAnimated = false) {
  let engine!: ReturnType<typeof provideMessageScroller>;
  const wrapper = mount(
    defineComponent({
      setup() {
        engine = provideMessageScroller({ autoScroll: true, followAnimated });
        return () => null;
      },
    }),
  );
  const viewport = document.createElement("div");
  const content = document.createElement("div");
  const message = document.createElement("div");
  message.dataset.messageId = "message";
  content.append(message);
  viewport.append(content);
  document.body.append(viewport);
  let height = 2000;
  Object.defineProperties(viewport, {
    clientHeight: { get: () => 500 },
    scrollHeight: { get: () => height },
  });
  vi.spyOn(viewport, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, 0, 400, 500),
  );
  vi.spyOn(message, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, -viewport.scrollTop, 400, height),
  );
  vi.spyOn(viewport, "scrollTo").mockImplementation(
    (options: number | ScrollToOptions) => {
      if (typeof options === "object") viewport.scrollTop = options.top ?? 0;
    },
  );
  const context = engine.context;
  context.setViewportElement(viewport);
  context.setContentElement(content);
  context.handleContentChange();
  context.syncAfterScroll();
  return {
    context,
    viewport,
    grow() {
      height += 100;
      context.handleResize();
    },
    destroy() {
      wrapper.unmount();
      viewport.remove();
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("message scroller user intent", () => {
  it("does not resume following after a small upward scroll inside the edge threshold", () => {
    const scroller = createScroller();
    const { context, viewport } = scroller;
    expect(viewport.scrollTop).toBe(1500);
    context.userScrollIntent();
    // A pending state callback may run before the wheel changes scrollTop.
    context.syncAfterScroll();
    viewport.scrollTop -= 4;
    context.syncAfterScroll();
    scroller.grow();
    expect(viewport.scrollTop).toBe(1496);
    scroller.destroy();
  });

  it("resumes following after the reader scrolls down to the live edge", () => {
    const scroller = createScroller();
    const { context, viewport } = scroller;
    context.userScrollIntent();
    viewport.scrollTop = 1200;
    context.syncAfterScroll();
    scroller.grow();
    expect(viewport.scrollTop).toBe(1200);
    viewport.scrollTop = 1600;
    context.syncAfterScroll();
    scroller.grow();
    expect(viewport.scrollTop).toBe(1700);
    scroller.destroy();
  });

  it("cancels a follow animation on user intent and ignores pending resize callbacks", () => {
    const cancel = vi.fn();
    vi.mocked(animateScrollTop).mockReturnValue(cancel);
    const scroller = createScroller(true);
    scroller.grow();
    expect(animateScrollTop).toHaveBeenCalledTimes(1);
    scroller.context.userScrollIntent();
    expect(cancel).toHaveBeenCalledOnce();
    expect(scroller.context.autoscrolling.value).toBe(false);
    scroller.grow();
    expect(animateScrollTop).toHaveBeenCalledTimes(1);
    scroller.destroy();
  });

  it("cancels an in-flight animation when jumping or unmounting", () => {
    const cancel = vi.fn();
    vi.mocked(animateScrollTop).mockReturnValue(cancel);
    const scroller = createScroller(true);
    scroller.grow();
    scroller.context.scrollToStart();
    expect(cancel).toHaveBeenCalledOnce();
    expect(scroller.viewport.scrollTop).toBe(0);
    scroller.context.scrollToEnd();
    scroller.grow();
    scroller.destroy();
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});
