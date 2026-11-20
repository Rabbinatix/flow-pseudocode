// The rfpc command: run() against a temp folder with captured output, plus the built executable and a guard that the
// library stays free of Node. See src/cli/run.ts for the exit codes (0 good, 1 problems, 2 the tool couldn't run).
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FPC_GRAMMAR, cheatSheet } from '../src/index';
import { run, HELP } from '../src/cli/run';
import { nodeIo, type Io } from '../src/cli/io';

/** canonical text: `format` leaves it as it is */
const GOOD = 'FPC 1.0\nLOGIC "x"\nINPUT a: string\nOUTPUT b: string\n\nSET b ← upper(a)\nRETURN { b }\n';
/** valid, but not canonical (ASCII arrow, no blank line after the header, `{ b: b }`) */
const PLAIN = 'FPC 1.0\nLOGIC "x"\nINPUT a: string\nOUTPUT b: string\nSET b <- upper(a)\nRETURN { b: b }\n';
/** `=` where `←` belongs: an error on line 5, column 7 */
const BAD = 'FPC 1.0\nLOGIC "x"\nINPUT a: string\nOUTPUT b: string\nSET b = upper(a)\nRETURN { b }\n';
/** a newer minor version: valid, with a warning */
const WARN = 'FPC 1.1\nLOGIC "x"\nRETURN 1\n';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** a temp folder holding `files`, and a way to run rfpc inside it */
function project(files: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rfpc-'));
  dirs.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  const exec = async (argv: string[], o: { stdin?: string; color?: boolean } = {}) => {
    let out = '', err = '';
    const io: Io = { ...nodeIo(), cwd: root, color: o.color ?? false, stdout: (t) => { out += t; }, stderr: (t) => { err += t; }, readStdin: async () => o.stdin ?? '' };
    const code = await run(argv, io);
    return { code, out, err };
  };
  return { root, exec, read: (name: string) => readFileSync(join(root, name), 'utf8') };
}

