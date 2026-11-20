# Flow Pseudocode (FPC)

A strict, typed pseudocode that developers and AI assistants can both read, write and check.

- **Typed header:** `INPUT email: string(email), rememberMe?: boolean`
- **Explicit API calls:** `CALL AuthService POST /api/v2/login WITH { email, password }`
- **A stable key on every step:** `STEP LOGIC-AUTH-LOGIN-001/CALL`, so a tool or an assistant can change one step without rewriting everything
- **A small, strict grammar:** a made-up function or an unclosed block is an error with a line and column, never a guess

```
FPC 1.0
FLOW "User login" KEY FLOW-AUTH-LOGIN-001 VERSION 1.3.0
INPUT email: string(email), password: string, rememberMe?: boolean
OUTPUT token: string, expiresIn: integer

STEP LOGIC-AUTH-LOGIN-001/CHK "Inputs valid?"
  IF email IS EMPTY OR password IS EMPTY THEN
    FAIL 400 "email is required"
  END IF

STEP LOGIC-AUTH-LOGIN-001/CALL
  SET result ← CALL AuthService POST /api/v2/login WITH { email, password }
  IF result.status = 401 THEN
    FAIL 401 "Invalid credentials"
  END IF
  RETURN { token: result.body.accessToken, expiresIn: result.body.expiresIn }
```

**Try it in your browser** (nothing leaves the page): https://rabbinatix.com/guide/pseudocode

## Install

```sh
npm install @rabbinatix/flow-pseudocode
```

Pure TypeScript, **no dependencies**, ESM and CommonJS, types included. Node 18 or newer, or any modern browser bundle.

## Command line

```sh
npx @rabbinatix/flow-pseudocode check login.fpc    # nothing to install
npm install -g @rabbinatix/flow-pseudocode         # or install it: the command is `rfpc`
```

| Command | What it does |
|---|---|
| `rfpc check [paths…]` | check files; a folder is searched for `*.fpc`; `-` reads standard input; no path means the current folder |
| `rfpc format [path]` | print the canonical text of a valid file |
| `rfpc format --write [paths…]` | rewrite files in place |
| `rfpc format --check [paths…]` | change nothing; exit 1 if a file isn't canonical |
| `rfpc cheat-sheet` | print the one-page cheat sheet, to give to an AI assistant |
| `rfpc grammar` | print the EBNF grammar |

`check` options: `--format text` (default), `--format json` (for scripts and AI loops) or `--format github` (annotations on a pull
request), and `--strict` to fail on warnings too. `--no-color` turns colours off (so does `NO_COLOR`).

```
$ rfpc check login.fpc
login.fpc:5:7  error  syntax  Use ← (or <-) to set a value; = compares
  5 | SET b = upper(a)
    |       ^
1 file checked, 1 error, 0 warnings
```

