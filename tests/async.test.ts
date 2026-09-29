import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runOnHost} from './helpers/host.js';
import {compile} from '../src/compiler.js';

const cases:[string,string][]=[
 [
  "await ordering matches job queue",
  "async function f(x){ console.log('in f', x); var y = await x; console.log('after await', y); return y*2; }\nvar p=f(21); console.log('sync end', typeof p, p instanceof Promise);\np.then(v=>console.log('resolved', v));\nasync function g(){ throw new Error('boom'); }\ng().catch(e=>console.log('caught', e.message));\nconst h = async (a) => { try { await Promise.reject(7); } catch(e){ return e+a; } };\nh(1).then(v=>console.log('arrow', v));\nvar o={ async m(){ return this.v + await 1; }, v: 10 };\no.m().then(v=>console.log('method', v));\nPromise.resolve().then(()=>console.log('tick1')).then(()=>console.log('tick2')).then(()=>console.log('tick3'));\n(async()=>{ console.log('A'); await null; console.log('B'); await null; console.log('C'); })();\nconsole.log(Object.prototype.toString.call(f), Object.getPrototypeOf(f)===Function.prototype, 'prototype' in f);\nasync function* ag(){ yield 1; var x = yield 2; console.log('got', x); return 3; }\nvar it=ag(); it.next().then(r=>console.log(JSON.stringify(r))); it.next().then(r=>console.log(JSON.stringify(r))); it.next('X').then(r=>console.log(JSON.stringify(r))); it.next().then(r=>console.log(JSON.stringify(r)));\nconsole.log(Object.prototype.toString.call(it), typeof it[Symbol.asyncIterator]);\n"
 ],
 [
  "for await over sync, async and closing iterators",
  "async function main(){\n  for await (const x of [1, Promise.resolve(2), 3]) console.log('sync-src', x);\n  async function* gen(){ try { yield 'a'; yield 'b'; yield 'c'; } finally { console.log('gen finally'); } }\n  for await (const v of gen()) { console.log('async-src', v); if (v==='b') break; }\n  var log=[];\n  var it={ [Symbol.asyncIterator](){ return { i:0, next(){ log.push('next'); return Promise.resolve({value:this.i++, done:this.i>3}); }, return(){ log.push('return'); return {}; } }; } };\n  try { for await (const v of it) { log.push(v); if (v===1) throw new Error('stop'); } } catch(e){ log.push(e.message); }\n  console.log(log.join());\n  label: for await (const v of gen()) { for (const w of [1]) { continue label; } }\n  return 'done';\n}\nmain().then(v=>console.log(v), e=>console.log('err', e));\n"
 ],
 [
  "async generator yield* delegation and requests",
  "async function* inner(){ try { var x = yield 1; console.log('inner got', x); yield 2; return 'ret'; } finally { console.log('inner finally'); } }\nasync function* outer(){ var r = yield* inner(); console.log('yield* result', r); yield* [10, 20]; }\nasync function main(){\n  var it=outer();\n  console.log(JSON.stringify(await it.next()));\n  console.log(JSON.stringify(await it.next('X')));\n  console.log(JSON.stringify(await it.next()));\n  console.log(JSON.stringify(await it.next()));\n  console.log(JSON.stringify(await it.next()));\n  var it2=outer(); await it2.next(); console.log(JSON.stringify(await it2.return('early')));\n  var it3=outer(); await it3.next(); try{ await it3.throw(new Error('t')); }catch(e){ console.log('thrown', e.message); }\n  async function* g(){ yield Promise.resolve('p'); return Promise.resolve('q'); }\n  for await (const v of g()) console.log('v', v);\n  var gi=g(); console.log(JSON.stringify(await gi.next()), JSON.stringify(await gi.next()));\n  console.log(Object.prototype.toString.call(g.prototype), Object.getPrototypeOf(g.prototype)===Object.getPrototypeOf(g).prototype);\n}\nmain().catch(e=>console.log('ERR',e));\n"
 ],
 [
  "parameter errors reject async functions but throw for async generators",
  "async function f(a=(()=>{throw new Error(\"p\")})()){}var p=f();console.log(p instanceof Promise);p.catch(e=>console.log(\"rejected\",e.message));async function* g(a=(()=>{throw new Error(\"q\")})()){}try{g();}catch(e){console.log(\"sync\",e.message);}"
 ],
 [
  "lexical this, arguments and super in async code",
  "class A{m(){return \"A\";}}class B extends A{async m(){await 0;return super.m()+\"B\";}}new B().m().then(v=>console.log(v));function outer(){const f=async()=>{await null;return [this.x,arguments[0]];};return f();}outer.call({x:1},2).then(v=>console.log(v.join()));var o={x:5,async*g(){yield this.x;}};o.g().next().then(r=>console.log(r.value));"
 ],
 [
  "await in try, catch and finally",
  "async function f(){var log=[];try{log.push(await 1);throw await Promise.resolve(\"e\");}catch(e){log.push(e,await 2);}finally{log.push(await 3);}return log.join();}f().then(v=>console.log(v));async function g(){try{return await Promise.reject(\"r\");}catch(e){return \"caught \"+e;}}g().then(v=>console.log(v));"
 ],
 [
  "thenables and promise subclass resolution",
  "var t={then(r){console.log(\"then called\");r(9);}};(async()=>console.log(await t))();class P extends Promise{};var p=P.resolve(3);(async()=>console.log(await p))();(async()=>{return t;})().then(v=>console.log(\"ret\",v));Promise.resolve().then(()=>console.log(\"j1\")).then(()=>console.log(\"j2\")).then(()=>console.log(\"j3\"));"
 ],
 [
  "async values survive GC across suspensions",
  "async function f(n){var keep=[];for(var i=0;i<n;i++){keep.push({s:\"v\"+i});await null;for(var j=0;j<5;j++)({junk:\"\"+j});}return keep.map(x=>x.s).join(\"\").length;}f(8).then(v=>console.log(v));async function*g(){for(var i=0;i<6;i++){yield {s:\"y\"+i};}}(async()=>{var out=\"\";for await(const o of g()){for(var j=0;j<5;j++)({junk:\"\"+j});out+=o.s;}console.log(out.length);})();"
 ],
 [
  "metadata of async functions and prototypes",
  "async function f(a,b){}async function* g(){}var AF=Object.getPrototypeOf(f),AGF=Object.getPrototypeOf(g),AGP=AGF.prototype,AIP=Object.getPrototypeOf(AGP);console.log(f.name,f.length,f.hasOwnProperty(\"prototype\"),typeof g.prototype,Object.getPrototypeOf(g.prototype)===AGP);console.log(AF[Symbol.toStringTag],AGF[Symbol.toStringTag],AGP[Symbol.toStringTag],AF.constructor.name,AGF.constructor.name,AGP.constructor===AGF);console.log(typeof AIP[Symbol.asyncIterator],AIP[Symbol.asyncIterator].call(7),Object.getPrototypeOf(AIP)===Object.prototype);var r=[];try{new f();}catch(e){r.push(e instanceof TypeError);}try{new g();}catch(e){r.push(e instanceof TypeError);}console.log(r.join(),Object.getOwnPropertyNames(AGP).sort().join());"
 ],
 [
  "async generator request queue and invalid receivers",
  "async function*g(){var x=yield 1;yield x;}var it=g();Promise.all([it.next(),it.next(\"a\"),it.return(\"r\"),it.next()]).then(rs=>console.log(JSON.stringify(rs)));Object.getPrototypeOf(it).next.call({}).catch(e=>console.log(e instanceof TypeError));var done=g();done.return(5).then(r=>console.log(JSON.stringify(r)));var th=g();th.throw(new Error(\"x\")).catch(e=>console.log(\"throw\",e.message));"
 ],
 [
  "async identifiers remain valid outside async code",
  "var async=1;function await(){return 2;}var o={async:3,await:4,async(){return 5;}};console.log(async,await(),o.async());var f=async=>async*2;console.log(f(4));"
 ]
];
for(const [name,source] of cases)test('async: '+name,()=>{
 const result=runOnHost(source);
 assert.equal(result.error,undefined);
 assert.equal(result.status,0,result.stderr);
 assert.equal(result.stdout,runOracle(source).stdout);
});
for(const source of [
 'async function f(){var await=1;}','async function f(await){}','async function f(){function g(){await 1;}}',
 'async function f(){for await(var x in y);}','function f(){for await(var x of y);}','var o={async get x(){}};',
 'class A{async constructor(){}}','async (await)=>1','async\nfunction f(){await 1;}',
])test('async syntax error: '+JSON.stringify(source),()=>{
 assert.equal(compile(source,{fileName:'t.js',target:'linux-x64'}).ok,false);
});
