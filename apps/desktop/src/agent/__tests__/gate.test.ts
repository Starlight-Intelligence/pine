import { describe, expect, it, vi } from "vitest";
import type { GateHost, ToolGate } from "../gate";
import { AutoReviewGate, normalizeCommand, UserApprovalGate } from "../gate";

interface HostMocks {
  emit: ReturnType<typeof vi.fn>;
  judge: ReturnType<typeof vi.fn>;
  requestUserApproval: ReturnType<typeof vi.fn>;
}

function createHost(
  judgeImpl: GateHost["judge"] = () => Promise.resolve({ verdict: "allow" }),
  requestApprovalImpl: GateHost["requestUserApproval"] = () =>
    Promise.resolve({ kind: "allow" }),
): { host: GateHost; mocks: HostMocks } {
  const emit = vi.fn();
  const judge = vi.fn(judgeImpl);
  const requestUserApproval = vi.fn(requestApprovalImpl);
  const host: GateHost = {
    sessionId: "session-1",
    emit,
    turnContext: () => ({}),
    judge,
    requestUserApproval,
  };
  return { host, mocks: { emit, judge, requestUserApproval } };
}

describe("UserApprovalGate", () => {
  it("lets read calls pass pre-execution review silently", async () => {
    const { host, mocks } = createHost();
    const gate = new UserApprovalGate(host);

    await expect(
      gate.reviewFileCall({
        toolCallId: "t0",
        toolName: "read",
        path: "/outside/notes.txt",
      }),
    ).resolves.toEqual({ kind: "allow" });
    expect(mocks.requestUserApproval).not.toHaveBeenCalled();
  });

  it("routes bash reviews to the user as pre-execution confirmations", async () => {
    const { host, mocks } = createHost(undefined, () =>
      Promise.resolve({ kind: "deny", reason: "no" }),
    );
    const gate = new UserApprovalGate(host);

    await expect(
      gate.reviewBashCommand({
        toolCallId: "t1",
        command: "npm test",
        signal: undefined,
      }),
    ).resolves.toEqual({ kind: "deny", reason: "no" });
    expect(mocks.requestUserApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "pre-execution",
        toolCallId: "t1",
        toolName: "bash",
        subject: "npm test",
      }),
    );
  });

  it("maps denial reviews to their triggers and carries the evidence", async () => {
    const { host, mocks } = createHost();
    const gate = new UserApprovalGate(host);

    await gate.reviewDenial("sandbox", {
      toolCallId: "t2",
      toolName: "bash",
      subject: "npm install",
      evidence: "Operation not permitted",
      signal: undefined,
    });
    expect(mocks.requestUserApproval).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        trigger: "sandbox-denied",
        subject: "npm install",
        evidence: "Operation not permitted",
      }),
    );

    await gate.reviewDenial("authorize", {
      toolCallId: "t3",
      toolName: "write",
      subject: "/etc/hosts",
      evidence: "Path is outside the folders shared with Pine: /etc/hosts",
      signal: undefined,
    });
    expect(mocks.requestUserApproval).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        trigger: "authorize-denied",
        subject: "/etc/hosts",
      }),
    );
  });

  it("routes privileged calls to a distinct per-call user approval", async () => {
    const { host, mocks } = createHost();
    const gate = new UserApprovalGate(host);

    await gate.reviewPrivilegedCall({
      toolCallId: "privileged-1",
      toolName: "privileged_bash",
      subject: "open -a Finder",
      description: "Open Finder",
      evidence: "Native application control requires elevated execution.",
    });

    expect(mocks.requestUserApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "privileged-execution",
        toolCallId: "privileged-1",
        toolName: "privileged_bash",
        subject: "open -a Finder",
      }),
    );
  });

  it("never remembers approved commands", () => {
    const { host } = createHost();
    const gate: ToolGate = new UserApprovalGate(host);
    expect(gate.isApprovedCommand("anything")).toBe(false);
  });
});

