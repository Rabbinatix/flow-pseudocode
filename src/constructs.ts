// FPC 1.0 — the one table of keywords, constructs and functions. The lexer reserves exactly FPC_KEYWORDS, the
// validator checks calls against FPC_FUNCTIONS, and the cheat sheet (grammar.ts) and documentation pages are generated
// from FPC_CONSTRUCTS, so the documentation can't drift from the parser. Spec: spec/fpc-1.0.md
// The tests check that every keyword is used in a construct's syntax and every construct's example parses.
// `nodes` names the Rabbinatix logic node types a construct stands for; other tools can ignore it.

export const FPC_VERSION = '1.0';
export const FPC_MEDIA_TYPE = 'text/x-fpc';
export const FPC_EXTENSION = '.fpc';

/** Reserved words. Keywords are reserved only in UPPER CASE; `set`, `match` or `result` are ordinary names. */
export const FPC_KEYWORDS = [
  'FPC', 'FLOW', 'LOGIC', 'KEY', 'VERSION', 'REVISION', 'SYSTEM', 'ON', 'REQUEST', 'EVENT', 'SCHEDULE', 'INPUT', 'OUTPUT', 'STEP',
  'SET', 'IF', 'THEN', 'ELSE', 'END', 'MATCH', 'CASE', 'FOR', 'EACH', 'IN', 'FROM', 'TO', 'REPEAT', 'TIMES', 'WHILE', 'DO',
  'CALL', 'WITH', 'EMIT', 'TRY', 'CATCH', 'FINALLY', 'RETRY', 'BACKOFF', 'AS', 'SUCCESS', 'FAILURE', 'PARALLEL', 'BRANCH', 'WAIT',
  'RETURN', 'HEADERS', 'FAIL', 'LOG', 'BREAK', 'CONTINUE', 'AND', 'OR', 'NOT', 'IS', 'EMPTY', 'NULL', 'TRUE', 'FALSE',
] as const;
export type FpcKeyword = (typeof FPC_KEYWORDS)[number];

/** HTTP methods after `CALL <System>` and `ON REQUEST` (contextual, not reserved). */
export const FPC_HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
/** Units after `WAIT n` (contextual, lower case). */
export const FPC_WAIT_UNITS = ['ms', 's', 'm', 'h'] as const;

/** Operators: canonical (Unicode) form first, then the ASCII alternatives the lexer accepts. */
export const FPC_OPERATORS: { op: string; ascii?: string; meaning: string; precedence: number }[] = [
  { op: '←', ascii: '<-', meaning: 'assignment (in SET)', precedence: 0 },
  { op: 'OR', meaning: 'logical or', precedence: 1 },
  { op: 'AND', meaning: 'logical and', precedence: 2 },
  { op: 'NOT', meaning: 'logical not (prefix)', precedence: 3 },
  { op: '=', ascii: '==', meaning: 'equal (deep for lists and objects)', precedence: 4 },
  { op: '≠', ascii: '!=', meaning: 'not equal', precedence: 4 },
  { op: '<', meaning: 'less than', precedence: 4 },
  { op: '≤', ascii: '<=', meaning: 'less or equal', precedence: 4 },
  { op: '>', meaning: 'greater than', precedence: 4 },
  { op: '≥', ascii: '>=', meaning: 'greater or equal', precedence: 4 },
  { op: 'IN', meaning: 'membership in a list', precedence: 4 },
  { op: 'IS [NOT] EMPTY', meaning: 'null, "", [] or {} (postfix)', precedence: 4 },
  { op: 'IS [NOT] NULL', meaning: 'null or missing (postfix)', precedence: 4 },
  { op: '+', meaning: 'add, or join two strings', precedence: 5 },
  { op: '-', meaning: 'subtract (and prefix minus)', precedence: 5 },
  { op: '*', meaning: 'multiply', precedence: 6 },
  { op: '/', meaning: 'divide (fails on zero)', precedence: 6 },
  { op: '%', meaning: 'remainder', precedence: 6 },
];

export interface FpcFunction {
  name: string;
  params: string;
  returns: string;
  summary: string;
  group: 'Values' | 'Objects' | 'Strings' | 'Lists' | 'Math' | 'Dates' | 'Validation' | 'Conversion' | 'Runtime';
  /** min / max argument count */
  arity: [number, number];
  /** logic node types it stands for */
  nodes: string[];
}

