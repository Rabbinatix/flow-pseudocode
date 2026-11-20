// FPC 1.0 reference implementation: corpus, round trips and the shared construct table. spec/fpc-1.0.md
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import {
  check, cheatSheet, FPC_CONSTRUCTS, FPC_FUNCTIONS, FPC_GRAMMAR, FPC_HTTP_METHODS, FPC_KEYWORDS, format, lex, parse, parseExpression, print,
  printExpr, stripPositions,
} from '../src/index';

const DIR = 'examples';
const corpus = (kind: 'valid' | 'invalid') =>
  (readdirSync(`${DIR}/${kind}`) as string[]).filter((f) => f.endsWith('.fpc')).sort().map((f) => ({ file: f, src: readFileSync(`${DIR}/${kind}/${f}`, 'utf8') as string }));

describe('FPC lexer', () => {
  it('normalises ASCII operators and keeps positions', () => {
    const t = lex('x <- a != b <= c >= d == e').tokens.filter((x) => x.kind === 'op');
    expect(t.map((x) => x.value)).toEqual(['←', '≠', '≤', '≥', '=']);
    expect(t[0]).toMatchObject({ line: 1, col: 3 });
  });
  it('reserves keywords only in upper case', () => {
    const t = lex('SET set IF if').tokens;
    expect(t.slice(0, 4).map((x) => x.kind)).toEqual(['kw', 'ident', 'kw', 'ident']);
  });
  it('reads comments and escapes', () => {
    const t = lex('LOG "a\\"b\\n" -- note').tokens;
    expect(t[1]).toMatchObject({ kind: 'str', value: 'a"b\n' });
    expect(t[2]).toMatchObject({ kind: 'comment', value: 'note' });
  });
});

describe('FPC corpus: valid documents', () => {
  for (const { file, src } of corpus('valid')) {
    it(`${file} is valid and round-trips`, () => {
      const r = check(src);
      expect(r.diagnostics, file).toEqual([]);
      const canonical = print(r.doc);
      // print(parse(x)) is canonical: formatting it again changes nothing
      expect(format(canonical).text).toBe(canonical);
      // parse(print(ast)) equals ast
      const again = parse(canonical);
      expect(again.diagnostics).toEqual([]);
      expect(stripPositions(again.doc)).toEqual(stripPositions(r.doc));
    });
  }
});

describe('FPC corpus: invalid documents', () => {
  for (const { file, src } of corpus('invalid')) {
    it(`${file} reports the expected problem`, () => {
      const m = /^-- expect: (\d+):(\d+) ([\w-]+)/.exec(src);
      expect(m, `${file} needs an "-- expect: line:col code" first line`).toBeTruthy();
      const r = check(src);
      expect(r.ok).toBe(false);
      const hit = r.diagnostics.find((d) => d.code === m![3] && d.line === Number(m![1]) && d.col === Number(m![2]));
      expect(hit, `${file}: ${JSON.stringify(r.diagnostics)}`).toBeTruthy();
      expect(hit!.message.length).toBeGreaterThan(10);
    });
  }
});

describe('FPC parser', () => {
  const doc = (body: string) => `FPC 1.0\nLOGIC "t"\nINPUT a: integer, b: integer, c: integer, x: any\n\n${body}\n`;

  it('keeps precedence through a round trip', () => {
    for (const e of ['(a + b) * c', 'a - (b - c)', 'a - b - c', 'NOT (a AND b)', 'NOT a AND b', 'NOT (a > b)', 'NOT (x IS EMPTY)', '-x.y', 'a = b OR c IS NOT EMPTY', '(a < b) = (b < c)', 'x[a + 1].name', '"a" IN [1, "a"]', '-5 * a', 'a * -5', 'a - -5']) {
      const p = parseExpression(e);
      expect(p.diagnostics, e).toEqual([]);
      expect(printExpr(p.expr!), e).toBe(e);
    }
  });
  it('writes CALL lines and keys as they were', () => {
    const r = parse(doc('SET r ← CALL AuthService POST /api/v2/users/{id} WITH { pathParams: { id: a } }\nSET f ← CALL LOGIC LOGIC-LIB-LINE-TOTAL-001 WITH { item: x }\nCALL "Orders DB" orders.insert WITH x'));
    expect(r.diagnostics).toEqual([]);
    const [a, b, c] = r.doc.body;
    expect(a).toMatchObject({ k: 'set', value: { k: 'api', system: 'AuthService', method: 'POST', path: '/api/v2/users/{id}' } });
    expect(b).toMatchObject({ k: 'set', value: { k: 'logic', key: 'LOGIC-LIB-LINE-TOTAL-001' } });
    expect(c).toMatchObject({ k: 'call', call: { k: 'op', system: 'Orders DB', operation: 'orders.insert' } });
  });
  it('accepts SET-less assignment and normalises it', () => {
    expect(format(doc('y <- a + 1')).text).toContain('SET y ← a + 1');
  });
  it('reports several problems with lines and columns, and recovers', () => {
    const r = check(doc('SET y ← \nIF a THEN\n  LOG lenn(a)\nEND WHILE\nSET z ← 1'));
    const errs = r.diagnostics.filter((d) => d.severity === 'error');
    expect(errs.length).toBeGreaterThanOrEqual(3);
    expect(errs[0]).toMatchObject({ line: 5, col: 9 });
    expect(errs.some((d) => d.code === 'unknown-function' && d.message.includes('len()'))).toBe(true);
    expect(r.doc.body.some((s) => s.k === 'set' && s.target.k === 'name' && s.target.name === 'z')).toBe(true);
  });
  it('keeps comments on their statement', () => {
    const r = parse(doc('-- about the header\nLOG a\n-- first\nSET y ← 1 -- why'));
    expect(r.doc.headerComments).toEqual(['about the header']);
    expect(r.doc.body[1]).toMatchObject({ k: 'comment', text: 'first' });
    expect(r.doc.body[2]).toMatchObject({ k: 'set', comment: 'why' });
    expect(print(r.doc)).toContain('SET y ← 1 -- why');
  });
  it('warns about names that are never set', () => {
    const r = check(doc('SET y ← nope + 1'));
    expect(r.ok).toBe(true);
    expect(r.diagnostics).toEqual([expect.objectContaining({ severity: 'warning', code: 'unknown-name' })]);
  });
});

