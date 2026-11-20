// FPC 1.0 parser: text → AST with source positions. Spec: spec/fpc-1.0.md, grammar: grammar/fpc-1.0.ebnf.
//
// How it works (read this first):
// - A hand-written recursive-descent parser over the tokens from lexer.ts. One method per construct: `document()` reads the
//   header, then the body, then each STEP; `block()` reads statements; `statement()` picks the construct by its first
//   keyword; the expression methods (`or` … `primary`) climb the precedence levels listed above `expr()`.
// - Errors never stop the parse. A method that can't continue throws a `SyntaxErr`; the nearest `block()` (or the header
//   loop) catches it in `recover()`, records a diagnostic with line and column, skips the rest of that line and goes on.
//   So one mistake doesn't hide the ones below it, and `parse()` always returns a document (the broken parts left out).
//   `block()` also guarantees progress, so a bad line can never loop forever.
// - Line breaks end statements, except inside ( ), [ ] and { }: `nest` counts those, and `peek`/`next` then skip line
//   breaks and comments for you. `open` is the stack of unclosed IF/MATCH/FOR/… blocks, used to say which END is missing.
// - Nesting deeper than MAX_NESTING is reported, not followed, so hostile input can't overflow the call stack.
// - To add a statement or keyword, follow the checklist in CONTRIBUTING.md.
import { FpcBinaryOp, FpcDocument, FpcExpr, FpcField, FpcParam, FpcStep, FpcStmt, FpcTrigger, FpcType, Diagnostic, Pos } from './ast';
import { FPC_HTTP_METHODS, FPC_WAIT_UNITS } from './constructs';
import { lex, Token } from './lexer';

class SyntaxErr extends Error {
  constructor(message: string, public tok: Token, public code = 'syntax') {
    super(message);
  }
}

const PRIMS = new Set(['string', 'number', 'integer', 'boolean', 'null', 'any', 'object', 'array']);
const METHODS = new Set<string>(FPC_HTTP_METHODS);
const UNITS = new Set<string>(FPC_WAIT_UNITS);
const COMPARE = new Set(['=', '≠', '<', '≤', '>', '≥']);
/** keywords that close or continue a block: a statement never starts with them */
const BLOCK_WORDS = new Set(['END', 'ELSE', 'CASE', 'CATCH', 'FINALLY', 'BRANCH', 'ON', 'STEP']);
/** deeper blocks or values than this are reported instead of overflowing the call stack */
export const MAX_NESTING = 200;

type Opener = { word: string; tok: Token };

export interface ParseResult {
  /** always present; parts that failed to parse are left out */
  doc: FpcDocument;
  diagnostics: Diagnostic[];
}

export function parse(src: string): ParseResult {
  return new Parser(src).document();
}

/** Parses a single expression (used by tools and tests). */
export function parseExpression(src: string): { expr?: FpcExpr; diagnostics: Diagnostic[] } {
  const p = new Parser(src);
  try {
    const e = p.expr();
    p.skipNl();
    if (p.peek().kind !== 'eof') throw new SyntaxErr(`Unexpected ${p.describe(p.peek())} after the expression`, p.peek());
    return { expr: e, diagnostics: p.diags };
  } catch (e) {
    if (e instanceof SyntaxErr) p.error(e);
    else throw e;
    return { diagnostics: p.diags };
  }
}

/** One parse of one source text. Use `parse()` or `parseExpression()` rather than this class directly. */
class Parser {
  toks: Token[];
  i = 0;
  diags: Diagnostic[] = [];
  /** inside ( ), [ ] or { }: new lines and comments are skipped */
  private nest = 0;
  private open: Opener[] = [];
  private loops = 0;
  private depth = 0;

  constructor(private src: string) {
    const r = lex(src);
    this.toks = r.tokens;
    for (const e of r.errors) this.diags.push({ severity: 'error', code: 'syntax', message: e.message, line: e.line, col: e.col });
  }

