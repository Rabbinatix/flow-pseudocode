# FPC 1.0 cheat sheet — Flow Pseudocode

Structured-keyword pseudocode with a typed header, CALL lines for APIs and STEP markers with keys.
Keywords are UPPER CASE. Blocks end with END. Indent with two spaces. Comments start with `--`.

```fpc
FPC 1.0
LOGIC "Sign in" KEY LOGIC-AUTH-LOGIN-001 VERSION 1.3.0
ON REQUEST POST /api/v2/login
INPUT request: { body: { email: string(email), password: string } }

IF request.body.email IS EMPTY THEN
  FAIL 400 "email is required"
END IF
SET user ← CALL UserService GET /internal/users/by-email WITH { query: { email: request.body.email } }
MATCH user.status
  CASE 200
    RETURN 200 WITH { accessToken: format("TOKEN-{id}", { id: user.body.id }) }
  ELSE
    FAIL 401 "Invalid credentials"
END MATCH
```

## Document

- **Header** — `FPC 1.0 ⏎ FLOW|LOGIC "name" [KEY key] [VERSION x.y.z | REVISION n]`  
  Every document starts with the FPC version, then what it describes: a FLOW (several systems) or one LOGIC. KEY is the app's key; VERSION or REVISION says which version it came from.
- **System** — `SYSTEM name`  
  The system a LOGIC document runs in.
- **Trigger** — `ON REQUEST METHOD /path ⏎ ON EVENT "name" ⏎ ON SCHEDULE "spec" ⏎ ON CALL`  
  How the logic starts: an HTTP request (endpoint), a UI or app event, a schedule or queue, or a call from other logic (a reusable function).
- **Inputs and outputs** — `INPUT name: type, name?: type ⏎ OUTPUT name: type`  
  Typed inputs and outputs in the compact shape syntax. `?` marks an optional field, `| null` a nullable one. Endpoint logic reads its request as `request` and may name outputs by HTTP status (`OUTPUT 200: { … }, 401: { error: string }`).
- **Step** — `STEP key ["title"] [IN system]`  
  A section of the document carrying one of the app's keys, so tools can map lines back to objects. A step runs until the next STEP. In a FLOW each step is one logic; unknown or missing keys mean "new".
- **Comment** — `-- text`  
  From `--` to the end of the line. Comments never change meaning.
## Data

- **Set** — `SET target ← expression ⏎ target ← expression`  
  Gives a variable (or a field or item of one) a value. `SET` may be left out; `<-` is the ASCII form of `←`.
- **Values** — `"text"  42  3.5  true  false  null  (or TRUE FALSE NULL)  { name: value }  [a, b]`  
  Strings, numbers, booleans, null, objects and lists. `{ email }` is short for `{ email: email }`.
- **Fields and items** — `value.field  value[index]  value["odd key"]`  
  A missing field reads as null (it never fails).
- **Log** — `LOG expression`  
  Writes a line to the run log.
## Control flow

- **Sequence** — `statement ⏎ statement`  
  Statements run top to bottom. Indentation is for people; blocks are closed by END.
- **If** — `IF condition THEN ⏎   … ⏎ ELSE IF condition THEN ⏎   … ⏎ ELSE ⏎   … ⏎ END IF`  
  Conditions are true unless they are false, null, 0, "" or "false".
- **Match** — `MATCH value ⏎   CASE literal[, literal] ⏎     … ⏎   ELSE ⏎     … ⏎ END MATCH`  
  Runs the first CASE whose value equals the value, else the ELSE block.
- **For each** — `FOR EACH item[, index] IN list ⏎   … ⏎ END FOR`  
  Runs the body once per item. A value that is not a list runs it zero times.
- **For range** — `FOR index FROM first TO last ⏎   … ⏎ END FOR`  
  Counts from first to last, both included. The bounds are read once.
- **Repeat** — `REPEAT n TIMES ⏎   … ⏎ END REPEAT`  
  Runs the body n times (the same as FOR i FROM 1 TO n).
- **While** — `WHILE condition [DO] ⏎   … ⏎ END WHILE`  
  Checks the condition before each round.
- **Break and continue** — `BREAK ⏎ CONTINUE`  
  Leave the innermost loop, or go on with its next round.
- **Parallel** — `PARALLEL ⏎   BRANCH ⏎     … ⏎   BRANCH ⏎     … ⏎ END PARALLEL`  
  Branches may run at the same time; the statement ends when all are done. Simulation runs them in order.
- **Return** — `RETURN [expression] ⏎ RETURN status WITH body [HEADERS headers]`  
  Ends the logic with its outputs. Endpoint logic returns an HTTP status and a body. Other logic that reaches its end without RETURN returns {} (its text shows no RETURN line, as it has no Return step).
## Calls

- **Call an API** — `CALL System METHOD /path [WITH expression]`  
  Calls another system through its API contract. The result has `status`, `body` and `headers`; MATCH on `result.status` for each declared response.
- **Call an operation** — `CALL System operation [WITH expression]`  
  A database, queue, cache or external-service operation, by its name. A query returns the row or null (test it with `found(x)`).
- **Call logic** — `CALL LOGIC key [WITH expression]`  
  Runs other logic by its key: a reusable function, or in a FLOW the next system's logic.
- **Emit** — `EMIT System event [WITH expression]`  
  Publishes an event to a queue or topic.
## Errors and timing

- **Fail** — `FAIL status|CODE message`  
  Stops with an error: an HTTP status or an UPPER_CASE code, and a message.
