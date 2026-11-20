// How problems are printed: for people (text), for scripts (json) and for GitHub Actions (github).
import type { Diagnostic } from '../ast';

/** the diagnostics found in one document */
export interface FileResult { file: string; text: string; diagnostics: Diagnostic[] }

const paint = (on: boolean, code: number, s: string) => (on ? `\u001b[${code}m${s}\u001b[0m` : s);

/** `file:line:col severity code message`, then the line itself with the place underlined */
export function textProblem(file: string, source: string, d: Diagnostic, color: boolean): string {
  const sev = paint(color, d.severity === 'error' ? 31 : 33, d.severity);
  const head = `${file}:${d.line}:${d.col}  ${sev}  ${paint(color, 2, d.code)}  ${d.message}`;
  const line = source.split(/\r\n|\r|\n/)[d.line - 1];
  if (line === undefined) return head;
  const width = String(d.line).length;
  const room = Math.max(1, line.length - (d.col - 1));
  const marks = '^'.repeat(Math.min(room, d.endCol && d.endCol > d.col ? d.endCol - d.col : 1));
  const gutter = paint(color, 2, '|');
  return `${head}\n  ${paint(color, 2, String(d.line))} ${gutter} ${line.split('\t').join(' ')}\n  ${' '.repeat(width)} ${gutter} ${' '.repeat(d.col - 1)}${paint(color, d.severity === 'error' ? 31 : 33, marks)}`;
}

/** a GitHub Actions workflow command: shows the problem on the changed line of a pull request */
export function githubProblem(file: string, d: Diagnostic): string {
  const data = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const prop = (s: string) => data(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
  const end = d.endCol && d.endCol > d.col ? `,endColumn=${d.endCol}` : '';
  return `::${d.severity} file=${prop(file)},line=${d.line},col=${d.col}${end},title=${prop(d.code)}::${data(d.message)}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** the last line: how many files, errors and warnings */
export function summary(files: number, errors: number, warnings: number): string {
  const checked = `${plural(files, 'file')} checked`;
  return errors || warnings ? `${checked}, ${plural(errors, 'error')}, ${plural(warnings, 'warning')}` : `${checked}, no problems`;
}

export function countOf(results: FileResult[], severity: 'error' | 'warning'): number {
  return results.reduce((n, r) => n + r.diagnostics.filter((d) => d.severity === severity).length, 0);
}
