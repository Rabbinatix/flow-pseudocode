// Flow Pseudocode (FPC) 1.0 — reference implementation. Spec (CC BY 4.0): spec/fpc-1.0.md
// Pure TypeScript with no dependencies: ast, lexer, parser, printer, validator and the constructs table.
//
// MIT License · Copyright (c) 2026 Rabbinatix
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice
// and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS
// PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
export * from './ast';
export * from './constructs';
export { lex } from './lexer';
export type { Token, TokKind } from './lexer';
export { parse, parseExpression } from './parser';
export type { ParseResult } from './parser';
export { print, printExpr, printType, quote } from './printer';
export type { PrintOptions } from './printer';
export { check, format, validate, walkStmts } from './validator';
export type { CheckResult } from './validator';
export { FPC_GRAMMAR, cheatSheet } from './grammar';