describe('rfpc check', () => {
  it('passes a good file: exit 0 and a summary', async () => {
    const r = await project({ 'a.fpc': GOOD }).exec(['check', 'a.fpc']);
    expect(r).toEqual({ code: 0, out: '1 file checked, no problems\n', err: '' });
  });

  it('reports a bad file with its place, the line and a caret: exit 1', async () => {
    const r = await project({ 'bad.fpc': BAD }).exec(['check', 'bad.fpc']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('bad.fpc:5:7  error  syntax  Use ← (or <-) to set a value; = compares');
    expect(r.out).toContain('5 | SET b = upper(a)\n    |       ^\n');
    // the broken SET leaves `b` unset, so there is a warning after the error too
    expect(r.out).toMatch(/1 file checked, 1 error, 1 warning\n$/);
  });

  it('searches a folder for *.fpc, skipping node_modules, .git and dist, in path order', async () => {
    const p = project({
      'b/two.fpc': GOOD, 'a/one.fpc': BAD, 'a/notes.txt': 'not fpc', 'node_modules/x/skip.fpc': BAD, '.git/skip.fpc': BAD, 'dist/skip.fpc': BAD,
    });
    const r = await p.exec(['check', '--format', 'json']);
    expect(JSON.parse(r.out).files.map((f: { file: string }) => f.file)).toEqual(['a/one.fpc', 'b/two.fpc']);
    expect(r.code).toBe(1);
  });

  it('defaults to the current folder, and takes several paths once each', async () => {
    const p = project({ 'a.fpc': GOOD, 'sub/b.fpc': GOOD });
    expect((await p.exec(['check'])).out).toBe('2 files checked, no problems\n');
    expect((await p.exec(['check', 'a.fpc', '.', 'a.fpc'])).out).toBe('2 files checked, no problems\n');
  });

  it('reads standard input for "-"', async () => {
    const p = project();
    const bad = await p.exec(['check', '-'], { stdin: BAD });
    expect(bad.code).toBe(1);
    expect(bad.out).toContain('<stdin>:5:7');
    expect((await p.exec(['check', '-'], { stdin: GOOD })).code).toBe(0);
  });

  it('--format json prints valid JSON with every diagnostic', async () => {
    const r = await project({ 'bad.fpc': BAD, 'ok.fpc': GOOD }).exec(['check', '--format=json']);
    const j = JSON.parse(r.out);
    expect(j.ok).toBe(false);
    expect(j.files.find((f: { file: string }) => f.file === 'ok.fpc')).toEqual({ file: 'ok.fpc', ok: true, diagnostics: [] });
    expect(j.files.find((f: { file: string }) => f.file === 'bad.fpc').diagnostics[0]).toMatchObject({ severity: 'error', code: 'syntax', line: 5, col: 7 });
    expect(r.code).toBe(1);
  });

  it('--format github prints workflow annotations, escaped', async () => {
    const r = await project({ 'bad.fpc': BAD }).exec(['check', 'bad.fpc', '--format', 'github']);
    expect(r.out).toContain('::error file=bad.fpc,line=5,col=7,endColumn=8,title=syntax::Use ← (or <-) to set a value; = compares\n');
    expect(r.out).not.toContain('|');
  });

  it('--strict makes a warning fail; without it a warning passes', async () => {
    const p = project({ 'w.fpc': WARN });
    const loose = await p.exec(['check', 'w.fpc']);
    expect(loose.code).toBe(0);
    expect(loose.out).toContain('warning');
    expect((await p.exec(['check', 'w.fpc', '--strict'])).code).toBe(1);
    expect(JSON.parse((await p.exec(['check', 'w.fpc', '--format', 'json'])).out).ok).toBe(true);
  });

  it('colours only when asked and not with --no-color', async () => {
    const p = project({ 'bad.fpc': BAD });
    expect((await p.exec(['check', 'bad.fpc'], { color: true })).out).toContain('\u001b[31m');
    expect((await p.exec(['check', 'bad.fpc', '--no-color'], { color: true })).out).not.toContain('\u001b');
    expect((await p.exec(['check', 'bad.fpc'])).out).not.toContain('\u001b');
  });
});

describe('rfpc format', () => {
  it('prints the canonical text of one file', async () => {
    const r = await project({ 'a.fpc': PLAIN }).exec(['format', 'a.fpc']);
    expect(r).toEqual({ code: 0, out: GOOD, err: '' });
  });

  it('--write rewrites what differs, and a second run changes nothing', async () => {
    const p = project({ 'a.fpc': PLAIN, 'b.fpc': GOOD });
    const first = await p.exec(['format', '--write']);
    expect(first.code).toBe(0);
    expect(first.out).toContain('formatted a.fpc');
    expect(first.out).not.toContain('formatted b.fpc');
    expect(first.out).toContain('1 formatted, 1 already canonical');
    expect(p.read('a.fpc')).toBe(GOOD);
    const second = await p.exec(['format', '--write']);
    expect(second.out).toBe('0 formatted, 2 already canonical\n');
  });

  it('--check changes nothing and exits 1 for a file that is not canonical, 0 when all are', async () => {
    const p = project({ 'a.fpc': PLAIN });
    const r = await p.exec(['format', '--check']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('a.fpc is not canonical');
    expect(p.read('a.fpc')).toBe(PLAIN);
    await p.exec(['format', '--write']);
    expect((await p.exec(['format', '--check'])).code).toBe(0);
  });

  it('leaves a document with errors alone, says why on stderr, and exits 1', async () => {
    const p = project({ 'bad.fpc': BAD, 'a.fpc': PLAIN });
    const r = await p.exec(['format', '--write']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('bad.fpc:5:7  error  syntax');
    expect(p.read('bad.fpc')).toBe(BAD);
    expect(p.read('a.fpc')).toBe(GOOD);
    const printed = await p.exec(['format', 'bad.fpc']);
    expect(printed.code).toBe(1);
    expect(printed.out).toBe('');
  });

  it('formats standard input; refuses --write on it', async () => {
    const p = project();
    expect((await p.exec(['format', '-'], { stdin: PLAIN })).out).toBe(GOOD);
    const w = await p.exec(['format', '--write', '-'], { stdin: PLAIN });
    expect(w.code).toBe(2);
    expect(w.err).toContain('--write needs files');
  });

  it('prints only one file, and asks for --write or --check when there are several', async () => {
    const r = await project({ 'a.fpc': GOOD, 'b.fpc': GOOD }).exec(['format']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('prints one file');
  });
});

describe('rfpc cheat-sheet, grammar, help and version', () => {
  it('print exactly what the package exports', async () => {
    const p = project();
    expect((await p.exec(['cheat-sheet'])).out).toBe(cheatSheet());
    expect((await p.exec(['grammar'])).out).toBe(FPC_GRAMMAR);
  });
  it('help exits 0 on stdout; no command shows it and exits 2; the version is the package version', async () => {
    const p = project();
    expect(await p.exec(['--help'])).toEqual({ code: 0, out: HELP, err: '' });
    expect((await p.exec([])).code).toBe(2);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect((await p.exec(['--version'])).out).toBe(`${pkg.version}\n`);
  });
});

describe('rfpc when it cannot run: exit 2', () => {
  it.each([
    [['frobnicate'], 'unknown command "frobnicate"'],
    [['check', '--nope'], 'unknown option "--nope"'],
    [['check', '--format', 'xml'], '--format must be one of text, json, github'],
    [['check', '--format'], '--format must be one of'],
    [['format', '--strict', 'a.fpc'], '--strict only works with "check"'],
    [['check', '--write'], '--write only works with "format"'],
    [['format', '--write', '--check'], "can't be used together"],
    [['grammar', 'a.fpc'], 'takes no paths'],
    [['check', 'missing.fpc'], 'no such file or folder: missing.fpc'],
  ])('%j', async (argv, message) => {
    const r = await project({ 'a.fpc': GOOD }).exec(argv);
    expect(r.code).toBe(2);
    expect(r.out).toBe('');
    expect(r.err).toContain(message);
  });

  it('a folder with no .fpc files is an error, not a pass', async () => {
    const r = await project({ 'readme.md': '# hi' }).exec(['check']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('no .fpc files in .');
  });
});

describe('the library stays free of Node', () => {
  it('nothing outside src/cli imports node: modules or the CLI', () => {
    for (const f of readdirSync('src').filter((n) => n.endsWith('.ts'))) {
      const text = readFileSync(join('src', f), 'utf8');
      expect(text, f).not.toMatch(/from 'node:/);
      expect(text, f).not.toMatch(/from '\.\/cli/);
    }
  });
});

// the built executable: needs `npm run build` (npm run check builds before it tests)
describe.skipIf(!existsSync('dist/cli.js'))('the built rfpc executable', () => {
  const bin = join(process.cwd(), 'dist/cli.js');
  it('runs as a program: exit codes and output come out right', () => {
    const p = project({ 'ok.fpc': GOOD, 'bad.fpc': BAD });
    const ok = spawnSync(process.execPath, [bin, 'check', 'ok.fpc'], { cwd: p.root, encoding: 'utf8' });
    expect([ok.status, ok.stdout]).toEqual([0, '1 file checked, no problems\n']);
    const bad = spawnSync(process.execPath, [bin, 'check', 'bad.fpc'], { cwd: p.root, encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain('bad.fpc:5:7');
    const fromStdin = spawnSync(process.execPath, [bin, 'check', '-'], { cwd: p.root, input: GOOD, encoding: 'utf8' });
    expect(fromStdin.status).toBe(0);
    const usage = spawnSync(process.execPath, [bin, 'nope'], { cwd: p.root, encoding: 'utf8' });
    expect([usage.status, usage.stderr.includes('unknown command')]).toEqual([2, true]);
  });
  it('is executable and starts with a node shebang', () => {
    expect(readFileSync(bin, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true);
  });
});
