// FPC 1.0 validator: the checks a grammar can't express (unknown functions, arity, keys, statuses, names).
// Spec: spec/fpc-1.0.md.
// - `validate(doc)` walks a parsed document and returns diagnostics (errors and warnings, each with a stable `code`).
// - `check(text)` = parse + validate, sorted by position; `format(text)` = the canonical text when there are no errors.
// A new rule is one more `at(severity, code, message, pos)` call here, plus an invalid example in examples/invalid/.
import { Diagnostic, FpcDocument, FpcExpr, FpcStmt, Pos, Severity } from './ast';
import { FPC_FUNCTIONS, FPC_VERSION } from './constructs';
import { parse } from './parser';
import { print } from './printer';

const FUNCTIONS = new Map(FPC_FUNCTIONS.map((f) => [f.name, f]));
export const KEY_RE = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+(\/[A-Za-z0-9_.-]+)?$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
/** names every logic may read without setting them: the request of endpoint logic, the input of other logic */
const IMPLICIT = ['request', 'input'];

export function validate(doc: FpcDocument): Diagnostic[] {
  const out: Diagnostic[] = [];
  const at = (severity: Severity, code: string, message: string, pos: Pos | undefined, len = 1) =>
    out.push({ severity, code, message, line: pos?.line ?? 1, col: pos?.col ?? 1, endCol: (pos?.col ?? 1) + len });

  // ---------- header
  if (doc.fpc) {
    const [major] = doc.fpc.split('.');
    if (major !== FPC_VERSION.split('.')[0]) at('error', 'fpc-version', `FPC ${doc.fpc} is not supported: this reader understands FPC ${FPC_VERSION}`, doc.pos, 3);
    else if (doc.fpc !== FPC_VERSION) at('warning', 'fpc-version', `FPC ${doc.fpc} is newer than ${FPC_VERSION}; newer constructs may be reported as errors`, doc.pos, 3);
  }
  if (doc.key !== undefined && !KEY_RE.test(doc.key)) at('warning', 'key-format', `"${doc.key}" doesn't look like a key (for example LOGIC-AUTH-LOGIN-001)`, doc.pos);
  if (doc.version !== undefined && !SEMVER.test(doc.version)) at('error', 'version-format', `VERSION must be x.y.z (for example 1.3.0), found "${doc.version}"`, doc.pos);
  if (doc.kind === 'FLOW' && doc.trigger) at('warning', 'trigger-in-flow', 'ON … describes how one logic starts; a FLOW starts with its first STEP', doc.trigger.pos, 2);
  if (doc.trigger?.k === 'request' && !doc.trigger.path.startsWith('/')) at('error', 'path', 'A path starts with "/"', doc.trigger.pos, 2);
  const dup = (list: { name: string; pos?: Pos }[], what: string) => {
    const seen = new Set<string>();
    for (const p of list) {
      if (seen.has(p.name)) at('error', 'duplicate', `${what} "${p.name}" is declared twice`, p.pos, p.name.length);
      seen.add(p.name);
    }
  };
  dup(doc.inputs, 'INPUT');
  dup(doc.outputs, 'OUTPUT');
  const keys = new Set<string>();
  for (const st of doc.steps) {
    if (keys.has(st.key)) at('error', 'duplicate-step', `STEP ${st.key} appears twice: keys must be unique`, st.pos, 4);
    keys.add(st.key);
    if (st.key && !KEY_RE.test(st.key)) at('warning', 'key-format', `"${st.key}" doesn't look like a key (for example LOGIC-AUTH-LOGIN-001 or LOGIC-AUTH-LOGIN-001/CHK)`, st.pos, 4);
  }

  // ---------- names that are set somewhere
  const known = new Set<string>([...IMPLICIT, ...doc.inputs.map((p) => p.name)]);
  const collect = (list: FpcStmt[]) => walkStmts(list, (s) => {
    if (s.k === 'set') known.add(baseName(s.target));
    if (s.k === 'forEach') [s.item, s.index].forEach((n) => n && known.add(n));
    if (s.k === 'forRange') known.add(s.index);
    if (s.k === 'try' && s.catchName) known.add(s.catchName);
    if (s.k === 'retry') [s.as, s.failureName].forEach((n) => n && known.add(n));
  });
  collect(doc.body);
  doc.steps.forEach((s) => collect(s.body));
  const warned = new Set<string>();

  // ---------- statements and expressions
  const expr = (e: FpcExpr | undefined, callOk: boolean) => {
    if (!e) return;
    switch (e.k) {
      case 'name':
        if (!known.has(e.name) && !warned.has(e.name)) {
          warned.add(e.name);
          at('warning', 'unknown-name', `"${e.name}" is never set: add it to INPUT or SET it first`, e.pos, e.name.length);
        }
        return;
      case 'call': {
        const f = FUNCTIONS.get(e.fn);
        if (!f) {
          const near = suggest(e.fn, [...FUNCTIONS.keys()]);
          at('error', 'unknown-function', `Unknown function ${e.fn}()${near ? `: did you mean ${near}()?` : ''}`, e.pos, e.fn.length);
        } else if (e.args.length < f.arity[0] || e.args.length > f.arity[1]) {
          const n = f.arity[0] === f.arity[1] ? `${f.arity[0]}` : `${f.arity[0]} to ${f.arity[1]}`;
          at('error', 'arity', `${e.fn}(${f.params}) takes ${n} argument${f.arity[1] === 1 ? '' : 's'}, found ${e.args.length}`, e.pos, e.fn.length);
        }
        e.args.forEach((a) => expr(a, false));
        return;
      }
      case 'api':
      case 'op':
      case 'logic':
        if (!callOk) at('error', 'nested-call', 'CALL must be a statement on its own or the whole value of SET or RETURN', e.pos, 4);
        if (e.k === 'api' && !e.path.startsWith('/')) at('error', 'path', 'A path starts with "/"', e.pos, 4);
        if (e.k === 'logic' && !KEY_RE.test(e.key)) at('warning', 'key-format', `"${e.key}" doesn't look like a logic key (for example LOGIC-LIB-LINE-TOTAL-001)`, e.pos, 4);
        expr(e.with, false);
        return;
      case 'member': expr(e.object, false); return;
      case 'index': expr(e.object, false); expr(e.index, false); return;
      case 'object': e.fields.forEach((f) => expr(f.value, false)); return;
      case 'list': e.items.forEach((x) => expr(x, false)); return;
      case 'unary': expr(e.arg, false); return;
      case 'binary': expr(e.left, false); expr(e.right, false); return;
      case 'is': expr(e.arg, false); return;
      case 'cond': expr(e.test, false); expr(e.then, false); expr(e.else, false); return;
      case 'lit': return;
    }
  };
  const stmts = (list: FpcStmt[]) => {
    for (const s of list) {
      switch (s.k) {
        case 'set':
          if (s.target.k !== 'name') expr(s.target, false);
          expr(s.value, true);
          break;
        case 'if':
          s.branches.forEach((b) => {
            expr(b.cond, false);
            stmts(b.body);
          });
          if (s.else) stmts(s.else);
          break;
        case 'match':
          expr(s.value, false);
          if (!s.cases.length) at('error', 'empty-match', 'MATCH needs at least one CASE', s.pos, 5);
          for (const c of s.cases) {
            for (const v of c.values) if (v.k !== 'lit') at('error', 'case-literal', 'A CASE value must be a literal (a number, a string, true, false or null)', v.pos);
            stmts(c.body);
          }
          if (s.else) stmts(s.else);
          break;
        case 'forEach': expr(s.list, false); stmts(s.body); break;
        case 'forRange': expr(s.from, false); expr(s.to, false); stmts(s.body); break;
        case 'repeat': expr(s.times, false); stmts(s.body); break;
        case 'while': expr(s.cond, false); stmts(s.body); break;
        case 'call':
          if (s.call.k !== 'api' && s.call.k !== 'op' && s.call.k !== 'logic') at('error', 'call', 'Expected CALL', s.pos);
          expr(s.call, true);
          break;
        case 'emit': expr(s.with, false); break;
        case 'try':
          stmts(s.body);
          if (s.catch) stmts(s.catch);
          if (s.finally) stmts(s.finally);
          break;
        case 'retry':
          expr(s.times, false);
          expr(s.backoff, false);
          stmts(s.body);
          if (s.success) stmts(s.success);
          if (s.failure) stmts(s.failure);
          break;
        case 'parallel':
          if (s.branches.length < 1) at('error', 'empty-parallel', 'PARALLEL needs at least one BRANCH', s.pos, 8);
          s.branches.forEach(stmts);
          break;
        case 'wait': expr(s.duration, false); break;
        case 'return':
          if (s.status !== undefined && (s.status < 100 || s.status > 599)) at('error', 'status', `${s.status} is not an HTTP status (100–599)`, s.pos, 6);
          expr(s.value, true);
          expr(s.headers, false);
          break;
        case 'fail':
          if (typeof s.status === 'number' && (s.status < 100 || s.status > 599)) at('error', 'status', `${s.status} is not an HTTP status (100–599); use an UPPER_CASE code for other errors`, s.pos, 4);
          if (typeof s.status === 'string' && !/^[A-Z][A-Z0-9_]*$/.test(s.status)) at('warning', 'error-code', `Error codes are UPPER_CASE (for example ${s.status.toUpperCase().replace(/[^A-Z0-9]+/g, '_')})`, s.pos, 4);
          expr(s.message, false);
          break;
        case 'log': expr(s.value, false); break;
        default: break;
      }
    }
  };
  stmts(doc.body);
  doc.steps.forEach((s) => stmts(s.body));
  return out;
}