  // ------------------------------------------------------------ tokens
  peek(o = 0): Token {
    if (this.nest === 0) return this.toks[Math.min(this.i + o, this.toks.length - 1)];
    let j = this.i, seen = -1;
    while (j < this.toks.length) {
      const t = this.toks[j];
      if (t.kind !== 'nl' && t.kind !== 'comment') {
        seen++;
        if (seen === o) return t;
      }
      j++;
    }
    return this.toks[this.toks.length - 1];
  }
  next(): Token {
    if (this.nest > 0) while (this.toks[this.i].kind === 'nl' || this.toks[this.i].kind === 'comment') this.i++;
    const t = this.toks[this.i];
    if (t.kind !== 'eof') this.i++;
    return t;
  }
  pos(t: Token): Pos {
    return { line: t.line, col: t.col };
  }
  isKw(word: string, o = 0) {
    const t = this.peek(o);
    return t.kind === 'kw' && t.value === word;
  }
  isP(v: string, o = 0) {
    const t = this.peek(o);
    return (t.kind === 'punct' || t.kind === 'op') && t.value === v;
  }
  eatKw(word: string) {
    if (!this.isKw(word)) return false;
    this.next();
    return true;
  }
  eatP(v: string) {
    if (!this.isP(v)) return false;
    this.next();
    return true;
  }
  expectKw(word: string, hint?: string): Token {
    if (!this.isKw(word)) throw new SyntaxErr(hint ?? `Expected ${word}, found ${this.describe(this.peek())}`, this.peek());
    return this.next();
  }
  expectP(v: string, hint?: string): Token {
    if (!this.isP(v)) throw new SyntaxErr(hint ?? `Expected "${v}", found ${this.describe(this.peek())}`, this.peek());
    return this.next();
  }
  describe(t: Token): string {
    switch (t.kind) {
      case 'eof': return 'the end of the document';
      case 'nl': return 'the end of the line';
      case 'str': return `the string "${t.value}"`;
      case 'comment': return 'a comment';
      case 'kw': return t.value;
      default: return `"${t.value}"`;
    }
  }
  atLineEnd() {
    const k = this.toks[this.i].kind;
    return k === 'nl' || k === 'eof' || k === 'comment';
  }
  skipNl() {
    while (this.toks[this.i].kind === 'nl') this.i++;
  }
  error(e: SyntaxErr) {
    const t = e.tok;
    // too deep is reported once, not on every line below the limit
    if (e.message.startsWith('Nested more than') && this.diags.some((d) => d.message === e.message)) return;
    this.diags.push({ severity: 'error', code: e.code, message: e.message, line: t.line, col: t.col, endCol: t.col + Math.max(1, t.end - t.start) });
  }
  /** skip the rest of the line (after an error) */
  skipLine() {
    this.nest = 0;
    while (!['nl', 'eof'].includes(this.toks[this.i].kind)) this.i++;
  }
  /** end of a statement line: an optional trailing comment, then a new line */
  endLine(): string | undefined {
    let comment: string | undefined;
    const t = this.toks[this.i];
    if (t.kind === 'comment') {
      comment = t.value;
      this.i++;
    }
    const n = this.toks[this.i];
    if (n.kind === 'nl') this.i++;
    else if (n.kind !== 'eof') {
      const e = new SyntaxErr(`Unexpected ${this.describe(n)} at the end of the statement`, n);
      this.skipLine();
      throw e;
    }
    return comment;
  }
  /**
   * Adjacent tokens with no space between them, as written: keys (`LOGIC-AUTH-LOGIN-001`), paths (`/api/v2/login`),
   * versions (`1.3.0`), operation names (`users.findByEmail`).
   */
  word(what: string): { text: string; tok: Token } {
    const first = this.peek();
    if (first.kind === 'eof' || first.kind === 'nl' || first.kind === 'comment' || first.kind === 'str') throw new SyntaxErr(`Expected ${what}, found ${this.describe(first)}`, first);
    this.next();
    let end = first.end;
    while (true) {
      const t = this.toks[this.i];
      if (t.spaced || t.kind === 'nl' || t.kind === 'eof' || t.kind === 'comment' || t.kind === 'str') break;
      if (t.kind === 'punct' && [',', '(', ')', '{', '}', '['].includes(t.value) && !(what === 'a path' && ['{', '}'].includes(t.value))) break;
      end = t.end;
      this.i++;
    }
    return { text: this.src.slice(first.start, end), tok: first };
  }
  /** a system name: a word, or a "quoted name" */
  name(what: string): string {
    const t = this.peek();
    if (t.kind === 'str') {
      this.next();
      return t.value;
    }
    if (t.kind !== 'ident') throw new SyntaxErr(`Expected ${what}, found ${this.describe(t)}`, t);
    return this.word(what).text;
  }
  ident(what: string): string {
    const t = this.peek();
    if (t.kind !== 'ident') throw new SyntaxErr(t.kind === 'kw' ? `${t.value} is a keyword and can't be used as ${what}` : `Expected ${what}, found ${this.describe(t)}`, t);
    this.next();
    return t.value;
  }

  // ------------------------------------------------------------ document
  document(): ParseResult {
    const doc: FpcDocument = { fpc: '', kind: 'LOGIC', name: '', headerComments: [], inputs: [], outputs: [], body: [], steps: [] };
    const blankOrComment = () => {
      while (true) {
        const t = this.toks[this.i];
        if (t.kind === 'nl') this.i++;
        else if (t.kind === 'comment') {
          doc.headerComments.push(t.value);
          this.i++;
        } else return;
      }
    };
    blankOrComment();
    // FPC 1.0
    try {
      const t = this.peek();
      doc.pos = this.pos(t);
      this.expectKw('FPC', 'A document starts with the line "FPC 1.0"');
      if (this.peek().kind !== 'num') throw new SyntaxErr('Expected the FPC version after FPC, for example "FPC 1.0"', this.peek());
      doc.fpc = this.word('the FPC version').text;
      this.endLine();
    } catch (e) {
      this.recover(e);
    }
    blankOrComment();
    // FLOW|LOGIC "name" KEY … VERSION …|REVISION …
    try {
      const t = this.peek();
      if (t.kind !== 'kw' || (t.value !== 'FLOW' && t.value !== 'LOGIC')) throw new SyntaxErr('The second line says what the document describes: FLOW "name" or LOGIC "name"', t);
      this.next();
      doc.kind = t.value as 'FLOW' | 'LOGIC';
      const n = this.peek();
      if (n.kind !== 'str') throw new SyntaxErr(`Expected the ${t.value.toLowerCase()} name in quotes, for example ${t.value} "User login"`, n);
      this.next();
      doc.name = n.value;
      while (!this.atLineEnd()) {
        if (this.eatKw('KEY')) doc.key = this.word('a key').text;
        else if (this.eatKw('VERSION')) doc.version = this.word('a version like 1.3.0').text;
        else if (this.eatKw('REVISION')) {
          const r = this.peek();
          if (r.kind !== 'num' || !/^\d+$/.test(r.value)) throw new SyntaxErr('REVISION needs a whole number', r);
          this.next();
          doc.revision = Number(r.value);
        } else throw new SyntaxErr(`Unexpected ${this.describe(this.peek())} in the header (expected KEY, VERSION or REVISION)`, this.peek());
      }
      const c = this.endLine();
      if (c) doc.headerComments.push(c);
    } catch (e) {
      this.recover(e);
    }
    // header lines
    while (true) {
      blankOrComment();
      const t = this.peek();
      if (t.kind !== 'kw') break;
      try {
        if (t.value === 'SYSTEM') {
          this.next();
          doc.system = this.name('a system name');
        } else if (t.value === 'ON' && !this.isKw('SUCCESS', 1) && !this.isKw('FAILURE', 1)) {
          this.next();
          doc.trigger = this.trigger(t);
        } else if (t.value === 'INPUT' || t.value === 'OUTPUT') {
          this.next();
          (t.value === 'INPUT' ? doc.inputs : doc.outputs).push(...this.params());
        } else break;
        const c = this.endLine();
        if (c) doc.headerComments.push(c);
      } catch (e) {
        this.recover(e);
      }
    }
    // body, then STEP sections
    doc.body = this.block(() => this.isKw('STEP'));
    while (this.isKw('STEP')) {
      const t = this.next();
      const step: FpcStep = { key: '', body: [], pos: this.pos(t) };
      try {
        step.key = this.word('a step key').text;
        if (this.peek().kind === 'str') step.title = this.next().value;
        if (this.eatKw('IN')) step.system = this.name('a system name');
        step.comment = this.endLine();
      } catch (e) {
        this.recover(e);
      }
      step.body = this.block(() => this.isKw('STEP'));
      if (step.comment === undefined) delete step.comment;
      doc.steps.push(step);
    }
    return { doc, diagnostics: this.diags };
  }

