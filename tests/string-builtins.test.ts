import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';

const cases:[string,string][]=[
 ['basic matches',`console.log('abracadabra'.includes('bra'),'abracadabra'.includes('xyz'),'abc'.includes(''),''.includes(''));`],
 ['positions',`console.log('abcabc'.includes('ab',1),'abcabc'.includes('ab',3),'abc'.includes('a',Infinity),'abc'.includes('',Infinity),'abc'.includes('a',-5),'abc'.includes('b',1.9));`],
 ['UTF16 code units',`console.log('😀x'.includes('😀'),'😀x'.includes('\ud83d'),'😀x'.includes('x',2));`],
 ['generic and conversions',`var s='';var o={toString:function(){s+='r';return 'abc';}},q={toString:function(){s+='s';return 'b';}},p={valueOf:function(){s+='p';return 1;}};console.log(String.prototype.includes.call(o,q,p),s,String.prototype.includes.call(123,'2'));`],
 ['Symbol.match false',`var o={toString:function(){return 'bc';}};o[Symbol.match]=false;console.log('abc'.includes(o));`],
];
for(const [name,source] of cases)test(`String.includes: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('String.includes: truthy Symbol.match throws',()=>{
 const source=`var o={};o[Symbol.match]=true;'abc'.includes(o);`;
 const run=runNative(linkPe(generate(compileToIR(source))));
 assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
});

test('String.includes: coercion survives stress GC',()=>{
 const source=`var x={toString:function(){for(var i=0;i<30;i++)({v:i});return 'abc';}},y={toString:function(){for(var i=0;i<30;i++)({v:i});return 'bc';}};console.log(String.prototype.includes.call(x,y));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
