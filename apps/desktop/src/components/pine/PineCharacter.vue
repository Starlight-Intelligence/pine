<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  pineCharacterExpressions,
  type PineCharacterExpressionName,
} from "./pineCharacterExpressions";

export type PineCharacterSize = "sm" | "md" | "lg";

interface Props {
  autoSleep?: boolean;
  decorative?: boolean;
  expression?: PineCharacterExpressionName;
  label?: string;
  paused?: boolean;
  size?: PineCharacterSize;
  sleepAfterMs?: number;
  trackPointer?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  autoSleep: true,
  decorative: false,
  expression: "idle",
  label: "Pine",
  paused: false,
  size: "md",
  sleepAfterMs: 30_000,
  trackPointer: true,
});

const characterElement = ref<HTMLElement>();
const leftPupilElement = ref<HTMLElement>();
const rightPupilElement = ref<HTMLElement>();
const frameIndex = ref(0);
const sleepPhase = ref<"awake" | "falling-asleep" | "sleeping" | "waking">(
  "awake",
);
const prefersReducedMotion = ref(false);
const isMounted = ref(false);

let frameTimer: number | undefined;
let gazeAnimationFrame: number | undefined;
let idleTimer: number | undefined;
let pointerPosition: { x: number; y: number } | undefined;
let reducedMotionQuery: MediaQueryList | undefined;
let resizeObserver: ResizeObserver | undefined;
let characterBounds: DOMRect | undefined;
let boundsDirty = true;
let gazeTargetDirty = true;
let currentGaze = { x: 0, y: 0 };
let targetGaze = { x: 0, y: 0 };

const effectiveExpression = computed<PineCharacterExpressionName>(() => {
  if (props.expression !== "idle") return props.expression;

  if (sleepPhase.value === "falling-asleep") return "fallingAsleep";
  if (sleepPhase.value === "sleeping") return "sleeping";
  if (sleepPhase.value === "waking") return "waking";
  return "idle";
});
const currentExpression = computed(
  () => pineCharacterExpressions[effectiveExpression.value],
);
const currentFrame = computed(
  () =>
    currentExpression.value.frames[frameIndex.value] ??
    currentExpression.value.frames[0],
);
const fixedEyes = computed(() =>
  currentFrame.value.eyes.mode === "fixed"
    ? currentFrame.value.eyes
    : undefined,
);
const currentSuffix = computed(() =>
  "suffix" in currentFrame.value ? currentFrame.value.suffix : "",
);

function clearFrameTimer(): void {
  if (frameTimer === undefined) return;

  window.clearTimeout(frameTimer);
  frameTimer = undefined;
}

function clearIdleTimer(): void {
  if (idleTimer === undefined) return;

  window.clearTimeout(idleTimer);
  idleTimer = undefined;
}

function scheduleIdleSleep(): void {
  clearIdleTimer();

  if (
    !isMounted.value ||
    !props.autoSleep ||
    props.expression !== "idle" ||
    sleepPhase.value !== "awake"
  ) {
    return;
  }

  idleTimer = window.setTimeout(() => {
    idleTimer = undefined;
    sleepPhase.value = prefersReducedMotion.value
      ? "sleeping"
      : "falling-asleep";
    resetGaze();
  }, props.sleepAfterMs);
}

function wake(): void {
  if (props.expression !== "idle") return;

  clearIdleTimer();

  if (
    sleepPhase.value === "sleeping" ||
    sleepPhase.value === "falling-asleep"
  ) {
    sleepPhase.value = prefersReducedMotion.value ? "awake" : "waking";
    return;
  }

  if (sleepPhase.value === "awake") scheduleIdleSleep();
}

function completeTransition(): void {
  if (effectiveExpression.value === "fallingAsleep") {
    sleepPhase.value = "sleeping";
  } else if (effectiveExpression.value === "waking") {
    sleepPhase.value = "awake";
    scheduleIdleSleep();
  }
}