  /** Records a syntax error and skips to the next line. Anything that isn't a `SyntaxErr` is a bug and is rethrown. */
  private recover(e: unknown) {
    if (!(e instanceof SyntaxErr)) throw e;
    this.error(e);
    this.skipLine();
    if (this.toks[this.i].kind === 'nl') this.i++;
  }

  private trigger(on: Token): FpcTrigger {
    const p = this.pos(on);
    if (this.eatKw('REQUEST')) {
      const m = this.peek();
      if (m.kind !== 'ident' || !METHODS.has(m.value)) throw new SyntaxErr(`Expected an HTTP method (${FPC_HTTP_METHODS.join(', ')}) after ON REQUEST`, m);
      this.next();
      if (!this.isP('/')) throw new SyntaxErr('Expected a path starting with "/"', this.peek());
      return { k: 'request', method: m.value, path: this.word('a path').text, pos: p };
    }
    if (this.eatKw('EVENT')) return { k: 'event', name: this.stringOrWord('the event name'), pos: p };
    if (this.eatKw('SCHEDULE')) return { k: 'schedule', spec: this.stringOrWord('the schedule'), pos: p };
    if (this.eatKw('CALL')) return { k: 'call', pos: p };
    throw new SyntaxErr('Expected REQUEST, EVENT, SCHEDULE or CALL after ON', this.peek());
  }
  private stringOrWord(what: string) {
    const t = this.peek();
    if (t.kind === 'str') return this.next().value;
    return this.word(what).text;
  }

  private params(): FpcParam[] {
    const out: FpcParam[] = [];
    do {
      const t = this.peek();
      let name: string;
      if (t.kind === 'ident' || t.kind === 'num' || t.kind === 'str' || t.kind === 'kw') name = this.next().value;
      else throw new SyntaxErr(`Expected a name, found ${this.describe(t)}`, t);
      const optional = this.eatP('?');
      this.expectP(':', `Expected ":" and a type after ${name}`);
      out.push({ name, optional, type: this.type(), pos: this.pos(t) });
    } while (this.eatP(','));
    return out;
  }

  // ------------------------------------------------------------ types
  type(): FpcType {
    const of = [this.singleType()];
    while (this.eatP('|')) of.push(this.singleType());
    return of.length === 1 ? of[0] : { t: 'union', of };
  }
  private singleType(): FpcType {
    let t: FpcType;
    const tok = this.peek();
    if (this.isP('{')) {
      this.next();
      this.nest++;
      const fields: FpcField[] = [];
      while (!this.isP('}')) {
        const n = this.peek();
        if (n.kind !== 'ident' && n.kind !== 'str' && n.kind !== 'kw' && n.kind !== 'num') throw new SyntaxErr(`Expected a field name, found ${this.describe(n)}`, n);
        this.next();
        const optional = this.eatP('?');
        this.expectP(':', `Expected ":" and a type after ${n.value}`);
        fields.push({ name: n.value, optional, type: this.type() });
        if (!this.eatP(',') && !this.isP('}') && this.peek().kind === 'eof') break;
      }
      this.nest--;
      this.expectP('}', 'This type is not closed: add "}"');
      t = { t: 'object', fields };
    } else if (this.isP('[')) {
      this.next();
      this.nest++;
      const item = this.type();
      this.nest--;
      this.expectP(']', 'Expected "]"');
      t = { t: 'array', item };
    } else if (tok.kind === 'ident' && tok.value === 'enum') {
      this.next();
      this.expectP('(', 'Expected "(" after enum');
      this.nest++;
      const values: (string | number)[] = [];
      while (!this.isP(')')) {
        const v = this.next();
        if (v.kind === 'num') values.push(Number(v.value));
        else if (v.kind === 'str' || v.kind === 'ident' || v.kind === 'kw') values.push(v.value);
        else if (v.kind === 'op' && v.value === '-' && this.peek().kind === 'num') values.push(-Number(this.next().value));
        else throw new SyntaxErr(`Expected an enum value, found ${this.describe(v)}`, v);
        if (!this.eatP(',')) break;
      }
      this.nest--;
      this.expectP(')', 'Expected ")" after the enum values');
      t = { t: 'enum', values };
    } else if ((tok.kind === 'ident' && PRIMS.has(tok.value)) || (tok.kind === 'kw' && tok.value === 'NULL')) {
      this.next();
      t = { t: 'prim', name: tok.value.toLowerCase() as 'string' };
      if (this.isP('(') && !this.peek().spaced) {
        this.next();
        const f = this.word('a format').text;
        this.expectP(')', 'Expected ")" after the format');
        t = { ...t, format: f };
      }
    } else {
      throw new SyntaxErr(`Unknown type ${this.describe(tok)}: use string, number, integer, boolean, null, any, object, array, enum(…), { … } or T[]`, tok, 'unknown-type');
    }
    while (this.isP('[') && this.isP(']', 1)) {
      this.next();
      this.next();
      t = { t: 'array', item: t };
    }
    return t;
  }

