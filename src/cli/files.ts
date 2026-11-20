// Finds the FPC documents to work on: the paths given on the command line, a folder searched for `*.fpc`, or standard input.
import { relative, resolve } from 'node:path';
import type { Io } from './io';

/** one document: its name as printed, where it lives (none for standard input) and its text */
export interface Source { name: string; path?: string; text: string }

/** a problem with the paths themselves (not with the FPC in them): the tool exits with 2 */
export class CliError extends Error {}

/** folders that are never searched */
const SKIP = new Set(['node_modules', '.git', 'dist']);

/** a path as printed: relative to the working folder, with `/` on every system */
export function display(path: string, cwd: string): string {
  return (relative(cwd, path) || '.').split('\\').join('/');
}

function walk(dir: string, io: Io, out: string[]) {
  for (const e of io.list(dir)) {
    const p = resolve(dir, e.name);
    if (e.dir) {
      if (!SKIP.has(e.name)) walk(p, io, out);
    } else if (e.name.endsWith('.fpc')) out.push(p);
  }
}

/** The documents for `paths` (the current folder when there are none), sorted by path, each once. Throws a CliError. */
export async function collect(paths: string[], io: Io): Promise<Source[]> {
  const targets = paths.length ? paths : ['.'];
  const found: string[] = [];
  let stdin = false;
  for (const t of targets) {
    if (t === '-') { stdin = true; continue; }
    const p = resolve(io.cwd, t);
    const kind = io.kind(p);
    if (!kind) throw new CliError(`no such file or folder: ${t}`);
    if (kind === 'file') found.push(p);
    else {
      const before = found.length;
      walk(p, io, found);
      if (found.length === before) throw new CliError(`no .fpc files in ${t}`);
    }
  }
  const unique = [...new Set(found)].sort();
  const sources: Source[] = [];
  for (const p of unique) {
    try {
      sources.push({ name: display(p, io.cwd), path: p, text: io.readFile(p) });
    } catch (e) {
      throw new CliError(`can't read ${display(p, io.cwd)}: ${(e as Error).message}`);
    }
  }
  if (stdin) sources.push({ name: '<stdin>', text: await io.readStdin() });
  return sources;
}
