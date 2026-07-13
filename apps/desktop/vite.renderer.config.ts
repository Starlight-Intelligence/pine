import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import path from 'node:path';

const workspaceRequire = createRequire(path.resolve(__dirname, '../../package.json'));
const vueCompiler = workspaceRequire('vue/compiler-sfc') as typeof import('vue/compiler-sfc');

// Bun may link Vue's optional TypeScript peer to a different nested version.
// Keep imported defineProps types on the workspace-pinned TypeScript toolchain.
vueCompiler.registerTS(() => workspaceRequire('typescript'));

// https://vitejs.dev/config
export default defineConfig({
  plugins: [vue({ compiler: vueCompiler }), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