  // ------------------------------------------------------------ statements
  /**
   * Statements until `stop()` or the end of the text; comment lines become comment statements. This is where errors are
   * caught: a bad statement is recorded by `recover()` and the next line is read as usual.
   */
  block(stop: () => boolean): FpcStmt[] {
    const out: FpcStmt[] = [];
    while (true) {
      this.skipNl();
      const t = this.toks[this.i];
      if (t.kind === 'eof') return out;
      if (t.kind === 'comment') {
        this.i++;
        out.push({ k: 'comment', text: t.value, pos: this.pos(t) });
        continue;
      }
      if (stop()) return out;
      const before = this.i;
      try {
        const s = this.statement();
        if (s) out.push(s);
      } catch (e) {
        this.recover(e);
      }
      if (this.i === before) this.i++; // always make progress
    }
  }

  /** One statement, chosen by its first word. Compound statements (IF, MATCH, FOR, …) read their own blocks and END line. */
  private statement(): FpcStmt | undefined {
    const t = this.peek();
    const pos = this.pos(t);
    const withComment = (s: FpcStmt, c: string | undefined): FpcStmt => (c !== undefined ? { ...s, comment: c } : s);
    if (t.kind === 'kw') {
      switch (t.value) {
        case 'SET': {
          this.next();
          const target = this.target();
          this.assignOp();
          const value = this.expr();
          return withComment({ k: 'set', target, value, pos }, this.endLine());
        }
        case 'IF': return this.ifStmt();
        case 'MATCH': return this.matchStmt();
        case 'FOR': return this.forStmt();
        case 'REPEAT': {
          this.next();
          const times = this.header(() => this.expr());
          this.headerKw('TIMES', 'REPEAT n TIMES: add TIMES');
          const c = this.headerEnd();
          const body = this.loopBody(() => this.isKw('END'));
          this.close('REPEAT', t);
          return withComment({ k: 'repeat', times: times ?? lit(0), body, pos }, c);
        }
        case 'WHILE': {
          this.next();
          const cond = this.header(() => this.expr());
          this.eatKw('DO');
          const c = this.headerEnd();
          const body = this.loopBody(() => this.isKw('END'));
          this.close('WHILE', t);
          return withComment({ k: 'while', cond: cond ?? lit(false), body, pos }, c);
        }
        case 'CALL': {
          const call = this.callExpr();
          return withComment({ k: 'call', call, pos }, this.endLine());
        }
        case 'EMIT': {
          this.next();
          const system = this.name('a system name');
          const event = this.stringOrWord('the event name');
          const w = this.eatKw('WITH') ? this.expr() : undefined;
          return withComment({ k: 'emit', system, event, ...(w ? { with: w } : {}), pos }, this.endLine());
        }
        case 'TRY': return this.tryStmt();
        case 'RETRY': return this.retryStmt();
        case 'PARALLEL': return this.parallelStmt();
        case 'WAIT': {
          this.next();
          const duration = this.expr();
          let unit: 'ms' | 's' | 'm' | 'h' = 'ms';
          const u = this.peek();
          if (u.kind === 'ident' && UNITS.has(u.value)) {
            this.next();
            unit = u.value as typeof unit;
          } else if (u.kind === 'ident') throw new SyntaxErr(`Unknown time unit "${u.value}": use ms, s, m or h`, u);
          return withComment({ k: 'wait', duration, unit, pos }, this.endLine());
        }
        case 'RETURN': {
          this.next();
          if (this.atLineEnd()) return withComment({ k: 'return', pos }, this.endLine());
          const first = this.expr();
          if (this.eatKw('WITH')) {
            if (first.k !== 'lit' || typeof first.value !== 'number' || !Number.isInteger(first.value)) throw new SyntaxErr('RETURN … WITH needs an HTTP status first, for example RETURN 200 WITH body', t);
            const value = this.expr();
            const headers = this.eatKw('HEADERS') ? this.expr() : undefined;
            return withComment({ k: 'return', status: first.value, value, ...(headers ? { headers } : {}), pos }, this.endLine());
          }
          return withComment({ k: 'return', value: first, pos }, this.endLine());
        }
        case 'FAIL': {
          this.next();
          const s = this.peek();
          let status: number | string;
          if (s.kind === 'num' && /^\d+$/.test(s.value)) status = Number(this.next().value);
          else if (s.kind === 'ident' || s.kind === 'str') status = this.next().value;
          else throw new SyntaxErr('FAIL needs a status or an error code, then a message: FAIL 401 "Invalid credentials"', s);
          if (this.atLineEnd()) throw new SyntaxErr('FAIL needs a message after the status, for example FAIL 400 "email is required"', this.peek());
          const message = this.expr();
          return withComment({ k: 'fail', status, message, pos }, this.endLine());
        }
        case 'LOG': {
          this.next();
          return withComment({ k: 'log', value: this.expr(), pos }, this.endLine());
        }
        case 'BREAK':
        case 'CONTINUE': {
          this.next();
          if (!this.loops) this.diags.push({ severity: 'error', code: 'break-outside-loop', message: `${t.value} can only be used inside FOR, REPEAT or WHILE`, line: t.line, col: t.col, endCol: t.col + t.value.length });
          return withComment({ k: t.value === 'BREAK' ? 'break' : 'continue', pos }, this.endLine());
        }
        default:
          if (BLOCK_WORDS.has(t.value)) {
            const inner = this.open[this.open.length - 1];
            throw new SyntaxErr(inner ? `Unexpected ${t.value}${this.isKw('IF', 1) || this.peek(1).kind === 'kw' ? ' ' + this.peek(1).value : ''} inside ${inner.word} (line ${inner.tok.line})` : `${t.value}${this.peek(1).kind === 'kw' ? ' ' + this.peek(1).value : ''} without an open block`, t, 'unbalanced');
          }
          if (t.value === 'NOT' || t.value === 'TRUE' || t.value === 'FALSE' || t.value === 'NULL') break;
          throw new SyntaxErr(`${t.value} can't start a statement`, t);
      }
    }
    // name ← value
    if (t.kind === 'ident' && this.isP('(', 1) && !this.peek(1).spaced) {
      throw new SyntaxErr(`A function call on its own does nothing: keep its value with "SET x ← ${t.value}(…)"`, t);
    }
    if (t.kind === 'ident') {
      const target = this.target();
      this.assignOp();
      const value = this.expr();
      return withComment({ k: 'set', target, value, pos }, this.endLine());
    }
    throw new SyntaxErr(`Expected a statement, found ${this.describe(t)}`, t);
  }

