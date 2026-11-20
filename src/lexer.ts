// FPC 1.0 lexer: text → tokens with line, column and offsets. Line-oriented: NEWLINE is a token, indentation is not
// significant. It also normalises: ASCII operators become their canonical form (`<-` → `←`, `!=` → `≠`, `==` → `=`) and
// curly quotes work as quotes. It never throws: bad characters become `LexError`s and the parser reports them.
import { FPC_KEYWORDS } from './constructs';

export type TokKind = 'kw' | 'ident' | 'num' | 'str' | 'op' | 'punct' | 'nl' | 'comment' | 'other' | 'eof';

export interface Token {
  kind: TokKind;
  /** normalised text: operators in canonical form (`<-` → `←`), strings unescaped */
  value: string;
  line: number;
  col: number;
  /** offsets in the source */
  start: number;
  end: number;
  /** whitespace (or a line start) before the token */
  spaced: boolean;
}

export interface LexError { message: string; line: number; col: number }

const KEYWORDS = new Set<string>(FPC_KEYWORDS);
const ASCII_OPS: Record<string, string> = { '<-': '←', '!=': '≠', '<=': '≤', '>=': '≥', '==': '=', '<>': '≠' };
const SINGLE_OPS = new Set(['←', '≠', '≤', '≥', '=', '<', '>', '+', '-', '*', '/', '%', '×', '÷']);
const PUNCT = new Set(['(', ')', '{', '}', '[', ']', ',', ':', '.', '?', '|']);

export function lex(src: string): { tokens: Token[]; errors: LexError[] } {
  const tokens: Token[] = [];
  const errors: LexError[] = [];
  let i = 0, line = 1, lineStart = 0, spaced = true;
  const push = (kind: TokKind, value: string, start: number, end: number) => {
    tokens.push({ kind, value, line, col: start - lineStart + 1, start, end, spaced });
    spaced = false;
  };
  if (src.charCodeAt(0) === 0xfeff) i = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n' || c === '\r') {
      const start = i;
      if (c === '\r' && src[i + 1] === '\n') i++;
      i++;
      push('nl', '\n', start, i);
      line++;
      lineStart = i;
      spaced = true;
      continue;
    }
    if (c === ' ' || c === '\t' || c === ' ') {
      i++;
      spaced = true;
      continue;
    }
    // comment: `--` to the end of the line
    if (c === '-' && src[i + 1] === '-') {
      let j = i + 2;
      while (j < src.length && src[j] !== '\n' && src[j] !== '\r') j++;
      push('comment', src.slice(i + 2, j).trim(), i, j);
      i = j;
      continue;
    }
    if (c === '"' || c === '“' || c === '”') {
      const start = i;
      let j = i + 1, s = '', closed = false;
      while (j < src.length && src[j] !== '\n' && src[j] !== '\r') {
        const ch = src[j];
        if (ch === '"' || ch === '”' || ch === '“') {
          closed = true;
          j++;
          break;
        }
        if (ch === '\\' && j + 1 < src.length) {
          const e = src[j + 1];
          if (e === 'n') s += '\n';
          else if (e === 't') s += '\t';
          else if (e === 'r') s += '\r';
          else if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(src.slice(j + 2, j + 6))) {
            s += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16));
            j += 6;
            continue;
          } else s += e;
          j += 2;
          continue;
        }
        s += ch;
        j++;
      }
      if (!closed) errors.push({ message: 'This string is not closed: add " before the end of the line', line, col: start - lineStart + 1 });
      push('str', s, start, j);
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const m = /^(\d+(\.\d+)?([eE][+-]?\d+)?)/.exec(src.slice(i))!;
      push('num', m[1], i, i + m[1].length);
      i += m[1].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(c) || c.charCodeAt(0) > 0x7f && /\p{L}/u.test(c)) {
      let j = i + 1;
      while (j < src.length && (/[A-Za-z0-9_$]/.test(src[j]) || (src.charCodeAt(j) > 0x7f && /[\p{L}\p{N}]/u.test(src[j])))) j++;
      const word = src.slice(i, j);
      push(KEYWORDS.has(word) ? 'kw' : 'ident', word, i, j);
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (ASCII_OPS[two]) {
      push('op', ASCII_OPS[two], i, i + 2);
      i += 2;
      continue;
    }
    if (SINGLE_OPS.has(c)) {
      push('op', c === '×' ? '*' : c === '÷' ? '/' : c, i, i + 1);
      i++;
      continue;
    }
    if (PUNCT.has(c)) {
      push('punct', c, i, i + 1);
      i++;
      continue;
    }
    // anything else is kept (paths may hold `~`, `@`, `&`…); the parser reports it where it isn't allowed
    const cp = src.codePointAt(i)!;
    const len = cp > 0xffff ? 2 : 1;
    push('other', src.slice(i, i + len), i, i + len);
    i += len;
  }
  tokens.push({ kind: 'eof', value: '', line, col: i - lineStart + 1, start: i, end: i, spaced: true });
  return { tokens, errors };
}
