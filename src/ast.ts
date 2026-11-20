// Flow Pseudocode (FPC) 1.0 — abstract syntax tree. Spec: spec/fpc-1.0.md
// Pure TypeScript, no dependencies (reference implementation, MIT). JSON-serialisable.

/** 1-based line and column of the first character of a construct. */
export interface Pos { line: number; col: number }

// ---------------------------------------------------------------- types
/** The compact shape syntax as written in an INPUT / OUTPUT header: `string(email)`, `integer`, `{ a: string }`, `T[]`, `T | null`. */
export type FpcType =
  | { t: 'prim'; name: 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'any' | 'object' | 'array'; format?: string }
  | { t: 'enum'; values: (string | number)[] }
  | { t: 'array'; item: FpcType }
  | { t: 'object'; fields: FpcField[] }
  | { t: 'union'; of: FpcType[] };
export interface FpcField { name: string; optional: boolean; type: FpcType }

/** One INPUT / OUTPUT entry. For endpoint logic an OUTPUT name may be an HTTP status (`200`). */
export interface FpcParam { name: string; optional: boolean; type: FpcType; pos?: Pos }

// ---------------------------------------------------------------- expressions
export type FpcBinaryOp = '+' | '-' | '*' | '/' | '%' | '=' | '≠' | '<' | '≤' | '>' | '≥' | 'AND' | 'OR' | 'IN';

export type FpcExpr = { pos?: Pos } & (
  | { k: 'lit'; value: string | number | boolean | null }
  | { k: 'name'; name: string }
  | { k: 'member'; object: FpcExpr; name: string }
  | { k: 'index'; object: FpcExpr; index: FpcExpr }
  | { k: 'object'; fields: { name: string; value: FpcExpr }[] }
  | { k: 'list'; items: FpcExpr[] }
  | { k: 'unary'; op: 'NOT' | '-'; arg: FpcExpr }
  | { k: 'binary'; op: FpcBinaryOp; left: FpcExpr; right: FpcExpr }
  /** `x IS EMPTY`, `x IS NOT NULL` */
  | { k: 'is'; arg: FpcExpr; test: 'EMPTY' | 'NULL'; negated: boolean }
  /** `(IF c THEN a ELSE b)` */
  | { k: 'cond'; test: FpcExpr; then: FpcExpr; else: FpcExpr }
  /** a function from the catalogue: `lower(s)`, `isEmail(s)` */
  | { k: 'call'; fn: string; args: FpcExpr[] }
  /** `CALL <System> <METHOD> <path> [WITH expr]` */
  | { k: 'api'; system: string; method: string; path: string; with?: FpcExpr }
  /** `CALL <System> <operation> [WITH expr]` (database, queue, external service, cache) */
  | { k: 'op'; system: string; operation: string; with?: FpcExpr }
  /** `CALL LOGIC <KEY> [WITH expr]` */
  | { k: 'logic'; key: string; with?: FpcExpr }
);

// ---------------------------------------------------------------- statements
/** `comment`: trailing `-- text` on the statement's first line. */
export type FpcStmt = { pos?: Pos; comment?: string } & (
  | { k: 'comment'; text: string }
  | { k: 'set'; target: FpcExpr; value: FpcExpr }
  | { k: 'if'; branches: { cond: FpcExpr; body: FpcStmt[]; pos?: Pos }[]; else?: FpcStmt[] }
  | { k: 'match'; value: FpcExpr; cases: { values: FpcExpr[]; body: FpcStmt[]; pos?: Pos }[]; else?: FpcStmt[] }
  | { k: 'forEach'; item: string; index?: string; list: FpcExpr; body: FpcStmt[] }
  | { k: 'forRange'; index: string; from: FpcExpr; to: FpcExpr; body: FpcStmt[] }
  | { k: 'repeat'; times: FpcExpr; body: FpcStmt[] }
  | { k: 'while'; cond: FpcExpr; body: FpcStmt[] }
  /** a CALL on its own (result not kept) */
  | { k: 'call'; call: FpcExpr }
  | { k: 'emit'; system: string; event: string; with?: FpcExpr }
  | { k: 'try'; body: FpcStmt[]; catchName?: string; catch?: FpcStmt[]; finally?: FpcStmt[] }
  | { k: 'retry'; times: FpcExpr; backoff?: FpcExpr; as?: string; body: FpcStmt[]; success?: FpcStmt[]; failureName?: string; failure?: FpcStmt[] }
  | { k: 'parallel'; branches: FpcStmt[][] }
  | { k: 'wait'; duration: FpcExpr; unit: 'ms' | 's' | 'm' | 'h' }
  /** `RETURN [expr]`, or `RETURN status WITH body [HEADERS expr]` for endpoint logic */
  | { k: 'return'; value?: FpcExpr; status?: number; headers?: FpcExpr }
  /** `FAIL 401 "Invalid credentials"`, `FAIL UPSTREAM_ERROR "User Service failed"` */
  | { k: 'fail'; status: number | string; message: FpcExpr }
  | { k: 'log'; value: FpcExpr }
  | { k: 'break' }
  | { k: 'continue' }
);

/** A `STEP key "title" [IN system]` section (top level only). */
export interface FpcStep { key: string; title?: string; system?: string; body: FpcStmt[]; pos?: Pos; comment?: string }

/** How logic starts: `ON REQUEST POST /path`, `ON EVENT "name"`, `ON SCHEDULE "cron"`, `ON CALL` (a reusable function). */
export type FpcTrigger =
  | { k: 'request'; method: string; path: string; pos?: Pos }
  | { k: 'event'; name: string; pos?: Pos }
  | { k: 'schedule'; spec: string; pos?: Pos }
  | { k: 'call'; pos?: Pos };

export interface FpcDocument {
  /** `FPC 1.0` */
  fpc: string;
  kind: 'FLOW' | 'LOGIC';
  name: string;
  key?: string;
  version?: string;
  revision?: number;
  /** comment lines between the header and the first statement */
  headerComments: string[];
  system?: string;
  trigger?: FpcTrigger;
  inputs: FpcParam[];
  outputs: FpcParam[];
  /** statements before the first STEP */
  body: FpcStmt[];
  steps: FpcStep[];
  pos?: Pos;
}

export type Severity = 'error' | 'warning';
export interface Diagnostic { severity: Severity; code: string; message: string; line: number; col: number; endCol?: number }

/** Removes `pos` everywhere (to compare two trees structurally). */
export function stripPositions<T>(node: T): T {
  if (Array.isArray(node)) return node.map(stripPositions) as T;
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'pos' || v === undefined) continue;
      out[k] = stripPositions(v);
    }
    return out as T;
  }
  return node;
}
