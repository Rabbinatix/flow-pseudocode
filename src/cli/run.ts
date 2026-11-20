// The `rfpc` command: parse the arguments, find the documents, run the command, print, and return the exit code.
//   0  all good
//   1  problems found in the FPC (or, with `format --check`, a file that isn't canonical)
//   2  the tool couldn't run: a bad command or option, a missing path, an unreadable file
// `run` never calls process.exit or touches the terminal itself: everything goes through `Io`, so tests call it directly.
import { version } from '../../package.json';
import { check, format } from '../validator';
import { FPC_GRAMMAR, cheatSheet } from '../grammar';
import { parseArgs, type Options } from './args';
import { CliError, collect, type Source } from './files';
import type { Io } from './io';
import { countOf, githubProblem, summary, textProblem, type FileResult } from './report';

export const HELP = `rfpc ${version}: check and format Flow Pseudocode (FPC) files

Usage:
  rfpc check [paths…]       check files; a folder is searched for *.fpc; "-" reads standard input
  rfpc format [paths…]      print the canonical text of a file (valid files only)
    --write                 rewrite the files in place
    --check                 change nothing; exit 1 if a file isn't canonical
  rfpc cheat-sheet          print the one-page cheat sheet (to give to an AI assistant)
  rfpc grammar              print the EBNF grammar

Options for check:
  --format text|json|github   how problems are printed (default text)
  --strict                    warnings fail too

Other options:
  --no-color                  no colours (also: NO_COLOR)
  -h, --help · -v, --version

With no paths, the current folder is searched. Exit code: 0 all good, 1 problems found, 2 the tool couldn't run.
Spec and in-browser validator: https://rabbinatix.com/guide/pseudocode
`;

export async function run(argv: string[], io: Io): Promise<number> {
  const o = parseArgs(argv);
  if ('error' in o) {
    io.stderr(`rfpc: ${o.error}\nTry "rfpc --help".\n`);
    return 2;
  }
  if (o.help) {
    io.stdout(HELP);
    return 0;
  }
  if (o.version) {
    io.stdout(`${version}\n`);
    return 0;
  }
  if (!o.command) {
    io.stderr(HELP);
    return 2;
  }
  const color = io.color && !o.noColor;
  try {
    switch (o.command) {
      case 'cheat-sheet': io.stdout(cheatSheet()); return 0;
      case 'grammar': io.stdout(FPC_GRAMMAR); return 0;
      case 'check': return runCheck(o, await collect(o.paths, io), io, color);
      case 'format': return runFormat(o, await collect(o.paths, io), io, color);
    }
  } catch (e) {
    if (!(e instanceof CliError)) throw e;
    io.stderr(`rfpc: ${e.message}\n`);
    return 2;
  }
}

/** shows the results in the chosen format and returns the exit code */
function report(results: FileResult[], o: Pick<Options, 'format' | 'strict'>, io: Io, color: boolean): number {
  const errors = countOf(results, 'error');
  const warnings = countOf(results, 'warning');
  const failed = (r: FileResult) => r.diagnostics.some((d) => d.severity === 'error' || (o.strict && d.severity === 'warning'));
  if (o.format === 'json') {
    io.stdout(`${JSON.stringify({ ok: !results.some(failed), files: results.map((r) => ({ file: r.file, ok: !failed(r), diagnostics: r.diagnostics })) }, null, 2)}\n`);
  } else {
    for (const r of results) {
      for (const d of r.diagnostics) io.stdout(`${o.format === 'github' ? githubProblem(r.file, d) : textProblem(r.file, r.text, d, color)}\n`);
    }
    io.stdout(`${summary(results.length, errors, warnings)}\n`);
  }
  return results.some(failed) ? 1 : 0;
}

function runCheck(o: Options, sources: Source[], io: Io, color: boolean): number {
  const results = sources.map((s): FileResult => ({ file: s.name, text: s.text, diagnostics: check(s.text).diagnostics }));
  return report(results, o, io, color);
}

function runFormat(o: Options, sources: Source[], io: Io, color: boolean): number {
  if (o.write && sources.some((s) => !s.path)) throw new CliError('--write needs files, not standard input');
  if (!o.write && !o.verify && sources.length !== 1) throw new CliError('"format" prints one file: give one path, or use --write or --check for several');

  const formatted = sources.map((s) => ({ s, f: format(s.text) }));
  // a document with errors can't be formatted: show why, like check does
  const invalid = formatted.filter((x) => !x.f.ok);
  const problems = invalid.map((x): FileResult => ({ file: x.s.name, text: x.s.text, diagnostics: x.f.diagnostics.filter((d) => d.severity === 'error') }));
  if (invalid.length) report(problems, { format: 'text', strict: false }, { ...io, stdout: io.stderr }, color);

  const valid = formatted.filter((x) => x.f.ok);
  const changed = valid.filter((x) => x.f.text !== x.s.text);
  if (o.write) {
    for (const x of changed) {
      io.writeFile(x.s.path!, x.f.text!);
      io.stdout(`formatted ${x.s.name}\n`);
    }
    io.stdout(`${changed.length} formatted, ${valid.length - changed.length} already canonical${invalid.length ? `, ${invalid.length} with errors` : ''}\n`);
    return invalid.length ? 1 : 0;
  }
  if (o.verify) {
    for (const x of changed) io.stdout(`${x.s.name} is not canonical: run "rfpc format --write"\n`);
    io.stdout(`${valid.length - changed.length} of ${sources.length} already canonical\n`);
    return invalid.length || changed.length ? 1 : 0;
  }
  // print mode: exactly one source
  if (invalid.length) return 1;
  io.stdout(valid[0].f.text!);
  return 0;
}
