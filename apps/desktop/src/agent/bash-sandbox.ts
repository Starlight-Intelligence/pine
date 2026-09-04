import path from "node:path";

function escapeSandboxString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
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
  "/Library/Developer",
  "/Library/Frameworks",
  "/Library/Preferences",
  "/Applications",
  "/private/var/select",
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
  // Toolchains walk upwards to discover workspace/configuration boundaries.
  // Permit directory entries along granted paths, never sibling file contents.
  const ancestorDirectories = new Set<string>();
  for (const target of [...readablePaths, ...writablePaths, ...runtimeFiles]) {
    let ancestor = path.dirname(target);
    while (ancestor !== path.dirname(ancestor)) {
      ancestorDirectories.add(ancestor);
      ancestor = path.dirname(ancestor);
    }
  }
  const readRules = [
    ...new Set([
      ...MACOS_RUNTIME_DIRECTORIES,
      ...readablePaths,
      ...writablePaths,
    ]),
  ].map((target) => `  (subpath "${escapeSandboxString(target)}")`);
  readRules.push(
    ...[...MACOS_RUNTIME_FILES, ...runtimeFiles, ...ancestorDirectories].map(
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