- **Try** — `TRY ⏎   … ⏎ CATCH error ⏎   … ⏎ FINALLY ⏎   … ⏎ END TRY`  
  CATCH gets `{ code, message }`. FINALLY runs after TRY or CATCH end (also when CATCH fails), not after RETURN.
- **Retry** — `RETRY n TIMES [BACKOFF ms] [AS attempt] ⏎   … ⏎ ON SUCCESS ⏎   … ⏎ ON FAILURE [AS error] ⏎   … ⏎ END RETRY`  
  Runs the body again when it fails, up to n times, waiting BACKOFF milliseconds between tries.
- **Wait** — `WAIT duration [ms|s|m|h]`  
  Pauses (virtual time in simulation). Without a unit the duration is in milliseconds.
## Expressions

- **Operators** — `+ - * / %  = ≠ < ≤ > ≥  AND OR NOT  IN  IS [NOT] EMPTY  IS [NOT] NULL`  
  ASCII alternatives: `<-` for ←, `!=` for ≠, `<=` for ≤, `>=` for ≥, `==` for =.
- **Conditional value** — `(IF condition THEN a ELSE b)`  
  A value chosen by a condition; the parentheses are required.
- **Functions** — `name(argument, …)`  
  The named functions of the node catalogue (see the function list). Unknown names are errors.

## Operators

`←` (`<-`) assignment (in SET) · `OR` logical or · `AND` logical and · `NOT` logical not (prefix) · `=` (`==`) equal (deep for lists and objects) · `≠` (`!=`) not equal · `<` less than · `≤` (`<=`) less or equal · `>` greater than · `≥` (`>=`) greater or equal · `IN` membership in a list · `IS [NOT] EMPTY` null, "", [] or {} (postfix) · `IS [NOT] NULL` null or missing (postfix) · `+` add, or join two strings · `-` subtract (and prefix minus) · `*` multiply · `/` divide (fails on zero) · `%` remainder

## Functions


**Values:** `default(value, fallback)` `exists(value)` `found(value)` `compare(a, b)` 

**Objects:** `get(object, "path")` `set(object, "path", value)` `remove(object, "path")` `merge(a, b)` `transform(source, [[target, source], …])` `template(template, data)` 

**Strings:** `format("text {name}", { name })` `concat(a, b)` `contains(text, search)` `startsWith(text, prefix)` `endsWith(text, suffix)` `trim(text)` `lower(text)` `upper(text)` `length(text)` `replace(text, search, replacement)` `split(text, separator)` `join(list, separator)` `regexMatch(text, "pattern", "flags"?)` `substring(text, start, end?)` `indexOf(text, search)` `padStart(text, length, fill)` `padEnd(text, length, fill)` `base64Encode(text)` `base64Decode(text)` `urlEncode(text)` `urlDecode(text)` `formatNumber(value, decimals, thousands, point)` `hash(text, "algorithm", "encoding")` `hmac(text, key, "algorithm", "encoding")` 

**Lists:** `len(list)` `at(list, index)` `append(list, item)` `sum(list, "path"?)` `sortBy(list, "path", descending)` `map(list, "LOGIC-KEY")` `filter(list, "LOGIC-KEY")` `find(list, "LOGIC-KEY")` `some(list, "LOGIC-KEY")` `every(list, "LOGIC-KEY")` `first(list)` `last(list)` `groupBy(list, "path"?)` `average(list, "path"?)` `slice(list, start, end?)` `reverse(list)` `unique(list)` `itemIndex(list, item)` `flatten(list)` 

**Objects:** `keys(object)` `values(object)` `entries(object)` 

**Math:** `round(value, decimals)` `floor(value)` `ceil(value)` `abs(value)` `min(a, b)` `max(a, b)` `power(base, exponent)` `sqrt(value)` `clamp(value, min, max)` 

**Dates:** `parseDate(value)` `formatDate(date, "pattern")` `addTime(date, amount, "unit")` `timeBetween(from, to, "unit")` `dateParts(date)` `makeDate(year, month, day, hour, minute, second)` `startOf(date, "unit")` `endOf(date, "unit")` 

**Validation:** `isEmail(value)` `isType(value, "type")` `matchesShape(value, "shape")` `inRange(value, min, max)` `matches(value, "pattern")` `passwordOk(value, { minLength, requireDigit, requireUpper })` `checkRequired(value, "field")` `checkEmail(value, "field")` `checkType(value, "type", "field")` `checkShape(value, shape, "field")` `checkRange(value, min, max, "field")` `checkRegex(value, "pattern", "field")` `checkPassword(value, policy, "field")` 

**Values:** `typeOf(value)` 

**Conversion:** `toString(value)` `toNumber(value)` `isNumeric(value)` `toBoolean(value)` `parseJson(text)` 

**Runtime:** `customCode("name", { inputs })` `now()` `uuid()` `random(min, max)` 

## Types

`string`, `string(email)`, `number`, `integer`, `boolean`, `null`, `any`, `enum(a, b)`, `{ name: string, age?: integer }`, `string[]`, `T | null`.

## Rules for tools and AI

- Start with `FPC 1.0`, then `FLOW "name"` or `LOGIC "name"`. Keep KEY and STEP keys exactly as given; leave them out for new things.
- Only use the statements and functions listed here. Assign with `←` (or `<-`); compare with `=`.
- Call APIs as `CALL System METHOD /path WITH { … }`; other logic as `CALL LOGIC KEY WITH { … }`.
- End every IF, MATCH, FOR, REPEAT, WHILE, TRY, RETRY and PARALLEL with its END line.

Spec: CC BY 4.0 · Reference parser: MIT · Guide: https://rabbinatix.com/guide/pseudocode
