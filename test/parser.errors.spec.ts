// What the FPC parser says when a document is written wrong: the message a person (or an AI) reads, on the line where
// the mistake is, and that the rest of the document is still read after it.
import { describe, expect, it } from 'vitest';
import { parse, parseExpression } from '../src/parser';

const HEAD = 'FPC 1.0\nLOGIC "t"\nON CALL\n';
const messages = (src: string) => parse(src).diagnostics.map((d) => d.message);
const body = (text: string) => messages(`${HEAD}${text}\n`);

describe('the header of a document', () => {
  const cases: [string, string, string][] = [
    ['no FPC line', 'LOGIC "t"\n', 'A document starts with the line "FPC 1.0"'],
    ['no version', 'FPC\nLOGIC "t"\n', 'Expected the FPC version after FPC, for example "FPC 1.0"'],
    ['not logic or flow', 'FPC 1.0\nDOCUMENT "t"\n', 'The second line says what the document describes: FLOW "name" or LOGIC "name"'],
    ['no name in quotes', 'FPC 1.0\nLOGIC t\n', 'Expected the logic name in quotes, for example LOGIC "User login"'],
    ['a flow with no name', 'FPC 1.0\nFLOW\n', 'Expected the flow name in quotes, for example FLOW "User login"'],
    ['a revision that is not a whole number', 'FPC 1.0\nLOGIC "t" REVISION x\n', 'REVISION needs a whole number'],
    ['a revision with decimals', 'FPC 1.0\nLOGIC "t" REVISION 1.5\n', 'REVISION needs a whole number'],
    ['something after the name', 'FPC 1.0\nLOGIC "t" COLOUR red\n', 'in the header (expected KEY, VERSION or REVISION)'],
    ['a method that does not exist', `${HEAD.replace('ON CALL', 'ON REQUEST FETCH /x')}`, 'Expected an HTTP method'],
    ['a path with no slash', `${HEAD.replace('ON CALL', 'ON REQUEST GET x')}`, 'Expected a path starting with "/"'],
    ['an unknown trigger', `${HEAD.replace('ON CALL', 'ON NOTHING')}`, 'Expected REQUEST, EVENT, SCHEDULE or CALL after ON'],
    ['a parameter with no name', `${HEAD}INPUT : string\n`, 'Expected a name, found'],
    ['a parameter with no type', `${HEAD}INPUT a\n`, 'Expected ":" and a type after a'],
    ['an object type with a bad field', `${HEAD}INPUT a: { ( }\n`, 'Expected a field name'],
    ['an object field with no type', `${HEAD}INPUT a: { b }\n`, 'Expected ":" and a type after b'],
    ['an object type not closed', `${HEAD}INPUT a: { b: string`, 'This type is not closed: add "}"'],
    ['an array type not closed', `${HEAD}INPUT a: [string\n`, 'Expected "]"'],
    ['an enum with no parenthesis', `${HEAD}INPUT a: enum\n`, 'Expected "(" after enum'],
    ['an enum with a bad value', `${HEAD}INPUT a: enum(a, +)\n`, 'Expected an enum value'],
    ['an enum not closed', `${HEAD}INPUT a: enum(a, b\n`, 'Expected ")" after the enum values'],
    ['a format not closed', `${HEAD}INPUT a: string(email\n`, 'Expected ")" after the format'],
    ['a type that does not exist', `${HEAD}INPUT a: strng\n`, 'Unknown type'],
  ];
  for (const [what, src, message] of cases) {
    it(`says so for ${what}`, () => {
      expect(messages(src).join('\n'), src).toContain(message);
    });
  }

  it('reads negative numbers and words in an enum, a format on a type, and a null type', () => {
    const r = parse(`${HEAD}INPUT a: enum(-1, 2, "x", y), b: string(email), c: null, d: { e?: integer, f: string[] }[] | null\n`);
    expect(r.diagnostics).toEqual([]);
    expect(r.doc.inputs.map((p) => p.name)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.doc.inputs[0].type).toEqual({ t: 'enum', values: [-1, 2, 'x', 'y'] });
  });

  it('keeps reading after a bad header line', () => {
    const r = parse('FPC 1.0\nLOGIC "t"\nINPUT a\nOUTPUT b: string\nRETURN { b: "x" }\n');
    expect(r.diagnostics).toHaveLength(1);
    expect(r.doc.outputs.map((p) => p.name)).toEqual(['b']);
    expect(r.doc.body.some((s) => s.k === 'return')).toBe(true);
  });

  it('a comment after the header lines belongs to the header', () => {
    const r = parse('FPC 1.0 -- version\nLOGIC "t" KEY LOGIC-T-001 -- name\nSYSTEM Shop -- where\nINPUT a: string -- input\nON CALL -- trigger\nRETURN\n');
    expect(r.diagnostics).toEqual([]);
    expect(r.doc.headerComments.length).toBeGreaterThanOrEqual(2);
  });
});

