export const modelOptions = [
  { value: "lightweight", label: "Quill" },
  { value: "balanced", label: "Folio" },
  { value: "advanced", label: "Lore" },
] as const;

export type Model = (typeof modelOptions)[number]["value"];

export const reasoningEfforts = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "auto",
] as const;

export type ReasoningEffort = (typeof reasoningEfforts)[number];