export const FPC_FUNCTIONS: FpcFunction[] = [
  { group: 'Values', name: 'default', params: 'value, fallback', returns: 'any', summary: 'value, or fallback when value is null', arity: [2, 2], nodes: ['data.default'] },
  { group: 'Values', name: 'exists', params: 'value', returns: 'boolean', summary: 'the path exists (the value may be null)', arity: [1, 1], nodes: ['obj.get'] },
  { group: 'Values', name: 'found', params: 'value', returns: 'boolean', summary: 'a query found something (not null, not an empty list)', arity: [1, 1], nodes: ['boundary.queryDatabase'] },
  { group: 'Values', name: 'compare', params: 'a, b', returns: 'integer', summary: '-1, 0 or 1', arity: [2, 2], nodes: ['op.compare'] },
  { group: 'Objects', name: 'get', params: 'object, "path"', returns: 'any', summary: 'a nested value by path (`a.b[0].c`); null when missing', arity: [2, 2], nodes: ['obj.get'] },
  { group: 'Objects', name: 'set', params: 'object, "path", value', returns: 'object', summary: 'a copy with a nested value set', arity: [3, 3], nodes: ['obj.set'] },
  { group: 'Objects', name: 'remove', params: 'object, "path"', returns: 'object', summary: 'a copy without a nested value', arity: [2, 2], nodes: ['obj.remove'] },
  { group: 'Objects', name: 'merge', params: 'a, b', returns: 'object', summary: 'shallow merge, b over a', arity: [2, 2], nodes: ['obj.merge'] },
  { group: 'Objects', name: 'transform', params: 'source, [[target, source], …]', returns: 'object', summary: 'a new object: each target path ← source path', arity: [2, 2], nodes: ['obj.transform'] },
  { group: 'Objects', name: 'template', params: 'template, data', returns: 'any', summary: 'fills {{path}} placeholders from data', arity: [2, 2], nodes: ['util.template'] },
  { group: 'Strings', name: 'format', params: '"text {name}", { name }', returns: 'string', summary: 'fills {name} placeholders', arity: [2, 2], nodes: ['str.format'] },
  { group: 'Strings', name: 'concat', params: 'a, b', returns: 'string', summary: 'joins two strings (null counts as "")', arity: [2, 2], nodes: ['str.concat'] },
  { group: 'Strings', name: 'contains', params: 'text, search', returns: 'boolean', summary: 'text contains search', arity: [2, 2], nodes: ['str.contains'] },
  { group: 'Strings', name: 'startsWith', params: 'text, prefix', returns: 'boolean', summary: '', arity: [2, 2], nodes: ['str.startsWith'] },
  { group: 'Strings', name: 'endsWith', params: 'text, suffix', returns: 'boolean', summary: '', arity: [2, 2], nodes: ['str.endsWith'] },
  { group: 'Strings', name: 'trim', params: 'text', returns: 'string', summary: 'without surrounding spaces', arity: [1, 1], nodes: ['str.trim'] },
  { group: 'Strings', name: 'lower', params: 'text', returns: 'string', summary: '', arity: [1, 1], nodes: ['str.lower'] },
  { group: 'Strings', name: 'upper', params: 'text', returns: 'string', summary: '', arity: [1, 1], nodes: ['str.upper'] },
  { group: 'Strings', name: 'length', params: 'text', returns: 'integer', summary: 'number of characters', arity: [1, 1], nodes: ['str.length'] },
  { group: 'Strings', name: 'replace', params: 'text, search, replacement', returns: 'string', summary: 'replaces every occurrence', arity: [3, 3], nodes: ['str.replace'] },
  { group: 'Strings', name: 'split', params: 'text, separator', returns: 'string[]', summary: '', arity: [2, 2], nodes: ['str.split'] },
  { group: 'Strings', name: 'join', params: 'list, separator', returns: 'string', summary: '', arity: [2, 2], nodes: ['str.join'] },
  { group: 'Strings', name: 'regexMatch', params: 'text, "pattern", "flags"?', returns: '{ matches: boolean, groups: string[] }', summary: 'regular expression match', arity: [2, 3], nodes: ['str.regexMatch'] },
  { group: 'Strings', name: 'substring', params: 'text, start, end?', returns: 'string', summary: 'part of the text (negative positions count from the end)', arity: [2, 3], nodes: ['str.substring'] },
  { group: 'Strings', name: 'indexOf', params: 'text, search', returns: 'integer', summary: 'position of search, or -1', arity: [2, 2], nodes: ['str.indexOf'] },
  { group: 'Strings', name: 'padStart', params: 'text, length, fill', returns: 'string', summary: 'fill added at the start up to length', arity: [3, 3], nodes: ['str.padStart'] },
  { group: 'Strings', name: 'padEnd', params: 'text, length, fill', returns: 'string', summary: 'fill added at the end up to length', arity: [3, 3], nodes: ['str.padEnd'] },
  { group: 'Strings', name: 'base64Encode', params: 'text', returns: 'string', summary: 'UTF-8 text as Base64', arity: [1, 1], nodes: ['str.base64Encode'] },
  { group: 'Strings', name: 'base64Decode', params: 'text', returns: 'string', summary: 'Base64 to text; fails with INVALID_BASE64', arity: [1, 1], nodes: ['str.base64Decode'] },
  { group: 'Strings', name: 'urlEncode', params: 'text', returns: 'string', summary: 'escaped for a web address', arity: [1, 1], nodes: ['str.urlEncode'] },
  { group: 'Strings', name: 'urlDecode', params: 'text', returns: 'string', summary: 'reverses urlEncode; fails with INVALID_URL_ENCODING', arity: [1, 1], nodes: ['str.urlDecode'] },
  { group: 'Strings', name: 'formatNumber', params: 'value, decimals, thousands, point', returns: 'string', summary: 'a number with fixed decimals and a thousands separator ("1,234.50"); fails with INVALID_NUMBER', arity: [4, 4], nodes: ['str.formatNumber'] },
  { group: 'Strings', name: 'hash', params: 'text, "algorithm", "encoding"', returns: 'string', summary: 'SHA-256, SHA-1 or MD5 of the text, as hex or base64', arity: [3, 3], nodes: ['str.hash'] },
  { group: 'Strings', name: 'hmac', params: 'text, key, "algorithm", "encoding"', returns: 'string', summary: 'an HMAC signature of the text with a secret key, as hex or base64', arity: [4, 4], nodes: ['str.hmac'] },
  { group: 'Lists', name: 'len', params: 'list', returns: 'integer', summary: 'number of items', arity: [1, 1], nodes: ['col.length'] },
  { group: 'Lists', name: 'at', params: 'list, index', returns: 'any', summary: 'the item at index (null when out of range); same as list[index]', arity: [2, 2], nodes: ['col.get'] },
  { group: 'Lists', name: 'append', params: 'list, item', returns: 'list', summary: 'a copy with the item appended', arity: [2, 2], nodes: ['col.push'] },
  { group: 'Lists', name: 'sum', params: 'list, "path"?', returns: 'number', summary: 'sum of the items (or of a field of each item)', arity: [1, 2], nodes: ['col.sum'] },
  { group: 'Lists', name: 'sortBy', params: 'list, "path", descending', returns: 'list', summary: 'a sorted copy', arity: [2, 3], nodes: ['col.sort'] },
  { group: 'Lists', name: 'map', params: 'list, "LOGIC-KEY"', returns: 'list', summary: 'calls the logic for each item and keeps its first output', arity: [2, 2], nodes: ['col.map'] },
  { group: 'Lists', name: 'filter', params: 'list, "LOGIC-KEY"', returns: 'list', summary: 'keeps the items for which the logic returns true', arity: [2, 2], nodes: ['col.filter'] },
  { group: 'Lists', name: 'find', params: 'list, "LOGIC-KEY"', returns: 'any', summary: 'the first item for which the logic returns true, or null', arity: [2, 2], nodes: ['col.find'] },
  { group: 'Lists', name: 'some', params: 'list, "LOGIC-KEY"', returns: 'boolean', summary: 'true if the logic returns true for any item', arity: [2, 2], nodes: ['col.some'] },
  { group: 'Lists', name: 'every', params: 'list, "LOGIC-KEY"', returns: 'boolean', summary: 'true if the logic returns true for every item (also for an empty list)', arity: [2, 2], nodes: ['col.every'] },
  { group: 'Lists', name: 'first', params: 'list', returns: 'any', summary: 'the first item, or null', arity: [1, 1], nodes: ['col.first'] },
  { group: 'Lists', name: 'last', params: 'list', returns: 'any', summary: 'the last item, or null', arity: [1, 1], nodes: ['col.last'] },
  { group: 'Lists', name: 'groupBy', params: 'list, "path"?', returns: 'object', summary: 'the items grouped by the text of a field: { value: [items] }', arity: [1, 2], nodes: ['col.groupBy'] },
  { group: 'Lists', name: 'average', params: 'list, "path"?', returns: 'number', summary: 'the average of the items (or of a field of each item); 0 for none', arity: [1, 2], nodes: ['col.average'] },
  { group: 'Lists', name: 'slice', params: 'list, start, end?', returns: 'list', summary: 'items from start up to end (negative positions count from the end)', arity: [2, 3], nodes: ['col.slice'] },
  { group: 'Lists', name: 'reverse', params: 'list', returns: 'list', summary: 'a reversed copy', arity: [1, 1], nodes: ['col.reverse'] },
  { group: 'Lists', name: 'unique', params: 'list', returns: 'list', summary: 'repeated items removed', arity: [1, 1], nodes: ['col.unique'] },
  { group: 'Lists', name: 'itemIndex', params: 'list, item', returns: 'integer', summary: 'position of an equal item, or -1', arity: [2, 2], nodes: ['col.indexOf'] },
  { group: 'Lists', name: 'flatten', params: 'list', returns: 'list', summary: 'a list of lists joined into one list', arity: [1, 1], nodes: ['col.flatten'] },
  { group: 'Objects', name: 'keys', params: 'object', returns: 'string[]', summary: 'the field names', arity: [1, 1], nodes: ['obj.keys'] },
  { group: 'Objects', name: 'values', params: 'object', returns: 'list', summary: 'the field values', arity: [1, 1], nodes: ['obj.values'] },
  { group: 'Objects', name: 'entries', params: 'object', returns: '{ key, value }[]', summary: 'the fields as { key, value } items', arity: [1, 1], nodes: ['obj.entries'] },
  { group: 'Math', name: 'round', params: 'value, decimals', returns: 'number', summary: 'rounded to decimals (halves up)', arity: [2, 2], nodes: ['math.round'] },
  { group: 'Math', name: 'floor', params: 'value', returns: 'integer', summary: 'rounded down', arity: [1, 1], nodes: ['math.floor'] },
  { group: 'Math', name: 'ceil', params: 'value', returns: 'integer', summary: 'rounded up', arity: [1, 1], nodes: ['math.ceil'] },
  { group: 'Math', name: 'abs', params: 'value', returns: 'number', summary: 'without its sign', arity: [1, 1], nodes: ['math.abs'] },
  { group: 'Math', name: 'min', params: 'a, b', returns: 'number', summary: 'the smaller value', arity: [2, 2], nodes: ['math.min'] },
  { group: 'Math', name: 'max', params: 'a, b', returns: 'number', summary: 'the larger value', arity: [2, 2], nodes: ['math.max'] },
  { group: 'Math', name: 'power', params: 'base, exponent', returns: 'number', summary: 'base raised to exponent', arity: [2, 2], nodes: ['math.power'] },
  { group: 'Math', name: 'sqrt', params: 'value', returns: 'number', summary: 'square root', arity: [1, 1], nodes: ['math.sqrt'] },
  { group: 'Math', name: 'clamp', params: 'value, min, max', returns: 'number', summary: 'the value kept between min and max', arity: [3, 3], nodes: ['math.clamp'] },
  { group: 'Dates', name: 'parseDate', params: 'value', returns: '{ date, timestamp, valid }', summary: 'reads ISO text or epoch milliseconds as a UTC date-time', arity: [1, 1], nodes: ['date.parse'] },
  { group: 'Dates', name: 'formatDate', params: 'date, "pattern"', returns: 'string', summary: 'yyyy-MM-dd HH:mm style text (UTC); fails with INVALID_DATE', arity: [2, 2], nodes: ['date.format'] },
  { group: 'Dates', name: 'addTime', params: 'date, amount, "unit"', returns: 'string(date-time)', summary: 'the date moved by amount units (days, months…)', arity: [3, 3], nodes: ['date.add'] },
  { group: 'Dates', name: 'timeBetween', params: 'from, to, "unit"', returns: 'integer', summary: 'whole units from from to to', arity: [3, 3], nodes: ['date.diff'] },
  { group: 'Dates', name: 'dateParts', params: 'date', returns: '{ year, month, day, hour, minute, second, millisecond, weekday }', summary: 'the parts of a date (UTC; weekday 1 = Monday)', arity: [1, 1], nodes: ['date.parts'] },
  { group: 'Dates', name: 'makeDate', params: 'year, month, day, hour, minute, second', returns: 'string(date-time)', summary: 'a UTC date-time from its parts', arity: [6, 6], nodes: ['date.make'] },
  { group: 'Dates', name: 'startOf', params: 'date, "unit"', returns: 'string(date-time)', summary: 'the start of the hour, day, week (Monday), month or year (UTC)', arity: [2, 2], nodes: ['date.startOf'] },
  { group: 'Dates', name: 'endOf', params: 'date, "unit"', returns: 'string(date-time)', summary: 'the last moment of the hour, day, week, month or year (UTC)', arity: [2, 2], nodes: ['date.endOf'] },
  { group: 'Validation', name: 'isEmail', params: 'value', returns: 'boolean', summary: 'a valid email address', arity: [1, 1], nodes: ['val.email'] },
  { group: 'Validation', name: 'isType', params: 'value, "type"', returns: 'boolean', summary: 'the value has the type', arity: [2, 2], nodes: ['val.type'] },
  { group: 'Validation', name: 'matchesShape', params: 'value, "shape"', returns: 'boolean', summary: 'the value matches a shape (compact syntax)', arity: [2, 2], nodes: ['val.schema'] },
  { group: 'Validation', name: 'inRange', params: 'value, min, max', returns: 'boolean', summary: 'min ≤ value ≤ max', arity: [3, 3], nodes: ['val.range'] },
  { group: 'Validation', name: 'matches', params: 'value, "pattern"', returns: 'boolean', summary: 'the value matches a regular expression', arity: [2, 2], nodes: ['val.regex'] },
  { group: 'Validation', name: 'passwordOk', params: 'value, { minLength, requireDigit, requireUpper }', returns: 'boolean', summary: 'the password meets the policy', arity: [2, 2], nodes: ['val.password'] },
  { group: 'Validation', name: 'checkRequired', params: 'value, "field"', returns: '{ valid, message }', summary: 'check with a message: "<field> is required"', arity: [2, 2], nodes: ['val.isRequired'] },
  { group: 'Validation', name: 'checkEmail', params: 'value, "field"', returns: '{ valid, message }', summary: 'check with a message', arity: [2, 2], nodes: ['val.email'] },
  { group: 'Validation', name: 'checkType', params: 'value, "type", "field"', returns: '{ valid, message }', summary: 'check with a message', arity: [3, 3], nodes: ['val.type'] },
  { group: 'Validation', name: 'checkShape', params: 'value, shape, "field"', returns: '{ valid, message }', summary: 'check with a message (first failing path)', arity: [3, 3], nodes: ['val.schema'] },
  { group: 'Validation', name: 'checkRange', params: 'value, min, max, "field"', returns: '{ valid, message }', summary: 'check with a message', arity: [4, 4], nodes: ['val.range'] },
  { group: 'Validation', name: 'checkRegex', params: 'value, "pattern", "field"', returns: '{ valid, message }', summary: 'check with a message', arity: [3, 3], nodes: ['val.regex'] },
  { group: 'Validation', name: 'checkPassword', params: 'value, policy, "field"', returns: '{ valid, message }', summary: 'check with a message (first failing rule)', arity: [3, 3], nodes: ['val.password'] },
  { group: 'Values', name: 'typeOf', params: 'value', returns: 'string', summary: 'string, integer, number, boolean, object, array or null', arity: [1, 1], nodes: ['val.typeOf'] },
  { group: 'Conversion', name: 'toString', params: 'value', returns: 'string', summary: 'objects become JSON', arity: [1, 1], nodes: ['conv.toString'] },
  { group: 'Conversion', name: 'toNumber', params: 'value', returns: 'number', summary: 'not a number → 0', arity: [1, 1], nodes: ['conv.toNumber'] },
  { group: 'Conversion', name: 'isNumeric', params: 'value', returns: 'boolean', summary: 'the value converts to a number', arity: [1, 1], nodes: ['conv.toNumber'] },
  { group: 'Conversion', name: 'toBoolean', params: 'value', returns: 'boolean', summary: '', arity: [1, 1], nodes: ['conv.toBoolean'] },
  { group: 'Conversion', name: 'parseJson', params: 'text', returns: 'any', summary: 'parses JSON; fails with INVALID_JSON', arity: [1, 1], nodes: ['data.parseJson'] },
  { group: 'Runtime', name: 'customCode', params: '"name", { inputs }', returns: 'any', summary: 'calls a Custom Code function; its JavaScript stays in the logic (deps.code.<name> in exported code)', arity: [2, 2], nodes: ['code.custom'] },
  { group: 'Runtime', name: 'now', params: '', returns: 'string(date-time)', summary: 'current date-time; a new value each time', arity: [0, 0], nodes: ['data.now'] },
  { group: 'Runtime', name: 'uuid', params: '', returns: 'string(uuid)', summary: 'a new id each time', arity: [0, 0], nodes: ['data.uuid'] },
  { group: 'Runtime', name: 'random', params: 'min, max', returns: 'integer', summary: 'integer between min and max', arity: [2, 2], nodes: ['data.random'] },
];
export const FPC_FUNCTION_NAMES = new Set(FPC_FUNCTIONS.map((f) => f.name));

