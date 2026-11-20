// FPC lexer, parser, validator and printer at the edges: unicode, whitespace, broken input, depth and size.
import { describe, expect, it } from 'vitest';
import { check, lex, parse, print, validate } from '../src/index';
import { MAX_NESTING } from '../src/parser';

const doc = (body: string) => `FPC 1.0\nLOGIC "t"\nINPUT a: integer\n\n${body}\n`;
const errors = (src: string) => check(src).diagnostics.filter((d) => d.severity === 'error');

describe('FPC lexer edges', () => {
  it('counts lines for \\n, \\r\\n and a lone \\r alike, and treats tabs as spaces', () => {
    const t = lex('LOG\t"a\tb" -- x\r\nLOG 1\rLOG 2').tokens.filter((x) => x.kind !== 'nl');
    expect(t.map((x) => [x.kind, x.value, x.line, x.col])).toEqual([
      ['kw', 'LOG', 1, 1], ['str', 'a\tb', 1, 5], ['comment', 'x', 1, 11], ['kw', 'LOG', 2, 1], ['num', '1', 2, 5], ['kw', 'LOG', 3, 1], ['num', '2', 3, 5], ['eof', '', 3, 6],
    ]);
  });
  it('reads unicode names, smart quotes and \\u escapes', () => {
    const t = lex('SET naïve ← “日本 😀” + "\\u00e9"').tokens;
    expect(t[1]).toMatchObject({ kind: 'ident', value: 'naïve' });
    expect(t[3]).toMatchObject({ kind: 'str', value: '日本 😀' });
    expect(t[5]).toMatchObject({ kind: 'str', value: 'é' });
  });
  it('reports an unterminated string at its opening quote and stops it at the line end', () => {
    const r = lex('LOG "abc\nLOG 1');
    expect(r.errors).toEqual([expect.objectContaining({ line: 1, col: 5 })]);
    expect(r.tokens[1]).toMatchObject({ kind: 'str', value: 'abc' });
    expect(r.tokens.find((x) => x.kind === 'num')).toMatchObject({ line: 2 });
  });
  it('skips a byte order mark', () => {
    expect(check('﻿FPC 1.0\nLOGIC "x"\n').diagnostics).toEqual([]);
  });
});

describe('FPC parser edges', () => {
  it('accepts CRLF and tab indentation and prints canonical LF text', () => {
    const r = check('FPC 1.0\r\nLOGIC "t"\r\nINPUT a: integer\r\n\r\nIF a > 1 THEN\r\n\tLOG a\r\nEND IF\r\n');
    expect(r.diagnostics).toEqual([]);
    const out = print(r.doc);
    expect(out).not.toContain('\r');
    expect(out).toContain('IF a > 1 THEN\n  LOG a\nEND IF');
  });
  it('round-trips unicode names and strings', () => {
    const r = check(doc('SET naïve ← "日本語 😀 \\"q\\""\nLOG naïve'));
    expect(r.diagnostics).toEqual([]);
    const again = check(print(r.doc));
    expect(again.diagnostics).toEqual([]);
    expect(again.doc.body[0]).toMatchObject({ k: 'set', value: { k: 'lit', value: '日本語 😀 "q"' } });
  });
  it('reports an unterminated string with line and column', () => {
    expect(errors(doc('LOG "abc'))).toEqual([expect.objectContaining({ code: 'syntax', line: 5, col: 5 })]);
  });
  it('reports a block without END at its opener', () => {
    expect(errors(doc('IF a > 1 THEN\n  LOG a'))).toEqual([expect.objectContaining({ code: 'unclosed-block', line: 5, col: 1 })]);
  });
  it('reports an END of the wrong kind', () => {
    const e = errors(doc('FOR EACH x IN [1]\n  LOG x\nEND IF'));
    expect(e[0]).toMatchObject({ code: 'unclosed-block', line: 7 });
    expect(e[0].message).toContain('found END IF');
  });
  it('reports empty input instead of throwing', () => {
    expect(errors('').length).toBeGreaterThan(0);
  });
  it('parses nesting just under the limit', () => {
    let ifs = '';
    for (let i = 0; i < MAX_NESTING - 1; i++) ifs += 'IF a > 1 THEN\n';
    for (let i = 0; i < MAX_NESTING - 1; i++) ifs += 'END IF\n';
    expect(check(doc(ifs)).ok).toBe(true);
  });
  it('reports very deep blocks once instead of overflowing the stack', () => {
    let ifs = '';
    for (let i = 0; i < 5000; i++) ifs += 'IF a > 1 THEN\n';
    for (let i = 0; i < 5000; i++) ifs += 'END IF\n';
    const r = check(doc(ifs));
    expect(r.ok).toBe(false);
    expect(r.diagnostics.filter((d) => d.message.startsWith('Nested more than'))).toHaveLength(1);
  });
  it('reports very deep values and keeps the next line', () => {
    for (const deep of ['('.repeat(5000) + 'a' + ')'.repeat(5000), 'NOT '.repeat(20000) + 'a', '[{x: '.repeat(3000) + 'a' + '}]'.repeat(3000)]) {
      const r = check(doc(`LOG ${deep}\nLOG a + 1`));
      expect(r.ok).toBe(false);
      expect(r.diagnostics[0]).toMatchObject({ code: 'syntax', line: 5 });
      expect(r.doc.body).toEqual([expect.objectContaining({ k: 'log', pos: expect.objectContaining({ line: 6 }) })]);
    }
  });
  it('checks and prints a huge document quickly', () => {
    let body = '';
    for (let i = 0; i < 5000; i++) body += `SET v${i} ← a + ${i} -- step ${i}\nIF v${i} > 3 THEN\n  LOG "big"\nEND IF\n`;
    const t0 = performance.now();
    const r = check(doc(body));
    const text = print(r.doc);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(r.ok).toBe(true);
    expect(r.doc.body).toHaveLength(10000);
    expect(text).toContain('SET v4999 ← a + 4999 -- step 4999');
  });
});

