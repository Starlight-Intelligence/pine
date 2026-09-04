import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionLocation } from "../protocol";
import type { ToolGate } from "../gate";
import {
  createMacOsBashSandboxProfile,
  createPineToolDefinitions,
  matchSandboxDenial,
  PineAttachedPathAccess,
  PineToolAccessPolicy,
  SandboxDeniedError,
} from "../tools";

function createFakeGate(
  overrides: {
    reviewBashCommand?: ToolGate["reviewBashCommand"];
    reviewFileCall?: ToolGate["reviewFileCall"];
    reviewDenial?: ToolGate["reviewDenial"];
    reviewPrivilegedCall?: ToolGate["reviewPrivilegedCall"];
  } = {},
): ToolGate & {
  reviewBashCommand: ReturnType<typeof vi.fn>;
  reviewFileCall: ReturnType<typeof vi.fn>;
  reviewDenial: ReturnType<typeof vi.fn>;
  reviewPrivilegedCall: ReturnType<typeof vi.fn>;
} {
  return {
    reviewBashCommand: vi.fn(
      overrides.reviewBashCommand ??
        (() => Promise.resolve({ kind: "allow" as const })),
    ),
    reviewFileCall: vi.fn(
      overrides.reviewFileCall ??
        (() => Promise.resolve({ kind: "allow" as const })),
    ),
    reviewDenial: vi.fn(
      overrides.reviewDenial ??
        (() => Promise.resolve({ kind: "allow" as const })),
    ),
    reviewPrivilegedCall: vi.fn(
      overrides.reviewPrivilegedCall ??
        (() => Promise.resolve({ kind: "allow" as const })),
    ),
    isApprovedCommand: () => false,
    resetTurn: () => undefined,
  };
}

const temporaryDirectories: string[] = [];

