import { defineConfig } from "vite";

// Pi is ESM-only and relies on `import.meta.url`. Keep the isolated agent
// process and all of its chunks in ESM instead of emitting runtime `require()`
// calls or rewriting Pi's module metadata for CommonJS.
export default defineConfig({
  build: {
    lib: {
      entry: "src/agent.ts",
      fileName: () => "agent.mjs",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent"],
      output: {
        chunkFileNames: "[name]-[hash].mjs",
      },
    },
  },
});
