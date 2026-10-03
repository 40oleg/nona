// acorn parses its own source (dist/acorn.mjs, about 230 KB) SCALE × 10
// times. Run from bench/real after `node bench/real/fetch.mjs`.
import {parse} from './vendor/acorn/dist/acorn.mjs';
import {readFileSync} from 'node:fs';
const SCALE = Number(process.env.SCALE) || 1; const S = n => Math.max(1, Math.round(n * SCALE));

const source = readFileSync('vendor/acorn/dist/acorn.mjs', 'utf8');
const options = {ecmaVersion: 2022, sourceType: 'module', locations: true};

// Counts the nodes of a tree, a checksum that the parse was complete.
function count(node) {
  let n = 1;
  for (const key in node) {
    const value = node[key];
    if (Array.isArray(value)) { for (const item of value) if (item && typeof item.type === 'string') n += count(item); }
    else if (value && typeof value.type === 'string' && key !== 'loc') n += count(value);
  }
  return n;
}

let t = performance.now();
const nodes = count(parse(source, options));
const tFirst = performance.now() - t;
t = performance.now();
for (let i = 0; i < S(10); i++) parse(source, options);
const tParse = performance.now() - t;
console.log(JSON.stringify({first: tFirst, parse10: tParse, check: nodes}));
