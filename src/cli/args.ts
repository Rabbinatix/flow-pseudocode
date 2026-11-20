// The command line → a plain options object. Hand-written (the package has no dependencies). Mistakes come back as
// `{ error }` and the tool exits with 2; nothing here prints or exits.

export type Command = 'check' | 'format' | 'cheat-sheet' | 'grammar';
export type OutputFormat = 'text' | 'json' | 'github';

export interface Options {
  command?: Command;
  help: boolean;
  version: boolean;
  /** files, folders, or `-` for standard input; empty means the current folder */
  paths: string[];
  /** check: how problems are printed */
  format: OutputFormat;
  /** check: warnings fail too */
  strict: boolean;
  /** format: rewrite the files in place */
  write: boolean;
  /** format: change nothing, fail when a file isn't canonical */
  verify: boolean;
  /** --no-color given */
  noColor: boolean;
}

const COMMANDS: readonly string[] = ['check', 'format', 'cheat-sheet', 'grammar'];
const FORMATS: readonly string[] = ['text', 'json', 'github'];

export function parseArgs(argv: string[]): Options | { error: string } {
  const o: Options = { help: false, version: false, paths: [], format: 'text', strict: false, write: false, verify: false, noColor: false };
  const seen = new Set<string>();
  let onlyPaths = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (onlyPaths || a === '-' || !a.startsWith('-')) {
      if (!o.command && !onlyPaths) {
        if (!COMMANDS.includes(a)) return { error: `unknown command "${a}"` };
        o.command = a as Command;
      } else o.paths.push(a);
      continue;
    }
    if (a === '--') { onlyPaths = true; continue; }
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    seen.add(flag);
    switch (flag) {
      case '-h': case '--help': o.help = true; break;
      case '-v': case '--version': o.version = true; break;
      case '--strict': o.strict = true; break;
      case '--write': o.write = true; break;
      case '--check': o.verify = true; break;
      case '--no-color': o.noColor = true; break;
      case '--format': {
        const v = inline ?? argv[++i];
        if (v === undefined || !FORMATS.includes(v)) return { error: `--format must be one of ${FORMATS.join(', ')}` };
        o.format = v as OutputFormat;
        break;
      }
      default: return { error: `unknown option "${flag}"` };
    }
    if (inline !== undefined && flag !== '--format') return { error: `${flag} doesn't take a value` };
  }
  // options that belong to one command
  if (o.command && o.command !== 'check') for (const f of ['--strict', '--format']) if (seen.has(f)) return { error: `${f} only works with "check"` };
  if (o.command && o.command !== 'format') for (const f of ['--write', '--check']) if (seen.has(f)) return { error: `${f} only works with "format"` };
  if (o.write && o.verify) return { error: '--write and --check can\'t be used together' };
  if ((o.command === 'cheat-sheet' || o.command === 'grammar') && o.paths.length) return { error: `"${o.command}" takes no paths` };
  return o;
}
