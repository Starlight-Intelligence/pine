import type { ObjectDirective } from "vue";

const SCROLL_EDGE_TOLERANCE = 1;

interface ScrollFadeBindingState {
  animationFrame: number | null;
  mutationObserver: MutationObserver;
  resizeObserver: ResizeObserver;
  scheduleUpdate: () => void;
  viewport: HTMLElement;
}

const bindingStates = new WeakMap<HTMLElement, ScrollFadeBindingState>();

function toggleAttributeIfChanged(
  element: HTMLElement,
  name: string,
  enabled: boolean,
): void {
  if (element.hasAttribute(name) !== enabled) {
    element.toggleAttribute(name, enabled);
  }
}

export function updateScrollFadeAttributes(viewport: HTMLElement): void {
  const maximumScrollTop = Math.max(
    0,
    viewport.scrollHeight - viewport.clientHeight,
  );
  const hasOverflow = maximumScrollTop > SCROLL_EDGE_TOLERANCE;
  const isAtStart = !hasOverflow || viewport.scrollTop <= SCROLL_EDGE_TOLERANCE;
  const isAtEnd =
    !hasOverflow ||
    viewport.scrollTop >= maximumScrollTop - SCROLL_EDGE_TOLERANCE;

  toggleAttributeIfChanged(viewport, "data-scroll-overflow", hasOverflow);
  toggleAttributeIfChanged(viewport, "data-scroll-start", isAtStart);
  toggleAttributeIfChanged(viewport, "data-scroll-end", isAtEnd);
}

function resolveViewport(host: HTMLElement, selector?: string): HTMLElement {
  if (!selector) return host;

  const viewport = host.querySelector<HTMLElement>(selector);
  if (!viewport) {
    throw new Error(`Scroll fade viewport not found: ${selector}`);
  }
  return viewport;
}

function removeScrollFade(host: HTMLElement): void {
  const state = bindingStates.get(host);
  if (!state) return;

  state.viewport.removeEventListener("scroll", state.scheduleUpdate);
  state.resizeObserver.disconnect();
  state.mutationObserver.disconnect();
  if (state.animationFrame !== null) {
    cancelAnimationFrame(state.animationFrame);
  }
  bindingStates.delete(host);
}

function installScrollFade(host: HTMLElement, selector?: string): void {
  removeScrollFade(host);

  const viewport = resolveViewport(host, selector);
  let animationFrame: number | null = null;

  const scheduleUpdate = (): void => {
    if (animationFrame !== null) return;
    animationFrame = requestAnimationFrame(() => {
      animationFrame = null;
      updateScrollFadeAttributes(viewport);
    });
  };

  const resizeObserver = new ResizeObserver(scheduleUpdate);
  const observeContent = (): void => {
    resizeObserver.observe(viewport);
    for (const child of viewport.children) resizeObserver.observe(child);
  };
  const mutationObserver = new MutationObserver(() => {
    observeContent();
    scheduleUpdate();
  });

  const state = {
    get animationFrame() {
      return animationFrame;
    },
    set animationFrame(value: number | null) {
      animationFrame = value;
    },
    mutationObserver,
    resizeObserver,
    scheduleUpdate,
    viewport,
  };

  bindingStates.set(host, state);
  viewport.addEventListener("scroll", scheduleUpdate, { passive: true });
  mutationObserver.observe(viewport, { childList: true, subtree: true });
  observeContent();
  updateScrollFadeAttributes(viewport);
}

export const scrollFadeDirective: ObjectDirective<
  HTMLElement,
  string | undefined
> = {
  mounted(host, binding) {
    installScrollFade(host, binding.value || undefined);
  },
  unmounted(host) {
    removeScrollFade(host);
  },
};