describe('statements', () => {
  const cases: [string, string, string][] = [
    ['an unit that does not exist', 'WAIT 2 weeks', 'Unknown time unit "weeks": use ms, s, m or h'],
    ['RETURN WITH a body that is not a status', 'RETURN "ok" WITH 5', 'RETURN … WITH needs an HTTP status first, for example RETURN 200 WITH body'],
    ['a FAIL with nothing to fail with', 'FAIL', 'FAIL needs a status or an error code'],
    ['a FAIL with no message', 'FAIL 400', 'FAIL needs a message after the status'],
    ['a keyword where a statement belongs', 'AND', "AND can't start a statement"],
    ['a function call that is thrown away', 'lower(x)', 'A function call on its own does nothing'],
    ['a value on its own', '"hello"', 'Expected a statement, found'],
    ['= for a set', 'SET x = 1', 'Use ← (or <-) to set a value; = compares'],
    ['nothing to set with', 'SET x 1', 'Expected ← (or <-), found'],
    ['a keyword as a variable', 'SET END ← 1', "END is a keyword and can't be used as a variable name"],
    ['a number as a variable', 'SET 5 ← 1', 'Expected a variable name'],
    ['something that can not be set', 'SET f(x) ← 1', 'Only a variable, a field or an item can be set'],
    ['an ELSE IF after the ELSE', 'IF a THEN\n  LOG 1\nELSE\n  LOG 2\nELSE IF b THEN\n  LOG 3\nEND IF', 'ELSE IF after ELSE: move it before ELSE'],
    ['a second ELSE', 'IF a THEN\n  LOG 1\nELSE\n  LOG 2\nELSE\n  LOG 3\nEND IF', 'An IF can have only one ELSE'],
    ['a statement in a MATCH outside a CASE', 'MATCH x\n  LOG 1\n  CASE 1\n    LOG 2\nEND MATCH', 'Statements in a MATCH must be inside a CASE'],
    ['a CASE after the ELSE', 'MATCH x\n  ELSE\n    LOG 1\n  CASE 1\n    LOG 2\nEND MATCH', 'CASE after ELSE: ELSE must be the last part of a MATCH'],
    ['a TRY with nothing to handle', 'TRY\n  LOG 1\nEND TRY', 'TRY needs a CATCH or a FINALLY'],
    ['two ON SUCCESS', 'RETRY 3 TIMES\n  LOG 1\nON SUCCESS\n  LOG 2\nON SUCCESS\n  LOG 3\nEND RETRY', 'RETRY has only one ON SUCCESS'],
    ['a statement in a PARALLEL outside a BRANCH', 'PARALLEL\n  LOG 1\n  BRANCH\n    LOG 2\nEND PARALLEL', 'Statements in PARALLEL must be inside a BRANCH'],
    ['comparisons in a row', 'IF a < b < c THEN\n  LOG 1\nEND IF', "Comparisons can't be chained"],
    ['IS followed by something else', 'IF a IS 5 THEN\n  LOG 1\nEND IF', 'Expected EMPTY or NULL after IS'],
    ['a dot with nothing after it', 'SET x ← a.5', 'Expected a field name after "."'],
    ['an object with a field that is a symbol', 'SET x ← { ( }', 'Expected a field name'],
    ['an object field written wrong', 'SET x ← { "a" }', 'Expected ":" after the field name a'],
    ['a value that is missing before the arrow', 'SET x ← ← 1', 'Unexpected ←: a value is missing before it'],
    ['CALL with nothing to call', 'CALL Shop 5', 'Expected an HTTP method and path, or an operation name, after CALL Shop'],
    ['text after a statement', 'LOG 1 2', 'at the end of the statement'],
  ];
  for (const [what, src, message] of cases) {
    it(`says so for ${what}`, () => {
      expect(body(src).join('\n'), src).toContain(message);
    });
  }

  it('NULL is a value, and the unit of a wait and a backoff in ms are read', () => {
    const r = parse(`${HEAD}SET x ← NULL\nWAIT 2 s\nRETRY 3 TIMES BACKOFF 100 ms AS attempt\n  LOG attempt\nEND RETRY\n`);
    expect(r.diagnostics).toEqual([]);
  });

  it('a mistake on one line does not hide the next one', () => {
    const r = parse(`${HEAD}SET x = 1\nSET y ← 2\nFAIL\nLOG y\n`);
    expect(r.diagnostics).toHaveLength(2);
    expect(r.doc.body.filter((s) => s.k === 'set' || s.k === 'log')).toHaveLength(2);
  });
});

describe('an expression on its own', () => {
  it('is read, or explained when it is not all an expression', () => {
    expect(parseExpression('a + 1').expr).toMatchObject({ k: 'binary' });
    const trailing = parseExpression('a + 1 )');
    expect(trailing.expr).toBeUndefined();
    expect(trailing.diagnostics[0].message).toContain('after the expression');
    const unclosed = parseExpression('(a +');
    expect(unclosed.expr).toBeUndefined();
    expect(unclosed.diagnostics).toHaveLength(1);
  });
});
