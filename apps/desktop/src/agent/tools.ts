import { constants } from "node:fs";
import {
  access,
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
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { Static } from "typebox";
import type { AgentSessionLocation } from "./protocol";
import type { AgentFolderGrant } from "./protocol";
import {
  createNativeBashEnvironment,
  resolveLoginPath,
  resolveNativeTemporaryDirectory,
} from "./bash-env";
import {
  createScopedBashOperations,
  SandboxCommandPermissionError,
} from "./bash-execution";
import {
  PineToolAccessPolicy,
  PineAttachedPathAccess,
  PathAccessDeniedError,
  preserveAccessDenial,
} from "./tool-access-policy";
export {
  PineToolAccessPolicy,
  PineAttachedPathAccess,
} from "./tool-access-policy";
export {
  SandboxCommandPermissionError,
  hasPermissionDiagnostic,
} from "./bash-execution";
import type { ToolGate } from "./gate";
import type { PineApprovalMode } from "../shared/agent";
import {
  createTinyFishToolDefinitions,
  type TinyFishToolFactoryOptions,
} from "./tinyfishTools";

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
        if (getApprovalMode() === "let-me-review") {
          throw new Error("Execution is unavailable without an approval gate.");
        }
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
        return await preserveAccessDenial(() =>
          tool.execute(toolCallId, params, signal, onUpdate, ctx),
        );
      } catch (error) {
        if (!(error instanceof PathAccessDeniedError)) throw error;
        const decision = await gate.reviewDenial("authorize", {
          toolCallId,
          toolName: tool.name,
          subject: subject ?? "",
          evidence: error instanceof Error ? error.message : String(error),
          signal,
        });
        if (decision.kind === "allow") {
          if (signal?.aborted) throw new Error("aborted");
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
  getTinyFishApiKey?: () => string | undefined;
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
  // macOS services may use confstr's per-user temporary directory regardless
  // of TMPDIR. Share that runtime scratch space with both shell and file tools.
  const systemTemporaryDirectory = await resolveNativeTemporaryDirectory();
  const systemTemporaryGrants: AgentFolderGrant[] = systemTemporaryDirectory
    ? [{ access: "read-write", path: systemTemporaryDirectory }]
    : [];
  const policy = await PineToolAccessPolicy.create(
    location.cwd,
    [
      {
        access: "read-write",
        path: canonicalBashTemporaryDirectory,
      },
      ...systemTemporaryGrants,
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

  // Approval changes authority, not the user's shell environment.
  const nativeBashTool = createBashToolDefinition(location.cwd, {
    operations: createLocalBashOperations(),
    spawnHook: (context) => ({
      ...context,
      env: createNativeBashEnvironment(context.env, loginPath, location.cwd),
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
    " Ordinary bash can read only shared project folders, user-attached files/directories, Pine's temporary directory, macOS user temporary storage, and installed system/application/toolchain runtime files. Ancestor directories can be listed for toolchain discovery without granting access to sibling file contents. Reading or listing other external paths (including ~/Documents, ~/Downloads, private configs, and unrelated projects) is blocked even in Auto Approve mode. Use privileged_bash directly for those external reads and explain the required access; each call requires approval. Writes are limited to read-write shared folders, $TMPDIR and macOS user temporary storage; direct writes to /tmp are blocked.";
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
      if (getApprovalMode() === "let-me-review" && !currentGate) {
        throw new Error("Execution is unavailable without an approval gate.");
      }
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
        if (error instanceof SandboxCommandPermissionError) {
          throw new Error(
            `${error.message}\n\nPermission diagnostic (not verified sandbox evidence):\n${error.outputTail.trim()}`,
          );
        }
        throw error;
      }
    },
    description: `${bashTool.description}${sandboxGuidance} The shell is zsh (no user startup files); here-documents are supported. The scratch directory is ${JSON.stringify(canonicalBashTemporaryDirectory)} and is exported as TMPDIR to child processes. Keep diagnostic stderr visible. Explicitly describe what each command does in the description field, written first, in the same language as the user's messages.`,
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
                  `Approval denied before execution; the command was not started. ${decision.reason ?? "The reviewer did not allow native execution."}`,
                );
              }
            }
            if (signal?.aborted) throw new Error("aborted");
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

  const tinyFishTools: ToolDefinition[] = permissions?.getTinyFishApiKey
    ? createTinyFishToolDefinitions({
        getApiKey: permissions.getTinyFishApiKey,
        outputDirectory: path.join(canonicalBashTemporaryDirectory, "web"),
      } satisfies TinyFishToolFactoryOptions)
    : [];

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
    ...tinyFishTools,
  ] as ToolDefinition[];
}