export interface CheckResult {
  doc: FpcDocument;
  diagnostics: Diagnostic[];
  /** no errors (warnings allowed) */
  ok: boolean;
}

/** Parse and validate: every problem, in document order. */
export function check(src: string): CheckResult {
  const r = parse(src);
  const diagnostics = [...r.diagnostics, ...validate(r.doc)];
  diagnostics.sort((a, b) => a.line - b.line || a.col - b.col);
  return { doc: r.doc, diagnostics, ok: !diagnostics.some((d) => d.severity === 'error') };
}

/** The canonical form of a document, when it has no errors. */
export function format(src: string): { ok: boolean; text?: string; diagnostics: Diagnostic[] } {
  const r = check(src);
  return r.ok ? { ok: true, text: print(r.doc), diagnostics: r.diagnostics } : { ok: false, diagnostics: r.diagnostics };
}

export function walkStmts(list: FpcStmt[], f: (s: FpcStmt) => void) {
  for (const s of list) {
    f(s);
    switch (s.k) {
      case 'if': s.branches.forEach((b) => walkStmts(b.body, f)); if (s.else) walkStmts(s.else, f); break;
      case 'match': s.cases.forEach((c) => walkStmts(c.body, f)); if (s.else) walkStmts(s.else, f); break;
      case 'forEach': case 'forRange': case 'repeat': case 'while': walkStmts(s.body, f); break;
      case 'try': walkStmts(s.body, f); if (s.catch) walkStmts(s.catch, f); if (s.finally) walkStmts(s.finally, f); break;
      case 'retry': walkStmts(s.body, f); if (s.success) walkStmts(s.success, f); if (s.failure) walkStmts(s.failure, f); break;
      case 'parallel': s.branches.forEach((b) => walkStmts(b, f)); break;
      default: break;
    }
  }
}

function baseName(e: FpcExpr): string {
  return e.k === 'name' ? e.name : e.k === 'member' || e.k === 'index' ? baseName(e.object) : '';
}

/** closest name by edit distance (≤ 2, or a case-insensitive match) */
export function suggest(word: string, names: string[]): string | undefined {
  const lw = word.toLowerCase();
  const exact = names.find((n) => n.toLowerCase() === lw);
  if (exact) return exact;
  let best: string | undefined, bestD = 3;
  for (const n of names) {
    const d = distance(lw, n.toLowerCase());
    if (d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}
function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