  private assignOp() {
    const t = this.peek();
    if (t.kind === 'op' && t.value === '←') {
      this.next();
      return;
    }
    if (t.kind === 'op' && t.value === '=') throw new SyntaxErr('Use ← (or <-) to set a value; = compares', t);
    throw new SyntaxErr(`Expected ← (or <-), found ${this.describe(t)}`, t);
  }

  /** assignable: name, name.field, name[index] */
  private target(): FpcExpr {
    const t = this.peek();
    if (t.kind !== 'ident') throw new SyntaxErr(t.kind === 'kw' ? `${t.value} is a keyword and can't be used as a variable name` : `Expected a variable name, found ${this.describe(t)}`, t);
    const e = this.postfix(this.primary());
    if (e.k !== 'name' && e.k !== 'member' && e.k !== 'index') throw new SyntaxErr('Only a variable, a field or an item can be set', t);
    return e;
  }

  /** parse a block header part; on error report it, skip the line and go on with the block */
  private headerFailed = false;
  private header<T>(f: () => T): T | undefined {
    if (this.headerFailed) return undefined;
    try {
      return f();
    } catch (e) {
      if (!(e instanceof SyntaxErr)) throw e;
      this.error(e);
      this.skipLine();
      this.headerFailed = true;
      return undefined;
    }
  }
  private headerKw(word: string, hint: string) {
    this.header(() => this.expectKw(word, hint));
  }
  private headerEnd(): string | undefined {
    if (this.headerFailed) {
      this.headerFailed = false;
      if (this.toks[this.i].kind === 'nl') this.i++;
      return undefined;
    }
    try {
      return this.endLine();
    } catch (e) {
      if (!(e instanceof SyntaxErr)) throw e;
      this.error(e);
      if (this.toks[this.i].kind === 'nl') this.i++;
      return undefined;
    }
  }
  private loopBody(stop: () => boolean) {
    this.loops++;
    try {
      return this.block(stop);
    } finally {
      this.loops--;
    }
  }

  /** `END <word>`; a different END that closes an outer block is left for it */
  private close(word: string, opener: Token) {
    const t = this.peek();
    if (this.isKw('END') && this.isKw(word, 1)) {
      this.next();
      this.next();
      this.headerEnd();
      return;
    }
    const msg = `${word} on line ${opener.line} is not closed: add END ${word}`;
    if (t.kind === 'eof') {
      this.diags.push({ severity: 'error', code: 'unclosed-block', message: msg, line: opener.line, col: opener.col, endCol: opener.col + word.length });
      return;
    }
    // END of another kind
    const other = this.peek(1);
    const closesOuter = this.isKw('END') && this.open.some((o) => o.word === other.value);
    this.diags.push({ severity: 'error', code: 'unclosed-block', message: `${msg}${this.isKw('END') ? ` (found END ${other.value ?? ''})` : ''}`, line: t.line, col: t.col, endCol: t.col + 3 });
    if (!closesOuter && this.isKw('END')) {
      this.skipLine();
      if (this.toks[this.i].kind === 'nl') this.i++;
    }
  }
  private opened<T>(word: string, tok: Token, f: () => T): T {
    this.open.push({ word, tok });
    try {
      return this.deeper(tok, f);
    } finally {
      this.open.pop();
    }
  }
  /** one level of nesting (a block or a value inside a value), refused past MAX_NESTING */
  private deeper<T>(tok: Token, f: () => T): T {
    if (this.depth >= MAX_NESTING) throw new SyntaxErr(`Nested more than ${MAX_NESTING} levels deep: split this into smaller parts`, tok);
    this.depth++;
    try {
      return f();
    } finally {
      this.depth--;
    }
  }

