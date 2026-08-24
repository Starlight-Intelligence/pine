import { utilityProcess } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { PineAgentEvent } from "../shared/agent";
import type {
  AgentSessionLocation,
  AgentWorkerMessage,
  AgentWorkerPromptResult,
  AgentWorkerRequest,
  AgentWorkerRequestInput,
  AgentWorkerResult,
  AgentWorkerSessionResult,
} from "../agent/protocol";

interface AgentProcess {
  kill(): boolean;
  on(event: "exit", listener: (code: number) => void): this;
  on(event: "message", listener: (message: unknown) => void): this;
  postMessage(message: AgentWorkerRequest): void;
}

export interface AgentHost {
  abort(sessionId: string): Promise<{ aborted: boolean }>;
  createSession(
    location: AgentSessionLocation,
  ): Promise<AgentWorkerSessionResult>;
  disposeSession(sessionId: string): Promise<{ disposed: boolean }>;
  openSession(
    location: AgentSessionLocation,
    sessionFile: string,
  ): Promise<AgentWorkerSessionResult>;
  prompt(
    sessionId: string,
    message: string,
    streamingBehavior?: "followUp" | "steer",
  ): Promise<AgentWorkerPromptResult>;
  subscribe(listener: (event: PineAgentEvent) => void): () => void;
}

type AgentProcessFactory = () => AgentProcess;

interface PendingRequest {
  reject: (reason: Error) => void;
  resolve: (result: AgentWorkerResult) => void;
}

export class AgentProcessHost implements AgentHost {
  private process: AgentProcess | null = null;
  private ready: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly listeners = new Set<(event: PineAgentEvent) => void>();

  constructor(private readonly createProcess: AgentProcessFactory) {}

  static createDefault(): AgentProcessHost {
    return new AgentProcessHost(() =>
      utilityProcess.fork(path.join(__dirname, "agent.js"), [], {
        serviceName: "Pine Agent",
        stdio: "pipe",
      }),
    );
  }

  createSession(
    location: AgentSessionLocation,
  ): Promise<AgentWorkerSessionResult> {
    return this.request({ type: "session:create", location });
  }

  openSession(
    location: AgentSessionLocation,
    sessionFile: string,
  ): Promise<AgentWorkerSessionResult> {
    return this.request({ type: "session:open", location, sessionFile });
  }

  prompt(
    sessionId: string,
    message: string,
    streamingBehavior?: "followUp" | "steer",
  ): Promise<AgentWorkerPromptResult> {
    return this.request({
      type: "session:prompt",
      sessionId,
      message,
      ...(streamingBehavior ? { streamingBehavior } : {}),
    });
  }

  abort(sessionId: string): Promise<{ aborted: boolean }> {
    return this.request({ type: "session:abort", sessionId });
  }

  disposeSession(sessionId: string): Promise<{ disposed: boolean }> {
    return this.request({ type: "session:dispose", sessionId });
  }

  subscribe(listener: (event: PineAgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    const process = this.process;
    if (!process) return;

    try {
      await this.request({ type: "runtime:dispose" });
    } finally {
      process.kill();
      this.resetProcess(new Error("The Pine agent process was disposed."));
    }
  }

  private async request<TResult extends AgentWorkerResult>(
    request: AgentWorkerRequestInput,
  ): Promise<TResult> {
    await this.ensureReady();
    const id = randomUUID();
    const message = { ...request, id } as AgentWorkerRequest;
    return new Promise<TResult>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (result) => resolve(result as TResult),
        reject,
      });
      this.process?.postMessage(message);
    });
  }

  private ensureReady(): Promise<void> {
    if (this.ready) return this.ready;

    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
    const process = this.createProcess();
    this.process = process;
    process.on("message", (message) => this.handleMessage(message));
    process.on("exit", (code) => {
      if (this.process !== process) return;
      this.resetProcess(
        new Error(`The Pine agent process exited unexpectedly (${code}).`),
      );
    });
    return this.ready;
  }

  private handleMessage(message: unknown): void {
    const workerMessage = message as AgentWorkerMessage;
    if (workerMessage.type === "ready") {
      this.resolveReady?.();
      this.resolveReady = null;
      return;
    }
    if (workerMessage.type === "event") {
      for (const listener of this.listeners) listener(workerMessage.event);
      return;
    }

    const pending = this.pending.get(workerMessage.id);
    if (!pending) return;
    this.pending.delete(workerMessage.id);
    if (workerMessage.ok) pending.resolve(workerMessage.result);
    else pending.reject(new Error(workerMessage.error.message));
  }

  private resetProcess(error: Error): void {
    this.process = null;
    this.ready = null;
    this.resolveReady = null;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
