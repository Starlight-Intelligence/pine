import type { PineAgentEvent, PineJsonValue } from "../shared/agent";
import type {
  LoginProviderRequest,
  PineModelCatalog,
  PineProviderAuthEvent,
  PineThinkingLevel,
  ProviderLoginResult,
} from "../shared/models";
import type { PineSessionSummary } from "../shared/sessions";

export interface AgentSessionLocation {
  agentDir: string;
  cwd: string;
  sessionsRoot: string;
}

export type PineRuntimeEvent = PineAgentEvent | PineProviderAuthEvent;

export type AgentWorkerRequest =
  | {
      id: string;
      type: "session:create";
      location: AgentSessionLocation;
    }
  | {
      id: string;
      type: "session:open";
      location: AgentSessionLocation;
      sessionFile: string;
    }
  | {
      id: string;
      type: "session:prompt";
      sessionId: string;
      message: string;
      streamingBehavior?: "followUp" | "steer";
    }
  | {
      id: string;
      type: "session:abort";
      sessionId: string;
    }
  | {
      id: string;
      type: "session:dispose";
      sessionId: string;
    }
  | {
      id: string;
      type: "models:catalog";
      agentDir: string;
    }
  | ({
      id: string;
      type: "provider:login";
      agentDir: string;
    } & LoginProviderRequest)
  | {
      id: string;
      type: "provider:auth-response";
      loginId: string;
      promptId: string;
      value: string;
    }
  | {
      id: string;
      type: "provider:auth-cancel";
      loginId: string;
    }
  | {
      id: string;
      type: "provider:logout";
      agentDir: string;
      providerId: string;
    }
  | {
      id: string;
      type: "models:select";
      agentDir: string;
      modelId: string;
      providerId: string;
      sessionId?: string;
      thinkingLevel: PineThinkingLevel;
    }
  | {
      id: string;
      type: "runtime:dispose";
    };

export type AgentWorkerRequestInput = AgentWorkerRequest extends infer TRequest
  ? TRequest extends { id: string }
    ? Omit<TRequest, "id">
    : never
  : never;

export interface AgentWorkerSessionResult {
  session: PineSessionSummary;
  sessionFile?: string;
}

export interface AgentWorkerPromptResult extends AgentWorkerSessionResult {
  accepted: boolean;
}

export type AgentWorkerResult =
  | AgentWorkerSessionResult
  | AgentWorkerPromptResult
  | PineModelCatalog
  | ProviderLoginResult
  | { accepted: boolean }
  | { aborted: boolean }
  | { cancelled: boolean }
  | { disposed: boolean };

export type AgentWorkerMessage =
  | { type: "ready" }
  | {
      type: "response";
      id: string;
      ok: true;
      result: AgentWorkerResult;
    }
  | {
      type: "response";
      id: string;
      ok: false;
      error: { message: string; code?: string };
    }
  | { type: "event"; event: PineRuntimeEvent };

export function toPineJsonValue(value: unknown): PineJsonValue {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as PineJsonValue;
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
