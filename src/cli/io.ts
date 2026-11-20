// What the CLI needs from the machine, in one small interface, so tests can run the whole tool against a temp folder
// and captured output. `nodeIo()` is the real thing; nothing else in src/cli touches the process, the disk or the terminal.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';

export interface Io {
  /** the folder that relative paths are read from, and that printed paths are relative to */
  cwd: string;
  stdout(text: string): void;
  stderr(text: string): void;
  /** the whole of standard input (only called for the path `-`) */
  readStdin(): Promise<string>;
  /** colour the text output (false for pipes, NO_COLOR, TERM=dumb and --no-color) */
  color: boolean;
  readFile(path: string): string;
  writeFile(path: string, text: string): void;
  /** what is at a path: a file, a folder, or nothing */
  kind(path: string): 'file' | 'dir' | undefined;
  /** the entries of a folder */
  list(dir: string): { name: string; dir: boolean }[];
}

export function nodeIo(): Io {
  return {
    cwd: process.cwd(),
    stdout: (text) => void process.stdout.write(text),
    stderr: (text) => void process.stderr.write(text),
    readStdin: async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString('utf8');
    },
    color: Boolean(process.stdout.isTTY) && !process.env['NO_COLOR'] && process.env['TERM'] !== 'dumb',
    readFile: (path) => readFileSync(path, 'utf8'),
    writeFile: (path, text) => writeFileSync(path, text, 'utf8'),
    kind: (path) => {
      try {
        const s = statSync(path);
        return s.isDirectory() ? 'dir' : s.isFile() ? 'file' : undefined;
      } catch {
        return undefined;
      }
    },
    list: (dir) => readdirSync(dir, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() })),
  };
}
