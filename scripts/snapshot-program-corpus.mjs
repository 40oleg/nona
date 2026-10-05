// This tool executes existing authored sources and writes data, never program code.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {runOracle} from '../dist/tests/helpers/oracle.js';
const root = new URL('../programs/', import.meta.url);
const original = [
  ['Insertion sorting with duplicate and negative values', ['arrays', 'nested loops', 'short circuiting']],
  ['Binary search across present, absent and empty inputs', ['functions', 'loops', 'arithmetic']],
  ['Prime sieve with sparse flags and aggregate statistics', ['sparse arrays', 'nested loops', 'continue']],
  ['Independent account closures and captured loop bindings', ['private fields', 'escaped arrows', 'lexical bindings']],
  ['Recursive expression parser with precedence and unary operations', ['closures', 'mutual recursion', 'string indexing']],
  ['Recursive tree traversal in preorder and postorder', ['generators', 'yield delegation', 'destructuring']],
  ['Shortest path through a cyclic graph and unreachable destinations', ['Map', 'Set', 'nullish coalescing']],
  ['Matrix multiplication using typed array rows and checksums', ['typed arrays', 'nested arrays', 'loops']],
  ['Run length encoding with JSON record round trips', ['JSON', 'destructuring', 'string scanning']],
  ['Async resource cleanup through success and caught failure', ['async await', 'exceptions', 'finally']],
];
const initialFiles = readdirSync(root).filter(file => /^\d{3}-.*\.js$/.test(file)).sort();
assert.equal(initialFiles.length, 10);
const cases = initialFiles.map((file, index) => ({id: index + 1, file, purpose: original[index][0], features: original[index][1]}));
for (const category of ['algorithms', 'collections', 'text', 'async', 'objects', 'language']) {
  const items = JSON.parse(readFileSync(new URL(`${category}/cases.json`, root), 'utf8'));
  assert.equal(items.length, 165, `${category}: expected 165 authored programs`);
  for (const item of items) {
    assert.ok(item.file.startsWith(`${category}/`));
    cases.push(item);
  }
}
cases.sort((a, b) => a.id - b.id);
assert.deepEqual(cases.map(item => item.id), Array.from({length: 1000}, (_, index) => index + 1));
assert.equal(new Set(cases.map(item => item.file)).size, 1000);
const manifest = cases.map(item => {
  const source = readFileSync(new URL(item.file, root), 'utf8');
  const {stdout} = runOracle(source);
  assert.ok(stdout.length > 0, `${item.file}: missing observable output`);
  return {...item, sha256: createHash('sha256').update(source).digest('hex'), stdout};
});
writeFileSync(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Recorded Node.js reference output for ${manifest.length} existing authored programs.`);
