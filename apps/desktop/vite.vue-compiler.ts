import { createRequire } from "node:module";
import path from "node:path";

const workspaceRequire = createRequire(
  path.resolve(__dirname, "../../package.json"),
);

export const vueCompiler = workspaceRequire(
  "vue/compiler-sfc",
) as typeof import("vue/compiler-sfc");

// Bun may link Vue's optional TypeScript peer to a different nested version.
// Keep imported defineProps types on the workspace-pinned TypeScript toolchain.
vueCompiler.registerTS(() => workspaceRequire("typescript"));
