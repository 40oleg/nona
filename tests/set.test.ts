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

test('Set constructor reads iterable with its current adder',()=>expectProgram(`
 var set=new Set([1,2,1]);console.log(set.size,set.has(1),set.has(2));
 var original=Set.prototype.add,calls=[];Set.prototype.add=function(value){calls.push(value);return original.call(this,value)};
 var other=new Set([3,4]);Set.prototype.add=original;
 console.log(calls.join(','),other.has(4));
`,'2 true true\n3,4 true\n'));

test('Set constructor closes iterator when the adder throws',()=>expectProgram(`
 var closed=0,iterable={[Symbol.iterator](){return {next(){return {value:1,done:false}},return(){closed++;return {done:true}}}}};
 var original=Set.prototype.add;Set.prototype.add=function(){throw new Error('stop')};
 try{new Set(iterable)}catch(error){console.log(error.message)}Set.prototype.add=original;
 console.log(closed);
`,'stop\n1\n'));

test('Set constructor rejects a non-callable adder before reading iterable',()=>expectProgram(`
 var touched=0,iterable={[Symbol.iterator](){touched++;return [1][Symbol.iterator]()}};
 var original=Set.prototype.add;Set.prototype.add={};
 try{new Set(iterable)}catch(error){console.log(error.name)}Set.prototype.add=original;
 console.log(touched);
`,'TypeError\n0\n'));

test('Set.forEach observes appends and skips deleted values',()=>expectProgram(`
 var set=new Set([1,2]),seen=[];
 set.forEach(function(value,key,current){seen.push(value+':'+key+':'+this.flag);if(value===1){current.delete(2);current.add(3)}},{flag:7});
 console.log(seen.join(','),set.size);
`,'1:1:7,3:3:7 2\n'));

test('Set iterators preserve order and observe later additions',()=>expectProgram(`
 var set=new Set([1,2]),values=set.values();
 console.log(values[Symbol.iterator]()===values,Set.prototype[Symbol.iterator]===Set.prototype.values,Set.prototype.keys===Set.prototype.values);
 console.log(values.next().value);set.delete(2);set.add(3);
 console.log(values.next().value,values.next().done,values.next().done);
 console.log(Array.from(set.keys()).join(','),Array.from(set).join(','),Array.from(set.entries()).map(pair=>pair.join(':')).join(','));
`,'true true true\n1\n3 true true\n1,3 1,3 1:1,3:3\n'));

test('Set iterator retains its source and values across GC',()=>{
 const source=`var iterator=(function(){var set=new Set([{id:7}]);return set.values()})();for(var i=0;i<40;i++)({i:i});console.log(iterator.next().value.id,iterator.next().done);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),'7 true\n');
});