  private ifStmt(): FpcStmt {
    const t = this.next();
    return this.opened('IF', t, () => {
      const branches: { cond: FpcExpr; body: FpcStmt[]; pos?: Pos }[] = [];
      const cond = this.header(() => this.expr());
      this.headerKw('THEN', 'IF needs THEN at the end of the line');
      const comment = this.headerEnd();
      const stop = () => this.isKw('ELSE') || this.isKw('END');
      branches.push({ cond: cond ?? lit(false), body: this.block(stop), pos: this.pos(t) });
      let otherwise: FpcStmt[] | undefined;
      while (this.isKw('ELSE')) {
        const e = this.next();
        if (this.isKw('IF')) {
          if (otherwise) this.diags.push({ severity: 'error', code: 'syntax', message: 'ELSE IF after ELSE: move it before ELSE', line: e.line, col: e.col });
          this.next();
          const c = this.header(() => this.expr());
          this.headerKw('THEN', 'ELSE IF needs THEN at the end of the line');
          this.headerEnd();
          branches.push({ cond: c ?? lit(false), body: this.block(stop), pos: this.pos(e) });
        } else {
          if (otherwise) this.diags.push({ severity: 'error', code: 'syntax', message: 'An IF can have only one ELSE', line: e.line, col: e.col });
          this.headerEnd();
          otherwise = this.block(stop);
        }
      }
      this.close('IF', t);
      const s: FpcStmt = { k: 'if', branches, ...(otherwise ? { else: otherwise } : {}), pos: this.pos(t) };
      return comment !== undefined ? { ...s, comment } : s;
    });
  }

  private matchStmt(): FpcStmt {
    const t = this.next();
    return this.opened('MATCH', t, () => {
      const value = this.header(() => this.expr());
      const comment = this.headerEnd();
      const cases: { values: FpcExpr[]; body: FpcStmt[]; pos?: Pos }[] = [];
      let otherwise: FpcStmt[] | undefined;
      const stop = () => this.isKw('CASE') || this.isKw('ELSE') || this.isKw('END');
      const lead = this.block(stop).filter((s) => s.k !== 'comment');
      if (lead.length) this.diags.push({ severity: 'error', code: 'syntax', message: 'Statements in a MATCH must be inside a CASE', line: lead[0].pos?.line ?? t.line, col: lead[0].pos?.col ?? 1 });
      while (this.isKw('CASE') || this.isKw('ELSE')) {
        const c = this.next();
        if (c.value === 'CASE') {
          if (otherwise) this.diags.push({ severity: 'error', code: 'syntax', message: 'CASE after ELSE: ELSE must be the last part of a MATCH', line: c.line, col: c.col });
          const values: FpcExpr[] = [];
          this.header(() => {
            do values.push(this.expr());
            while (this.eatP(','));
          });
          this.headerEnd();
          cases.push({ values, body: this.block(stop), pos: this.pos(c) });
        } else {
          this.headerEnd();
          otherwise = this.block(stop);
        }
      }
      this.close('MATCH', t);
      const s: FpcStmt = { k: 'match', value: value ?? lit(null), cases, ...(otherwise ? { else: otherwise } : {}), pos: this.pos(t) };
      return comment !== undefined ? { ...s, comment } : s;
    });
  }

  private forStmt(): FpcStmt {
    const t = this.next();
    return this.opened('FOR', t, () => {
      let s: FpcStmt;
      if (this.eatKw('EACH')) {
        const h = this.header(() => {
          const item = this.ident('the item name');
          const index = this.eatP(',') ? this.ident('the index name') : undefined;
          this.expectKw('IN', 'FOR EACH item IN list: add IN');
          const list = this.expr();
          this.eatKw('DO');
          return { item, index, list };
        });
        const comment = this.headerEnd();
        const body = this.loopBody(() => this.isKw('END'));
        this.close('FOR', t);
        s = { k: 'forEach', item: h?.item ?? 'item', ...(h?.index ? { index: h.index } : {}), list: h?.list ?? lit(null), body, pos: this.pos(t), ...(comment !== undefined ? { comment } : {}) };
      } else {
        const h = this.header(() => {
          const index = this.ident('the counter name');
          this.expectKw('FROM', 'FOR i FROM first TO last (or FOR EACH item IN list)');
          const from = this.expr();
          this.expectKw('TO', 'FOR i FROM first TO last: add TO');
          const to = this.expr();
          this.eatKw('DO');
          return { index, from, to };
        });
        const comment = this.headerEnd();
        const body = this.loopBody(() => this.isKw('END'));
        this.close('FOR', t);
        s = { k: 'forRange', index: h?.index ?? 'i', from: h?.from ?? lit(0), to: h?.to ?? lit(0), body, pos: this.pos(t), ...(comment !== undefined ? { comment } : {}) };
      }
      return s;
    });
  }

  private tryStmt(): FpcStmt {
    const t = this.next();
    return this.opened('TRY', t, () => {
      const comment = this.headerEnd();
      const stop = () => this.isKw('CATCH') || this.isKw('FINALLY') || this.isKw('END');
      const body = this.block(stop);
      let catchName: string | undefined, handler: FpcStmt[] | undefined, fin: FpcStmt[] | undefined;
      if (this.eatKw('CATCH')) {
        if (!this.atLineEnd()) catchName = this.header(() => this.ident('the error name'));
        this.headerEnd();
        handler = this.block(stop);
      }
      if (this.eatKw('FINALLY')) {
        this.headerEnd();
        fin = this.block(stop);
      }
      if (!handler && !fin) this.diags.push({ severity: 'error', code: 'syntax', message: 'TRY needs a CATCH or a FINALLY', line: t.line, col: t.col, endCol: t.col + 3 });
      this.close('TRY', t);
      const s: FpcStmt = { k: 'try', body, ...(catchName ? { catchName } : {}), ...(handler ? { catch: handler } : {}), ...(fin ? { finally: fin } : {}), pos: this.pos(t) };
      return comment !== undefined ? { ...s, comment } : s;
    });
  }

