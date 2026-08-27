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
import { afterEach, describe, expect, it } from "vitest";
import type { AgentSessionLocation } from "../protocol";
import {
  createMacOsBashSandboxProfile,
  createPineToolDefinitions,
  PineToolAccessPolicy,
} from "../tools";

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

  it("only grants shell writes to writable folders and Pine's temporary directory", () => {
    const profile = createMacOsBashSandboxProfile(
      ["/project/source"],
      "/pine/project/tmp",
    );

    expect(profile).toContain('(subpath "/project/source")');
    expect(profile).not.toContain("/project/context");
    expect(profile).toContain('(subpath "/pine/project/tmp")');
    expect(profile).toContain("(deny default)");
  });

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
});