describe('validate() on a parsed document', () => {
  const v = (src: string) => validate(parse(src).doc);
  it('returns nothing for a clean document', () => {
    expect(v(doc('RETURN { ok: a }'))).toEqual([]);
  });
  it('checks the header: major version, key shape and semver', () => {
    expect(v('FPC 2.0\nLOGIC "x" KEY bad VERSION 1.0\n').map((d) => [d.severity, d.code])).toEqual([
      ['error', 'fpc-version'], ['warning', 'key-format'], ['error', 'version-format'],
    ]);
    expect(v('FPC 1.9\nLOGIC "x"\n')).toEqual([expect.objectContaining({ severity: 'warning', code: 'fpc-version' })]);
  });
  it('checks statuses, error codes, MATCH and nested CALLs', () => {
    expect(v(doc('RETURN 700 WITH {}')).map((d) => d.code)).toEqual(['status']);
    expect(v(doc('FAIL 99 "m"')).map((d) => d.code)).toEqual(['status']);
    expect(v(doc('FAIL "bad-code" "m"'))[0]).toMatchObject({ severity: 'warning', code: 'error-code', message: expect.stringContaining('BAD_CODE') });
    expect(v(doc('MATCH a\nEND MATCH')).map((d) => d.code)).toEqual(['empty-match']);
    expect(v(doc('LOG (CALL X POST /a)')).map((d) => d.code)).toEqual(['nested-call']);
  });
  it('checks functions, arity, duplicates and step keys', () => {
    expect(v(doc('LOG lenn(a)\nLOG len(a, a)')).map((d) => [d.code, d.message])).toEqual([
      ['unknown-function', 'Unknown function lenn(): did you mean len()?'], ['arity', 'len(list) takes 1 argument, found 2'],
    ]);
    expect(v('FPC 1.0\nLOGIC "x"\nINPUT a: integer, a: string\n').map((d) => d.code)).toEqual(['duplicate']);
    expect(v('FPC 1.0\nFLOW "f"\nSTEP LOGIC-A-001\n  LOG 1\nSTEP LOGIC-A-001\n  LOG 2\n').map((d) => d.code)).toEqual(['duplicate-step']);
  });
  it('knows names set in loops, CATCH and RETRY, and warns once per unknown name', () => {
    const src = doc('FOR EACH x, i IN [1]\n  LOG x + i\nEND FOR\nTRY\n  LOG 1\nCATCH e\n  LOG e\nEND TRY\nLOG nope\nLOG nope');
    expect(v(src)).toEqual([expect.objectContaining({ code: 'unknown-name', message: expect.stringContaining('"nope"') })]);
  });
});