  private retryStmt(): FpcStmt {
    const t = this.next();
    return this.opened('RETRY', t, () => {
      const h = this.header(() => {
        const times = this.expr();
        this.expectKw('TIMES', 'RETRY n TIMES: add TIMES');
        const backoff = this.eatKw('BACKOFF') ? this.expr() : undefined;
        if (backoff && this.peek().kind === 'ident' && this.peek().value === 'ms') this.next();
        const as = this.eatKw('AS') ? this.ident('the attempt name') : undefined;
        return { times, backoff, as };
      });
      const comment = this.headerEnd();
      const stop = () => this.isKw('END') || (this.isKw('ON') && (this.isKw('SUCCESS', 1) || this.isKw('FAILURE', 1)));
      const body = this.block(stop);
      let success: FpcStmt[] | undefined, failure: FpcStmt[] | undefined, failureName: string | undefined;
      while (this.isKw('ON')) {
        const on = this.next();
        if (this.eatKw('SUCCESS')) {
          if (success) this.diags.push({ severity: 'error', code: 'syntax', message: 'RETRY has only one ON SUCCESS', line: on.line, col: on.col });
          this.headerEnd();
          success = this.block(stop);
        } else {
          this.next(); // FAILURE (stop() guarantees it)
          if (this.eatKw('AS')) failureName = this.header(() => this.ident('the error name'));
          this.headerEnd();
          failure = this.block(stop);
        }
      }
      this.close('RETRY', t);
      const s: FpcStmt = {
        k: 'retry', times: h?.times ?? lit(1), ...(h?.backoff ? { backoff: h.backoff } : {}), ...(h?.as ? { as: h.as } : {}), body,
        ...(success ? { success } : {}), ...(failureName ? { failureName } : {}), ...(failure ? { failure } : {}), pos: this.pos(t),
      };
      return comment !== undefined ? { ...s, comment } : s;
    });
  }

  private parallelStmt(): FpcStmt {
    const t = this.next();
    return this.opened('PARALLEL', t, () => {
      const comment = this.headerEnd();
      const stop = () => this.isKw('BRANCH') || this.isKw('END');
      const lead = this.block(stop).filter((s) => s.k !== 'comment');
      if (lead.length) this.diags.push({ severity: 'error', code: 'syntax', message: 'Statements in PARALLEL must be inside a BRANCH', line: lead[0].pos?.line ?? t.line, col: lead[0].pos?.col ?? 1 });
      const branches: FpcStmt[][] = [];
      while (this.eatKw('BRANCH')) {
        this.headerEnd();
        branches.push(this.block(stop));
      }
      this.close('PARALLEL', t);
      const s: FpcStmt = { k: 'parallel', branches, pos: this.pos(t) };
      return comment !== undefined ? { ...s, comment } : s;
    });
  }

