import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { TSchema } from "typebox";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createLocalBashOperations,
  createReadToolDefinition,
  createWriteToolDefinition,
  defineTool,
  type BashOperations,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { Static } from "typebox";
import type { AgentSessionLocation } from "./protocol";
import type { AgentFolderGrant } from "./protocol";
import { createBashEnvironment, resolveLoginPath } from "./bash-env";
import type { ToolGate } from "./gate";
import type { PineApprovalMode } from "../shared/agent";

type AccessMode = "read" | "write";

interface CanonicalFolderGrant extends AgentFolderGrant {
  path: string;
}

function pathContains(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".." &&
      !path.isAbsolute(relativePath))
  );
}

/**
 * Read-only paths explicitly selected by the user as message attachments.
 * Grants accumulate for the live session. Files match exactly; directories
 * include descendants after realpath canonicalization.
 */
export class PineAttachedPathAccess {
  private readonly paths = new Set<string>();

  async grant(targetPaths: readonly string[]): Promise<void> {
    const canonicalPaths = await Promise.allSettled(
      targetPaths.map((targetPath) => realpath(path.resolve(targetPath))),
    );
    for (const result of canonicalPaths) {
      if (result.status === "fulfilled") this.paths.add(result.value);
    }
  }

  allowsRead(canonicalPath: string): boolean {
    return [...this.paths].some((attachedPath) =>
      pathContains(attachedPath, canonicalPath),
    );
  }

  readablePaths(): string[] {
    return [...this.paths];
  }
}

