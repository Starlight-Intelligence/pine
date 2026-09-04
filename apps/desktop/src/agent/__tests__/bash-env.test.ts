import { describe, expect, it } from "vitest";
import { createBashEnvironment, resolveLoginPath } from "../bash-env";

describe("createBashEnvironment", () => {
  it("prepends the project bin directory to the login PATH", () => {
    const environment = createBashEnvironment(
      { HOME: "/Users/dev", LANG: "en_US.UTF-8" },
      "/pine/tmp",
      "/opt/homebrew/bin:/usr/bin:/bin",
      "/project",
    );

    expect(environment.PATH).toBe(
      "/project/node_modules/.bin:/opt/homebrew/bin:/usr/bin:/bin",
    );
  });

  it("keeps the real HOME and redirects tool caches into the temporary directory", () => {
    const environment = createBashEnvironment(
      { HOME: "/Users/dev", LC_ALL: "zh_CN.UTF-8" },
      "/pine/tmp",
      "/usr/bin:/bin",
      "/project",
    );

    expect(environment.HOME).toBe("/Users/dev");
    expect(environment.TMPDIR).toBe("/pine/tmp");
    expect(environment.TMPPREFIX).toBe("/pine/tmp/zsh");
    expect(environment.npm_config_cache).toBe("/pine/tmp/npm-cache");
    expect(environment.BUN_INSTALL_CACHE_DIR).toBe("/pine/tmp/bun-cache");
    expect(environment.XDG_CACHE_HOME).toBe("/pine/tmp/xdg-cache");
    expect(environment.LC_ALL).toBe("zh_CN.UTF-8");
  });

  it("falls back to a temporary home when the source has none", () => {
    const environment = createBashEnvironment(
      {},
      "/pine/tmp",
      "/usr/bin:/bin",
      "/project",
    );

    expect(environment.HOME).toBe("/pine/tmp/home");
  });
});

describe("resolveLoginPath", () => {
  it("resolves a non-empty PATH", async () => {
    const loginPath = await resolveLoginPath();
    expect(loginPath.length).toBeGreaterThan(0);
    expect(loginPath).toContain("/bin");
  });
});
