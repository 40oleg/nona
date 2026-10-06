import {requireHostTarget} from '../src/target.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compile,hostTarget,type CompileOptions,type Target} from '../src/compiler.js';

// The compiler links the RegExp engine, its Unicode property tables and the
// normalization tables only when the program's sources can reach them (#62).

function image(source:string,options:Partial<CompileOptions>={},target:Target=hostTarget??requireHostTarget()):Uint8Array {
 const result=compile(source,{fileName:options.module?'/app.mjs':'/app.js',target,...options});
 assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));
 return result.image;
}

function run(source:string,options:Partial<CompileOptions>={}):string {
 const directory=mkdtempSync(join(tmpdir(),'nona-link-'));
 try{
  const executable=join(directory,hostTarget==='win32-x64'?'app.exe':'app');
  writeFileSync(executable,image(source,options));chmodSync(executable,0o755);
  const result=spawnSync(executable,[],{encoding:'utf8',timeout:60_000,windowsHide:true});
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stderr);
  return result.stdout;
 }finally{rmSync(directory,{recursive:true,force:true});}
}

test('programs that use RegExp and normalization behave as before',()=>{
 const source=String.raw`
console.log("a1b22c333".replace(/\d+/g, n => "[" + n.length + "]"));
console.log(/^(?<y>\d{4})-(?<m>\d\d)$/.exec("2026-10").groups.m, /ÄB/i.test("äb"));
console.log("héllo wörld 42".match(new RegExp("\\p{L}+", "gu")).join("|"));
console.log("x-y-z".search("z"), "Привет мир".match(/\p{Script=Cyrillic}+/gu).length);
console.log("é".normalize("NFC").length, ["b", "a", "ä"].sort((x, y) => x.localeCompare(y)).join(""));
`;
 const expected='a[1]b[2]c[3]\n10 true\nhéllo|wörld\n4 2\n1 abä\n';
 assert.equal(run(source),expected);
 assert.equal(run(source,{fullRuntime:true}),expected);
});

test('usage in imported modules and compile-time eval sources links the engine',()=>{
 const modules:Record<string,string>={'/app.mjs':'import {digits} from "./lib.mjs"; console.log(digits("a1b2"));','/lib.mjs':'export const digits = s => s.replace(/\\D/g, "");'};
 const moduleHost={resolve:(specifier:string)=>'/'+specifier.replace(/^\.\//,''),read:(path:string)=>modules[path]};
 assert.equal(run(modules['/app.mjs']!,{module:true,moduleHost}),'12\n');
 assert.equal(run('console.log(eval("/b+/.exec(\'abbc\')[0]"));'),'bb\n');
});

test('reaching an omitted part throws an Error that names --full-runtime',()=>{
 const regexp='const name = ["Reg", "Exp"].join("");\ntry { console.log(new globalThis[name]("a+").test("caab")); } catch (e) { console.log(e instanceof Error, e.message.includes("engine"), e.message.includes("--full-runtime")); }';
 // The check itself must not spell RegExp, or the engine would be linked.
 assert.equal(run(regexp),'true true true\n');
 assert.equal(run(regexp,{fullRuntime:true}),'true\n');
 const properties='const p = String.fromCharCode(92) + "p{L}";\ntry { console.log(new (/x/.constructor)(p, "u").test("é")); } catch (e) { console.log(e.message.includes("Unicode property tables")); }';
 assert.equal(run(properties),'true\n');
 assert.equal(run(properties,{fullRuntime:true}),'true\n');
 const normalization='const m = ["norm", "alize"].join("");\ntry { console.log("e\\u0301"[m]().length); } catch (e) { console.log(e.message.includes("normalization tables")); }';
 assert.equal(run(normalization),'true\n');
 assert.equal(run(normalization,{fullRuntime:true}),'1\n');
});

test('a literal with a non-ASCII group name links the identifier tables',()=>{
 assert.equal(run('console.log(/(?<𝒜>b)/u.exec("abc").groups.𝒜, /(?<\\u{72f8}>x)\\k<狸>/u.test("xx"));'),'b true\n');
});

test('omitted prelude globals and host primitives remain absent',()=>{
 // Without the preludes the globals are absent and their host primitives are not installed.
 assert.equal(run('console.log(typeof globalThis[["Pro","xy"].join("")], ["__nonaHostNow", "__nonaUtf8Encode", "__nonaHost_GetCommandLineW"].map(k => typeof globalThis[k]).join());'),'undefined undefined,undefined,undefined\n');
});

test('programs using each optional prelude behave as before',()=>{
 const source=String.raw`
const p = new Proxy({}, {get: (t, k) => k + "!"});
console.log(p.x, new TextDecoder().decode(new TextEncoder().encode("é")), typeof process.argv[0]);
setTimeout(() => console.log("timer"), 1);
console.log([1, 2, 3].at(-1), [3, 1, 2].findLast(x => x < 3), Object.hasOwn({a: 1}, "a"));
console.log(escape("a b"), "abc".substr(1), [3, 1, 2].sort().join(""), Object.isFrozen(Object.freeze({})));
const o = {}; o.__defineGetter__("g", () => 7); console.log(o.g, typeof o.__lookupGetter__("g"));
Promise.any([Promise.reject(1)]).catch(e => console.log(e instanceof AggregateError));
`;
 const expected='x! é string\n3 2 true\na%20b bc 123 true\n7 function\ntrue\ntimer\n';
 assert.equal(run(source),expected);
 assert.equal(run(source,{fullRuntime:true}),expected);
});
