# Flow Pseudocode (FPC) 1.0 — Specification

**Status:** 1.0, normative. **Licence:** this specification is released under
[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). The reference
implementation (`src/`: lexer, parser, validator, canonical printer; npm `@rabbinatix/flow-pseudocode`) is released under the MIT licence.
**Media type:** `text/x-fpc` · **File extension:** `.fpc` · **Encoding:** UTF-8.

Guide for readers, with an in-browser validator: https://rabbinatix.com/guide/pseudocode

The key words MUST, MUST NOT, SHOULD and MAY are to be read as in RFC 2119.

## 1. Purpose

There is no single global standard for pseudocode. Textbook styles and school exam-board conventions (`IF … THEN …
ELSE … ENDIF`, `WHILE … ENDWHILE`) are made for people: they have no types, no API calls and no way to map a line back
to the object it came from. FPC keeps that familiar structured-keyword style and adds only what a round trip with tools
and AI needs:

- a typed header (`INPUT`, `OUTPUT`) in the compact shape syntax of the endpoint editor;
- `CALL` lines for APIs, operations and other logic;
- `STEP` markers that carry stable keys;
- a small, strict grammar that parses without guessing.

Goals: readable by anyone who has seen textbook pseudocode; parseable without heuristics; easy for an AI to produce from
a one-page prompt (the cheat sheet); independent of any language or vendor.

## 2. A first document

```fpc
FPC 1.0
FLOW "User login" KEY FLOW-AUTH-LOGIN-001 VERSION 1.3.0
INPUT email: string(email), password: string, rememberMe?: boolean
OUTPUT token: string, expiresIn: integer

STEP LOGIC-AUTH-LOGIN-001/CHK "Inputs valid?"
  IF email IS EMPTY OR password IS EMPTY THEN
    FAIL 400 "email is required"
  END IF

STEP LOGIC-AUTH-LOGIN-001/CALL
  result ← CALL AuthService POST /api/v2/login WITH { email, password }
  IF result.status = 401 THEN
    FAIL 401 "Invalid credentials"
  END IF
  RETURN { token: result.body.accessToken, expiresIn: result.body.expiresIn }
```

## 3. Lexical structure

- **Lines.** FPC is line oriented: a statement ends at the end of its line. Inside `( )`, `[ ]` and `{ }` line breaks
  are ignored, so a long object or list MAY span several lines. `\n`, `\r\n` and `\r` are line breaks.
- **Indentation** is not significant. Blocks are closed by `END …`. Writers SHOULD indent block bodies by two spaces
  (the canonical form, § 10).
- **Comments** start with `--` and run to the end of the line. `--` always starts a comment, so write a space between
  two minus signs (`a - -b`). A comment on a line of its own is kept as a comment statement; a comment after a statement
  belongs to that statement. Comments inside a multi-line expression are dropped.
- **Keywords** are reserved only in UPPER CASE (§ 13 lists them). `set`, `match` or `result` are ordinary names.
- **Identifiers**: a letter, `_` or `$`, then letters, digits, `_` or `$` (Unicode letters allowed).
- **Numbers**: `42`, `3.5`, `1e3`. A leading `-` is the minus operator; `-5` reads as the number −5.
- **Strings**: double quotes, with the escapes `\"`, `\\`, `\n`, `\t`, `\r` and `\uXXXX`. A string can't span lines.
  Typographic quotes (`“ ”`) are accepted as `"`.
- **Literals**: `true`, `false`, `null` (also `TRUE`, `FALSE`, `NULL`).
- **Words**: keys (`LOGIC-AUTH-LOGIN-001`, `LOGIC-AUTH-LOGIN-001/CHK`), versions (`1.3.0`), paths (`/api/v2/users/{id}`)
  and operation names (`users.findByEmail`) are read as written, up to the next space.
- **Operators** have a canonical Unicode form and ASCII alternatives that readers MUST accept:

| Canonical | ASCII | Meaning |
|---|---|---|
| `←` | `<-` | assignment |
| `≠` | `!=`, `<>` | not equal |
| `≤` | `<=` | less or equal |
| `≥` | `>=` | greater or equal |
| `=` | `==` | equal |
| `*` `/` | `×` `÷` | multiply, divide |

## 4. Document structure

```
FPC 1.0                                         ← required first line (comments and blank lines may come before)
FLOW|LOGIC "name" [KEY key] [VERSION x.y.z] [REVISION n]
[-- comments]
[SYSTEM name]                                   ← LOGIC: the system it runs in
[ON REQUEST METHOD /path | ON EVENT "name" | ON SCHEDULE "spec" | ON CALL]
[INPUT param, …]*
[OUTPUT param, …]*

statements…
[STEP key ["title"] [IN system]
  statements…]*
```

- **`FPC 1.0`** names the version of this specification the document follows (§ 12).
- **`FLOW`** describes a flow across systems; **`LOGIC`** describes one piece of logic. The name is a string.
- **`KEY`** is the app's key for the object. **`VERSION`** (semver) and/or **`REVISION`** (integer) say which version
  of the object the document was written from. Exports MUST include one of them and SHOULD add the export time as a
  header comment (`-- exported 2026-09-30 12:34 UTC from Rabbinatix`).
- **`SYSTEM`** names the system a LOGIC runs in: a word (`AuthService`) or a string (`"Auth Service"`).
- **`ON`** says how LOGIC starts: `REQUEST` with an HTTP method and path (endpoint logic), `EVENT` (a UI or app event),
  `SCHEDULE` (a schedule or queue trigger) or `CALL` (a reusable function called by other logic). A FLOW has no `ON`
  (a warning).