describe('FPC construct table', () => {
  it('uses only real keywords, and every keyword is documented', () => {
    const kw = new Set<string>(FPC_KEYWORDS);
    const placeholders = new Set(['METHOD', 'CODE', 'KEY', ...FPC_HTTP_METHODS]);
    const used = new Set<string>();
    for (const c of FPC_CONSTRUCTS) {
      for (const w of c.syntax.match(/\b[A-Z]{2,}\b/g) ?? []) {
        if (!kw.has(w) && !placeholders.has(w)) throw new Error(`${c.id}: ${w} is not a keyword`);
        used.add(w);
      }
    }
    expect(FPC_KEYWORDS.filter((k) => !used.has(k))).toEqual([]);
  });
  it('has examples that parse', () => {
    for (const c of FPC_CONSTRUCTS) {
      let src: string | undefined;
      if (c.id === 'header') src = `${c.example}\n`;
      else if (c.id === 'step') src = `FPC 1.0\nFLOW "x"\n${c.example}\n  LOG 1\n`;
      else if (c.group === 'Document') src = `FPC 1.0\nLOGIC "x"\n${c.example}\n`;
      else if (!['access', 'operators', 'functions'].includes(c.id)) src = `FPC 1.0\nLOGIC "x"\n${c.example}\n`;
      if (!src) continue;
      const r = check(src);
      expect(r.diagnostics.filter((d) => d.severity === 'error'), c.id).toEqual([]);
    }
  });
  it('keeps the examples in the normative spec valid', () => {
    const spec = readFileSync('spec/fpc-1.0.md', 'utf8') as string;
    const blocks = [...spec.matchAll(/```fpc\n([\s\S]*?)```/g)].map((m) => m[1]);
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const b of blocks) expect(check(b).diagnostics.filter((d) => d.severity === 'error'), b).toEqual([]);
    // the grammar in the spec is the one shipped in grammar/fpc-1.0.ebnf
    expect(spec).toContain(FPC_GRAMMAR.trim().split('\n').slice(0, 5).join('\n'));
  });
  it('keeps the README example valid', () => {
    const readme = readFileSync('README.md', 'utf8') as string;
    const ex = /```\nFPC 1\.0([\s\S]*?)```/.exec(readme);
    expect(ex).not.toBeNull();
    expect(check(`FPC 1.0${ex![1]}`).diagnostics).toEqual([]);
  });
  it('ships the generated grammar and cheat sheet files, in step with the code (run `npm run generate` when this fails)', () => {
    expect(readFileSync('grammar/fpc-1.0.ebnf', 'utf8') as string).toBe(FPC_GRAMMAR);
    expect(readFileSync('grammar/cheat-sheet.md', 'utf8') as string).toBe(cheatSheet());
  });
  it('publishes a grammar and a cheat sheet that mention every construct', () => {
    expect(FPC_GRAMMAR).toContain('document');
    const sheet = cheatSheet();
    for (const c of FPC_CONSTRUCTS) expect(sheet).toContain(c.title);
    // the cheat sheet's own example is valid FPC
    const ex = /```fpc\n([\s\S]*?)```/.exec(sheet)![1];
    expect(check(ex).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
