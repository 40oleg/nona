import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {runNative} from './helpers/native.js';

const cases:[string,string][]=[
 ['basic and overwrite',`var a={x:1,y:2},b={...a,y:5,z:6};console.log(b.x,b.y,b.z,Object.keys(b).join(','));`],
 ['nullish and primitive',`var o={...null,...undefined,...'ab',...3};console.log(o[0],o[1],Object.keys(o).join(','));`],
 ['symbols and enumerability',`var s=Symbol('s'),o={a:1};o[s]=3;Object.defineProperty(o,'hidden',{value:4});var p={...o};console.log(p.a,p[s],Object.getOwnPropertySymbols(p).length,'hidden' in p);`],
 ['getter called in key order',`var log='';var o={get a(){log+='a';return 1;},get b(){log+='b';return 2;}};var p={...o};console.log(p.a,p.b,log);`],
 ['own data creation',`var p={...{__proto__:null,x:2}};console.log(p.x,Object.getPrototypeOf(p)===Object.prototype);`],
];
for(const [name,source] of cases)test(`object spread: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('object spread survives getter stress GC',()=>{
 const source=`var o={};Object.defineProperty(o,'x',{enumerable:true,get:function(){for(var i=0;i<30;i++)({v:i});return {n:7};}});var p={...o};console.log(p.x.n);`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
