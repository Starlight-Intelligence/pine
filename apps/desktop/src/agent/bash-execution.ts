import { spawn, type ChildProcess } from "node:child_process";
import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { createMacOsBashSandboxProfile } from "./bash-sandbox";
import { createBashEnvironment } from "./bash-env";
import type { PineToolAccessPolicy } from "./tool-access-policy";

/**
 * A failed sandboxed process emitted permission-related text. This is only
 * diagnostic evidence: output cannot identify the enforcing authority.
 */
export class SandboxCommandPermissionError extends Error {
  constructor(readonly outputTail: string) {
    super(
      "The command failed inside the project sandbox and reported a permission-related error. This may be a sandbox restriction or an ordinary OS/application permission failure. Use privileged_bash for this operation if it genuinely requires capabilities outside the project sandbox.",
    );
  }
}

/** A diagnostic hint only; no command-specific error codes or authorization. */
export function hasPermissionDiagnostic(output: string): boolean {
  return /operation not permitted|permission denied|permission error|access denied|\bE(?:PERM|ACCES)\b|blocked by sandbox|sandbox(?:_extension| violation| denied)/i.test(
    output,
  );
}

function terminateProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

export function createScopedBashOperations(
  policy: PineToolAccessPolicy,
  temporaryDirectory: string,
  loginPath: string,
  runtimeFiles: string[],
): BashOperations {
  return {
    exec: async (command, cwd, options) => {
      await policy.authorize(cwd, "write");
      if (process.platform !== "darwin") {
        throw new Error(
          "Bash is unavailable because Pine cannot enforce project read/write boundaries on this platform yet.",
        );
      }
      if (options.signal?.aborted) throw new Error("aborted");

      let timeoutMs: number | undefined;
      if (options.timeout !== undefined) {
        if (!Number.isFinite(options.timeout) || options.timeout <= 0) {
          throw new Error("Invalid timeout: must be a positive number");
        }
        timeoutMs = Math.min(options.timeout * 1_000, 2_147_483_647);
      }
      const shellPath = "/bin/zsh";
      const profile = createMacOsBashSandboxProfile({
        readablePaths: policy.readablePaths(),
        writableFolders: policy.writableFolders(),
        temporaryDirectory,
        runtimeFiles,
      });
      const child = spawn(
        "/usr/bin/sandbox-exec",
        // pipefail: a sandbox denial at the head of a pipeline (`ps aux | head`)
        // must surface in the exit code, or the gate never sees it — the last
        // stage succeeds and the default exit code would be 0. no_bg_nice
        // prevents zsh from trying to renice background jobs, which the
        // sandbox rejects even though the requested job itself starts.
        [
          "-p",
          profile,
          shellPath,
          // Do not source the user's ~/.zshenv outside the shared folders.
          "-f",
          "-o",
          "pipefail",
          "-o",
          "no_bg_nice",
          "-c",
          command,
        ],
        {
          cwd: policy.cwd,
          detached: true,
          env: createBashEnvironment(
            options.env,
            temporaryDirectory,
            loginPath,
            policy.cwd,
          ),
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        },
      );

      child.stdout.on("data", options.onData);
      // Keep bounded tails of BOTH streams as gate evidence: tool-emitted
      // messages (LaunchServices, AppleScript) follow the command's own
      // redirections, so denial text can land on stdout via `2>&1`.
      let stdoutTail = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutTail = (stdoutTail + chunk.toString("utf8")).slice(-8_192);
      });
      let stderrTail = "";
      child.stderr.on("data", (chunk: Buffer) => {
        options.onData(chunk);
        stderrTail = (stderrTail + chunk.toString("utf8")).slice(-8_192);
      });
      let timedOut = false;
      let timeoutHandle: NodeJS.Timeout | undefined;
      let killHandle: NodeJS.Timeout | undefined;
      const onAbort = () => {
        terminateProcess(child, "SIGTERM");
        killHandle ??= setTimeout(
          () => terminateProcess(child, "SIGKILL"),
          500,
        );
      };
      if (options.signal?.aborted) onAbort();
      else options.signal?.addEventListener("abort", onAbort, { once: true });
      if (timeoutMs !== undefined) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          onAbort();
        }, timeoutMs);
      }

      // Background descendants can keep inherited pipes open after the shell exits.
      let drainHandle: NodeJS.Timeout | undefined;
      child.once("exit", () => {
        drainHandle = setTimeout(() => {
          child.stdout.destroy();
          child.stderr.destroy();
        }, 1_000);
      });
      try {
        const { exitCode, exitSignal } = await new Promise<{
          exitCode: number | null;
          exitSignal: NodeJS.Signals | null;
        }>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", (code, signal) => {
            resolve({ exitCode: code, exitSignal: signal });
          });
        });
        if (options.signal?.aborted) throw new Error("aborted");
        if (timedOut) throw new Error(`timeout:${options.timeout}`);
        // Preserve the actual exit status, including SIGPIPE (141).
        // Output is untrusted diagnostic text, never proof of an OS denial.
        // Successful commands may legitimately print permission errors.
        const outputTail = `${stdoutTail}\n${stderrTail}`;
        if (
          exitCode !== null &&
          exitCode !== 0 &&
          hasPermissionDiagnostic(outputTail)
        ) {
          throw new SandboxCommandPermissionError(outputTail);
        }
        if (exitCode === null) {
          throw new Error(
            `Shell terminated by signal ${exitSignal ?? "unknown"}.\n${outputTail.trim()}`,
          );
        }
        return { exitCode };
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (killHandle) clearTimeout(killHandle);
        if (drainHandle) clearTimeout(drainHandle);
        options.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
