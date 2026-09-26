import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

const cases:[string,string][]=[
 ['arrays and holes',`var a=[1,,3];var b=[0,...a,4,,];console.log(b.length,b[0],b[1],b[2],b[3],b[4],5 in b);`],
 ['strings',`var a=[...'A😀B'];console.log(a.length,a[0],a[1],a[2]);`],
 ['custom iterator and order',`var s='';var o={ [Symbol.iterator]:function(){var n=0;return {next:function(){s+=n;return n++<2?{value:n,done:false}:{done:true};}};}};var a=[(s+='a',0),...o,(s+='b',3)];console.log(a.join(','),s);`],
 ['iterator override',`var a=[1,2];a[Symbol.iterator]=function(){return {next:function(){return {done:true};}};};console.log([0,...a,3].join(','));`],
 ['trailing holes',`var a=[...[], , ,];console.log(a.length,0 in a,1 in a);`],
];
for(const [name,source] of cases)test(`array spread: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('array spread survives stress GC',()=>{
 const source=`var a=[];for(var i=0;i<20;i++)a.push({x:i});var b=[{x:-1},...a,{x:20}];console.log(b.length,b[0].x,b[20].x,b[21].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