describe("AutoReviewGate", () => {
  it("allows ordinary commands without consulting the judge", async () => {
    const { host, mocks } = createHost();
    const gate = new AutoReviewGate(host);

    await expect(
      gate.reviewBashCommand({ toolCallId: "t1", command: "bun run test" }),
    ).resolves.toEqual({ kind: "allow" });
    expect(mocks.judge).not.toHaveBeenCalled();
  });

  it("escalates destructive-pattern matches to the judge", async () => {
    const { host, mocks } = createHost(() =>
      Promise.resolve({ verdict: "deny", reason: "untracked files" }),
    );
    const gate = new AutoReviewGate(host);

    await expect(
      gate.reviewBashCommand({
        toolCallId: "t1",
        command: "rm -rf node_modules",
      }),
    ).resolves.toEqual({ kind: "deny", reason: "untracked files" });
    expect(mocks.judge).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "destructive-pattern",
        subject: "rm -rf node_modules",
        evidence: expect.stringContaining("recursive-force-delete"),
      }),
    );
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "approval-decided",
        verdict: "denied",
        decidedBy: "judge",
        reason: "untracked files",
      }),
    );
  });

  it("records session-scope approvals as normalized allowlist entries", async () => {
    const { host, mocks } = createHost();
    mocks.judge.mockResolvedValue({ verdict: "allow", scope: "session" });
    const gate = new AutoReviewGate(host);

    // Only escalated (destructive-pattern) commands reach the judge, so the
    // allowlist is exercised with a destructive command.
    await gate.reviewBashCommand({
      toolCallId: "t1",
      command: "rm    -rf   build",
    });
    expect(gate.isApprovedCommand("rm -rf build")).toBe(true);

    mocks.judge.mockClear();
    await expect(
      gate.reviewBashCommand({ toolCallId: "t2", command: "rm -rf build" }),
    ).resolves.toEqual({ kind: "allow" });
    expect(mocks.judge).not.toHaveBeenCalled();
  });

  it("reviews identical privileged calls every time without caching session scope", async () => {
    const { host, mocks } = createHost();
    mocks.judge.mockResolvedValue({ verdict: "allow", scope: "session" });
    const gate = new AutoReviewGate(host);
    const review = {
      toolName: "privileged_bash",
      subject: "open -a Finder",
      description: "Open Finder",
      evidence: "Native application control requires elevated execution.",
    };

    await expect(
      gate.reviewPrivilegedCall({ toolCallId: "p1", ...review }),
    ).resolves.toEqual({ kind: "allow", scope: "once" });
    await expect(
      gate.reviewPrivilegedCall({ toolCallId: "p2", ...review }),
    ).resolves.toEqual({ kind: "allow", scope: "once" });

    expect(mocks.judge).toHaveBeenCalledTimes(2);
    expect(mocks.judge).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        trigger: "privileged-execution",
        allowSessionScope: false,
      }),
    );
    expect(gate.isApprovedCommand("open -a Finder")).toBe(false);
  });

  it("fails closed when the judge errors", async () => {
    const { host, mocks } = createHost();
    mocks.judge.mockRejectedValue(new Error("provider down"));
    const gate = new AutoReviewGate(host);

    await expect(
      gate.reviewBashCommand({ toolCallId: "t1", command: "rm -rf build" }),
    ).resolves.toEqual({
      kind: "deny",
      reason: expect.stringContaining("provider down"),
    });
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "approval-decided",
        verdict: "denied",
        decidedBy: "judge",
      }),
    );
  });

  it("stops reviewing after too many consecutive escalations", async () => {
    const { host, mocks } = createHost(() =>
      Promise.resolve({ verdict: "deny", reason: "denied" }),
    );
    const gate = new AutoReviewGate(host);
    const command = "rm -rf build";

    for (let index = 0; index < 5; index += 1) {
      await gate.reviewBashCommand({ toolCallId: `t${index}`, command });
    }
    expect(mocks.judge).toHaveBeenCalledTimes(5);

    const capped = await gate.reviewBashCommand({
      toolCallId: "t-final",
      command,
    });
    expect(capped).toEqual({
      kind: "deny",
      reason: expect.stringContaining("Too many escalations"),
    });
    expect(mocks.judge).toHaveBeenCalledTimes(5);
  });

  it("resetTurn clears the escalation streak", async () => {
    const { host, mocks } = createHost(() =>
      Promise.resolve({ verdict: "deny", reason: "denied" }),
    );
    const gate = new AutoReviewGate(host);
    const command = "rm -rf build";

    for (let index = 0; index < 5; index += 1) {
      await gate.reviewBashCommand({ toolCallId: `t${index}`, command });
    }
    gate.resetTurn();

    await gate.reviewBashCommand({ toolCallId: "t-new", command });
    expect(mocks.judge).toHaveBeenCalledTimes(6);
  });
});

describe("normalizeCommand", () => {
  it("collapses whitespace", () => {
    expect(normalizeCommand("  echo   'a  b'  ")).toBe("echo 'a b'");
  });
});