async function canonicalizeTarget(
  targetPath: string,
  allowMissing: boolean,
): Promise<string> {
  try {
    return await realpath(targetPath);
  } catch (error) {
    if (!allowMissing || (error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const missingSegments: string[] = [];
  let ancestorPath = path.resolve(targetPath);
  while (true) {
    try {
      await lstat(ancestorPath);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parentPath = path.dirname(ancestorPath);
      if (parentPath === ancestorPath) throw error;
      missingSegments.unshift(path.basename(ancestorPath));
      ancestorPath = parentPath;
    }
  }

  const canonicalAncestor = await realpath(ancestorPath);
  return path.join(canonicalAncestor, ...missingSegments);
}

export class PineToolAccessPolicy {
  private constructor(
    readonly cwd: string,
    readonly folders: CanonicalFolderGrant[],
    private readonly attachedPaths?: PineAttachedPathAccess,
    private readonly permissive = false,
  ) {}

  static async create(
    cwd: string,
    folders: AgentFolderGrant[],
    attachedPaths?: PineAttachedPathAccess,
  ): Promise<PineToolAccessPolicy> {
    const canonicalFolders = await Promise.all(
      folders.map(async (folder) => ({
        ...folder,
        path: await realpath(folder.path),
      })),
    );
    const canonicalCwd = await realpath(cwd);
    const defaultGrant = canonicalFolders.find(
      (folder) =>
        folder.access === "read-write" &&
        pathContains(folder.path, canonicalCwd),
    );
    if (!defaultGrant) {
      throw new Error(
        "The project default folder must be an available read-write folder.",
      );
    }
    return new PineToolAccessPolicy(
      canonicalCwd,
      canonicalFolders,
      attachedPaths,
      false,
    );
  }

  /**
   * A policy that authorizes every path. It is only used after an approval
   * gate explicitly allows a denied file operation to cross folder grants.
   */
  static permissive(cwd: string): PineToolAccessPolicy {
    return new PineToolAccessPolicy(cwd, [], undefined, true);
  }

  async authorize(
    targetPath: string,
    mode: AccessMode,
    options: { allowMissing?: boolean } = {},
  ): Promise<string> {
    const canonicalPath = await canonicalizeTarget(
      path.resolve(targetPath),
      options.allowMissing ?? false,
    );
    if (this.permissive) return canonicalPath;
    if (mode === "read" && this.attachedPaths?.allowsRead(canonicalPath)) {
      return canonicalPath;
    }
    const containingGrant = this.folders.find((folder) =>
      pathContains(folder.path, canonicalPath),
    );
    if (!containingGrant) {
      throw new Error(
        `Path is outside the folders shared with Pine: ${targetPath}`,
      );
    }
    if (mode === "write" && containingGrant.access !== "read-write") {
      throw new Error(`Folder is read-only: ${containingGrant.path}`);
    }
    return canonicalPath;
  }

  writableFolders(): string[] {
    if (this.permissive) return [];
    return this.folders
      .filter((folder) => folder.access === "read-write")
      .map((folder) => folder.path);
  }

  readablePaths(): string[] {
    return [
      ...this.folders.map((folder) => folder.path),
      ...(this.attachedPaths?.readablePaths() ?? []),
    ];
  }
}

async function detectImageMimeType(
  policy: PineToolAccessPolicy,
  targetPath: string,
): Promise<string | null> {
  const authorizedPath = await policy.authorize(targetPath, "read");
  const file = await open(authorizedPath, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
      return "image/png";
    }
    if (bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) {
      return "image/jpeg";
    }
    const signature = bytes.toString("ascii");
    if (signature.startsWith("GIF87a") || signature.startsWith("GIF89a")) {
      return "image/gif";
    }
    if (signature.startsWith("RIFF") && signature.slice(8, 12) === "WEBP") {
      return "image/webp";
    }
    if (signature.startsWith("BM")) return "image/bmp";
    return null;
  } finally {
    await file.close();
  }
}

function escapeSandboxString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

/**
 * Thrown when the macOS sandbox denied a command at runtime: an EPERM-class
 * failure, a blocked LaunchServices launch, or blocked Apple Events. Carries
 * the captured output tail (either stream) as review evidence for the gate.
 */
export class SandboxDeniedError extends Error {
  constructor(readonly outputTail: string) {
    super(
      "The project sandbox denied this command. Use privileged_bash for this operation if it genuinely requires capabilities outside the project sandbox.",
    );
  }
}

/**
 * Recognizes sandbox denial evidence in captured command output. These
 * failures announce themselves in several dialects: zsh prints EPERM for
 * denied syscalls, LaunchServices reports blocked app launches with an
 * "LSOpenURLsWithCompletionHandler … error -54" message, and Apple Events
 * that the sandbox cannot deliver surface as the -600 "Application isn't
 * running" error (natively a tell block would auto-launch the app instead).
 * The apostrophe in "isn't" is matched loosely because AppleScript emits a
 * Unicode right single quote.
 */
export function matchSandboxDenial(output: string): boolean {
  return /operation not permitted|permission denied|permission error|access denied|not authou?rized|not permitted|\bE(?:PERM|ACCES)\b|sandbox(?:_extension| violation| denied)|LSOpenURLsWithCompletionHandler|Application isn.t running\. \(-600\)|\((?:-54|-1743|-10004|-5000)\)/i.test(
    output,
  );
}

/** Matches the two denial errors PineToolAccessPolicy.authorize throws. */
function isAuthorizeDenial(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("outside the folders shared with Pine") ||
    message.includes("Folder is read-only")
  );
}

// Runtime installation trees only. In particular, /System includes the Data
// volume and must NOT be granted wholesale. Neither HOME nor arbitrary PATH
// entries are implicit read grants. Other toolchains require shared folders or
// privileged_bash instead of silently widening the filesystem boundary.
const MACOS_RUNTIME_DIRECTORIES = [
  "/bin",
  "/sbin",
  "/usr/bin",
  "/usr/sbin",
  "/usr/lib",
  "/usr/libexec",
  "/usr/share",
  "/System/Library",
  "/System/Cryptexes/OS",
  "/System/Volumes/Preboot/Cryptexes/OS",
  "/private/preboot/Cryptexes/OS",
  "/Library/Apple",
  "/Library/Developer/CommandLineTools",
  "/Applications/Xcode.app/Contents/Developer",
  "/opt/homebrew/Cellar",
  "/usr/local/Cellar",
  "/private/var/db/dyld",
  "/private/var/db/com.apple.dyld",
  "/private/var/db/timezone",
  "/private/etc/ssl/certs",
];

const MACOS_RUNTIME_FILES = [
  // dyld opens the root directory during startup. This grants only the root
  // itself, not its descendants (unlike a subpath "/" rule).
  "/",
  "/dev/null",
  "/dev/zero",
  "/dev/tty",
  "/dev/random",
  "/dev/urandom",
  "/private/etc/zshenv",
  "/private/etc/passwd",
  "/private/etc/group",
  "/private/etc/hosts",
  "/private/etc/resolv.conf",
  "/private/etc/localtime",
  "/private/etc/ssl/cert.pem",
];

export function createMacOsBashSandboxProfile({
  readablePaths,
  writableFolders,
  temporaryDirectory,
  runtimeFiles = [],
}: {
  readablePaths: string[];
  writableFolders: string[];
  temporaryDirectory: string;
  runtimeFiles?: string[];
}): string {
  const writablePaths = new Set([...writableFolders, temporaryDirectory]);
  const readRules = [
    ...new Set([
      ...MACOS_RUNTIME_DIRECTORIES,
      ...readablePaths,
      ...writablePaths,
    ]),
  ].map((target) => `  (subpath "${escapeSandboxString(target)}")`);
  readRules.push(
    ...[...MACOS_RUNTIME_FILES, ...runtimeFiles].map(
      (target) => `  (literal "${escapeSandboxString(target)}")`,
    ),
  );
  const writeRules = [...writablePaths]
    .map((folderPath) => `  (subpath "${escapeSandboxString(folderPath)}")`)
    .join("\n");
  return `(version 1)
(deny default)
(allow process*)
(allow network*)
(allow mach-lookup)
(allow sysctl-read)
; Directory metadata permits path traversal, not listing directory contents.
(allow file-read-metadata
  (vnode-type DIRECTORY)
  (literal "/etc")
  (literal "/tmp")
  (literal "/var"))
(allow file-read* file-map-executable
${readRules.join("\n")})
(allow file-write*
  (literal "/dev/null")
  (literal "/dev/tty")
${writeRules})`;
}

function terminateProcess(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function createScopedBashOperations(
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
      const onAbort = () => terminateProcess(child);
      if (options.signal?.aborted) onAbort();
      else options.signal?.addEventListener("abort", onAbort, { once: true });
      if (timeoutMs !== undefined) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          terminateProcess(child);
        }, timeoutMs);
      }

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
        // With pipefail a writer killed by SIGPIPE (`… | head`) reports 141;
        // that truncation is the intended behavior, not a failure.
        const effectiveExit = exitCode === 141 ? 0 : exitCode;
        // Inspect denial evidence regardless of the final exit status. Shell
        // lists such as `kill <pid>; pgrep ...` can fail a sandboxed segment
        // and then exit 0 because the final diagnostic command succeeded.
        // Treating only non-zero commands as denials made those operations
        // impossible to escalate.
        const outputTail = `${stdoutTail}\n${stderrTail}`;
        if (matchSandboxDenial(outputTail)) {
          throw new SandboxDeniedError(outputTail);
        }
        if (exitCode === null) {
          throw new Error(
            `Shell terminated by signal ${exitSignal ?? "unknown"}.\n${outputTail.trim()}`,
          );
        }
        return { exitCode: effectiveExit };
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        options.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

