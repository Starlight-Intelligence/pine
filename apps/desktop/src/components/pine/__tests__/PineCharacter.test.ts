import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import PineCharacter from "../PineCharacter.vue";

interface FrameClock {
  flushFrame: () => void;
}

function installBrowserMocks(prefersReducedMotion = false): FrameClock {
  const frames = new Map<number, FrameRequestCallback>();
  let frameHandle = 0;
  let now = 0;

  vi.stubGlobal("matchMedia", () => ({
    addEventListener: vi.fn(),
    matches: prefersReducedMotion,
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameHandle, callback);
    return frameHandle;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    frames.delete(handle);
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    bottom: 140,
    height: 40,
    left: 100,
    right: 200,
    top: 100,
    width: 100,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  });

  return {
    flushFrame() {
      now += 16;
      for (const [handle, callback] of [...frames]) {
        frames.delete(handle);
        callback(now);
      }
    },
  };
}

function horizontalOffset(transform: string): number {
  const match = transform.match(/translate3d\((-?[\d.]+)px,/);
  if (!match) throw new Error(`Unexpected transform: ${transform}`);
  return Number(match[1]);
}

describe("PineCharacter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves the whole face toward the pointer with more damping than the pupils", () => {
    const clock = installBrowserMocks();
    const wrapper = mount(PineCharacter, {
      props: { autoSleep: false, paused: true },
    });

    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 300, clientY: 200 }),
    );
    clock.flushFrame();

    const face = wrapper.get(".pine-character__face");
    const pupils = wrapper.findAll(".pine-character__pupil");
    const faceTransform = (face.element as HTMLElement).style.transform;
    const leftPupilTransform = (pupils[0].element as HTMLElement).style
      .transform;
    const rightPupilTransform = (pupils[1].element as HTMLElement).style
      .transform;
    const faceOffset = horizontalOffset(faceTransform);
    const pupilOffset = horizontalOffset(leftPupilTransform);

    expect(face.text()).toBe("(•ᴗ•)");
    expect(faceOffset).toBeGreaterThan(0);
    expect(pupilOffset).toBeGreaterThan(faceOffset);
    expect(rightPupilTransform).toBe(leftPupilTransform);

    wrapper.unmount();
  });

  it("keeps the face neutral when reduced motion is preferred", () => {
    const clock = installBrowserMocks(true);
    const wrapper = mount(PineCharacter, {
      props: { autoSleep: false, paused: true },
    });

    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 300, clientY: 200 }),
    );
    clock.flushFrame();

    expect(
      (wrapper.get(".pine-character__face").element as HTMLElement).style
        .transform,
    ).toBe("translate3d(0.00px, 0.00px, 0)");

    wrapper.unmount();
  });
});
