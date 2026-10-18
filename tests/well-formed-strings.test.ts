import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// ES2024 String.prototype.isWellFormed / toWellFormed (#313), compared with
// Node.js under GC stress.
const programs: Record<string, string> = {
    "well-formed strings are unchanged": `
const list=["","abc","h\\u00e9llo \\u4e2d\\u6587","\\uD83D\\uDE00","a\\uD83D\\uDE00b\\uD800\\uDC00","\\uDBFF\\uDFFF"];
for(const s of list){const w=s.toWellFormed();console.log(s.isWellFormed(),w===s,w.length,w.charCodeAt(0));}`,
    "lone surrogates": `
const list=["\\uD800","a\\uD800","\\uD800a","a\\uD800b","\\uDC00","\\uDC00a","a\\uDC00b","\\uD800\\uD800\\uDC00","\\uDC00\\uD800","\\uD800\\uD800","\\uDC00\\uDC00","\\uD83D\\uDE00\\uD83D","\\uDE00\\uD83D\\uDE00"];
for(const s of list){const w=s.toWellFormed();console.log(s.isWellFormed(),w.isWellFormed(),w.length,Array.from(w,c=>c.codePointAt(0).toString(16)).join());}`,
    "long strings": `
let s="";for(let i=0;i<40;i++)s+="ab";
const ok=s+"\\uD83D\\uDE00"+s;console.log(ok.length,ok.isWellFormed(),ok.toWellFormed()===ok);
const bad=s+"\\uD800"+s+"\\uDC00"+s;console.log(bad.length,bad.isWellFormed());
const fixed=bad.toWellFormed();console.log(fixed.length,fixed.isWellFormed(),fixed.indexOf("\\uFFFD"),fixed.lastIndexOf("\\uFFFD"),fixed.slice(78,82)===("ab\\uFFFDab"));
let t="\\uD800";for(let i=0;i<8;i++)t+=t;console.log(t.length,t.isWellFormed(),t.toWellFormed()===("\\uFFFD".repeat(256)));`,
    "non-string receivers": `
const f=String.prototype.isWellFormed,g=String.prototype.toWellFormed;
console.log(f.call(123),g.call(123),g.call(true),f.call({toString(){return "x\\uD800";}}),g.call({toString(){return "x\\uD800";}}).charCodeAt(1));
console.log(g.call([1,2]),f.call(new String("a\\uDC00")));
for(const v of [null,undefined,Symbol("s")]){for(const fn of [f,g]){try{fn.call(v);console.log("no throw");}catch(e){console.log(e.constructor.name);}}}
try{f.call({toString(){throw new RangeError("x");}});}catch(e){console.log(e.constructor.name);}`,
    "function properties": `
for(const name of ["isWellFormed","toWellFormed"]){
const fn=String.prototype[name],d=Object.getOwnPropertyDescriptor(String.prototype,name);
console.log(fn.name,fn.length,d.writable,d.enumerable,d.configurable,typeof fn,Object.prototype.hasOwnProperty.call(fn,"prototype"));
try{new fn();}catch(e){console.log(e.constructor.name);}
try{Reflect.construct(String,[],fn);console.log("constructed");}catch(e){console.log(e.constructor.name);}
console.log(Object.keys(String.prototype).includes(name),Function.prototype.toString.call(fn).includes("[native code]"));}`,
};
for (const [name, source] of Object.entries(programs))
    test(`well-formed strings: ${name}`, () => {
        const expected = runOracle(source).stdout;
        const run = runOnHost(source);
        assert.equal(run.error, undefined);
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout, expected);
    });
