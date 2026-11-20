// FPC 1.0 canonical printer: AST → text. print(parse(x)) is the canonical form of x, and parse(print(ast)) gives the
// same tree back (positions aside). Canonical form: Unicode operators, `SET` on every assignment, two-space
// indentation, one statement per line, a blank line after the header and between steps.
import { FpcDocument, FpcExpr, FpcParam, FpcStep, FpcStmt, FpcTrigger, FpcType } from './ast';
import { FPC_KEYWORDS } from './constructs';

const KEYWORDS = new Set<string>(FPC_KEYWORDS);
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const WORDY = /^[A-Za-z_$][A-Za-z0-9_$.\-:]*$/;

export interface PrintOptions {
  /** called for every line printed for a statement or step (1-based line number) */
  onLine?(node: FpcStmt | FpcStep, line: number): void;
  /** indentation unit (default two spaces) */
  indent?: string;
}

export function quote(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else if (c < 0x20) out += '\\u' + c.toString(16).padStart(4, '0');
    else out += ch;
  }
  return out + '"';
}

/** a bare name if it reads back as the same name, else a quoted string */
export const isBareName = (s: string) => IDENT.test(s) && !KEYWORDS.has(s) && !['true', 'false', 'null'].includes(s);
const fieldName = (s: string) => (IDENT.test(s) && !['true', 'false', 'null'].includes(s) ? s : quote(s));
/** system names, event names: one word (dots and dashes allowed) or a quoted string */
export const wordOrQuoted = (s: string) => (WORDY.test(s) && !KEYWORDS.has(s) && !['true', 'false', 'null'].includes(s) && !s.includes('--') && !/[.\-:]$/.test(s) ? s : quote(s));

// ---------------------------------------------------------------- types
export function printType(t: FpcType): string {
  switch (t.t) {
    case 'prim': return t.name + (t.format ? `(${t.format})` : '');
    case 'enum': return `enum(${t.values.map((v) => (typeof v === 'number' ? String(v) : IDENT.test(v) ? v : quote(v))).join(', ')})`;
    case 'array': return t.item.t === 'union' ? `[${printType(t.item)}]` : `${printType(t.item)}[]`;
    case 'object': return t.fields.length ? `{ ${t.fields.map((f) => `${fieldName(f.name)}${f.optional ? '?' : ''}: ${printType(f.type)}`).join(', ')} }` : '{}';
    case 'union': return t.of.map((o) => (o.t === 'union' ? `[${printType(o)}]` : printType(o))).join(' | ');
  }
}
const printParam = (p: FpcParam) => `${/^\d+$/.test(p.name) ? p.name : fieldName(p.name)}${p.optional ? '?' : ''}: ${printType(p.type)}`;

