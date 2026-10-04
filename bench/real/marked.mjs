// marked renders a generated Markdown document (200 sections with headings,
// emphasis, code spans, links, lists, fenced code and quotes) SCALE × 5
// times. Run from bench/real after `node bench/real/fetch.mjs`.
import {marked} from './vendor/marked/lib/marked.esm.js';
const SCALE = Number(process.env.SCALE) || 1; const S = n => Math.max(1, Math.round(n * SCALE));

let doc = '';
for (let i = 0; i < 200; i++)
  doc += '# Title ' + i + '\n\nSome *emphasis*, **strong**, `code` and a [link](http://x.y/' + i + ').\n\n- item one\n- item two\n\n```js\nconst x = ' + i + ';\n```\n\n> quote ' + i + '\n\n';

let t = performance.now();
let html = marked.parse(doc);
const tFirst = performance.now() - t;
t = performance.now();
for (let i = 0; i < S(5); i++) html = marked.parse(doc);
const tRender = performance.now() - t;
console.log(JSON.stringify({first: tFirst, render5: tRender, check: html.length}));