function createReadOperations(policy: PineToolAccessPolicy) {
  return {
    access: async (targetPath: string) => {
      const authorizedPath = await policy.authorize(targetPath, "read");
      await access(authorizedPath, constants.R_OK);
    },
    detectImageMimeType: (targetPath: string) =>
      detectImageMimeType(policy, targetPath),
    readFile: async (targetPath: string) =>
      readFile(await policy.authorize(targetPath, "read")),
  };
}

function createEditOperations(policy: PineToolAccessPolicy) {
  return {
    access: async (targetPath: string) => {
      const authorizedPath = await policy.authorize(targetPath, "write");
      await access(authorizedPath, constants.R_OK | constants.W_OK);
    },
    readFile: async (targetPath: string) =>
      readFile(await policy.authorize(targetPath, "write")),
    writeFile: async (targetPath: string, content: string) =>
      writeFile(await policy.authorize(targetPath, "write"), content, "utf8"),
  };
}

function createWriteOperations(policy: PineToolAccessPolicy) {
  return {
    mkdir: async (targetPath: string) =>
      mkdir(
        await policy.authorize(targetPath, "write", { allowMissing: true }),
        {
          recursive: true,
        },
      ).then(() => undefined),
    writeFile: async (targetPath: string, content: string) =>
      writeFile(
        await policy.authorize(targetPath, "write", { allowMissing: true }),
        content,
        "utf8",
      ),
  };
}