function scheduleNextFrame(): void {
  clearFrameTimer();

  const expression = currentExpression.value;
  const isLastFrame = frameIndex.value === expression.frames.length - 1;

  if (
    !isMounted.value ||
    props.paused ||
    prefersReducedMotion.value ||
    expression.frames.length < 2
  ) {
    return;
  }

  frameTimer = window.setTimeout(() => {
    if (isLastFrame && !expression.loop) {
      completeTransition();
      return;
    }

    frameIndex.value = isLastFrame ? 0 : frameIndex.value + 1;
    scheduleNextFrame();
  }, currentFrame.value.durationMs);
}

function handleReducedMotionChange(event: MediaQueryListEvent): void {
  prefersReducedMotion.value = event.matches;
  frameIndex.value = 0;
  if (event.matches && sleepPhase.value === "falling-asleep")
    sleepPhase.value = "sleeping";
  if (event.matches && sleepPhase.value === "waking")
    sleepPhase.value = "awake";
  resetGaze();
  scheduleNextFrame();
}

function applyPupilOffset(offsetX: number, offsetY: number): void {
  const transform = `translate3d(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px, 0)`;

  if (leftPupilElement.value)
    leftPupilElement.value.style.transform = transform;
  if (rightPupilElement.value)
    rightPupilElement.value.style.transform = transform;
}

function calculateGazeTarget(): void {
  gazeTargetDirty = false;

  if (
    !props.trackPointer ||
    prefersReducedMotion.value ||
    !pointerPosition ||
    currentFrame.value.eyes.mode !== "tracking" ||
    !characterElement.value
  ) {
    targetGaze = { x: 0, y: 0 };
    return;
  }

  if (boundsDirty || !characterBounds) {
    characterBounds = characterElement.value.getBoundingClientRect();
    boundsDirty = false;
  }

  const centerX = characterBounds.left + characterBounds.width / 2;
  const centerY = characterBounds.top + characterBounds.height / 2;
  const deltaX = pointerPosition.x - centerX;
  const deltaY = pointerPosition.y - centerY;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance < 36) {
    targetGaze = { x: 0, y: 0 };
    return;
  }

  const strength = Math.min(1, (distance - 36) / 120);
  targetGaze = {
    x: (deltaX / distance) * characterBounds.height * 0.11 * strength,
    y: (deltaY / distance) * characterBounds.height * 0.08 * strength,
  };
}

function updateGaze(): void {
  gazeAnimationFrame = undefined;

  if (gazeTargetDirty || boundsDirty) calculateGazeTarget();

  const easing = prefersReducedMotion.value ? 1 : 0.28;
  currentGaze = {
    x: currentGaze.x + (targetGaze.x - currentGaze.x) * easing,
    y: currentGaze.y + (targetGaze.y - currentGaze.y) * easing,
  };

  const remainingDistance = Math.hypot(
    targetGaze.x - currentGaze.x,
    targetGaze.y - currentGaze.y,
  );

  if (remainingDistance < 0.01) currentGaze = { ...targetGaze };
  applyPupilOffset(currentGaze.x, currentGaze.y);

  if (remainingDistance >= 0.01) scheduleGazeUpdate();
}

function scheduleGazeUpdate(): void {
  if (!isMounted.value || gazeAnimationFrame !== undefined) return;
  gazeAnimationFrame = window.requestAnimationFrame(updateGaze);
}

function handlePointerMove(event: PointerEvent): void {
  pointerPosition = { x: event.clientX, y: event.clientY };
  gazeTargetDirty = true;
  scheduleGazeUpdate();
}

function resetGaze(): void {
  pointerPosition = undefined;
  gazeTargetDirty = true;
  scheduleGazeUpdate();
}

function invalidateCharacterBounds(): void {
  boundsDirty = true;
  gazeTargetDirty = true;
  scheduleGazeUpdate();
}

function handleOperationPointerOver(event: PointerEvent): void {
  const target = event.target;

  if (target instanceof Element && target.closest('button, [role="button"]')) {
    wake();
  }
}

watch(effectiveExpression, () => {
  frameIndex.value = 0;
  scheduleNextFrame();
});

watch(currentFrame, () => {
  gazeTargetDirty = true;
  scheduleGazeUpdate();
});

watch(
  () => props.expression,
  () => {
    sleepPhase.value = "awake";
    scheduleIdleSleep();
  },
);

watch(
  () => [props.autoSleep, props.sleepAfterMs] as const,
  () => scheduleIdleSleep(),
);

