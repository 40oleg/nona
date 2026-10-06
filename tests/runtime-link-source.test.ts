import {requireHostTarget} from '../src/target.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile,hostTarget,type CompileOptions,type Target} from '../src/compiler.js';
import {collectSourceUsage,lex} from '../src/frontend/lexer.js';
import {preludeSet} from '../src/runtime/link.js';

function image(source:string,options:Partial<CompileOptions>={},target:Target=hostTarget??requireHostTarget()):Uint8Array {
 const result=compile(source,{fileName:options.module?'/app.mjs':'/app.js',target,...options});
 assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));
 return result.image;
}

const usage=(...sources:string[])=>collectSourceUsage(()=>sources.forEach(source=>lex(source))).usage;

test('source usage: what reaches the RegExp engine and the Unicode tables',()=>{
 const none={regexp:false,unicodeProperties:false,unicodeNormalization:false,preludes:preludeSet(false)};
 assert.deepEqual(usage('console.log("hi".split(",").join("-"), "a".replace("a", "b"))'),none);
 assert.deepEqual(usage('/a+/g.test(s)'),{...none,regexp:true});
 assert.deepEqual(usage('/\\p{L}/u.test(s)'),{...none,regexp:true,unicodeProperties:true});
 // Non-ASCII or escaped group names are checked against ID_Start/ID_Continue.
 for(const source of ['/(?<𝒜>b)/u','/(?<\\u{72f8}>x)/u','/(?<\\u0061>x)/','/\\k<ñ>(?<ñ>x)/'])
  assert.deepEqual(usage(source),{...none,regexp:true,unicodeProperties:true},source);
 for(const source of ['/(?<year>\\d+)\\k<year>/','/(?<=é)x/','/(?<!é)x/'])
  assert.deepEqual(usage(source),{...none,regexp:true},source);
 for(const source of ['new RegExp(p)','s.match(p)','s.matchAll(p)','s.search(p)','self["RegExp"]','s[`match`](p)','let \\u0052egExp = 1'])
  assert.deepEqual(usage(source),{...none,regexp:true,unicodeProperties:true},source);
 for(const source of ['s.normalize()','a.localeCompare(b)','s["normalize"]()'])
  assert.deepEqual(usage(source),{...none,unicodeNormalization:true},source);
 // Every source lexed inside one collection counts; nested collections report to the outer one.
 const outer=collectSourceUsage(()=>{lex('1');collectSourceUsage(()=>lex('/x/'));});
 assert.equal(outer.usage.regexp,true);
});

test('a program without regular expressions is several megabytes smaller',()=>{
 for(const target of ['win32-x64','linux-x64'] as const){
  const trimmed=image('console.log("hi");',{},target).length,full=image('console.log("hi");',{fullRuntime:true},target).length;
  assert.ok(full-trimmed>3_000_000,`${target}: ${trimmed} vs ${full} bytes`);
  // A literal without \p links the engine but not the property tables.
  const engine=image('console.log(/a/.test("a"));',{},target).length;
  assert.ok(engine>trimmed&&engine<full-1_000_000,`${target}: ${engine}`);
 }
});

test('source usage: optional preludes follow the names a program uses',()=>{
 const linked=(...sources:string[])=>Object.entries(usage(...sources).preludes).filter(([,on])=>on).map(([name])=>name).sort().join(',');
 assert.equal(linked('console.log("hi")'),'');
 assert.equal(linked('new Proxy({}, {})'),'proxy');
 assert.equal(linked('Buffer.alloc(1)'),'buffer');
 assert.equal(linked('self["TextEncoder"]'),'encoding');
 assert.equal(linked('process.exitCode = 1'),'process');
 assert.equal(linked('new EventTarget()'),'events');
 assert.equal(linked('new AsyncResource("task")'),'asyncHooks');
 assert.equal(linked('setTimeout(f, 1)','clearInterval(id)'),'timers');
 assert.equal(linked('a.at(-1)','Object.hasOwn(o, "x")'),'es2021');
 assert.equal(linked('s.substr(1)'),'annexB');
 assert.equal(linked('s.anchor("x")','d.toGMTString()'),'annexB');
 assert.equal(linked('performance.now()'),'timers');
 assert.equal(linked('Object.keys(globalThis)'),'timers');
 assert.equal(linked('a.sort()'),'arraySort');
 assert.equal(linked('Object.freeze(o)'),'objectIntegrity');
 assert.equal(linked('o.__lookupGetter__("x")'),'objectAnnexB');
 // Long names are found inside strings; short ones only as a whole string.
 assert.equal(linked('const code = "x = setTimeout(g)"'),'timers');
 assert.equal(linked('const word = "data format"'),'');
 assert.equal(linked('const key = "at"'),'es2021');
 // Enumerating built-ins could observe a missing method: everything is linked.
 assert.equal(linked('Object.getOwnPropertyNames(Array.prototype)'),'annexB,arraySort,asyncHooks,buffer,encoding,es2021,events,objectAnnexB,objectIntegrity,process,proxy,timers');
 assert.equal(linked('Reflect.ownKeys(globalThis)'),'annexB,arraySort,asyncHooks,buffer,encoding,es2021,events,objectAnnexB,objectIntegrity,process,proxy,timers');
});

test('unrelated programs omit event and async-context preludes',()=>{
 for(const source of ['console.log("hi")','new Proxy({}, {})','process.exitCode = 1','setTimeout(f, 1)']){
  const preludes=usage(source).preludes;
  assert.equal(preludes.events,false,source);assert.equal(preludes.asyncHooks,false,source);
 }
});

test('a program links only the preludes it names',()=>{
 for(const target of ['win32-x64','linux-x64'] as const){
  const trimmed=image('console.log("hi");',{},target).length;
  const all=image('console.log(Reflect.ownKeys({}).length);',{},target).length;
  assert.ok(all-trimmed>600_000,`${target}: ${trimmed} vs ${all} bytes`);
 }
});
