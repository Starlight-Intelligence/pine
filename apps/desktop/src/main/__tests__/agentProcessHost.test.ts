import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { AgentWorkerRequest } from "../../agent/protocol";
import type { PineAgentEvent } from "../../shared/agent";
import { AgentProcessHost } from "../agentProcessHost";

vi.mock("electron", () => ({
  utilityProcess: { fork: vi.fn() },
}));

class FakeAgentProcess extends EventEmitter {
  readonly requests: AgentWorkerRequest[] = [];
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }

  postMessage(message: AgentWorkerRequest): void {
    this.requests.push(message);
  }
}

function createHost() {
  const process = new FakeAgentProcess();
  const host = new AgentProcessHost(() => {
    queueMicrotask(() => process.emit("message", { type: "ready" }));
    return process;
  });
  return { host, process };
}

describe("AgentProcessHost", () => {
  it("correlates typed requests and responses", async () => {
    const { host, process } = createHost();
    const location = {
      agentDir: "/pine/agent",
      cwd: "/project",
      sessionsRoot: "/pine/sessions",
    };
    const pending = host.createSession(location);
    await vi.waitFor(() => expect(process.requests).toHaveLength(1));
    const request = process.requests[0];

    process.emit("message", {
      type: "response",
      id: request.id,
      ok: true,
      result: {
        session: {
          id: "session-1",
          createdAt: "2026-08-24T12:00:00.000Z",
          updatedAt: "2026-08-24T12:00:00.000Z",
          messageCount: 0,
        },
      },
    });

    await expect(pending).resolves.toEqual(
      expect.objectContaining({
        session: expect.objectContaining({ id: "session-1" }),
      }),
    );
    expect(request).toEqual(
      expect.objectContaining({ type: "session:create", location }),
    );
  });

  it("forwards worker events to subscribers", async () => {
    const { host, process } = createHost();
    const listener = vi.fn();
    host.subscribe(listener);
    const event: PineAgentEvent = {
      type: "run-state",
      sessionId: "session-1",
      state: "running",
    };

    const pending = host.abort("session-1");
    await vi.waitFor(() => expect(process.requests).toHaveLength(1));
    process.emit("message", { type: "event", event });
    expect(listener).toHaveBeenCalledWith(event);

    process.emit("message", {
      type: "response",
      id: process.requests[0].id,
      ok: true,
      result: { aborted: true },
    });
    await pending;
  });

  it("rejects pending work when the utility process exits", async () => {
    const { host, process } = createHost();
    const pending = host.abort("session-1");
    await vi.waitFor(() => expect(process.requests).toHaveLength(1));

    process.emit("exit", 9);

    await expect(pending).rejects.toThrow(
      "The Pine agent process exited unexpectedly (9).",
    );
  });
});