watch(
  () => props.paused,
  () => scheduleNextFrame(),
);

watch(
  () => props.trackPointer,
  (shouldTrackPointer) => {
    if (!shouldTrackPointer) resetGaze();
  },
);

onMounted(() => {
  isMounted.value = true;
  reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  prefersReducedMotion.value = reducedMotionQuery.matches;
  reducedMotionQuery.addEventListener("change", handleReducedMotionChange);
  resizeObserver = new ResizeObserver(invalidateCharacterBounds);
  resizeObserver.observe(characterElement.value!);
  if (characterElement.value?.parentElement) {
    resizeObserver.observe(characterElement.value.parentElement);
  }
  window.addEventListener("blur", resetGaze);
  window.addEventListener("click", wake);
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("resize", invalidateCharacterBounds, {
    passive: true,
  });
  document.addEventListener("pointerover", handleOperationPointerOver, {
    passive: true,
  });
  document.documentElement.addEventListener("pointerleave", resetGaze);
  scheduleNextFrame();
  scheduleIdleSleep();
});

onUnmounted(() => {
  isMounted.value = false;
  clearFrameTimer();
  clearIdleTimer();
  if (gazeAnimationFrame !== undefined) {
    window.cancelAnimationFrame(gazeAnimationFrame);
  }
  reducedMotionQuery?.removeEventListener("change", handleReducedMotionChange);
  resizeObserver?.disconnect();
  window.removeEventListener("blur", resetGaze);
  window.removeEventListener("click", wake);
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("resize", invalidateCharacterBounds);
  document.removeEventListener("pointerover", handleOperationPointerOver);
  document.documentElement.removeEventListener("pointerleave", resetGaze);
});
</script>

<template>
  <span
    ref="characterElement"
    class="pine-character"
    :data-expression="effectiveExpression"
    :data-size="props.size"
    :role="props.decorative ? undefined : 'img'"
    :aria-label="props.decorative ? undefined : props.label"
    :aria-hidden="props.decorative ? 'true' : undefined"
    :data-tracking="currentFrame.eyes.mode === 'tracking'"
  >
    <span>(</span>
    <span class="pine-character__eye">
      <span ref="leftPupilElement" class="pine-character__pupil">•</span>
      <span class="pine-character__fixed-eye">{{ fixedEyes?.left }}</span>
    </span>
    <span class="pine-character__mouth">{{ currentFrame.mouth }}</span>
    <span class="pine-character__eye">
      <span ref="rightPupilElement" class="pine-character__pupil">•</span>
      <span class="pine-character__fixed-eye">{{ fixedEyes?.right }}</span>
    </span>
    <span>)</span>
    <span class="pine-character__suffix" aria-hidden="true">{{
      currentSuffix
    }}</span>
  </span>
</template>

<style scoped>
.pine-character {
  position: relative;
  display: inline-flex;
  min-width: 4.5em;
  height: 1.25em;
  align-items: center;
  justify-content: center;
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 1.25rem;
  font-variant-ligatures: none;
  font-weight: 600;
  line-height: 1;
  text-align: center;
  white-space: pre;
  user-select: none;
}

.pine-character__eye {
  position: relative;
  display: inline-grid;
  width: 0.68em;
  height: 1em;
  place-items: center;
}

.pine-character__pupil,
.pine-character__fixed-eye {
  grid-area: 1 / 1;
}

.pine-character__pupil {
  will-change: transform;
}

.pine-character__fixed-eye {
  opacity: 0;
}

.pine-character[data-tracking="false"] .pine-character__pupil {
  opacity: 0;
}

.pine-character[data-tracking="false"] .pine-character__fixed-eye {
  opacity: 1;
}

.pine-character__mouth {
  display: inline-grid;
  width: 0.72em;
  place-items: center;
}

.pine-character__suffix {
  position: absolute;
  top: -0.24em;
  left: calc(50% + 1.55em);
  width: 2.5em;
  color: var(--muted-foreground);
  font-size: 0.52em;
  font-weight: 500;
  letter-spacing: 0.03em;
  line-height: 1;
  text-align: left;
}

.pine-character[data-size="sm"] {
  font-size: 1rem;
}

.pine-character[data-size="lg"] {
  font-size: 1.75rem;
}
</style>