/**
 * Wrap a file-mutating tool with the approval gate: Let Me Review mode confirms before
 * every call, and an authorize denial (outside grants / read-only) escalates
 * to the gate, whose allowance re-runs the call with permissive operations.
 */
function gateFileTool<TParams extends TSchema, TDetails, TState>(
  tool: ToolDefinition<TParams, TDetails, TState>,
  permissive: ToolDefinition<TParams, TDetails, TState>,
  getGate: () => ToolGate | null,
  getApprovalMode: () => PineApprovalMode,
): ToolDefinition<TParams, TDetails, TState> {
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      if (getApprovalMode() === "YOLO") {
        return permissive.execute(toolCallId, params, signal, onUpdate, ctx);
      }
      const gate = getGate();
      if (!gate) {
        return tool.execute(toolCallId, params, signal, onUpdate, ctx);
      }
      const targetPath = (params as { path?: unknown }).path;
      const subject = typeof targetPath === "string" ? targetPath : undefined;
      const pre = await gate.reviewFileCall({
        toolCallId,
        toolName: tool.name,
        path: subject,
        signal,
      });
      if (pre.kind === "deny") {
        throw new Error(pre.reason ?? "This call was denied.");
      }
      try {
        return await tool.execute(toolCallId, params, signal, onUpdate, ctx);
      } catch (error) {
        if (!isAuthorizeDenial(error)) throw error;
        const decision = await gate.reviewDenial("authorize", {
          toolCallId,
          toolName: tool.name,
          subject: subject ?? "",
          evidence: error instanceof Error ? error.message : String(error),
          signal,
        });
        if (decision.kind === "allow") {
          return await permissive.execute(
            toolCallId,
            params,
            signal,
            onUpdate,
            ctx,
          );
        }
        throw new Error(
          decision.reason ??
            (error instanceof Error ? error.message : String(error)),
        );
      }
    },
  };
}

export interface PineToolPermissionContext {
  getApprovalMode(): PineApprovalMode;
  getGate(): ToolGate | null;
}