**Exit codes:** `0` all good · `1` problems found in the FPC (or a file `format --check` would change) · `2` the tool couldn't run
(unknown command or option, a path that doesn't exist, a folder with no `.fpc` files).

In **GitHub Actions**:

```yaml
- run: npx @rabbinatix/flow-pseudocode check . --format github
```

As a **pre-commit** hook (`.git/hooks/pre-commit`, or the same line in Husky or lefthook):

```sh
npx @rabbinatix/flow-pseudocode format --check . && npx @rabbinatix/flow-pseudocode check .
```

With an **AI assistant**: give it `rfpc cheat-sheet`, ask for FPC, run `rfpc check - --format json` on its answer, and send the
diagnostics back until `ok` is `true`.

## Use as a library

```ts
import { check, format, parse, print } from '@rabbinatix/flow-pseudocode';

// check: parse + validate in one call
const r = check('FPC 1.0\nLOGIC "x"\nINPUT a: string\nOUTPUT b: string\nSET b = upper(a)\nRETURN { b: b }\n');
r.ok;             // false: there is an error
r.diagnostics[0]; // { severity: 'error', code: 'syntax', line: 5, col: 7,
                  //   message: 'Use ← (or <-) to set a value; = compares' }

// format: the canonical text, when the document is valid
const f = format('FPC 1.0\nLOGIC "x"\nINPUT a: string\nOUTPUT b: string\nSET b <- upper(a)\nRETURN { b: b }\n');
f.ok;   // true
f.text; // 'FPC 1.0\nLOGIC "x"\n…\nSET b ← upper(a)\nRETURN { b }\n'

// parse: the syntax tree (JSON-serialisable), then print it back
const { doc, diagnostics } = parse(f.text!);
print(doc); // the same canonical text
```

| Export | What it does |
|---|---|
| `check(text)` | parse + validate → `{ doc, diagnostics, ok }` (`ok` means no errors; warnings allowed) |
| `format(text)` | canonical text when the document is valid → `{ ok, text?, diagnostics }` |
| `parse(text)` | `{ doc, diagnostics }`; recovers at the next line, so `doc` is always there |
| `parseExpression(text)` | one expression |
| `validate(doc)` | the checks on an already parsed document |
| `print(doc, { indent?, onLine? })` | canonical text; `onLine(node, line)` maps output lines back to statements and steps |
| `lex(text)` | `{ tokens, errors }`, with line, column and offsets |
| `walkStmts(list, fn)` | visit every statement, including nested ones |
| `stripPositions(node)` | remove `pos` from a tree, to compare two trees |
| `FPC_VERSION`, `FPC_KEYWORDS`, `FPC_FUNCTIONS`, `FPC_OPERATORS`, `FPC_CONSTRUCTS` | the language's tables: the single source for editors and docs |
| `FPC_GRAMMAR`, `cheatSheet()` | the EBNF grammar and the one-page cheat sheet, as strings |

A diagnostic is `{ severity: 'error' | 'warning', code, message, line, col, endCol? }`, with 1-based positions.

## For AI assistants

Give the assistant the cheat sheet, ask for FPC, run the answer through `check`, and send the diagnostics back if there are any.
Then ask for changes by step key.

```ts
import { cheatSheet } from '@rabbinatix/flow-pseudocode';
const prompt = `Write the logic as Flow Pseudocode.\n\n${cheatSheet()}`;
```

The same files are in the package: `@rabbinatix/flow-pseudocode/cheat-sheet.md` and `@rabbinatix/flow-pseudocode/grammar.ebnf`.

## What is in this repository

| Path | What |
|---|---|
| `spec/fpc-1.0.md` | the normative specification (CC BY 4.0) |
| `grammar/fpc-1.0.ebnf`, `grammar/cheat-sheet.md` | generated from the code: `npm run generate` |
| `src/` | the reference implementation (MIT): `lexer`, `parser`, `validator`, `printer`, `ast`, `constructs`, `grammar` |
| `src/cli/` | the `rfpc` command (Node only; the library never imports it) |
| `examples/valid`, `examples/invalid` | the test corpus: every valid file parses and round-trips; each invalid file starts with `-- expect: line:col code` |
| `test/` | the tests |

```sh
npm install
npm run check   # typecheck, tests, build
```

## Contributing

Issues and pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md) for the code map, how to add a test example, and the
checklist for changing the language.

## Versioning

The language is versioned in its first line (`FPC 1.0`) and the package follows it: `1.x` packages read and write FPC 1.x.
A change to the grammar is a spec change first (`spec/fpc-1.0.md`), with its test examples.

## Licence

- The **specification** (`spec/`, `grammar/`) is [CC BY 4.0](LICENSE-SPEC): share and adapt it for any purpose, including commercial, with credit.
- The **code** (`src/`) is [MIT](LICENSE).

Flow Pseudocode is the text form of logic in [Rabbinatix](https://rabbinatix.com), a living map of how your software works.
It stands on its own: you don't need Rabbinatix to use it.
