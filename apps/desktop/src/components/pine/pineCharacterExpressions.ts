export interface PineCharacterFrame {
  durationMs: number;
  eyes: PineCharacterEyes;
  mouth: string;
  suffix?: string;
}

export type PineCharacterEyes =
  | { mode: 'tracking' }
  | { left: string; mode: 'fixed'; right: string };

export interface PineCharacterExpression {
  frames: readonly [PineCharacterFrame, ...PineCharacterFrame[]];
  loop: boolean;
}

export const pineCharacterExpressions = {
  idle: {
    loop: true,
    frames: [
      { eyes: { mode: 'tracking' }, mouth: 'ᴗ', durationMs: 2400 },
      { eyes: { mode: 'fixed', left: '–', right: '–' }, mouth: 'ᴗ', durationMs: 140 },
      { eyes: { mode: 'tracking' }, mouth: 'ᴗ', durationMs: 2200 },
    ],
  },
  fallingAsleep: {
    loop: false,
    frames: [
      { eyes: { mode: 'tracking' }, mouth: 'ᴗ', durationMs: 180 },
      { eyes: { mode: 'fixed', left: 'ᵕ', right: '•' }, mouth: 'ᴗ', durationMs: 220 },
      { eyes: { mode: 'fixed', left: 'ᵕ', right: 'ᵕ' }, mouth: 'ᴗ', durationMs: 300 },
      { eyes: { mode: 'fixed', left: '–', right: '–' }, mouth: 'ᴗ', durationMs: 180 },
    ],
  },
  sleeping: {
    loop: true,
    frames: [
      {
        eyes: { mode: 'fixed', left: 'ᵕ', right: 'ᵕ' },
        mouth: 'ᴗ',
        suffix: 'z',
        durationMs: 420,
      },
      {
        eyes: { mode: 'fixed', left: 'ᵕ', right: 'ᵕ' },
        mouth: 'ᴗ',
        suffix: 'zZ',
        durationMs: 420,
      },
      {
        eyes: { mode: 'fixed', left: 'ᵕ', right: 'ᵕ' },
        mouth: 'ᴗ',
        suffix: 'zZZ',
        durationMs: 900,
      },
      {
        eyes: { mode: 'fixed', left: 'ᵕ', right: 'ᵕ' },
        mouth: 'ᴗ',
        suffix: '',
        durationMs: 420,
      },
    ],
  },
  waking: {
    loop: false,
    frames: [
      { eyes: { mode: 'fixed', left: 'ᵕ', right: 'ᵕ' }, mouth: 'ᴗ', durationMs: 180 },
      { eyes: { mode: 'fixed', left: 'ᵕ', right: '•' }, mouth: 'ᴗ', durationMs: 180 },
      { eyes: { mode: 'tracking' }, mouth: 'ᴗ', durationMs: 240 },
    ],
  },
  thinking: {
    loop: true,
    frames: [
      { eyes: { mode: 'tracking' }, mouth: '_', durationMs: 1600 },
      { eyes: { mode: 'fixed', left: '–', right: '–' }, mouth: '_', durationMs: 140 },
    ],
  },
  working: {
    loop: true,
    frames: [
      { eyes: { mode: 'tracking' }, mouth: '⌣', durationMs: 900 },
      { eyes: { mode: 'fixed', left: '–', right: '–' }, mouth: '⌣', durationMs: 120 },
    ],
  },
  success: {
    loop: false,
    frames: [
      { eyes: { mode: 'tracking' }, mouth: 'ᴗ', durationMs: 180 },
      { eyes: { mode: 'fixed', left: '＾', right: '＾' }, mouth: '▽', durationMs: 1200 },
    ],
  },
} as const satisfies Record<string, PineCharacterExpression>;

export type PineCharacterExpressionName = keyof typeof pineCharacterExpressions;