export interface FpcConstruct {
  id: string;
  group: 'Document' | 'Data' | 'Control flow' | 'Calls' | 'Errors and timing' | 'Expressions';
  title: string;
  /** syntax line(s); UPPER-CASE words are keywords (checked against FPC_KEYWORDS by the tests) */
  syntax: string;
  example: string;
  summary: string;
  /** logic node types written with this construct */
  nodes: string[];
}

export const FPC_CONSTRUCTS: FpcConstruct[] = [
  // ---------------------------------------------------------------- document
  { id: 'header', group: 'Document', title: 'Header', syntax: 'FPC 1.0\nFLOW|LOGIC "name" [KEY key] [VERSION x.y.z | REVISION n]', example: 'FPC 1.0\nLOGIC "Sign in" KEY LOGIC-AUTH-LOGIN-001 VERSION 1.3.0', summary: 'Every document starts with the FPC version, then what it describes: a FLOW (several systems) or one LOGIC. KEY is the app\'s key; VERSION or REVISION says which version it came from.', nodes: [] },
  { id: 'system', group: 'Document', title: 'System', syntax: 'SYSTEM name', example: 'SYSTEM AuthService', summary: 'The system a LOGIC document runs in.', nodes: [] },
  { id: 'trigger', group: 'Document', title: 'Trigger', syntax: 'ON REQUEST METHOD /path\nON EVENT "name"\nON SCHEDULE "spec"\nON CALL', example: 'ON REQUEST POST /api/v2/login', summary: 'How the logic starts: an HTTP request (endpoint), a UI or app event, a schedule or queue, or a call from other logic (a reusable function).', nodes: ['io.onRequest', 'io.onEvent', 'io.trigger', 'io.functionEntry'] },
  { id: 'input', group: 'Document', title: 'Inputs and outputs', syntax: 'INPUT name: type, name?: type\nOUTPUT name: type', example: 'INPUT email: string(email), password: string, rememberMe?: boolean\nOUTPUT token: string, expiresIn: integer', summary: 'Typed inputs and outputs in the compact shape syntax. `?` marks an optional field, `| null` a nullable one. Endpoint logic reads its request as `request` and may name outputs by HTTP status (`OUTPUT 200: { … }, 401: { error: string }`).', nodes: [] },
  { id: 'step', group: 'Document', title: 'Step', syntax: 'STEP key ["title"] [IN system]', example: 'STEP LOGIC-AUTH-LOGIN-001 "Sign in" IN AuthService', summary: 'A section of the document carrying one of the app\'s keys, so tools can map lines back to objects. A step runs until the next STEP. In a FLOW each step is one logic; unknown or missing keys mean "new".', nodes: [] },
  { id: 'comment', group: 'Document', title: 'Comment', syntax: '-- text', example: '-- exported 2026-09-30 12:00 UTC', summary: 'From `--` to the end of the line. Comments never change meaning.', nodes: [] },
  // ---------------------------------------------------------------- data
  { id: 'set', group: 'Data', title: 'Set', syntax: 'SET target ← expression\ntarget ← expression', example: 'SET total ← total + line.price * line.quantity', summary: 'Gives a variable (or a field or item of one) a value. `SET` may be left out; `<-` is the ASCII form of `←`.', nodes: ['data.setVar', 'data.getVar', 'obj.set'] },
  { id: 'literals', group: 'Data', title: 'Values', syntax: '"text"  42  3.5  true  false  null  (or TRUE FALSE NULL)  { name: value }  [a, b]', example: 'SET body ← { email, password, tags: ["new", "web"] }', summary: 'Strings, numbers, booleans, null, objects and lists. `{ email }` is short for `{ email: email }`.', nodes: ['data.literal', 'data.makeObject', 'data.makeArray', 'data.dictionary'] },
  { id: 'access', group: 'Data', title: 'Fields and items', syntax: 'value.field  value[index]  value["odd key"]', example: 'result.body.accessToken', summary: 'A missing field reads as null (it never fails).', nodes: ['obj.get', 'obj.break', 'col.get'] },
  { id: 'log', group: 'Data', title: 'Log', syntax: 'LOG expression', example: 'LOG format("signed in {id}", { id })', summary: 'Writes a line to the run log.', nodes: ['util.log'] },
  // ---------------------------------------------------------------- control flow
  { id: 'sequence', group: 'Control flow', title: 'Sequence', syntax: 'statement\nstatement', example: 'SET a ← 1\nSET b ← a + 1', summary: 'Statements run top to bottom. Indentation is for people; blocks are closed by END.', nodes: ['flow.sequence', 'util.rerouteExec', 'util.reroute'] },
  { id: 'if', group: 'Control flow', title: 'If', syntax: 'IF condition THEN\n  …\nELSE IF condition THEN\n  …\nELSE\n  …\nEND IF', example: 'IF email IS EMPTY OR password IS EMPTY THEN\n  FAIL 400 "email is required"\nEND IF', summary: 'Conditions are true unless they are false, null, 0, "" or "false".', nodes: ['flow.branch'] },
  { id: 'match', group: 'Control flow', title: 'Match', syntax: 'MATCH value\n  CASE literal[, literal]\n    …\n  ELSE\n    …\nEND MATCH', example: 'MATCH result.status\n  CASE 200\n    RETURN result.body\n  CASE 401, 403\n    FAIL 401 "Invalid credentials"\nEND MATCH', summary: 'Runs the first CASE whose value equals the value, else the ELSE block.', nodes: ['flow.switch', 'boundary.callContract'] },
  { id: 'forEach', group: 'Control flow', title: 'For each', syntax: 'FOR EACH item[, index] IN list\n  …\nEND FOR', example: 'FOR EACH line IN order.items\n  SET total ← total + line.total\nEND FOR', summary: 'Runs the body once per item. A value that is not a list runs it zero times.', nodes: ['flow.forEach'] },
  { id: 'forRange', group: 'Control flow', title: 'For range', syntax: 'FOR index FROM first TO last\n  …\nEND FOR', example: 'FOR i FROM 1 TO 3\n  LOG i\nEND FOR', summary: 'Counts from first to last, both included. The bounds are read once.', nodes: ['flow.loop'] },
  { id: 'repeat', group: 'Control flow', title: 'Repeat', syntax: 'REPEAT n TIMES\n  …\nEND REPEAT', example: 'REPEAT 3 TIMES\n  CALL Mailer send WITH { to }\nEND REPEAT', summary: 'Runs the body n times (the same as FOR i FROM 1 TO n).', nodes: ['flow.loop'] },
  { id: 'while', group: 'Control flow', title: 'While', syntax: 'WHILE condition [DO]\n  …\nEND WHILE', example: 'WHILE page.next IS NOT NULL\n  SET page ← CALL Catalog GET /products WITH { cursor: page.next }\nEND WHILE', summary: 'Checks the condition before each round.', nodes: ['flow.while'] },
  { id: 'break', group: 'Control flow', title: 'Break and continue', syntax: 'BREAK\nCONTINUE', example: 'FOR EACH item IN items\n  IF item.id = wanted THEN\n    BREAK\n  END IF\nEND FOR', summary: 'Leave the innermost loop, or go on with its next round.', nodes: ['flow.break'] },
  { id: 'parallel', group: 'Control flow', title: 'Parallel', syntax: 'PARALLEL\n  BRANCH\n    …\n  BRANCH\n    …\nEND PARALLEL', example: 'PARALLEL\n  BRANCH\n    EMIT EventBus user.logged_in WITH { userId }\n  BRANCH\n    LOG "audit"\nEND PARALLEL', summary: 'Branches may run at the same time; the statement ends when all are done. Simulation runs them in order.', nodes: ['flow.parallel'] },
  { id: 'return', group: 'Control flow', title: 'Return', syntax: 'RETURN [expression]\nRETURN status WITH body [HEADERS headers]', example: 'RETURN 200 WITH { token, expiresIn: 3600 }', summary: 'Ends the logic with its outputs. Endpoint logic returns an HTTP status and a body. Other logic that reaches its end without RETURN returns {} (its text shows no RETURN line, as it has no Return step).', nodes: ['io.return', 'io.returnResponse'] },
  // ---------------------------------------------------------------- calls
  { id: 'callApi', group: 'Calls', title: 'Call an API', syntax: 'CALL System METHOD /path [WITH expression]', example: 'result ← CALL AuthService POST /api/v2/login WITH { body: { email, password } }', summary: 'Calls another system through its API contract. The result has `status`, `body` and `headers`; MATCH on `result.status` for each declared response.', nodes: ['boundary.callContract'] },
  { id: 'callOp', group: 'Calls', title: 'Call an operation', syntax: 'CALL System operation [WITH expression]', example: 'user ← CALL UsersDb users.findByEmail WITH { email }', summary: 'A database, queue, cache or external-service operation, by its name. A query returns the row or null (test it with `found(x)`).', nodes: ['boundary.queryDatabase', 'boundary.insert', 'boundary.update', 'boundary.delete', 'boundary.consumeEvent', 'boundary.callExternal', 'boundary.cache'] },
  { id: 'callLogic', group: 'Calls', title: 'Call logic', syntax: 'CALL LOGIC key [WITH expression]', example: 'line ← CALL LOGIC LOGIC-LIB-LINE-TOTAL-001 WITH { item }', summary: 'Runs other logic by its key: a reusable function, or in a FLOW the next system\'s logic.', nodes: ['fn.call'] },
  { id: 'emit', group: 'Calls', title: 'Emit', syntax: 'EMIT System event [WITH expression]', example: 'EMIT EventBus user.logged_in WITH { userId }', summary: 'Publishes an event to a queue or topic.', nodes: ['boundary.publishEvent'] },
  // ---------------------------------------------------------------- errors and timing
  { id: 'fail', group: 'Errors and timing', title: 'Fail', syntax: 'FAIL status|CODE message', example: 'FAIL 401 "Invalid credentials"\nFAIL UPSTREAM_ERROR "User Service failed"', summary: 'Stops with an error: an HTTP status or an UPPER_CASE code, and a message.', nodes: ['flow.throw'] },
  { id: 'try', group: 'Errors and timing', title: 'Try', syntax: 'TRY\n  …\nCATCH error\n  …\nFINALLY\n  …\nEND TRY', example: 'TRY\n  SET data ← parseJson(text)\nCATCH e\n  LOG e.message\nEND TRY', summary: 'CATCH gets `{ code, message }`. FINALLY runs after TRY or CATCH end (also when CATCH fails), not after RETURN.', nodes: ['flow.try'] },
  { id: 'retry', group: 'Errors and timing', title: 'Retry', syntax: 'RETRY n TIMES [BACKOFF ms] [AS attempt]\n  …\nON SUCCESS\n  …\nON FAILURE [AS error]\n  …\nEND RETRY', example: 'RETRY 3 TIMES BACKOFF 200\n  CALL Payments POST /charges WITH { body }\nON FAILURE AS e\n  FAIL 502 e.message\nEND RETRY', summary: 'Runs the body again when it fails, up to n times, waiting BACKOFF milliseconds between tries.', nodes: ['flow.retry'] },
  { id: 'wait', group: 'Errors and timing', title: 'Wait', syntax: 'WAIT duration [ms|s|m|h]', example: 'WAIT 500 ms', summary: 'Pauses (virtual time in simulation). Without a unit the duration is in milliseconds.', nodes: ['flow.wait', 'flow.delay'] },
  // ---------------------------------------------------------------- expressions
  { id: 'operators', group: 'Expressions', title: 'Operators', syntax: '+ - * / %  = ≠ < ≤ > ≥  AND OR NOT  IN  IS [NOT] EMPTY  IS [NOT] NULL', example: 'IF total ≥ 100 AND NOT user.blocked THEN', summary: 'ASCII alternatives: `<-` for ←, `!=` for ≠, `<=` for ≤, `>=` for ≥, `==` for =.', nodes: ['op.equals', 'op.notEquals', 'op.gt', 'op.lt', 'op.gte', 'op.lte', 'op.and', 'op.or', 'op.not', 'op.add', 'op.subtract', 'op.multiply', 'op.divide', 'op.modulo', 'col.contains', 'val.isEmpty', 'val.isNull', 'val.isRequired'] },
  { id: 'conditional', group: 'Expressions', title: 'Conditional value', syntax: '(IF condition THEN a ELSE b)', example: 'SET label ← (IF count = 1 THEN "item" ELSE "items")', summary: 'A value chosen by a condition; the parentheses are required.', nodes: ['data.select'] },
  { id: 'functions', group: 'Expressions', title: 'Functions', syntax: 'name(argument, …)', example: 'IF NOT isEmail(lower(trim(email))) THEN', summary: 'The named functions of the node catalogue (see the function list). Unknown names are errors.', nodes: [] },
];

/** Every logic node type → how FPC writes it (construct id or function name). Checked against the registry by the tests. */
export function fpcFormsByNode(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (node: string, form: string) => out.set(node, [...(out.get(node) ?? []), form]);
  for (const c of FPC_CONSTRUCTS) for (const n of c.nodes) add(n, c.title);
  for (const f of FPC_FUNCTIONS) for (const n of f.nodes) add(n, `${f.name}()`);
  return out;
}
