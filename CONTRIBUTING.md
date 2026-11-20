# Contributing to Flow Pseudocode

Thanks for helping. This repo holds the **specification** of Flow Pseudocode (FPC) and its **reference implementation**
(a lexer, parser, validator and printer in plain TypeScript, no dependencies). Bug reports, fixes, new examples, doc
improvements and grammar proposals are all welcome.

## Set up

```sh
git clone https://github.com/Rabbinatix/flow-pseudocode.git
cd flow-pseudocode
npm install
npm run check      # typecheck, build, tests; run it before every pull request (the CLI test needs the build)
npm test           # just the tests (vitest); `npx vitest` keeps them running while you edit
```

Node 18 or newer. Nothing needs a network after `npm install`.

## The code map

Text goes through a pipeline, one file per stage:

```
text ──lexer.ts──▶ tokens ──parser.ts──▶ AST (ast.ts) ──validator.ts──▶ diagnostics
                                              │
                                              └──printer.ts──▶ canonical text
```

| File | What it does |
|---|---|
| `src/lexer.ts` | text → tokens with line and column; turns `<-` into `←` and so on. Never throws |
| `src/parser.ts` | tokens → AST. Hand-written recursive descent that **recovers at the next line**, so one mistake doesn't hide the rest. Start with the comment at the top of the file |
| `src/ast.ts` | the AST types (`FpcDocument`, `FpcStmt`, `FpcExpr`, `FpcType`), `Diagnostic`, `stripPositions` |
| `src/validator.ts` | the checks a grammar can't express: unknown functions, argument counts, key and version formats, names used before they are set. `check(text)` = parse + validate |
| `src/printer.ts` | AST → canonical text. `print(parse(x))` is the canonical form of `x` |
| `src/constructs.ts` | **the one table** of keywords, functions and constructs. The lexer, validator, cheat sheet and tests all read it |
| `src/grammar.ts` | the EBNF grammar text and the cheat sheet, as strings |
| `src/index.ts` | what the package exports (never the CLI: the library stays free of Node) |
| `src/cli/run.ts` | the `rfpc` command: arguments in, exit code out (0 good, 1 problems, 2 couldn't run). Everything goes through an `Io` object, so tests run it against a temp folder |
| `src/cli/args.ts`, `files.ts`, `report.ts` | reading the options; finding the `*.fpc` files; printing problems as text, JSON or GitHub annotations |
| `src/cli/io.ts`, `bin.ts` | the real disk and terminal, and the tiny executable around `run` |
| `spec/fpc-1.0.md` | the normative specification |
| `grammar/` | generated: `npm run generate` rewrites it from the code; a test fails when it is stale |
| `examples/valid/`, `examples/invalid/` | the test corpus (see below) |
| `test/` | the tests |

## The corpus

- Every file in `examples/valid/*.fpc` must parse with no errors and print back to a form that parses to the same tree.
- Every file in `examples/invalid/*.fpc` starts with a line `-- expect: <line>:<col> <code>` and must be rejected with
  exactly that diagnostic. The code is the validator's or parser's stable code (`unknown-function`, `unclosed-block`, …).

**Fixing a bug?** Add a file to `examples/invalid/` (or `valid/`) that fails first, then fix it.

## Changing the language

FPC is a published language (`FPC 1.0` is the first line of every document), so a change to what is valid is a change to
the spec first. Read spec § 12 (Versioning): minor versions only **add**; a change of meaning is a major version.
Open an issue to discuss it before you write code.

When a change is agreed, one pull request does all of these. The tests catch most omissions (a keyword with no construct, a stale
`grammar/`, an example that doesn't parse), but not all, so go through the list:

1. **Spec:** `spec/fpc-1.0.md` (the section, and the Changelog at the end).
2. **Table:** a new keyword goes in `FPC_KEYWORDS`, a new function in `FPC_FUNCTIONS` (name, params, returns, arity), a new
   statement in `FPC_CONSTRUCTS` (syntax and an example that parses) in `src/constructs.ts`.
3. **Grammar:** update `FPC_GRAMMAR` in `src/grammar.ts` to match the parser.
4. **Parser:** read it in `src/parser.ts` (`statement()` picks a construct by its first keyword; expressions are in the
   precedence ladder above `expr()`), and the AST type in `src/ast.ts`.
5. **Printer:** print it in `src/printer.ts`, in canonical form.
6. **Validator:** any rule that needs more than the grammar goes in `src/validator.ts`.
7. **Examples:** a valid example, and an invalid one for each new error code.
8. **Generated files:** `npm run generate`, and commit `grammar/`.
9. **Changelog:** a line in `CHANGELOG.md`.
10. `npm run check` passes.

A new keyword is reserved only in UPPER CASE (`set` and `match` stay ordinary names), so existing documents keep working.

## Code style

- Plain TypeScript, **no dependencies** (not even dev-only ones in `src/`): that is a promise of this package.
- 2 spaces, single quotes, semicolons, LF line endings (`.editorconfig` has it). Keep lines to about 140 characters;
  the data tables in `constructs.ts` are the exception.
- Comment the *why*, not the *what*; keep the comment at the top of a file true when you change the file.
- Errors are for the person who wrote the FPC: say what is wrong, where, and what to write instead
  (`Use ← (or <-) to set a value; = compares`, `Unknown function isEmial(): did you mean isEmail()?`).
- Don't throw from `parse` or `check` on bad input: report a diagnostic. Hostile input (very deep nesting, huge files) must
  not crash or hang.

## Pull requests

Keep them small and about one thing. Say what changed and why, link the issue, and tick the checklist in the template.
By contributing you agree that your code is released under the MIT licence and your changes to the spec under CC BY 4.0
(see `LICENSE` and `LICENSE-SPEC`).

See also the [Code of Conduct](CODE_OF_CONDUCT.md).
