import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

test('Set stores values with SameValueZero and supports core methods',()=>expectProgram(`
 var set=new Set();console.log(set instanceof Set,set.size,Object.prototype.toString.call(set));
 set.add(NaN).add(NaN).add(-0);console.log(set.size,set.has(NaN),set.has(+0),set.has(5));
 console.log(set.delete(NaN),set.size,set.has(NaN),set.delete(NaN));
 set.clear();console.log(set.size,set.has(0));
 try{Set()}catch(error){console.log(error.name)}
 try{Set.prototype.has.call({},1)}catch(error){console.log(error.name)}
`,'true 0 [object Set]\n2 true true false\ntrue 1 false false\n0 false\nTypeError\nTypeError\n'));

test('Set retains live object values across GC',()=>{
 const source=`var set=new Set(),value={id:9};set.add(value);for(var i=0;i<40;i++)({i:i});console.log(set.has(value),set.size);set.delete(value);for(var i=0;i<40;i++)({i:i});console.log(set.size,set.has(value));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),'true 1\n0 false\n');
});
