// FPC 1.0 grammar (EBNF, ISO 14977 style) and the one-page cheat sheet. Both are generated here so the spec, the docs
// and the downloads (grammar/*, written by `npm run generate`) share one source. Keep FPC_GRAMMAR in sync with parser.ts
// (the tests parse every example).
import { FPC_CONSTRUCTS, FPC_FUNCTIONS, FPC_OPERATORS, FPC_VERSION } from './constructs';

export const FPC_GRAMMAR = `(* FPC ${FPC_VERSION}. Keywords are UPPER CASE and reserved only in upper case.
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
string      = '"', { character | "\\", escape }, '"' ;
number      = digit, { digit }, [ ".", digit, { digit } ], [ ( "e" | "E" ), [ "+" | "-" ], digit, { digit } ] ;
comment     = "--", { character } ;
(* ASCII alternatives: "<-" for "←", "!=" or "<>" for "≠", "<=" for "≤", ">=" for "≥", "==" for "=" *)
`;

/** The one-page cheat sheet (Markdown): paste it into an AI chat together with your code or pseudocode. */
export function cheatSheet(): string {
  const out: string[] = [];
  out.push(`# FPC ${FPC_VERSION} cheat sheet — Flow Pseudocode`, '');
  out.push('Structured-keyword pseudocode with a typed header, CALL lines for APIs and STEP markers with keys.');
  out.push('Keywords are UPPER CASE. Blocks end with END. Indent with two spaces. Comments start with `--`.', '');
  out.push('```fpc', 'FPC 1.0', 'LOGIC "Sign in" KEY LOGIC-AUTH-LOGIN-001 VERSION 1.3.0', 'ON REQUEST POST /api/v2/login',
    'INPUT request: { body: { email: string(email), password: string } }', '',
    'IF request.body.email IS EMPTY THEN', '  FAIL 400 "email is required"', 'END IF',
    'SET user ← CALL UserService GET /internal/users/by-email WITH { query: { email: request.body.email } }',
    'MATCH user.status', '  CASE 200', '    RETURN 200 WITH { accessToken: format("TOKEN-{id}", { id: user.body.id }) }',
    '  ELSE', '    FAIL 401 "Invalid credentials"', 'END MATCH', '```', '');
  let group = '';
  for (const c of FPC_CONSTRUCTS) {
    if (c.group !== group) {
      group = c.group;
      out.push(`## ${group}`, '');
    }
    out.push(`- **${c.title}** — \`${c.syntax.split('\n').join(' ⏎ ')}\`${c.summary ? `  \n  ${c.summary}` : ''}`);
  }
  out.push('', '## Operators', '');
  out.push(FPC_OPERATORS.map((o) => `\`${o.op}\`${o.ascii ? ` (\`${o.ascii}\`)` : ''} ${o.meaning}`).join(' · '));
  out.push('', '## Functions', '');
  let fg = '';
  for (const f of FPC_FUNCTIONS) {
    if (f.group !== fg) {
      fg = f.group;
      out.push('', `**${fg}:** `);
    }
    out[out.length - 1] += `\`${f.name}(${f.params})\` `;
  }
  out.push('', '## Types', '', '`string`, `string(email)`, `number`, `integer`, `boolean`, `null`, `any`, `enum(a, b)`, `{ name: string, age?: integer }`, `string[]`, `T | null`.', '');
  out.push('## Rules for tools and AI', '');
  out.push('- Start with `FPC 1.0`, then `FLOW "name"` or `LOGIC "name"`. Keep KEY and STEP keys exactly as given; leave them out for new things.');
  out.push('- Only use the statements and functions listed here. Assign with `←` (or `<-`); compare with `=`.');
  out.push('- Call APIs as `CALL System METHOD /path WITH { … }`; other logic as `CALL LOGIC KEY WITH { … }`.');
  out.push('- End every IF, MATCH, FOR, REPEAT, WHILE, TRY, RETRY and PARALLEL with its END line.', '');
  out.push('Spec: CC BY 4.0 · Reference parser: MIT · Guide: https://rabbinatix.com/guide/pseudocode');
  return out.join('\n') + '\n';
}
