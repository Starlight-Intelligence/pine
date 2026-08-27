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
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  defineTool,
  type BashOperations,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { Static } from "typebox";
import type { AgentFolderGrant, AgentSessionLocation } from "./protocol";

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
  ) {}

  static async create(
    cwd: string,
    folders: AgentFolderGrant[],
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
    return new PineToolAccessPolicy(canonicalCwd, canonicalFolders);
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
    return this.folders
      .filter((folder) => folder.access === "read-write")
      .map((folder) => folder.path);
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

export function createMacOsBashSandboxProfile(
  writableFolders: string[],
  temporaryDirectory: string,
): string {
  const writablePaths = new Set([...writableFolders, temporaryDirectory]);
  const writeRules = [...writablePaths]
    .map((folderPath) => `  (subpath "${escapeSandboxString(folderPath)}")`)
    .join("\n");
  return `(version 1)
(deny default)
(allow process*)
(allow network*)
(allow mach-lookup)
(allow sysctl-read)
(allow file-read*)
(allow file-write*
  (literal "/dev/null")
  (literal "/dev/tty")
${writeRules})`;
}

function createBashEnvironment(
  environment: NodeJS.ProcessEnv | undefined,
  temporaryDirectory: string,
): NodeJS.ProcessEnv {
  const source = environment ?? process.env;
  const result: NodeJS.ProcessEnv = {
    HOME: path.join(temporaryDirectory, "home"),
    LANG: source.LANG,
    LOGNAME: source.LOGNAME,
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    SHELL: "/bin/zsh",
    TERM: source.TERM,
    TMPDIR: temporaryDirectory,
    USER: source.USER,
  };
  for (const [name, value] of Object.entries(source)) {
    if (name.startsWith("LC_")) result[name] = value;
  }
  return result;
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
): BashOperations {
  return {
    exec: async (command, cwd, options) => {
      await policy.authorize(cwd, "write");
      if (process.platform !== "darwin") {
        throw new Error(
          "Bash is unavailable because Pine cannot enforce project write boundaries on this platform yet.",
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
      const profile = createMacOsBashSandboxProfile(
        policy.writableFolders(),
        temporaryDirectory,
      );
      const child = spawn(
        "/usr/bin/sandbox-exec",
        ["-p", profile, shellPath, "-c", command],
        {
          cwd: policy.cwd,
          detached: true,
          env: createBashEnvironment(options.env, temporaryDirectory),
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        },
      );

      child.stdout.on("data", options.onData);
      child.stderr.on("data", options.onData);
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
        const exitCode = await new Promise<number | null>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", resolve);
        });
        if (options.signal?.aborted) throw new Error("aborted");
        if (timedOut) throw new Error(`timeout:${options.timeout}`);
        return { exitCode };
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        options.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

export async function createPineToolDefinitions(
  location: AgentSessionLocation,
): Promise<ToolDefinition[]> {
  const policy = await PineToolAccessPolicy.create(
    location.cwd,
    location.folders,
  );
  const bashTemporaryDirectory = path.join(
    path.dirname(location.sessionsRoot),
    "tmp",
  );
  await mkdir(bashTemporaryDirectory, { recursive: true });
  await mkdir(path.join(bashTemporaryDirectory, "home"), { recursive: true });
  const canonicalBashTemporaryDirectory = await realpath(
    bashTemporaryDirectory,
  );
  const readTool = createReadToolDefinition(location.cwd, {
    operations: {
      access: async (targetPath) => {
        const authorizedPath = await policy.authorize(targetPath, "read");
        await access(authorizedPath, constants.R_OK);
      },
      detectImageMimeType: (targetPath) =>
        detectImageMimeType(policy, targetPath),
      readFile: async (targetPath) =>
        readFile(await policy.authorize(targetPath, "read")),
    },
  });
  const editTool = createEditToolDefinition(location.cwd, {
    operations: {
      access: async (targetPath) => {
        const authorizedPath = await policy.authorize(targetPath, "write");
        await access(authorizedPath, constants.R_OK | constants.W_OK);
      },
      readFile: async (targetPath) =>
        readFile(await policy.authorize(targetPath, "write")),
      writeFile: async (targetPath, content) =>
        writeFile(await policy.authorize(targetPath, "write"), content, "utf8"),
    },
  });
  const writeTool = createWriteToolDefinition(location.cwd, {
    operations: {
      mkdir: async (targetPath) =>
        mkdir(
          await policy.authorize(targetPath, "write", { allowMissing: true }),
          {
            recursive: true,
          },
        ).then(() => undefined),
      writeFile: async (targetPath, content) =>
        writeFile(
          await policy.authorize(targetPath, "write", { allowMissing: true }),
          content,
          "utf8",
        ),
    },
  });
  const bashTool = createBashToolDefinition(location.cwd, {
    operations: createScopedBashOperations(
      policy,
      canonicalBashTemporaryDirectory,
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
  const pineBashTool = defineTool({
    ...bashTool,
    parameters: pineBashParams,
    prepareArguments: (args) => args as Static<typeof pineBashParams>,
    execute: (toolCallId, params, signal, onUpdate, ctx) =>
      bashTool.execute(toolCallId, params, signal, onUpdate, ctx),
    description: `${bashTool.description} Pine provides an isolated writable temporary directory through $TMPDIR; direct writes to /tmp are blocked. Explicitly describe what each command does in the description field, written first, in the same language as the user's messages.`,
    promptSnippet: `${bashTool.promptSnippet}. Use $TMPDIR for temporary files instead of /tmp; always write the description argument before composing the command, in the user's language`,
  });

  return [readTool, pineBashTool, editTool, writeTool] as ToolDefinition[];
}