async function createFixture(): Promise<{
  location: AgentSessionLocation;
  outside: string;
  readOnly: string;
  readWrite: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pine-tools-"));
  temporaryDirectories.push(root);
  const readWrite = path.join(root, "workspace");
  const readOnly = path.join(root, "context");
  const outside = path.join(root, "private");
  await Promise.all([
    mkdir(readWrite),
    mkdir(readOnly),
    mkdir(outside),
    mkdir(path.join(root, "data", "sessions"), { recursive: true }),
  ]);
  return {
    location: {
      agentDir: path.join(root, "agent"),
      cwd: readWrite,
      folders: [
        { access: "read-write", path: readWrite },
        { access: "read-only", path: readOnly },
      ],
      sessionsRoot: path.join(root, "data", "sessions"),
    },
    outside,
    readOnly,
    readWrite,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("PineToolAccessPolicy", () => {
  it("allows reads from every shared folder and writes only to writable folders", async () => {
    const { location, outside, readOnly, readWrite } = await createFixture();
    const policy = await PineToolAccessPolicy.create(
      location.cwd,
      location.folders,
    );

    const canonicalReadWrite = await realpath(readWrite);
    const canonicalReadOnly = await realpath(readOnly);
    await expect(
      policy.authorize(path.join(readWrite, "new", "file.txt"), "write", {
        allowMissing: true,
      }),
    ).resolves.toBe(path.join(canonicalReadWrite, "new", "file.txt"));
    await expect(policy.authorize(readOnly, "read")).resolves.toBe(
      canonicalReadOnly,
    );
    await expect(policy.authorize(readOnly, "write")).rejects.toThrow(
      "Folder is read-only",
    );
    await expect(policy.authorize(outside, "read")).rejects.toThrow(
      "outside the folders shared with Pine",
    );
  });

  it("resolves symlinks before checking folder boundaries", async () => {
    const { location, outside, readWrite } = await createFixture();
    const secretPath = path.join(outside, "secret.txt");
    const linkPath = path.join(readWrite, "secret-link.txt");
    await writeFile(secretPath, "secret");
    await symlink(secretPath, linkPath);
    const policy = await PineToolAccessPolicy.create(
      location.cwd,
      location.folders,
    );

    await expect(policy.authorize(linkPath, "read")).rejects.toThrow(
      "outside the folders shared with Pine",
    );
  });

  it("grants attached files and folder descendants read-only access", async () => {
    const { location, outside } = await createFixture();
    const attachedFile = path.join(outside, "attached.txt");
    const attachedFolder = path.join(outside, "references");
    const nestedFile = path.join(attachedFolder, "nested.txt");
    await mkdir(attachedFolder);
    await Promise.all([
      writeFile(attachedFile, "attached"),
      writeFile(nestedFile, "nested"),
    ]);
    const attachedPaths = new PineAttachedPathAccess();
    await attachedPaths.grant([attachedFile, attachedFolder]);
    const policy = await PineToolAccessPolicy.create(
      location.cwd,
      location.folders,
      attachedPaths,
    );

    await expect(policy.authorize(attachedFile, "read")).resolves.toBe(
      await realpath(attachedFile),
    );
    await expect(policy.authorize(nestedFile, "read")).resolves.toBe(
      await realpath(nestedFile),
    );
    await expect(policy.authorize(attachedFile, "write")).rejects.toThrow(
      "outside the folders shared with Pine",
    );
  });

  it("requires the default folder to be writable", async () => {
    const { readOnly } = await createFixture();

    await expect(
      PineToolAccessPolicy.create(readOnly, [
        { access: "read-only", path: readOnly },
      ]),
    ).rejects.toThrow("default folder must be an available read-write folder");
  });
});

describe("createPineToolDefinitions", () => {
  it("registers Pi's four default tool names with Pine-owned operations", async () => {
    const { location } = await createFixture();

    const tools = await createPineToolDefinitions(location);

    expect(tools.map((tool) => tool.name)).toEqual([
      "read",
      "bash",
      "edit",
      "write",
    ]);
    expect(tools.find((tool) => tool.name === "bash")?.description).toContain(
      "$TMPDIR",
    );

    const bash = tools.find((tool) => tool.name === "bash");
    if (!bash) throw new Error("Bash tool is missing.");
    const bashParams = bash.parameters as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(bashParams.required).toContain("description");
    expect(bashParams.required).toContain("command");
    expect(bashParams.properties?.description).toBeDefined();
    // Streaming display relies on the model emitting `description` before
    // `command`, which follows the schema's property order.
    expect(Object.keys(bashParams.properties ?? {})[0]).toBe("description");
  });

  it("reads shared context and limits mutations to writable folders", async () => {
    const { location, readOnly, readWrite } = await createFixture();
    const contextPath = path.join(readOnly, "context.txt");
    const outputPath = path.join(readWrite, "output.txt");
    await writeFile(contextPath, "shared context");
    const tools = await createPineToolDefinitions(location);
    const read = tools.find((tool) => tool.name === "read");
    const edit = tools.find((tool) => tool.name === "edit");
    const write = tools.find((tool) => tool.name === "write");
    if (!read || !edit || !write) throw new Error("File tools are missing.");

    await expect(
      read.execute(
        "read-context",
        { path: contextPath },
        undefined,
        undefined,
        undefined as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        content: [expect.objectContaining({ text: "shared context" })],
      }),
    );
    await write.execute(
      "write-output",
      { content: "before", path: outputPath },
      undefined,
      undefined,
      undefined as never,
    );
    await edit.execute(
      "edit-output",
      {
        edits: [{ newText: "after", oldText: "before" }],
        path: outputPath,
      },
      undefined,
      undefined,
      undefined as never,
    );

    await expect(readFile(outputPath, "utf8")).resolves.toBe("after");
    await expect(
      write.execute(
        "write-context",
        { content: "denied", path: contextPath },
        undefined,
        undefined,
        undefined as never,
      ),
    ).rejects.toThrow("Folder is read-only");
  });

  it("allows file tools to use Pine's temporary directory without escalation", async () => {
    const { location } = await createFixture();
    const gate = createFakeGate();
    const tools = await createPineToolDefinitions(location, gate);
    const read = tools.find((tool) => tool.name === "read");
    const edit = tools.find((tool) => tool.name === "edit");
    const write = tools.find((tool) => tool.name === "write");
    if (!read || !edit || !write) throw new Error("File tools are missing.");
    const temporaryPath = path.join(
      path.dirname(location.sessionsRoot),
      "tmp",
      "artifact.txt",
    );

    await write.execute(
      "write-temporary",
      { content: "before", path: temporaryPath },
      undefined,
      undefined,
      undefined as never,
    );
    await edit.execute(
      "edit-temporary",
      {
        edits: [{ newText: "after", oldText: "before" }],
        path: temporaryPath,
      },
      undefined,
      undefined,
      undefined as never,
    );
    await read.execute(
      "read-temporary",
      { path: temporaryPath },
      undefined,
      undefined,
      undefined as never,
    );

    await expect(readFile(temporaryPath, "utf8")).resolves.toBe("after");
    expect(gate.reviewDenial).not.toHaveBeenCalled();
  });

  it("separates shell read grants from write grants without unrestricted reads", () => {
    const profile = createMacOsBashSandboxProfile({
      readablePaths: [
        "/project/source",
        "/project/context",
        '/attachment/"file',
      ],
      writableFolders: ["/project/source"],
      temporaryDirectory: "/pine/project/tmp",
    });

    expect(profile).toContain('(subpath "/project/source")');
    expect(profile).toContain('(subpath "/project/context")');
    expect(profile).toContain('(subpath "/attachment/\\"file")');
    expect(profile.split("(allow file-write*")[1]).not.toContain(
      "/project/context",
    );
    expect(profile.split("(allow file-write*")[1]).not.toContain(
      "/attachment/",
    );
    expect(profile).toContain('(subpath "/pine/project/tmp")');
    expect(profile).toContain("(deny default)");
    expect(profile).not.toContain("(allow file-read*)");
    for (const broadRoot of [
      "/",
      "/System",
      "/Users",
      "/private/tmp",
      "/opt/homebrew",
    ]) {
      expect(profile).not.toContain(`(subpath "${broadRoot}")`);
    }
  });

  it("tells the agent to use privileged bash for external reads", async () => {
    const { location } = await createFixture();
    const tools = await createPineToolDefinitions(location, createFakeGate());
    const bash = tools.find((tool) => tool.name === "bash")!;
    const privileged = tools.find((tool) => tool.name === "privileged_bash")!;
    expect(bash.description).toContain(
      "Reading or listing other external paths",
    );
    expect(bash.promptSnippet).toContain(
      "use privileged_bash directly to read or list",
    );
    expect(privileged.description).toContain(
      "ordinary bash blocks these reads even in Auto Approve mode",
    );
  });

  describe.runIf(process.platform === "darwin" && !process.env.CODEX_SANDBOX)(
    "native shell read boundaries",
    () => {
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

      async function setup() {
        const fixture = await createFixture();
        const attachments = new PineAttachedPathAccess();
        const gate = createFakeGate();
        const tools = await createPineToolDefinitions(
          fixture.location,
          gate,
          attachments,
        );
        const bash = tools.find((tool) => tool.name === "bash")!;
        const run = (command: string) =>
          bash.execute(
            "read-boundary",
            { command, description: "test read boundaries" },
            undefined,
            undefined,
            undefined as never,
          );
        return { ...fixture, attachments, gate, run };
      }

      it("reads shared folders and temporary files using system and Bun tools", async () => {
        const { readWrite, readOnly, run } = await setup();
        await writeFile(path.join(readWrite, "local.txt"), "local-content");
        await writeFile(path.join(readOnly, "context.txt"), "shared-content");
        const result = await run(
          `/bin/cat local.txt ${quote(path.join(readOnly, "context.txt"))}; printf temporary-content > "$TMPDIR/probe"; /bin/cat "$TMPDIR/probe"; bun --version`,
        );
        expect(result.content).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "text",
              text: expect.stringContaining(
                "local-contentshared-contenttemporary-content",
              ),
            }),
          ]),
        );
      });

      it("blocks external files, directory listings and symlink escapes without escalating", async () => {
        const { readWrite, outside, run, gate } = await setup();
        const secret = path.join(outside, "secret.txt");
        await writeFile(secret, "external-secret-content");
        await symlink(outside, path.join(readWrite, "escape"));
        for (const command of [
          `/bin/cat ${quote(secret)}`,
          `/bin/ls ${quote(outside)}`,
          "/bin/cat escape/secret.txt",
          `bun -e ${quote(`console.log(await Bun.file(${JSON.stringify(secret)}).text())`)}`,
        ]) {
          const error = await run(command).catch((error: unknown) => error);
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain("Use privileged_bash");
          expect((error as Error).message).not.toContain(
            "external-secret-content",
          );
        }
        expect(gate.reviewBashCommand).not.toHaveBeenCalled();
        expect(gate.reviewDenial).not.toHaveBeenCalled();
        expect(gate.reviewPrivilegedCall).not.toHaveBeenCalled();
      });

      it("picks up new attachments without granting siblings or writes", async () => {
        const { outside, readOnly, attachments, run } = await setup();
        const attachment = path.join(outside, "attachment.txt");
        const sibling = path.join(outside, "sibling.txt");
        const directory = path.join(outside, "attached-directory");
        await mkdir(directory);
        await writeFile(attachment, "attached-file");
        await writeFile(sibling, "private-sibling");
        await writeFile(path.join(directory, "child.txt"), "attached-child");
        await expect(run(`/bin/cat ${quote(attachment)}`)).rejects.toThrow(
          "Use privileged_bash",
        );
        await attachments.grant([attachment, directory]);
        const result = await run(
          `/bin/cat ${quote(attachment)} ${quote(path.join(directory, "child.txt"))}`,
        );
        expect(result.content).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "text",
              text: expect.stringContaining("attached-fileattached-child"),
            }),
          ]),
        );
        await expect(run(`/bin/cat ${quote(sibling)}`)).rejects.toThrow(
          "Use privileged_bash",
        );
        for (const target of [
          attachment,
          path.join(directory, "child.txt"),
          path.join(readOnly, "new.txt"),
        ]) {
          await expect(
            run(`printf changed > ${quote(target)}`),
          ).rejects.toThrow("Use privileged_bash");
        }
        expect(await readFile(attachment, "utf8")).toBe("attached-file");
      });

      it("does not report a shell terminated by a signal as successful", async () => {
        const { run } = await setup();
        await expect(run("kill -TERM $$")).rejects.toThrow(
          "Shell terminated by signal SIGTERM",
        );
      });

      it("requires privileged approval before reading an external file", async () => {
        const { location, outside, run, gate } = await setup();
        const target = path.join(outside, "reviewed.txt");
        await writeFile(target, "approved-external-content");
        const command = `/bin/cat ${quote(target)}`;
        await expect(run(command)).rejects.toThrow("Use privileged_bash");
        const tools = await createPineToolDefinitions(location, gate);
        const privileged = tools.find(
          (tool) => tool.name === "privileged_bash",
        )!;
        const readExternal = () =>
          privileged.execute(
            "privileged-read",
            { command, description: "read the requested external file" },
            undefined,
            undefined,
            undefined as never,
          );
        gate.reviewPrivilegedCall.mockResolvedValueOnce({
          kind: "deny",
          reason: "External read was denied",
        });
        await expect(readExternal()).rejects.toThrow(
          "External read was denied",
        );
        const approved = await readExternal();
        expect(approved.content).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "text",
              text: expect.stringContaining("approved-external-content"),
            }),
          ]),
        );
        expect(gate.reviewPrivilegedCall).toHaveBeenCalledTimes(2);
      });
    },
  );

  describe("matchSandboxDenial", () => {
    it("recognizes every denial dialect seen in real sandbox runs", () => {
      expect(matchSandboxDenial("zsh:1: operation not permitted: ps")).toBe(
        true,
      );
      expect(
        matchSandboxDenial(
          "_LSOpenURLsWithCompletionHandler() failed for the application /System/Applications/Music.app with error -54.",
        ),
      ).toBe(true);
      expect(
        matchSandboxDenial(
          "sandbox_extension_issue_file failed for /System/Library/CoreServices/System Events.app: 1 (Operation not permitted)",
        ),
      ).toBe(true);
      expect(
        matchSandboxDenial(
          "32:44: execution error: Music got an error: Application isn’t running. (-600)",
        ),
      ).toBe(true);
      expect(
        matchSandboxDenial(
          "40:83: execution error: File permission error. (-54)",
        ),
      ).toBe(true);
      expect(matchSandboxDenial("Error: EACCES: access denied")).toBe(true);
    });

    it("ignores ordinary command failures", () => {
      expect(
        matchSandboxDenial("cat: missing.txt: No such file or directory"),
      ).toBe(false);
      expect(matchSandboxDenial("Application isn’t running. (-601)")).toBe(
        false,
      );
    });
  });

  it.runIf(process.platform === "darwin" && !process.env.CODEX_SANDBOX)(
    "reports denials that hide inside pipelines without escalating",
    async () => {
      const { location } = await createFixture();
      const gate = createFakeGate();
      const tools = await createPineToolDefinitions(location, gate);
      const bash = tools.find((tool) => tool.name === "bash");
      if (!bash) throw new Error("Bash tool was not registered.");

      // pipefail makes the denied `ps` stage visible even though `head`
      // succeeds, but ordinary bash never escalates itself.
      await expect(
        bash.execute(
          "p1",
          { command: "ps aux | head -20", description: "list processes" },
          undefined,
          undefined,
          undefined as never,
        ),
      ).rejects.toThrow("Use privileged_bash");
      expect(gate.reviewDenial).not.toHaveBeenCalled();
    },
  );

  it.runIf(process.platform === "darwin" && !process.env.CODEX_SANDBOX)(
    "reports denied command segments even when a later command exits zero",
    async () => {
      const { location } = await createFixture();
      const gate = createFakeGate();
      const tools = await createPineToolDefinitions(location, gate);
      const bash = tools.find((tool) => tool.name === "bash");
      if (!bash) throw new Error("Bash tool was not registered.");
      const target = spawn("/bin/sleep", ["30"], { stdio: "ignore" });
      if (!target.pid) throw new Error("Test process did not start.");

      try {
        await expect(
          bash.execute(
            "signal-process",
            {
              command: `/bin/kill ${target.pid} 2>&1; /usr/bin/true`,
              description: "stop a process",
            },
            undefined,
            undefined,
            undefined as never,
          ),
        ).rejects.toThrow("Use privileged_bash");
        expect(gate.reviewDenial).not.toHaveBeenCalled();
      } finally {
        target.kill("SIGKILL");
      }
    },
  );

  it.runIf(process.platform === "darwin" && !process.env.CODEX_SANDBOX)(
    "directs sandboxed AppleScript failures to privileged bash",
    async () => {
      const { location } = await createFixture();
      const gate = createFakeGate();
      const tools = await createPineToolDefinitions(location, gate);
      const bash = tools.find((tool) => tool.name === "bash");
      if (!bash) throw new Error("Bash tool was not registered.");

      // A tell block to a live system service fails with -600 inside the
      // sandbox; the widened signature must produce the explicit fallback
      // rather than depending on Finder's wording.
      await expect(
        bash.execute(
          "apple-events",
          {
            command:
              "osascript -e 'tell application \"Finder\" to get name of startup disk'",
            description: "probe Apple Events",
          },
          undefined,
          undefined,
          undefined as never,
        ),
      ).rejects.toThrow("Use privileged_bash");

      expect(gate.reviewDenial).not.toHaveBeenCalled();
    },
  );

  it.runIf(process.platform === "darwin" && !process.env.CODEX_SANDBOX)(
    "enforces writable and read-only grants for shell commands",
    async () => {
      const { location, readOnly, readWrite } = await createFixture();
      const tools = await createPineToolDefinitions(location);
      const bash = tools.find((tool) => tool.name === "bash");
      if (!bash) throw new Error("Bash tool was not registered.");

      const allowedPath = path.join(readWrite, "allowed.txt");
      const deniedPath = path.join(readOnly, "denied.txt");
      const readablePath = path.join(readOnly, "readable.txt");
      await writeFile(readablePath, "context");
      await bash.execute(
        "allowed",
        { command: `printf allowed > ${JSON.stringify(allowedPath)}` },
        undefined,
        undefined,
        undefined as never,
      );
      await expect(
        bash.execute(
          "denied",
          { command: `printf denied > ${JSON.stringify(deniedPath)}` },
          undefined,
          undefined,
          undefined as never,
        ),
      ).rejects.toThrow("operation not permitted");

      await expect(readFile(allowedPath, "utf8")).resolves.toBe("allowed");
      await expect(readFile(deniedPath, "utf8")).rejects.toThrow();
      await expect(
        bash.execute(
          "read-context",
          { command: `cat ${JSON.stringify(readablePath)}` },
          undefined,
          undefined,
          undefined as never,
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          content: [expect.objectContaining({ text: "context" })],
        }),
      );

      const outputResult = await bash.execute(
        "stdout",
        { command: "printf 'hello\\n'; pwd; ls -1" },
        undefined,
        undefined,
        undefined as never,
      );
      expect(outputResult.content).toEqual([
        expect.objectContaining({
          text: expect.stringContaining("hello"),
        }),
      ]);
      expect(outputResult.content[0]).toEqual(
        expect.objectContaining({
          text: expect.stringContaining(await realpath(readWrite)),
        }),
      );
      expect(outputResult.content[0]).toEqual(
        expect.objectContaining({
          text: expect.stringContaining("allowed.txt"),
        }),
      );

      await expect(
        bash.execute(
          "pine-temp",
          {
            command:
              'printf temporary > "$TMPDIR/pi_test_out"; cat "$TMPDIR/pi_test_out"',
          },
          undefined,
          undefined,
          undefined as never,
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          content: [expect.objectContaining({ text: "temporary" })],
        }),
      );

      await expect(
        bash.execute(
          "system-temp",
          { command: "printf denied > /tmp/pine_pi_test_out" },
          undefined,
          undefined,
          undefined as never,
        ),
      ).rejects.toThrow("operation not permitted");
    },
  );

  it("escalates authorize denials and writes beyond grants on approval", async () => {
    const { location, outside } = await createFixture();
    const gate = createFakeGate();
    const tools = await createPineToolDefinitions(location, gate);
    const write = tools.find((tool) => tool.name === "write");
    if (!write) throw new Error("Write tool is missing.");
    const outsideFile = path.join(outside, "approved.txt");

    await write.execute(
      "approved-write",
      { content: "granted", path: outsideFile },
      undefined,
      undefined,
      undefined as never,
    );

    await expect(readFile(outsideFile, "utf8")).resolves.toBe("granted");
    expect(gate.reviewFileCall).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "write", path: outsideFile }),
    );
    expect(gate.reviewDenial).toHaveBeenCalledWith(
      "authorize",
      expect.objectContaining({ subject: outsideFile }),
    );
  });

  it("escalates out-of-scope reads through the gate on approval", async () => {
    const { location, outside } = await createFixture();
    const gate = createFakeGate();
    const tools = await createPineToolDefinitions(location, gate);
    const read = tools.find((tool) => tool.name === "read");
    if (!read) throw new Error("Read tool was not registered.");
    const outsideFile = path.join(outside, "secret.txt");
    await writeFile(outsideFile, "elevated-read");

    await expect(
      read.execute(
        "r1",
        { path: outsideFile },
        undefined,
        undefined,
        undefined as never,
      ),
    ).resolves.toBeDefined();
    expect(gate.reviewDenial).toHaveBeenCalledWith(
      "authorize",
      expect.objectContaining({ toolName: "read", subject: outsideFile }),
    );
  });

  it("reads attached paths without review but still reviews edits", async () => {
    const { location, outside } = await createFixture();
    const attachedFile = path.join(outside, "attached.txt");
    await writeFile(attachedFile, "before");
    const attachedPaths = new PineAttachedPathAccess();
    await attachedPaths.grant([attachedFile]);
    const gate = createFakeGate({
      reviewDenial: () =>
        Promise.resolve({ kind: "deny" as const, reason: "write denied" }),
    });
    const tools = await createPineToolDefinitions(
      location,
      gate,
      attachedPaths,
    );
    const read = tools.find((tool) => tool.name === "read");
    const edit = tools.find((tool) => tool.name === "edit");
    if (!read || !edit) throw new Error("File tools are missing.");

    await expect(
      read.execute(
        "read-attachment",
        { path: attachedFile },
        undefined,
        undefined,
        undefined as never,
      ),
    ).resolves.toBeDefined();
    expect(gate.reviewDenial).not.toHaveBeenCalled();

    await expect(
      edit.execute(
        "edit-attachment",
        {
          edits: [{ newText: "after", oldText: "before" }],
          path: attachedFile,
        },
        undefined,
        undefined,
        undefined as never,
      ),
    ).rejects.toThrow("write denied");
    expect(gate.reviewDenial).toHaveBeenCalledWith(
      "authorize",
      expect.objectContaining({ toolName: "edit", subject: attachedFile }),
    );
  });

  it("propagates the gate's pre-execution denial for file tools", async () => {
    const { location } = await createFixture();
    const gate = createFakeGate({
      reviewFileCall: () =>
        Promise.resolve({ kind: "deny" as const, reason: "not allowed" }),
    });
    const tools = await createPineToolDefinitions(location, gate);
    const write = tools.find((tool) => tool.name === "write");
    if (!write) throw new Error("Write tool is missing.");

    await expect(
      write.execute(
        "denied-write",
        { content: "x", path: path.join(location.cwd, "in-grant.txt") },
        undefined,
        undefined,
        undefined as never,
      ),
    ).rejects.toThrow("not allowed");
  });

  it("rejects bash commands denied before execution", async () => {
    const { location: fixtureLocation } = await createFixture();
    const location = {
      ...fixtureLocation,
      approvalMode: "let-me-review" as const,
    };
    const gate = createFakeGate({
      reviewBashCommand: () =>
        Promise.resolve({ kind: "deny" as const, reason: "user said no" }),
    });
    const tools = await createPineToolDefinitions(location, gate);
    const bash = tools.find((tool) => tool.name === "bash");
    if (!bash) throw new Error("Bash tool was not registered.");

    await expect(
      bash.execute(
        "b1",
        { command: "echo hi", description: "greet" },
        undefined,
        undefined,
        undefined as never,
      ),
    ).rejects.toThrow("user said no");
    expect(gate.reviewBashCommand).toHaveBeenCalledWith(
      expect.objectContaining({ command: "echo hi" }),
    );
  });

  it("reviews every privileged bash call in automatic mode", async () => {
    const { location } = await createFixture();
    const gate = createFakeGate();
    const tools = await createPineToolDefinitions(location, gate);
    const privileged = tools.find((tool) => tool.name === "privileged_bash");
    if (!privileged)
      throw new Error("Privileged bash tool was not registered.");

    await expect(
      privileged.execute(
        "privileged-1",
        { command: "printf privileged", description: "test native shell" },
        undefined,
        undefined,
        undefined as never,
      ),
    ).resolves.toBeDefined();
    await expect(
      privileged.execute(
        "privileged-2",
        { command: "printf privileged", description: "test native shell" },
        undefined,
        undefined,
        undefined as never,
      ),
    ).resolves.toBeDefined();
    expect(gate.reviewPrivilegedCall).toHaveBeenCalledTimes(2);
    expect(gate.reviewPrivilegedCall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        toolCallId: "privileged-1",
        toolName: "privileged_bash",
        subject: "printf privileged",
      }),
    );
    expect(privileged.description).not.toContain("always allowed");
    expect(privileged.promptSnippet).not.toContain("fixed-allow");
  });

  it("reviews privileged bash once in let-me-review mode", async () => {
    const { location: fixtureLocation } = await createFixture();
    const location = {
      ...fixtureLocation,
      approvalMode: "let-me-review" as const,
    };
    const gate = createFakeGate();
    const tools = await createPineToolDefinitions(location, gate);
    const privileged = tools.find((tool) => tool.name === "privileged_bash");
    if (!privileged)
      throw new Error("Privileged bash tool was not registered.");

    await privileged.execute(
      "privileged-ask",
      { command: "printf privileged", description: "test native shell" },
      undefined,
      undefined,
      undefined as never,
    );
    expect(gate.reviewPrivilegedCall).toHaveBeenCalledOnce();
  });

  it("does not execute privileged bash when its fresh review is denied", async () => {
    const { location } = await createFixture();
    const gate = createFakeGate({
      reviewPrivilegedCall: () =>
        Promise.resolve({ kind: "deny" as const, reason: "unsafe" }),
    });
    const tools = await createPineToolDefinitions(location, gate);
    const privileged = tools.find((tool) => tool.name === "privileged_bash");
    if (!privileged)
      throw new Error("Privileged bash tool was not registered.");

    await expect(
      privileged.execute(
        "privileged-denied",
        { command: "printf privileged", description: "test native shell" },
        undefined,
        undefined,
        undefined as never,
      ),
    ).rejects.toThrow("unsafe");
  });

  it("exposes privileged bash without review in yolo mode", async () => {
    const { location } = await createFixture();
    const gate = createFakeGate({
      reviewPrivilegedCall: () =>
        Promise.resolve({ kind: "deny" as const, reason: "should be skipped" }),
    });
    const tools = await createPineToolDefinitions(
      { ...location, approvalMode: "YOLO" },
      gate,
    );
    const privileged = tools.find((tool) => tool.name === "privileged_bash");
    if (!privileged)
      throw new Error("Privileged bash tool was not registered.");

    await expect(
      privileged.execute(
        "privileged-yolo",
        { command: "printf yolo", description: "test native shell" },
        undefined,
        undefined,
        undefined as never,
      ),
    ).resolves.toBeDefined();
    expect(gate.reviewPrivilegedCall).not.toHaveBeenCalled();
  });

  it("uses the latest approval mode without rebuilding the session tools", async () => {
    const { location } = await createFixture();
    let approvalMode: "auto-approve" | "YOLO" = "auto-approve";
    const gate = createFakeGate();
    const tools = await createPineToolDefinitions(location, gate, undefined, {
      getApprovalMode: () => approvalMode,
      getGate: () => gate,
    });
    const privileged = tools.find((tool) => tool.name === "privileged_bash");
    if (!privileged)
      throw new Error("Privileged bash tool was not registered.");

    await privileged.execute(
      "privileged-reviewed",
      { command: "printf reviewed", description: "test reviewed shell" },
      undefined,
      undefined,
      undefined as never,
    );
    approvalMode = "YOLO";
    await privileged.execute(
      "privileged-yolo",
      { command: "printf yolo", description: "test yolo shell" },
      undefined,
      undefined,
      undefined as never,
    );

    expect(gate.reviewPrivilegedCall).toHaveBeenCalledOnce();
    expect(gate.reviewPrivilegedCall).toHaveBeenCalledWith(
      expect.objectContaining({ toolCallId: "privileged-reviewed" }),
    );
  });

  it.runIf(process.platform === "darwin" && !process.env.CODEX_SANDBOX)(
    "directs sandbox-denied commands to privileged bash without escalating",
    async () => {
      const { location, outside } = await createFixture();
      const gate = createFakeGate();
      const tools = await createPineToolDefinitions(location, gate);
      const bash = tools.find((tool) => tool.name === "bash");
      if (!bash) throw new Error("Bash tool was not registered.");
      const outsideFile = path.join(outside, "elevated.txt");

      await expect(
        bash.execute(
          "elevated",
          {
            command: `printf elevated > ${JSON.stringify(outsideFile)}`,
            description: "write outside the project",
          },
          undefined,
          undefined,
          undefined as never,
        ),
      ).rejects.toThrow("Use privileged_bash");

      expect(gate.reviewDenial).not.toHaveBeenCalled();
      await expect(readFile(outsideFile, "utf8")).rejects.toThrow();
    },
  );

  it("carries the captured output as review evidence", () => {
    const error = new SandboxDeniedError("zsh:1: operation not permitted: ps");
    expect(error.outputTail).toContain("operation not permitted");
  });

  it("YOLO mode lets file tools bypass shared-folder restrictions", async () => {
    const { location, outside } = await createFixture();
    const gate = createFakeGate();
    const tools = await createPineToolDefinitions(
      { ...location, approvalMode: "YOLO" },
      gate,
    );
    const write = tools.find((tool) => tool.name === "write");
    if (!write) throw new Error("Write tool is missing.");
    const outsideFile = path.join(outside, "yolo.txt");
    await write.execute(
      "write-yolo",
      { content: "YOLO", path: outsideFile },
      undefined,
      undefined,
      undefined as never,
    );
    await expect(readFile(outsideFile, "utf8")).resolves.toBe("YOLO");
    expect(gate.reviewFileCall).not.toHaveBeenCalled();
    expect(gate.reviewDenial).not.toHaveBeenCalled();
  });

  it("applies unrestricted file access after switching to YOLO", async () => {
    const { location, outside } = await createFixture();
    let approvalMode: "auto-approve" | "YOLO" = "auto-approve";
    const gate = createFakeGate();
    const tools = await createPineToolDefinitions(location, gate, undefined, {
      getApprovalMode: () => approvalMode,
      getGate: () => gate,
    });
    const write = tools.find((tool) => tool.name === "write");
    if (!write) throw new Error("Write tool is missing.");
    const outsideFile = path.join(outside, "dynamic-yolo.txt");

    approvalMode = "YOLO";
    await write.execute(
      "dynamic-write-yolo",
      { content: "unrestricted", path: outsideFile },
      undefined,
      undefined,
      undefined as never,
    );

    await expect(readFile(outsideFile, "utf8")).resolves.toBe("unrestricted");
    expect(gate.reviewFileCall).not.toHaveBeenCalled();
  });

  it("YOLO mode disables ordinary bash and only runs privileged bash", async () => {
    const { location, outside } = await createFixture();
    const tools = await createPineToolDefinitions({
      ...location,
      approvalMode: "YOLO",
    });
    const bash = tools.find((tool) => tool.name === "bash");
    const privileged = tools.find((tool) => tool.name === "privileged_bash");
    if (!bash || !privileged) throw new Error("Bash tools are missing.");
    const outsideFile = path.join(outside, "yolo-shell.txt");
    await expect(
      bash.execute(
        "yolo-shell",
        {
          command: `printf yolo > ${JSON.stringify(outsideFile)}`,
          description: "test disabled shell",
        },
        undefined,
        undefined,
        undefined as never,
      ),
    ).rejects.toThrow("Ordinary bash is disabled in YOLO mode");
    await privileged.execute(
      "privileged-yolo-shell",
      {
        command: `printf yolo > ${JSON.stringify(outsideFile)}`,
        description: "test native shell",
      },
      undefined,
      undefined,
      undefined as never,
    );
    await expect(readFile(outsideFile, "utf8")).resolves.toBe("yolo");
  });
});