// ---------------------------------------------------------------- expressions
const PREC: Record<string, number> = { OR: 1, AND: 2, '=': 4, '≠': 4, '<': 4, '≤': 4, '>': 4, '≥': 4, IN: 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
const COMPARE = new Set(['=', '≠', '<', '≤', '>', '≥', 'IN']);

function prec(e: FpcExpr): number {
  switch (e.k) {
    case 'binary': return PREC[e.op];
    case 'unary': return e.op === 'NOT' ? 3 : 7;
    case 'is': return 4;
    case 'api':
    case 'op':
    case 'logic': return 0;
    case 'lit': return typeof e.value === 'number' && e.value < 0 ? 7 : 8;
    default: return 8;
  }
}

export function printExpr(e: FpcExpr, min = 0): string {
  const s = exprText(e);
  return prec(e) < min ? `(${s})` : s;
}

function exprText(e: FpcExpr): string {
  switch (e.k) {
    case 'lit':
      if (e.value === null) return 'null';
      if (typeof e.value === 'string') return quote(e.value);
      if (typeof e.value === 'number') return Number.isFinite(e.value) ? String(e.value) : 'null';
      return String(e.value);
    case 'name': return e.name;
    case 'member': return printExpr(e.object, 8) + (isBareName(e.name) || (IDENT.test(e.name) && KEYWORDS.has(e.name)) ? `.${e.name}` : `[${quote(e.name)}]`);
    case 'index': return `${printExpr(e.object, 8)}[${printExpr(e.index)}]`;
    case 'object':
      return e.fields.length
        ? `{ ${e.fields.map((f) => (f.value.k === 'name' && f.value.name === f.name && isBareName(f.name) ? f.name : `${fieldName(f.name)}: ${printExpr(f.value)}`)).join(', ')} }`
        : '{}';
    case 'list': return `[${e.items.map((x) => printExpr(x)).join(', ')}]`;
    // NOT (a > b) reads better than NOT a > b, although both mean the same
    case 'unary': return e.op === 'NOT' ? `NOT ${printExpr(e.arg, 5)}` : `-${printExpr(e.arg, 7)}`;
    case 'binary': {
      const p = PREC[e.op];
      const cmp = COMPARE.has(e.op);
      return `${printExpr(e.left, cmp ? p + 1 : p)} ${e.op} ${printExpr(e.right, p + 1)}`;
    }
    case 'is': return `${printExpr(e.arg, 5)} IS ${e.negated ? 'NOT ' : ''}${e.test}`;
    case 'cond': return `(IF ${printExpr(e.test)} THEN ${printExpr(e.then)} ELSE ${printExpr(e.else)})`;
    case 'call': return `${e.fn}(${e.args.map((a) => printExpr(a)).join(', ')})`;
    case 'api': return `CALL ${wordOrQuoted(e.system)} ${e.method} ${e.path}${withPart(e.with)}`;
    case 'op': return `CALL ${wordOrQuoted(e.system)} ${wordOrQuoted(e.operation)}${withPart(e.with)}`;
    case 'logic': return `CALL LOGIC ${e.key}${withPart(e.with)}`;
  }
}
const withPart = (w?: FpcExpr) => (w ? ` WITH ${printExpr(w)}` : '');

function triggerText(t: FpcTrigger): string {
  switch (t.k) {
    case 'request': return `ON REQUEST ${t.method} ${t.path}`;
    case 'event': return `ON EVENT ${quote(t.name)}`;
    case 'schedule': return `ON SCHEDULE ${quote(t.spec)}`;
    case 'call': return 'ON CALL';
  }
}

// ---------------------------------------------------------------- statements and documents
export function print(doc: FpcDocument, o: PrintOptions = {}): string {
  const unit = o.indent ?? '  ';
  const lines: string[] = [];
  const emit = (depth: number, text: string, node?: FpcStmt | FpcStep) => {
    lines.push(unit.repeat(depth) + text);
    if (node) o.onLine?.(node, lines.length);
  };
  const withComment = (text: string, c?: string) => (c !== undefined ? `${text} -- ${c}`.trimEnd() : text);

  const block = (list: FpcStmt[], d: number) => list.forEach((s) => stmt(s, d));
  const stmt = (s: FpcStmt, d: number) => {
    const line = (text: string) => emit(d, withComment(text, s.comment), s);
    const end = (text: string) => emit(d, text, s);
    switch (s.k) {
      case 'comment': emit(d, s.text ? `-- ${s.text}` : '--', s); return;
      case 'set': line(`SET ${printExpr(s.target)} ← ${printExpr(s.value)}`); return;
      case 'if':
        s.branches.forEach((b, k) => {
          if (k === 0) line(`IF ${printExpr(b.cond)} THEN`);
          else end(`ELSE IF ${printExpr(b.cond)} THEN`);
          block(b.body, d + 1);
        });
        if (s.else) {
          end('ELSE');
          block(s.else, d + 1);
        }
        end('END IF');
        return;
      case 'match':
        line(`MATCH ${printExpr(s.value)}`);
        for (const c of s.cases) {
          emit(d + 1, `CASE ${c.values.map((v) => printExpr(v)).join(', ')}`, s);
          block(c.body, d + 2);
        }
        if (s.else) {
          emit(d + 1, 'ELSE', s);
          block(s.else, d + 2);
        }
        end('END MATCH');
        return;
      case 'forEach':
        line(`FOR EACH ${s.item}${s.index ? `, ${s.index}` : ''} IN ${printExpr(s.list)}`);
        block(s.body, d + 1);
        end('END FOR');
        return;
      case 'forRange':
        line(`FOR ${s.index} FROM ${printExpr(s.from)} TO ${printExpr(s.to)}`);
        block(s.body, d + 1);
        end('END FOR');
        return;
      case 'repeat':
        line(`REPEAT ${printExpr(s.times)} TIMES`);
        block(s.body, d + 1);
        end('END REPEAT');
        return;
      case 'while':
        line(`WHILE ${printExpr(s.cond)}`);
        block(s.body, d + 1);
        end('END WHILE');
        return;
      case 'call': line(printExpr(s.call)); return;
      case 'emit': line(`EMIT ${wordOrQuoted(s.system)} ${wordOrQuoted(s.event)}${withPart(s.with)}`); return;
      case 'try':
        line('TRY');
        block(s.body, d + 1);
        if (s.catch) {
          end(`CATCH${s.catchName ? ` ${s.catchName}` : ''}`);
          block(s.catch, d + 1);
        }
        if (s.finally) {
          end('FINALLY');
          block(s.finally, d + 1);
        }
        end('END TRY');
        return;
      case 'retry':
        line(`RETRY ${printExpr(s.times)} TIMES${s.backoff ? ` BACKOFF ${printExpr(s.backoff)}` : ''}${s.as ? ` AS ${s.as}` : ''}`);
        block(s.body, d + 1);
        if (s.success) {
          end('ON SUCCESS');
          block(s.success, d + 1);
        }
        if (s.failure) {
          end(`ON FAILURE${s.failureName ? ` AS ${s.failureName}` : ''}`);
          block(s.failure, d + 1);
        }
        end('END RETRY');
        return;
      case 'parallel':
        line('PARALLEL');
        for (const b of s.branches) {
          emit(d + 1, 'BRANCH', s);
          block(b, d + 2);
        }
        end('END PARALLEL');
        return;
      case 'wait': line(`WAIT ${printExpr(s.duration)} ${s.unit}`); return;
      case 'return':
        if (s.status !== undefined) line(`RETURN ${s.status} WITH ${printExpr(s.value ?? { k: 'lit', value: null })}${s.headers ? ` HEADERS ${printExpr(s.headers)}` : ''}`);
        else line(s.value ? `RETURN ${printExpr(s.value)}` : 'RETURN');
        return;
      case 'fail': line(`FAIL ${typeof s.status === 'number' ? s.status : isBareName(s.status) ? s.status : quote(s.status)} ${printExpr(s.message)}`); return;
      case 'log': line(`LOG ${printExpr(s.value)}`); return;
      case 'break': line('BREAK'); return;
      case 'continue': line('CONTINUE'); return;
    }
  };

  emit(0, `FPC ${doc.fpc || '1.0'}`);
  let head = `${doc.kind} ${quote(doc.name)}`;
  if (doc.key) head += ` KEY ${doc.key}`;
  if (doc.version) head += ` VERSION ${doc.version}`;
  if (doc.revision !== undefined) head += ` REVISION ${doc.revision}`;
  emit(0, head);
  for (const c of doc.headerComments) emit(0, c ? `-- ${c}` : '--');
  if (doc.system) emit(0, `SYSTEM ${wordOrQuoted(doc.system)}`);
  if (doc.trigger) emit(0, triggerText(doc.trigger));
  if (doc.inputs.length) emit(0, `INPUT ${doc.inputs.map(printParam).join(', ')}`);
  if (doc.outputs.length) emit(0, `OUTPUT ${doc.outputs.map(printParam).join(', ')}`);
  if (doc.body.length) {
    lines.push('');
    block(doc.body, 0);
  }
  for (const st of doc.steps) {
    lines.push('');
    emit(0, withComment(`STEP ${st.key}${st.title !== undefined ? ` ${quote(st.title)}` : ''}${st.system ? ` IN ${wordOrQuoted(st.system)}` : ''}`, st.comment), st);
    block(st.body, 1);
  }
  return lines.join('\n') + '\n';
}
