import { defineConfig } from 'tsup';

// ESM + CommonJS + type declarations from src/index.ts; no dependencies, so nothing is external.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
});