- **`INPUT` / `OUTPUT`** declare typed parameters, `name[?]: type`, separated by commas; the lines may repeat. Endpoint
  logic reads its request as `request` (with `pathParams`, `query`, `headers`, `body`) and MAY name outputs by HTTP
  status: `OUTPUT 200: { token: string }, 401: { error: string }`.
- **Body**: statements, then any number of **`STEP`** sections. A STEP runs until the next STEP or the end of the
  document; STEPs don't nest and appear only at the top level.

## 5. Types

The compact shape syntax of the endpoint editor (`01-domain` endpoint schema), on one line:

| Type | Meaning |
|---|---|
| `string`, `number`, `integer`, `boolean`, `null`, `any`, `object`, `array` | primitives (`object` and `array` with unknown contents) |
| `string(email)`, `string(date-time)`, `string(uuid)` … | a format in brackets |
| `enum(admin, member, "two words")`, `enum(1, 2, 3)` | one of the values |
| `{ name: string, age?: integer }` | an object; `?` marks an optional field |
| `T[]` or `[T]` | a list of T (`[A \| B]` for a list of a union) |
| `A \| B`, `T \| null` | a union; `\| null` marks a nullable value |

Unknown type names are errors (`unknown-type`).

## 6. Statements

| Statement | Form | Semantics |
|---|---|---|
| Set | `SET target ← expr` or `target ← expr` | Evaluates `expr` and stores it. The target is a name, `name.field…` or `name[index]…` (a copy is updated; objects and lists are values). |
| Comment | `-- text` | No effect. |
| If | `IF c THEN … {ELSE IF c THEN …} [ELSE …] END IF` | Runs the first branch whose condition is true (§ 7.2), else the ELSE block. |
| Match | `MATCH v {CASE lit, … …} [ELSE …] END MATCH` | Runs the first CASE with a value equal to `v` (§ 7.3); else the ELSE block. CASE values MUST be literals. At least one CASE is required. |
| For each | `FOR EACH item[, index] IN list [DO] … END FOR` | Runs the body once per item (index from 0). A value that is not a list runs it zero times. After the loop the item and index keep their last values. |
| For range | `FOR i FROM a TO b [DO] … END FOR` | `i` counts from `a` to `b`, both included, step 1. The bounds are evaluated once. |
| Repeat | `REPEAT n TIMES … END REPEAT` | Same as `FOR _ FROM 1 TO n`. |
| While | `WHILE c [DO] … END WHILE` | Checks `c` before each round. |
| Break / Continue | `BREAK`, `CONTINUE` | Leave the innermost loop / go on with its next round. Outside a loop they are errors (`break-outside-loop`). |
| Call | `CALL …` (§ 8) | Performs the call and drops its result. |
| Emit | `EMIT System event [WITH expr]` | Publishes `expr` as `event` (a word such as `user.logged_in`, or a string) on a queue or topic system. |
| Try | `TRY … [CATCH [e] …] [FINALLY …] END TRY` | Runs TRY. When it fails, CATCH runs with `e = { code, message }`. FINALLY runs after TRY completes, after CATCH completes, and after CATCH fails (then the CATCH error continues); it does **not** run after RETURN or BREAK inside TRY or CATCH. At least CATCH or FINALLY is required. |
| Retry | `RETRY n TIMES [BACKOFF ms] [AS attempt] … [ON SUCCESS …] [ON FAILURE [AS e] …] END RETRY` | Runs the body; when it fails, waits `ms` and runs it again, at most `n` times (`attempt` counts from 1). ON SUCCESS runs when an attempt succeeds, ON FAILURE (with the last error as `e`) when all fail. Execution then continues after END RETRY unless the block returned or failed. |
| Parallel | `PARALLEL {BRANCH …} END PARALLEL` | The branches may run at the same time; the statement ends when all have. Simulators MAY run them in order. |
| Wait | `WAIT d [ms\|s\|m\|h]` | Pauses for `d` (milliseconds when no unit). Simulators use virtual time. |
| Return | `RETURN [expr]` · `RETURN status WITH body [HEADERS h]` | Ends the logic with its outputs (an object of the OUTPUT names) or, for endpoint logic, an HTTP status (100–599) and body. Logic other than endpoint logic that reaches its end without RETURN returns `{}`; the export prints no `RETURN {}` for it (lowering's fallback is not a step). |
| Fail | `FAIL status\|CODE message` | Stops with an error: an HTTP status (100–599) or an UPPER_CASE code, and a message expression (required). Caught by TRY and RETRY. |
| Log | `LOG expr` | Writes to the run log. |

An expression on its own is not a statement: keep its value with `SET` (a function call alone is an error with a hint).

## 7. Expressions

### 7.1 Precedence (lowest first)

| Level | Operators | Associativity |
|---|---|---|
| 1 | `OR` | left |
| 2 | `AND` | left |
| 3 | `NOT` (prefix) | right |
| 4 | `=` `≠` `<` `≤` `>` `≥` `IN`, `IS [NOT] EMPTY`, `IS [NOT] NULL` (postfix) | none: `a < b < c` is an error |
| 5 | `+` `-` | left |
| 6 | `*` `/` `%` | left |
| 7 | `-` (prefix) | right |
| 8 | `.field`, `[index]`, calls, literals, `( … )`, `(IF c THEN a ELSE b)` | left |

`CALL` expressions (§ 8) have the lowest precedence of all: they take everything after `WITH`, and they MUST be a
statement on its own or the whole value of `SET` or `RETURN` (`nested-call`).

### 7.2 Values and truth

- A condition is **true** unless it is `false`, `null`, `0`, `""` or `"false"`.
- **Equality** (`=`, `≠`, `IN`, `MATCH`) is deep: objects and lists are equal when their contents are. `MATCH` compares
  a number with a string CASE by its text (`CASE "200"` matches `200`).
- **Missing data** reads as `null`: `a.b.c` never fails when `a` or `b` is missing.
- **Arithmetic** on `null` treats it as `0`; `+` on two strings joins them; `/` by zero fails (`DIVIDE_BY_ZERO`).
- **`IS EMPTY`**: `null`, `""`, `[]` or `{}`. **`IS NULL`**: `null` or missing. **`x IN list`**: deep membership.
- **`{ email }`** is short for `{ email: email }`. Field names that aren't identifiers are strings: `{ "x-trace": id }`,
  read back with `obj["x-trace"]`.
- **Conditional value**: `(IF c THEN a ELSE b)`; the parentheses are required.

### 7.3 Functions

Only the functions below exist; any other name is an error (`unknown-function`, with a suggestion), and the argument
count is checked (`arity`). They are the named functions of Rabbinatix's logic nodes; the table below is the single source (`src/constructs.ts`).
`now()`, `uuid()` and `random()` give a new value each time they are evaluated.

| Group | Function | Returns | Meaning |
|---|---|---|---|
| Values | `default(value, fallback)` | any | value, or fallback when value is null |
| Values | `exists(value)` | boolean | the path exists (the value may be null) |
| Values | `found(value)` | boolean | a query found something (not null, not an empty list) |
| Values | `compare(a, b)` | integer | -1, 0 or 1 |
| Objects | `get(object, "path")` | any | a nested value by path (`a.b[0].c`); null when missing |
| Objects | `set(object, "path", value)` | object | a copy with a nested value set |
| Objects | `remove(object, "path")` | object | a copy without a nested value |
| Objects | `merge(a, b)` | object | shallow merge, b over a |
| Objects | `transform(source, [[target, source], …])` | object | a new object: each target path ← source path |
| Objects | `template(template, data)` | any | fills {{path}} placeholders from data |
| Strings | `format("text {name}", { name })` | string | fills {name} placeholders |
| Strings | `concat(a, b)` | string | joins two strings (null counts as "") |
| Strings | `contains(text, search)` | boolean | text contains search |
| Strings | `startsWith(text, prefix)` | boolean |  |
| Strings | `endsWith(text, suffix)` | boolean |  |
| Strings | `trim(text)` | string | without surrounding spaces |
| Strings | `lower(text)` | string |  |
| Strings | `upper(text)` | string |  |
| Strings | `length(text)` | integer | number of characters |
| Strings | `replace(text, search, replacement)` | string | replaces every occurrence |
| Strings | `split(text, separator)` | string[] |  |
| Strings | `join(list, separator)` | string |  |
| Strings | `regexMatch(text, "pattern", "flags"?)` | { matches: boolean, groups: string[] } | regular expression match |
| Strings | `substring(text, start, end?)` | string | part of the text (negative positions count from the end) |
| Strings | `indexOf(text, search)` | integer | position of search, or -1 |
| Strings | `padStart(text, length, fill)` | string | fill added at the start up to length |
| Strings | `padEnd(text, length, fill)` | string | fill added at the end up to length |
| Strings | `base64Encode(text)` | string | UTF-8 text as Base64 |
| Strings | `base64Decode(text)` | string | Base64 to text; fails with INVALID_BASE64 |
| Strings | `urlEncode(text)` | string | escaped for a web address |
| Strings | `urlDecode(text)` | string | reverses urlEncode; fails with INVALID_URL_ENCODING |
| Strings | `formatNumber(value, decimals, thousands, point)` | string | a number with fixed decimals and a thousands separator ("1,234.50"); fails with INVALID_NUMBER |
| Strings | `hash(text, "algorithm", "encoding")` | string | SHA-256, SHA-1 or MD5 of the text, as hex or base64 |
| Strings | `hmac(text, key, "algorithm", "encoding")` | string | an HMAC signature of the text with a secret key, as hex or base64 |
| Lists | `len(list)` | integer | number of items |
| Lists | `at(list, index)` | any | the item at index (null when out of range); same as list[index] |
| Lists | `append(list, item)` | list | a copy with the item appended |
| Lists | `sum(list, "path"?)` | number | sum of the items (or of a field of each item) |
| Lists | `sortBy(list, "path", descending)` | list | a sorted copy |
| Lists | `map(list, "LOGIC-KEY")` | list | calls the logic for each item and keeps its first output |
| Lists | `filter(list, "LOGIC-KEY")` | list | keeps the items for which the logic returns true |
| Lists | `find(list, "LOGIC-KEY")` | any | the first item for which the logic returns true, or null |
| Lists | `some(list, "LOGIC-KEY")` | boolean | true if the logic returns true for any item |
| Lists | `every(list, "LOGIC-KEY")` | boolean | true if the logic returns true for every item (also for an empty list) |
| Lists | `first(list)` | any | the first item, or null |
| Lists | `last(list)` | any | the last item, or null |
| Lists | `groupBy(list, "path"?)` | object | the items grouped by the text of a field: { value: [items] } |
| Lists | `average(list, "path"?)` | number | the average of the items (or of a field of each item); 0 for none |
| Lists | `slice(list, start, end?)` | list | items from start up to end (negative positions count from the end) |
| Lists | `reverse(list)` | list | a reversed copy |
| Lists | `unique(list)` | list | repeated items removed |
| Lists | `itemIndex(list, item)` | integer | position of an equal item, or -1 |
| Lists | `flatten(list)` | list | a list of lists joined into one list |
| Objects | `keys(object)` | string[] | the field names |
| Objects | `values(object)` | list | the field values |
| Objects | `entries(object)` | { key, value }[] | the fields as { key, value } items |
| Math | `round(value, decimals)` | number | rounded to decimals (halves up) |
| Math | `floor(value)` | integer | rounded down |
| Math | `ceil(value)` | integer | rounded up |
| Math | `abs(value)` | number | without its sign |
| Math | `min(a, b)` | number | the smaller value |
| Math | `max(a, b)` | number | the larger value |
| Math | `power(base, exponent)` | number | base raised to exponent |
| Math | `sqrt(value)` | number | square root |
| Math | `clamp(value, min, max)` | number | the value kept between min and max |
| Dates | `parseDate(value)` | { date, timestamp, valid } | reads ISO text or epoch milliseconds as a UTC date-time |
| Dates | `formatDate(date, "pattern")` | string | yyyy-MM-dd HH:mm style text (UTC); fails with INVALID_DATE |
| Dates | `addTime(date, amount, "unit")` | string(date-time) | the date moved by amount units (days, months…) |
| Dates | `timeBetween(from, to, "unit")` | integer | whole units from from to to |
| Dates | `dateParts(date)` | { year, month, day, hour, minute, second, millisecond, weekday } | the parts of a date (UTC; weekday 1 = Monday) |
| Dates | `makeDate(year, month, day, hour, minute, second)` | string(date-time) | a UTC date-time from its parts |
| Dates | `startOf(date, "unit")` | string(date-time) | the start of the hour, day, week (Monday), month or year (UTC) |
| Dates | `endOf(date, "unit")` | string(date-time) | the last moment of the hour, day, week, month or year (UTC) |
| Validation | `isEmail(value)` | boolean | a valid email address |
| Validation | `isType(value, "type")` | boolean | the value has the type |
| Validation | `matchesShape(value, "shape")` | boolean | the value matches a shape (compact syntax) |
| Validation | `inRange(value, min, max)` | boolean | min ≤ value ≤ max |
| Validation | `matches(value, "pattern")` | boolean | the value matches a regular expression |
| Validation | `passwordOk(value, { minLength, requireDigit, requireUpper })` | boolean | the password meets the policy |
| Validation | `checkRequired(value, "field")` | { valid, message } | check with a message: "<field> is required" |
| Validation | `checkEmail(value, "field")` | { valid, message } | check with a message |
| Validation | `checkType(value, "type", "field")` | { valid, message } | check with a message |
| Validation | `checkShape(value, shape, "field")` | { valid, message } | check with a message (first failing path) |
| Validation | `checkRange(value, min, max, "field")` | { valid, message } | check with a message |
| Validation | `checkRegex(value, "pattern", "field")` | { valid, message } | check with a message |
| Validation | `checkPassword(value, policy, "field")` | { valid, message } | check with a message (first failing rule) |
| Values | `typeOf(value)` | string | string, integer, number, boolean, object, array or null |
| Conversion | `toString(value)` | string | objects become JSON |
| Conversion | `toNumber(value)` | number | not a number → 0 |
| Conversion | `isNumeric(value)` | boolean | the value converts to a number |
| Conversion | `toBoolean(value)` | boolean |  |
| Conversion | `parseJson(text)` | any | parses JSON; fails with INVALID_JSON |
| Runtime | `customCode("name", { inputs })` | any | calls a Custom Code function; its JavaScript stays in the logic (deps.code.<name> in exported code) |
| Runtime | `now()` | string(date-time) | current date-time; a new value each time |
| Runtime | `uuid()` | string(uuid) | a new id each time |
| Runtime | `random(min, max)` | integer | integer between min and max |

## 8. Calls

| Form | Meaning |
|---|---|
| `CALL System METHOD /path [WITH expr]` | A call through an API contract of `System` (METHOD: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS). `expr` is the request: `{ pathParams, query, headers, body, auth }` (fields as needed). The result is `{ status, body, headers }`; branch on it with `MATCH result.status`, one CASE per declared response and ELSE for any other. |
| `CALL System operation [WITH expr]` | A database, queue, cache or external-service operation, by name (`users.findByEmail`, `orders.insert`, `get`). A query returns the row or `null` (test with `found(x)`); a write returns its result. |
| `CALL LOGIC key [WITH expr]` | Runs other logic by its key with `expr` as its input (a function: an object of its inputs; endpoint logic: its request). The result is that logic's outputs (endpoint logic: `{ status, body, headers }`). |

System names are one word (`AuthService`; exporters write the system's name without spaces) or a string
(`"Auth Service"`). Readers SHOULD match them to systems ignoring case, spaces and punctuation.

## 9. Steps, keys and flows

- **Keys** are the app's stable keys: `{PREFIX}-{SCOPE}-{NAME}-{NNN}` (for example `LOGIC-AUTH-LOGIN-001`), optionally
  followed by `/` and a local part (`LOGIC-AUTH-LOGIN-001/CHK`) for a place inside an object. Keys that don't have this
  shape are warnings (`key-format`). STEP keys MUST be unique in a document (`duplicate-step`).
- On import (conformance level 2), keys map sections and calls back to existing objects. **Unknown or missing keys mean
  "new"**; importing never overwrites silently (it creates a new logic or a new revision, with a preview).
- **FLOW documents** are a sequence of STEPs across systems, one per logic the flow runs, in the order the flow reaches
  them. The first STEP is the flow's entry and reads the flow's INPUT names. A STEP keyed by endpoint logic reads its
  request as `request`; a STEP keyed by a function reads `input`. A contract call into logic that is part of the flow is
  written `CALL LOGIC key WITH …` with the API as a trailing comment (`-- AuthService POST /api/v2/login`).
- **LOGIC documents** MAY use STEPs to group statements. Exporters that don't write STEPs keep a separate line map
  (line → node key) outside the text.

## 10. Canonical form

`print(parse(x))` is the canonical form of a valid document `x`, and `parse(print(ast))` gives `ast` back (positions
aside). The canonical form:

- `FPC 1.0` on line 1, then the header line (`KEY`, `VERSION`, `REVISION` in that order), header comments, `SYSTEM`,
  `ON`, one `INPUT` line, one `OUTPUT` line, a blank line, the statements, and a blank line before each STEP;
- `SET` on every assignment; Unicode operators; `true`, `false`, `null` in lower case;
- two spaces of indentation per block (STEP bodies are indented once, CASE lines once inside MATCH, BRANCH once inside
  PARALLEL); one statement per line; expressions on one line;
- the fewest parentheses that keep the meaning, except `NOT (a > b)` (a comparison or logic operand of NOT is always
  bracketed) and `(IF … )`;
- object shorthand `{ email }` where the value is the same name; strings with `\"`, `\\`, `\n`, `\t`, `\r` escapes;
- `WAIT` always with its unit; `FAIL` codes bare when they are identifiers.

## 11. Validation

A reader reports **errors** (the document is invalid) and **warnings** (it is valid but probably not what was meant),
each with a line, a column and a message that says how to fix it. The reference validator's codes:

| Code | Severity | When |
|---|---|---|
| `syntax` | error | anything the grammar doesn't allow (missing THEN, `=` used to assign, unclosed string or bracket…) |
| `unclosed-block` | error | a block without its END, or an END of the wrong kind |
| `unbalanced` | error | END, ELSE, CASE… with no open block |
| `unknown-type` | error | a type name that doesn't exist |
| `break-outside-loop` | error | BREAK or CONTINUE outside FOR, REPEAT or WHILE |
| `unknown-function`, `arity` | error | a function that doesn't exist, or the wrong number of arguments |
| `nested-call` | error | CALL inside another expression |
| `case-literal`, `empty-match` | error | a CASE value that isn't a literal; a MATCH without CASE |
| `status` | error | a RETURN or FAIL status outside 100–599 |
| `duplicate`, `duplicate-step` | error | an INPUT/OUTPUT name or a STEP key used twice |
| `fpc-version` | error / warning | another major version (error); a newer minor version (warning) |
| `version-format`, `path` | error | VERSION that isn't semver; a path that doesn't start with `/` |
| `key-format`, `error-code`, `trigger-in-flow` | warning | a key or error code of an unusual shape; `ON` in a FLOW |
| `unknown-name` | warning | a name that is never set (not an INPUT, SET, loop, CATCH or AS name; `request` and `input` are always known) |

Readers MUST NOT guess: a document with errors is not imported.

## 12. Versioning of FPC

- Every document states its version on its first line: `FPC 1.0`.
- **Minor versions** (1.1, 1.2, …) only add: new statements, functions or header clauses. A 1.x document that uses no
  addition is valid 1.0. A 1.0 reader reads a newer 1.x document with a warning and reports unknown constructs as errors.
- **Major versions** (2.0) may change meaning. A reader MUST refuse a major version it doesn't implement.
- The keyword, construct and function tables of the reference implementation (`src/constructs.ts`) are the single source
  for this spec, the grammar file and the cheat sheet; a change there is a change of FPC and needs a version decision.

## 13. Conformance

- **Level 1 — export.** The tool writes documents that are valid FPC 1.0 (pass the validator without errors), carry
  the header with KEY and VERSION or REVISION, and use the app's keys. Rabbinatix exports logic and flows at level 1
  (from its codegen IR, so pseudocode, generated code and verification agree).
- **Level 2 — round trip.** The tool also reads FPC back: it accepts every valid document, rejects every invalid one
  with line and column, maps keys back to objects (unknown keys mean new) and never overwrites without a preview.
- **Test suite:** `examples/valid/*.fpc` MUST parse without diagnostics and round-trip through the
  canonical printer; each `examples/invalid/*.fpc` starts with `-- expect: line:col code` and MUST be rejected with that
  diagnostic.

**Reserved words:** `FPC FLOW LOGIC KEY VERSION REVISION SYSTEM ON REQUEST EVENT SCHEDULE INPUT OUTPUT STEP SET IF THEN
ELSE END MATCH CASE FOR EACH IN FROM TO REPEAT TIMES WHILE DO CALL WITH EMIT TRY CATCH FINALLY RETRY BACKOFF AS SUCCESS
FAILURE PARALLEL BRANCH WAIT RETURN HEADERS FAIL LOG BREAK CONTINUE AND OR NOT IS EMPTY NULL TRUE FALSE`.
Contextual (not reserved): the HTTP methods after `CALL System` and `ON REQUEST`, and the units after `WAIT`.

## 14. Grammar (EBNF)

```ebnf
(* FPC 1.0. Keywords are UPPER CASE and reserved only in upper case.
   NL is a line break. Inside ( ), [ ] and { } line breaks are ignored.
   "--" starts a comment that runs to the end of the line. *)

document    = { NL | comment NL }, "FPC", version, NL,
              ( "FLOW" | "LOGIC" ), string, [ "KEY", key ], [ "VERSION", semver ], [ "REVISION", integer ], NL,
              { header NL }, block, { step } ;
header      = comment
            | "SYSTEM", name
            | "ON", ( "REQUEST", method, path | "EVENT", string | "SCHEDULE", string | "CALL" )
            | ( "INPUT" | "OUTPUT" ), param, { ",", param } ;
param       = ( identifier | integer | string ), [ "?" ], ":", type ;
step        = "STEP", key, [ string ], [ "IN", name ], NL, block ;

block       = { statement | comment NL | NL } ;
statement   = simple, [ comment ], NL | compound ;
simple      = [ "SET" ], target, "←", expression
            | call
            | "EMIT", name, word, [ "WITH", expression ]
            | "WAIT", expression, [ "ms" | "s" | "m" | "h" ]
            | "RETURN", [ expression ]
            | "RETURN", integer, "WITH", expression, [ "HEADERS", expression ]
            | "FAIL", ( integer | identifier | string ), expression
            | "LOG", expression
            | "BREAK" | "CONTINUE" ;
compound    = "IF", expression, "THEN", NL, block,
              { "ELSE", "IF", expression, "THEN", NL, block }, [ "ELSE", NL, block ], "END", "IF", NL
            | "MATCH", expression, NL, { "CASE", expression, { ",", expression }, NL, block },
              [ "ELSE", NL, block ], "END", "MATCH", NL
            | "FOR", "EACH", identifier, [ ",", identifier ], "IN", expression, [ "DO" ], NL, block, "END", "FOR", NL
            | "FOR", identifier, "FROM", expression, "TO", expression, [ "DO" ], NL, block, "END", "FOR", NL
            | "REPEAT", expression, "TIMES", NL, block, "END", "REPEAT", NL
            | "WHILE", expression, [ "DO" ], NL, block, "END", "WHILE", NL
            | "TRY", NL, block, [ "CATCH", [ identifier ], NL, block ], [ "FINALLY", NL, block ], "END", "TRY", NL
            | "RETRY", expression, "TIMES", [ "BACKOFF", expression ], [ "AS", identifier ], NL, block,
              [ "ON", "SUCCESS", NL, block ], [ "ON", "FAILURE", [ "AS", identifier ], NL, block ], "END", "RETRY", NL
            | "PARALLEL", NL, { "BRANCH", NL, block }, "END", "PARALLEL", NL ;
target      = identifier, { "." , field | "[", expression, "]" } ;
call        = "CALL", "LOGIC", key, [ "WITH", expression ]
            | "CALL", name, method, path, [ "WITH", expression ]
            | "CALL", name, word, [ "WITH", expression ] ;

expression  = or ;
or          = and, { "OR", and } ;
and         = not, { "AND", not } ;
not         = "NOT", not | comparison ;
comparison  = sum, [ ( "=" | "≠" | "<" | "≤" | ">" | "≥" | "IN" ), sum | "IS", [ "NOT" ], ( "EMPTY" | "NULL" ) ] ;
sum         = product, { ( "+" | "-" ), product } ;
product     = unary, { ( "*" | "/" | "%" ), unary } ;
unary       = "-", unary | postfix ;
postfix     = primary, { "." , field | "[", expression, "]" } ;
primary     = number | string | "true" | "false" | "null" | "TRUE" | "FALSE" | "NULL"
            | identifier, [ "(", [ expression, { ",", expression } ], ")" ]
            | "(", expression, ")"
            | "(", "IF", expression, "THEN", expression, "ELSE", expression, ")"
            | "{", [ entry, { ",", entry }, [ "," ] ], "}"
            | "[", [ expression, { ",", expression }, [ "," ] ], "]"
            | call ;
entry       = ( identifier | string ), [ ":", expression ] ;

type        = single, { "|", single } ;
single      = ( "string" | "number" | "integer" | "boolean" | "null" | "any" | "object" | "array" ), [ "(", word, ")" ]
            | "enum", "(", value, { ",", value }, ")"
            | "{", [ field, [ "?" ], ":", type, { ",", field, [ "?" ], ":", type } ], "}"
            | "[", type, "]"
            | single, "[", "]" ;

(* lexical *)
identifier  = letter, { letter | digit | "_" | "$" } - keyword ;
key         = word ;                          (* LOGIC-AUTH-LOGIN-001, LOGIC-AUTH-LOGIN-001/CHK *)
word        = ? characters with no space between them ? ;
path        = "/", word ;                     (* /api/v2/users/{id} *)
method      = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" ;
name        = word | string ;                 (* a system: AuthService, "Auth Service" *)
string      = '"', { character | "\", escape }, '"' ;
number      = digit, { digit }, [ ".", digit, { digit } ], [ ( "e" | "E" ), [ "+" | "-" ], digit, { digit } ] ;
comment     = "--", { character } ;
(* ASCII alternatives: "<-" for "←", "!=" or "<>" for "≠", "<=" for "≤", ">=" for "≥", "==" for "=" *)
```

## 15. Node coverage

This section is informative. In Rabbinatix, where FPC is the text form of logic, every logic node type has an FPC form
(checked by Rabbinatix's own tests against its node registry). Other tools can ignore the table.

| Node | Title | FPC |
|---|---|---|
| `flow.branch` | Branch | If |
| `flow.sequence` | Sequence | Sequence |
| `flow.switch` | Switch | Match |
| `flow.forEach` | For Each | For each |
| `flow.loop` | For Loop | For range, Repeat |
| `flow.while` | While | While |
| `flow.break` | Break | Break and continue |
| `flow.parallel` | Parallel | Parallel |
| `flow.try` | Try / Catch | Try |
| `flow.retry` | Retry | Retry |
| `flow.wait` | Wait | Wait |
| `flow.delay` | Delay | Wait |
| `flow.throw` | Throw Error | Fail |
| `io.onRequest` | On Request | Trigger |
| `io.returnResponse` | Return Response | Return |
| `io.onEvent` | On Event | Trigger |
| `io.functionEntry` | Function Entry | Trigger |
| `io.trigger` | Scheduled Trigger | Trigger |
| `io.return` | Return | Return |
| `data.literal` | Value | Values |
| `data.makeObject` | Make Object | Values |
| `data.makeArray` | Make Array | Values |
| `data.dictionary` | Dictionary | Values |
| `data.getVar` | Get Variable | Set |
| `data.setVar` | Set Variable | Set |
| `data.default` | Default Value | `default()` |
| `data.select` | Select | Conditional value |
| `data.parseJson` | Parse JSON | `parseJson()` |
| `data.now` | Now | `now()` |
| `data.random` | Random Number | `random()` |
| `data.uuid` | UUID | `uuid()` |
| `conv.toString` | To String | `toString()` |
| `conv.toNumber` | To Number | `toNumber()`, `isNumeric()` |
| `conv.toBoolean` | To Boolean | `toBoolean()` |
| `val.typeOf` | Type Of | `typeOf()` |
| `util.reroute` | Reroute | Sequence |
| `util.rerouteExec` | Reroute (exec) | Sequence |
| `util.log` | Log | Log |
| `util.template` | Template | `template()` |
| `op.equals` | Equals | Operators |
| `op.notEquals` | Not Equals | Operators |
| `op.gt` | Greater Than | Operators |
| `op.lt` | Less Than | Operators |
| `op.gte` | Greater or Equal | Operators |
| `op.lte` | Less or Equal | Operators |
| `op.and` | AND | Operators |
| `op.or` | OR | Operators |
| `op.add` | Add | Operators |
| `op.subtract` | Subtract | Operators |
| `op.multiply` | Multiply | Operators |
| `op.divide` | Divide | Operators |
| `op.modulo` | Modulo | Operators |
| `op.compare` | Compare | `compare()` |
| `op.not` | NOT | Operators |
| `str.contains` | Contains | `contains()` |
| `str.startsWith` | Starts With | `startsWith()` |
| `str.endsWith` | Ends With | `endsWith()` |
| `str.trim` | Trim | `trim()` |
| `str.lower` | To Lower Case | `lower()` |
| `str.upper` | To Upper Case | `upper()` |
| `str.length` | String Length | `length()` |
| `str.concat` | Concat | `concat()` |
| `str.replace` | Replace | `replace()` |
| `str.split` | Split | `split()` |
| `str.join` | Join | `join()` |
| `str.regexMatch` | Regex Match | `regexMatch()` |
| `str.format` | Format | `format()` |
| `str.substring` | Substring | `substring()` |
| `str.indexOf` | Find Text | `indexOf()` |
| `str.padStart` | Pad Start | `padStart()` |
| `str.padEnd` | Pad End | `padEnd()` |
| `str.base64Encode` | Base64 Encode | `base64Encode()` |
| `str.base64Decode` | Base64 Decode | `base64Decode()` |
| `str.urlEncode` | URL Encode | `urlEncode()` |
| `str.urlDecode` | URL Decode | `urlDecode()` |
| `str.formatNumber` | Format Number | `formatNumber()` |
| `str.hash` | Hash | `hash()` |
| `str.hmac` | HMAC Signature | `hmac()` |
| `obj.get` | Get Property | Fields and items, `exists()`, `get()` |
| `obj.break` | Break Object | Fields and items |
| `obj.set` | Set Property | Set, `set()` |
| `obj.remove` | Remove Property | `remove()` |
| `obj.merge` | Merge | `merge()` |
| `obj.transform` | Transform | `transform()` |
| `obj.keys` | Keys | `keys()` |
| `obj.values` | Values | `values()` |
| `obj.entries` | Entries | `entries()` |
| `col.length` | Length | `len()` |
| `col.get` | Get Item | Fields and items, `at()` |
| `col.push` | Append | `append()` |
| `col.contains` | Array Contains | Operators |
| `col.sum` | Sum | `sum()` |
| `col.sort` | Sort | `sortBy()` |
| `col.map` | Map | `map()` |
| `col.filter` | Filter | `filter()` |
| `col.find` | Find First | `find()` |
| `col.some` | Any Match | `some()` |
| `col.every` | All Match | `every()` |
| `col.groupBy` | Group By | `groupBy()` |
| `col.average` | Average | `average()` |
| `col.slice` | Slice | `slice()` |
| `col.reverse` | Reverse | `reverse()` |
| `col.unique` | Unique | `unique()` |
| `col.indexOf` | Find Item | `itemIndex()` |
| `col.flatten` | Flatten | `flatten()` |
| `col.first` | First Item | `first()` |
| `col.last` | Last Item | `last()` |
| `math.round` | Round | `round()` |
| `math.floor` | Round Down | `floor()` |
| `math.ceil` | Round Up | `ceil()` |
| `math.abs` | Absolute | `abs()` |
| `math.min` | Minimum | `min()` |
| `math.max` | Maximum | `max()` |
| `math.power` | Power | `power()` |
| `math.sqrt` | Square Root | `sqrt()` |
| `math.clamp` | Keep in Range | `clamp()` |
| `date.parse` | To Date | `parseDate()` |
| `date.format` | Format Date | `formatDate()` |
| `date.add` | Add Time | `addTime()` |
| `date.diff` | Time Between | `timeBetween()` |
| `date.parts` | Date Parts | `dateParts()` |
| `date.make` | Make Date | `makeDate()` |
| `date.startOf` | Start of Period | `startOf()` |
| `date.endOf` | End of Period | `endOf()` |
| `val.isRequired` | Is Required | Operators, `checkRequired()` |
| `val.isEmpty` | Is Empty | Operators |
| `val.isNull` | Is Null | Operators |
| `val.email` | Validate Email | `isEmail()`, `checkEmail()` |
| `val.type` | Validate Type | `isType()`, `checkType()` |
| `val.schema` | Validate Schema | `matchesShape()`, `checkShape()` |
| `val.range` | Validate Range | `inRange()`, `checkRange()` |
| `val.regex` | Validate Regex | `matches()`, `checkRegex()` |
| `val.password` | Validate Password | `passwordOk()`, `checkPassword()` |
| `boundary.callContract` | Call Contract | Match, Call an API |
| `boundary.queryDatabase` | Query Database | Call an operation, `found()` |
| `boundary.insert` | Database Insert | Call an operation |
| `boundary.update` | Database Update | Call an operation |
| `boundary.delete` | Database Delete | Call an operation |
| `boundary.publishEvent` | Publish Event | Emit |
| `boundary.consumeEvent` | Consume Event | Call an operation |
| `boundary.callExternal` | Call External Service | Call an operation |
| `boundary.cache` | Cache | Call an operation |
| `fn.call` | Call Function | Call logic |
| `code.custom` | Custom Code | `customCode()` |

`io.onRequest` also makes the endpoint's request readable as `request`; `obj.break` reads fields with `.`;
`data.getVar` is a name; `flow.sequence` is statements in order; `util.reroute*` are transparent.

## 16. Examples

### Valid: endpoint logic

```fpc
FPC 1.0
LOGIC "Sign in (POST /api/v2/login)" KEY LOGIC-AUTH-LOGIN-001 REVISION 4
-- exported 2026-09-30 12:34 UTC from Rabbinatix
SYSTEM AuthService
ON REQUEST POST /api/v2/login
INPUT request: { headers?: object, body: { email: string(email), password: string } }
OUTPUT 200: { accessToken: string, expiresIn: integer, tokenType: enum(Bearer) }, 401: { error: string }

SET email ← request.body.email
SET emailCheck ← checkEmail(email, "email")
SET password ← request.body.password
IF NOT (emailCheck.valid AND password IS NOT EMPTY) THEN
  RETURN 401 WITH { error: (IF emailCheck.valid THEN checkRequired(password, "password").message ELSE emailCheck.message) }
END IF
SET lookUpUser ← CALL UserService GET /internal/users/by-email WITH { query: { email } }
MATCH lookUpUser.status
  CASE 200
    IF lookUpUser.body.passwordHash ≠ format("hash:{password}", { password }) THEN
      RETURN 401 WITH { error: "Invalid credentials" }
    END IF
    SET id ← lookUpUser.body.id
    EMIT EventBus user.logged_in WITH { userId: id }
    RETURN 200 WITH { accessToken: format("TEST-TOKEN-{id}", { id }), expiresIn: 3600, tokenType: "Bearer" }
  CASE 404
    RETURN 401 WITH { error: "Invalid credentials" }
  ELSE
    FAIL UPSTREAM_ERROR "User Service failed"
END MATCH
```

### Valid: a flow across systems (excerpt)

```fpc
FPC 1.0
FLOW "User login" KEY FLOW-AUTH-LOGIN-001 REVISION 3
INPUT email: string, password: string
OUTPUT success: boolean, token: string | null, message: string | null

STEP LOGIC-WEB-SUBMIT-LOGIN-001 "Submit login form" IN WebApp
  SET postLoginResponse ← CALL LOGIC LOGIC-AUTH-LOGIN-001 WITH { body: { email, password } } -- AuthService POST /api/v2/login
  MATCH postLoginResponse.status
    CASE 200
      RETURN { success: true, token: postLoginResponse.body.accessToken, message: null }
    ELSE
      RETURN { success: false, token: null, message: "Something went wrong" }
  END MATCH

STEP LOGIC-AUTH-LOGIN-001 "Sign in (POST /api/v2/login)" IN AuthService
  -- on POST /api/v2/login; reads the request as request
  SET email ← request.body.email
  RETURN 200 WITH { accessToken: format("TEST-TOKEN-{id}", { id: 1 }) }
```

### Valid: every statement

See `examples/valid/every-statement.fpc` (loops, MATCH, calls of every kind, TRY/CATCH/FINALLY,
RETRY with ON SUCCESS / ON FAILURE, PARALLEL, WAIT, conditional values).

### Invalid

| Document | Diagnostic |
|---|---|
| `SET x = 1` | 4:7 `syntax` — Use ← (or <-) to set a value; = compares |
| `IF x > 1 THEN` … (no END IF) | `unclosed-block` — IF on line 5 is not closed: add END IF |
| `SET ok ← isEmial(email)` | `unknown-function` — Unknown function isEmial(): did you mean isEmail()? |
| `SET r ← CALL AuthService /api/v2/login` | `syntax` — Expected an HTTP method before the path |
| `SET r ← 1 + (CALL Billing charges.create)` | `nested-call` — CALL must be a statement on its own or the whole value of SET or RETURN |
| `FAIL 400` | `syntax` — FAIL needs a message after the status |
| `INPUT a: strng` | `unknown-type` — Unknown type "strng" |
| `BREAK` outside a loop | `break-outside-loop` |
| `FPC 2.0` | `fpc-version` — FPC 2.0 is not supported |

The full suite is `examples/`.

## 17. Reference implementation

`src/` (pure TypeScript, no dependencies):

| File | Role |
|---|---|
| `ast.ts` | the AST (`FpcDocument`, `FpcStmt`, `FpcExpr`, `FpcType`), positions, `stripPositions` |
| `constructs.ts` | keywords, operators, constructs and functions: the single table (§ 12) |
| `lexer.ts` | `lex(text)` → tokens with line, column and offsets |
| `parser.ts` | `parse(text)` → `{ doc, diagnostics }` (recovers at the next line), `parseExpression` |
| `validator.ts` | `validate(doc)`, `check(text)` (parse + validate), `format(text)` (canonical text when valid) |
| `printer.ts` | `print(doc, { onLine })` → canonical text, with a callback that maps lines to statements |
| `grammar.ts` | `FPC_GRAMMAR` (§ 14) and `cheatSheet()` (the one-page prompt) |

## Changelog

- **1.0** (2026-09-30): first version.
