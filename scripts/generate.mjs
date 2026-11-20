// Writes the files people download from the built code, so they never drift from it:
//   grammar/fpc-1.0.ebnf   the EBNF grammar (FPC_GRAMMAR)
//   grammar/cheat-sheet.md the one-page cheat sheet an AI assistant can be given (cheatSheet())
// A test fails when they are out of step. Run: npm run generate
import { writeFileSync } from 'node:fs';
import { FPC_GRAMMAR, cheatSheet } from '../dist/index.js';

writeFileSync(new URL('../grammar/fpc-1.0.ebnf', import.meta.url), FPC_GRAMMAR);
writeFileSync(new URL('../grammar/cheat-sheet.md', import.meta.url), cheatSheet());
console.log('grammar/fpc-1.0.ebnf and grammar/cheat-sheet.md written');
