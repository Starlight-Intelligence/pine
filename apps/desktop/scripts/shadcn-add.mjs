#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: bun run shadcn:add <component...> [shadcn-vue options]');
  process.exit(1);
}

const result = spawnSync('bun', ['x', '--bun', 'shadcn-vue@latest', 'add', ...args], {
  cwd: desktopRoot,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