export async function createPineToolDefinitions(
  location: AgentSessionLocation,
  gate?: ToolGate | null,
  attachedPaths?: PineAttachedPathAccess,
  permissions?: PineToolPermissionContext,
): Promise<ToolDefinition[]> {
  const getApprovalMode = () =>
    permissions?.getApprovalMode() ?? location.approvalMode ?? "auto-approve";
  const getGate = () => permissions?.getGate() ?? gate ?? null;
  const bashTemporaryDirectory = path.join(
    path.dirname(location.sessionsRoot),
    "tmp",
  );
  await mkdir(bashTemporaryDirectory, { recursive: true });
  const canonicalBashTemporaryDirectory = await realpath(
    bashTemporaryDirectory,
  );
  const policy = await PineToolAccessPolicy.create(
    location.cwd,
    [
      {
        access: "read-write",
        path: canonicalBashTemporaryDirectory,
      },
      ...location.folders,
    ],
    attachedPaths,
  );
  // Permissive twin used to re-run a call the gate approved beyond the grants.
  const permissivePolicy = PineToolAccessPolicy.permissive(location.cwd);
  const loginPath = await resolveLoginPath();
  // Bun's standalone installer puts a single executable in HOME. Grant that
  // exact executable (and its canonical target), never its parent directory.
  const bunPath = path.join(os.homedir(), ".bun", "bin", "bun");
  const canonicalBunPath = await realpath(bunPath).catch(() => null);
  const runtimeFiles = canonicalBunPath ? [bunPath, canonicalBunPath] : [];

  // Native (unsandboxed) execution. YOLO keeps the user's full environment;
  // reviewed native re-runs retain Pine's deterministic shell environment.
  const nativeBashTool = createBashToolDefinition(location.cwd, {
    operations: createLocalBashOperations(),
    spawnHook: (context) => ({
      ...context,
      env:
        getApprovalMode() === "YOLO"
          ? {
              ...context.env,
              PATH: `${path.join(location.cwd, "node_modules", ".bin")}:${loginPath}`,
            }
          : createBashEnvironment(
              context.env,
              canonicalBashTemporaryDirectory,
              loginPath,
              location.cwd,
            ),
    }),
  });

  const readTool = createReadToolDefinition(location.cwd, {
    operations: createReadOperations(policy),
  });
  const editTool = createEditToolDefinition(location.cwd, {
    operations: createEditOperations(policy),
  });
  const writeTool = createWriteToolDefinition(location.cwd, {
    operations: createWriteOperations(policy),
  });
  const permissiveEditTool = createEditToolDefinition(location.cwd, {
    operations: createEditOperations(permissivePolicy),
  });
  const permissiveWriteTool = createWriteToolDefinition(location.cwd, {
    operations: createWriteOperations(permissivePolicy),
  });
  const permissiveReadTool = createReadToolDefinition(location.cwd, {
    operations: createReadOperations(permissivePolicy),
  });

  const gatedReadTool = gateFileTool(
    readTool,
    permissiveReadTool,
    getGate,
    getApprovalMode,
  );
  const gatedEditTool = gateFileTool(
    editTool,
    permissiveEditTool,
    getGate,
    getApprovalMode,
  );
  const gatedWriteTool = gateFileTool(
    writeTool,
    permissiveWriteTool,
    getGate,
    getApprovalMode,
  );

  const bashTool = createBashToolDefinition(location.cwd, {
    operations: createScopedBashOperations(
      policy,
      canonicalBashTemporaryDirectory,
      loginPath,
      runtimeFiles,
    ),
  });

  // Rebuild the bash tool with a required `description` field so the agent
  // must state what each command does. The original execute handles the
  // command/timeout args and ignores the extra description, so we forward
  // straight to it.
  const pineBashParams = Type.Object({
    // First property on purpose: models emit keys in schema order, so the
    // description streams in before the command and can render immediately.
    description: Type.String({
      description:
        "A short, imperative description of what this command does, for the user reading the transcript. Write this argument FIRST, before composing command, so readers see the intent while the call streams in. Write it in the same language the user is using in this conversation, not the model's preferred language.",
    }),
    command: Type.String({ description: "Bash command to execute" }),
    timeout: Type.Optional(
      Type.Number({
        description: "Timeout in seconds (optional, no default timeout)",
      }),
    ),
  });
  const sandboxGuidance =
    " Ordinary bash can read only shared project folders, user-attached files/directories, Pine's temporary directory, and an allowlist of system/toolchain runtime files. Reading or listing other external paths (including ~/Documents, ~/Downloads, private configs, and unrelated projects) is blocked even in Auto Approve mode. Use privileged_bash directly for those external reads and explain the required access; each call requires approval. Writes are limited to read-write shared folders and $TMPDIR; direct writes to /tmp are blocked.";
  const pineBashTool = defineTool({
    ...bashTool,
    parameters: pineBashParams,
    prepareArguments: (args) => args as Static<typeof pineBashParams>,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      if (getApprovalMode() === "YOLO") {
        throw new Error(
          "Ordinary bash is disabled in YOLO mode. Use privileged_bash instead.",
        );
      }
      const command = params.command;
      const description = params.description;
      // Let Me Review mode keeps its explicit "confirm every call" contract. Automatic
      // mode never reviews ordinary bash: the project sandbox is its complete,
      // non-escalating authority boundary.
      const currentGate = getGate();
      if (currentGate && getApprovalMode() === "let-me-review") {
        const pre = await currentGate.reviewBashCommand({
          toolCallId,
          command,
          description,
          signal,
        });
        if (pre.kind === "deny") {
          throw new Error(pre.reason ?? "This call was denied.");
        }
      }

      try {
        return await bashTool.execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          ctx,
        );
      } catch (error) {
        if (error instanceof SandboxDeniedError) {
          throw new Error(
            `${error.message}\n\nSandbox evidence:\n${error.outputTail.trim()}`,
          );
        }
        throw error;
      }
    },
    description: `${bashTool.description}${sandboxGuidance} Explicitly describe what each command does in the description field, written first, in the same language as the user's messages.`,
    promptSnippet: `${bashTool.promptSnippet}. Reads are restricted to shared folders, attachments, $TMPDIR and runtime files; use privileged_bash directly to read or list other external paths, subject to approval. Use $TMPDIR for temporary files instead of /tmp; always write description before command, in the user's language`,
  });

  const privilegedBashTool =
    getGate() || getApprovalMode() === "YOLO" || permissions
      ? defineTool({
          ...nativeBashTool,
          name: "privileged_bash",
          parameters: pineBashParams,
          prepareArguments: (args) => args as Static<typeof pineBashParams>,
          execute: async (toolCallId, params, signal, onUpdate, ctx) => {
            const command = params.command;
            // YOLO bypasses every Pine permission gate. Other modes require a
            // fresh review before native execution.
            if (getApprovalMode() !== "YOLO") {
              const currentGate = getGate();
              if (!currentGate) {
                throw new Error(
                  "Privileged execution is unavailable without an approval gate.",
                );
              }
              const decision = await currentGate.reviewPrivilegedCall({
                toolCallId,
                toolName: "privileged_bash",
                subject: command,
                description: params.description,
                evidence:
                  "The agent explicitly requested execution outside Pine's project sandbox because the required capability cannot be completed inside it.",
                signal,
              });
              if (decision.kind === "deny") {
                throw new Error(
                  decision.reason ??
                    "The reviewer did not allow this command to run outside the project sandbox.",
                );
              }
            }
            return nativeBashTool.execute(
              toolCallId,
              params,
              signal,
              onUpdate,
              ctx,
            );
          },
          description:
            "Run a shell command with the user's native permissions, outside Pine's project sandbox. Every call requires a fresh approval unless YOLO mode is active. Use it directly to read files or list directories outside the shared project folders and user attachments: ordinary bash blocks these reads even in Auto Approve mode. Also use it for external writes, macOS application control (osascript, open, Shortcuts, Automator), launching GUI applications, controlling or signaling processes outside Pine (kill, pkill, killall), or another operation that ordinary bash explicitly reports was denied by the project sandbox. State the needed external access in description. Do not use it for normal project commands or ordinary command errors.",
          promptSnippet:
            "Use privileged_bash directly for macOS app/GUI control, external process control, out-of-project filesystem access, or after ordinary bash explicitly says the project sandbox denied an operation. Calls receive a fresh review before native execution unless YOLO mode is active. State why native privileges are required in description before composing command.",
        })
      : null;

  return [
    {
      ...gatedReadTool,
      description: `${gatedReadTool.description} Read shared project files and user attachments. To read files in other external folders, use privileged_bash with an explanation of the needed access; approval is required.`,
      promptSnippet: `${gatedReadTool.promptSnippet}. For files outside shared folders and user attachments, use privileged_bash subject to approval`,
    },
    pineBashTool,
    gatedEditTool,
    gatedWriteTool,
    ...(privilegedBashTool ? [privilegedBashTool] : []),
  ] as ToolDefinition[];
}
