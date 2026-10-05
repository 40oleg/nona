// Review aid: token skeletons ignore spelling of local names and literal values.
// A matching skeleton is a candidate for human review, not proof of a duplicate.
import {readFileSync, readdirSync} from 'node:fs';
import {lex} from '../dist/src/frontend/lexer.js';
const root = new URL('../programs/', import.meta.url);
const retained = new Set(('break case catch continue debugger default delete do else finally for function if in instanceof new return switch this throw try typeof var void while with class const enum export extends import super yield null true false let async await of get set static console log JSON Math Object Array Map Set Promise Reflect Symbol Number String Boolean Int32Array Uint8Array RegExp Error').split(' '));
const groups = new Map();
for (const file of readdirSync(root, {recursive: true}).map(String).filter(file => file.endsWith('.js')).sort()) {
  let tokens;
  try { tokens = lex(readFileSync(new URL(file, root), 'utf8')); }
  catch (error) { throw new Error(`${file}: ${error.message}`, {cause: error}); }
  const signature = tokens.map(token => {
    if (['number', 'string', 'regexp', 'templateHead', 'templateMiddle', 'templateTail', 'templateNoSub'].includes(token.kind)) return token.kind;
    if (token.kind === 'word' || token.kind === 'private') return retained.has(token.text) ? token.text : 'name';
    return token.text;
  }).join(' ');
  const group = groups.get(signature) ?? [];
  group.push(file.replaceAll('\\', '/')); groups.set(signature, group);
}
const candidates = [...groups.values()].filter(group => group.length > 1);
console.log(JSON.stringify({programs: [...groups.values()].reduce((sum, group) => sum + group.length, 0), candidateGroups: candidates}, null, 2));
