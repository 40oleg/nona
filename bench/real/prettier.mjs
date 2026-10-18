// Prettier 3 (the standalone build with the babel and estree plugins) formats
// a generated 2 000-line JavaScript module S(3) times. Run from bench/real
// after `node bench/real/fetch.mjs`.
import * as prettier from "./vendor/prettier/standalone.mjs";
import * as babel from "./vendor/prettier/plugins/babel.mjs";
import * as estree from "./vendor/prettier/plugins/estree.mjs";
const SCALE = Number(process.env.SCALE) || 1;
const S = (n) => Math.max(1, Math.round(n * SCALE));

let source = "";
for (let i = 0; i < 200; i++)
    source += `export function f${i}(a,b,{c,d=${i}},...rest){const x=a+b*${i};if(x>10){return rest.map(r=>r*c).filter(Boolean)}else{for(let j=0;j<d;j++){a+=j}}return {a,b,c,d,x,s:'str${i}'+"q",arr:[1,2,3,[4,5]],fn:async()=>await g(a)}}\nclass C${i} extends Base{#p=1;static s=${i};get v(){return this.#p}m(q){return q??this.v}}\n`;
const options = { parser: "babel", plugins: [babel, estree] };

let t = performance.now();
let out = await prettier.format(source, options);
const tFirst = performance.now() - t;
t = performance.now();
for (let i = 0; i < S(3); i++) out = await prettier.format(source, options);
const tFormat = performance.now() - t;
console.log(
    JSON.stringify({ first: tFirst, format3: tFormat, check: out.length }),
);
