import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

const cases:[string,string][]=[
  ['own numeric and string keys',`var o={b:1,2:2,1:1,a:4};var s='';for(var k in o)s+=k+',';console.log(s);`],
  ['inherited keys',`var p={x:1,z:2};var o=Object.create(p);o.y=3;var s='';for(var k in o)s+=k+',';console.log(s);`],
  ['nonenumerable shadow',`var p={x:1};var o=Object.create(p);Object.defineProperty(o,'x',{value:2});var s='';for(var k in o)s+=k;console.log(s);`],
  ['break and continue',`var o={a:1,b:2,c:3};var s='';for(var k in o){if(k==='b')continue;s+=k;if(k==='c')break;}console.log(s);`],
  ['nullish and string',`var s='';for(var k in null)s+=k;for(var k in 'ab')s+=k;console.log(s);`],
  ['existing binding',`var o={x:1};var k='before';for(k in o){}console.log(k);`],
  ['property assignment target',`var box={k:'before'},s='';for(box.k in {a:1,b:2})s+=box.k;console.log(s,box.k);`],
  ['computed target each iteration',`var box={},n=0;for(box[(n++,'k')] in {a:1,b:2}){}console.log(n,box.k);`],
  ['deleted key is skipped',`var o={a:1,b:2,c:3};var s='';for(var k in o){s+=k;if(k==='a')delete o.b;}console.log(s);`],
  ['lexical loop bindings',`var s='';for(let k in {a:1,b:2})s+=k;for(const k in {c:1,d:2})s+=k;console.log(s);`],
  ['fresh captured binding',`var f=[],i=0;for(let k in {a:1,b:2}){f[i]=function(){return k;};i++;}console.log(f[0](),f[1]());`],
  ['lexical TDZ in RHS',`var o={x:1};try{for(let o in o){}}catch(e){console.log(e instanceof ReferenceError);}`],
];
for(const [name,source] of cases)test(`for...in: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('for...in: key snapshot survives stress GC',()=>{
  const source=`var p={base:1};var o=Object.create(p);for(var i=0;i<30;i++)o['k'+i]=i;var n=0;for(var k in o){n++;for(var j=0;j<5;j++)({v:''+j});}console.log(n);`;
  const image=linkPe(generate(compileToIR(source),{gcStress:true}));
  const run=runNative(image);
  assert.equal(run.status,0,run.stderr.toString());
  assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
