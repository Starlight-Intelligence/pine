export const GET_CONTEXT_COMPACTION_STRATEGY_CHANNEL =
  "preferences:get-context-compaction-strategy" as const;
export const SET_CONTEXT_COMPACTION_STRATEGY_CHANNEL =
  "preferences:set-context-compaction-strategy" as const;

export type PineContextCompactionStrategy = "passive" | "recommended";

export const DEFAULT_CONTEXT_COMPACTION_STRATEGY =
  "recommended" satisfies PineContextCompactionStrategy;

export function isPineContextCompactionStrategy(
  value: unknown,
): value is PineContextCompactionStrategy {
  return value === "passive" || value === "recommended";
}

export interface SetContextCompactionStrategyRequest {
  strategy: PineContextCompactionStrategy;
}

export interface SetContextCompactionStrategyResult {
  updated: boolean;
}
