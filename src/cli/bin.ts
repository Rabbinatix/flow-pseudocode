#!/usr/bin/env node
// The `rfpc` executable: the real process, terminal and disk around `run`. Kept tiny on purpose; the work is in run.ts.
import { nodeIo } from './io';
import { run } from './run';

run(process.argv.slice(2), nodeIo()).then(
  // exitCode, not process.exit(): lets everything written to a pipe finish first
  (code) => { process.exitCode = code; },
  (e: unknown) => {
    console.error(`rfpc: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 2;
  },
);
