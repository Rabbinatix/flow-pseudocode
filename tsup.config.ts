import { defineConfig } from 'tsup';

// Two builds from one source tree. No dependencies, so nothing is external.
export default defineConfig([
  // the library: ESM + CommonJS + types. It never imports src/cli, so it stays free of Node's disk and process (browser-safe).
  { entry: { index: 'src/index.ts' }, format: ['esm', 'cjs'], dts: true, clean: true, sourcemap: true, target: 'es2022' },
  // the `rfpc` command: ESM only, Node. tsup keeps the #! line and marks the file executable.
  { entry: { cli: 'src/cli/bin.ts' }, format: ['esm'], platform: 'node', clean: false, target: 'es2022' },
]);