  // ------------------------------------------------------------ expressions
  // Precedence, loosest to tightest; each level is one method that calls the next one down:
  //   OR  <  AND  <  NOT  <  comparison (= ≠ < ≤ > ≥, IN, IS EMPTY / IS NULL)  <  + -  <  * / %  <  unary -  <  postfix (.field, [index])  <  primary
  // Comparisons don't chain (`a < b < c` is an error: write `a < b AND b < c`).
  expr(): FpcExpr {
    return this.deeper(this.peek(), () => this.or());
  }
  private bin(op: FpcBinaryOp, left: FpcExpr, right: FpcExpr, t: Token): FpcExpr {
    return { k: 'binary', op, left, right, pos: left.pos ?? this.pos(t) };
  }
  private or(): FpcExpr {
    let e = this.and();
    while (this.isKw('OR')) {
      const t = this.next();
      e = this.bin('OR', e, this.and(), t);
    }
    return e;
  }
  private and(): FpcExpr {
    let e = this.not();
    while (this.isKw('AND')) {
      const t = this.next();
      e = this.bin('AND', e, this.not(), t);
    }
    return e;
  }
  private not(): FpcExpr {
    if (this.isKw('NOT')) {
      const t = this.next();
      return { k: 'unary', op: 'NOT', arg: this.deeper(t, () => this.not()), pos: this.pos(t) };
    }
    return this.compare();
  }
  private compare(): FpcExpr {
    const e = this.additive();
    const t = this.peek();
    if (t.kind === 'op' && COMPARE.has(t.value)) {
      this.next();
      const r = this.additive();
      const n = this.peek();
      if (n.kind === 'op' && COMPARE.has(n.value)) throw new SyntaxErr('Comparisons can\'t be chained: use AND (a < b AND b < c)', n);
      return this.bin(t.value as '=', e, r, t);
    }
    if (this.isKw('IN')) {
      this.next();
      return this.bin('IN', e, this.additive(), t);
    }
    if (this.isKw('IS')) {
      this.next();
      const negated = this.eatKw('NOT');
      const w = this.peek();
      if (!this.isKw('EMPTY') && !this.isKw('NULL')) throw new SyntaxErr('Expected EMPTY or NULL after IS', w);
      this.next();
      return { k: 'is', arg: e, test: w.value as 'EMPTY', negated, pos: e.pos };
    }
    return e;
  }
  private additive(): FpcExpr {
    let e = this.multiplicative();
    while (this.isP('+') || this.isP('-')) {
      const t = this.next();
      e = this.bin(t.value as '+', e, this.multiplicative(), t);
    }
    return e;
  }
  private multiplicative(): FpcExpr {
    let e = this.unary();
    while (this.isP('*') || this.isP('/') || this.isP('%')) {
      const t = this.next();
      e = this.bin(t.value as '*', e, this.unary(), t);
    }
    return e;
  }
  private unary(): FpcExpr {
    if (this.isP('-')) {
      const t = this.next();
      const arg = this.deeper(t, () => this.unary());
      if (arg.k === 'lit' && typeof arg.value === 'number') return { k: 'lit', value: -arg.value, pos: this.pos(t) };
      return { k: 'unary', op: '-', arg, pos: this.pos(t) };
    }
    return this.postfix(this.primary());
  }
  private postfix(e: FpcExpr): FpcExpr {
    while (true) {
      const t = this.peek();
      if (this.isP('.') && !t.spaced) {
        this.next();
        const n = this.peek();
        if (n.kind !== 'ident' && n.kind !== 'kw') throw new SyntaxErr(`Expected a field name after ".", found ${this.describe(n)}`, n);
        this.next();
        e = { k: 'member', object: e, name: n.value, pos: e.pos };
      } else if (this.isP('[') && !t.spaced) {
        this.next();
        this.nest++;
        const index = this.expr();
        this.nest--;
        this.expectP(']', 'Expected "]"');
        e = index.k === 'lit' && typeof index.value === 'string' ? { k: 'member', object: e, name: index.value, pos: e.pos } : { k: 'index', object: e, index, pos: e.pos };
      } else return e;
    }
  }
  private primary(): FpcExpr {
    const t = this.peek();
    const pos = this.pos(t);
    switch (t.kind) {
      case 'num':
        this.next();
        return { k: 'lit', value: Number(t.value), pos };
      case 'str':
        this.next();
        return { k: 'lit', value: t.value, pos };
      case 'kw':
        if (t.value === 'TRUE' || t.value === 'FALSE') {
          this.next();
          return { k: 'lit', value: t.value === 'TRUE', pos };
        }
        if (t.value === 'NULL') {
          this.next();
          return { k: 'lit', value: null, pos };
        }
        if (t.value === 'CALL') return this.callExpr();
        throw new SyntaxErr(`Expected a value, found ${t.value}`, t);
      case 'ident': {
        this.next();
        if (t.value === 'true' || t.value === 'false') return { k: 'lit', value: t.value === 'true', pos };
        if (t.value === 'null') return { k: 'lit', value: null, pos };
        if (this.isP('(') && !this.peek().spaced) {
          this.next();
          this.nest++;
          const args: FpcExpr[] = [];
          while (!this.isP(')')) {
            args.push(this.expr());
            if (!this.eatP(',')) break;
          }
          this.nest--;
          this.expectP(')', `Expected ")" to close ${t.value}(`);
          return { k: 'call', fn: t.value, args, pos };
        }
        return { k: 'name', name: t.value, pos };
      }
      case 'punct':
        if (t.value === '(') {
          this.next();
          this.nest++;
          let e: FpcExpr;
          if (this.eatKw('IF')) {
            const test = this.expr();
            this.expectKw('THEN', 'Expected THEN in (IF … THEN … ELSE …)');
            const a = this.expr();
            this.expectKw('ELSE', 'A conditional value needs ELSE: (IF c THEN a ELSE b)');
            const b = this.expr();
            e = { k: 'cond', test, then: a, else: b, pos };
          } else e = this.expr();
          this.nest--;
          this.expectP(')', 'Expected ")"');
          return e;
        }
        if (t.value === '{') {
          this.next();
          this.nest++;
          const fields: { name: string; value: FpcExpr }[] = [];
          while (!this.isP('}')) {
            const n = this.peek();
            if (n.kind !== 'ident' && n.kind !== 'str' && n.kind !== 'kw' && n.kind !== 'num') throw new SyntaxErr(`Expected a field name, found ${this.describe(n)}`, n);
            this.next();
            if (this.eatP(':')) fields.push({ name: n.value, value: this.expr() });
            else if (n.kind === 'ident') fields.push({ name: n.value, value: { k: 'name', name: n.value, pos: this.pos(n) } });
            else throw new SyntaxErr(`Expected ":" after the field name ${n.value}`, this.peek());
            if (!this.eatP(',')) break;
          }
          this.nest--;
          this.expectP('}', 'This object is not closed: add "}" (or a "," between fields)');
          return { k: 'object', fields, pos };
        }
        if (t.value === '[') {
          this.next();
          this.nest++;
          const items: FpcExpr[] = [];
          while (!this.isP(']')) {
            items.push(this.expr());
            if (!this.eatP(',')) break;
          }
          this.nest--;
          this.expectP(']', 'This list is not closed: add "]" (or a "," between items)');
          return { k: 'list', items, pos };
        }
        break;
      case 'op':
        if (t.value === '←') throw new SyntaxErr('Unexpected ←: a value is missing before it', t);
        break;
    }
    throw new SyntaxErr(`Expected a value, found ${this.describe(t)}`, t);
  }

  /** CALL LOGIC key | CALL System METHOD /path | CALL System operation, then [WITH expr] */
  private callExpr(): FpcExpr {
    const t = this.expectKw('CALL');
    const pos = this.pos(t);
    let e: FpcExpr;
    if (this.eatKw('LOGIC')) {
      e = { k: 'logic', key: this.word('a logic key').text, pos };
    } else {
      const system = this.name('a system name after CALL (or LOGIC)');
      const m = this.peek();
      if (m.kind === 'ident' && METHODS.has(m.value) && this.isP('/', 1)) {
        this.next();
        e = { k: 'api', system, method: m.value, path: this.word('a path').text, pos };
      } else {
        if (this.isP('/')) throw new SyntaxErr('Expected an HTTP method before the path, for example CALL AuthService POST /login', m);
        const op = this.peek();
        if (op.kind !== 'ident' && op.kind !== 'str') throw new SyntaxErr(`Expected an HTTP method and path, or an operation name, after CALL ${system}`, op);
        e = { k: 'op', system, operation: op.kind === 'str' ? this.next().value : this.word('an operation name').text, pos };
      }
    }
    if (this.eatKw('WITH')) (e as { with?: FpcExpr }).with = this.expr();
    return e;
  }
}

const lit = (value: string | number | boolean | null): FpcExpr => ({ k: 'lit', value });
