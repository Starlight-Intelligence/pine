import { execFile } from "node:child_process";
import path from "node:path";

const FALLBACK_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const LOGIN_PATH_TIMEOUT_MS = 10_000;

let cachedLoginPath: string | null = null;
let loginPathFailed = false;

/**
 * Resolve the user's login-shell PATH once and cache it.
 *
 * Electron GUI processes inherit launchd's minimal PATH
 * (`/usr/bin:/bin:/usr/sbin:/sbin`), so tools installed via Homebrew, MacPorts,
 * nvm, or Bun are invisible unless the PATH is resolved from a login shell.
 */
export async function resolveLoginPath(): Promise<string> {
  if (cachedLoginPath) return cachedLoginPath;
  if (loginPathFailed) return FALLBACK_PATH;

  const shell = process.env.SHELL || "/bin/zsh";
  const resolved = await new Promise<string | null>((resolve) => {
    execFile(
      shell,
      ["-l", "-c", "echo $PATH"],
      { timeout: LOGIN_PATH_TIMEOUT_MS },
      (error, stdout) => {
        if (error || !stdout.trim()) resolve(null);
        else resolve(stdout.trim());
      },
    );
  });

  if (!resolved) {
    loginPathFailed = true;
    return FALLBACK_PATH;
  }
  cachedLoginPath = resolved;
  return resolved;
}

/**
 * Build the environment for Pine's bash tool.
 *
 * Preserve HOME and the login PATH for consistent path resolution. They do not
 * grant sandbox access: private home configs and unshared toolchains may need
 * privileged_bash. Package caches use Pine's temporary directory so ordinary
 * commands do not need read/write access to the user's global caches.
 */
export function createBashEnvironment(
  environment: NodeJS.ProcessEnv | undefined,
  temporaryDirectory: string,
  loginPath: string,
  cwd: string,
): NodeJS.ProcessEnv {
  const source = environment ?? process.env;
  const result: NodeJS.ProcessEnv = {
    HOME: source.HOME ?? path.join(temporaryDirectory, "home"),
    LANG: source.LANG,
    LOGNAME: source.LOGNAME,
    PATH: `${path.join(cwd, "node_modules", ".bin")}:${loginPath}`,
    SHELL: source.SHELL ?? "/bin/zsh",
    TERM: source.TERM,
    TMPDIR: temporaryDirectory,
    USER: source.USER,
    // Redirect tool caches into the sandbox-writable temporary directory so
    // package installs work without write access to the real HOME.
    BUN_INSTALL_CACHE_DIR: path.join(temporaryDirectory, "bun-cache"),
    XDG_CACHE_HOME: path.join(temporaryDirectory, "xdg-cache"),
    npm_config_cache: path.join(temporaryDirectory, "npm-cache"),
  };
  for (const [name, value] of Object.entries(source)) {
    if (name.startsWith("LC_")) result[name] = value;
  }
  return result;
}
