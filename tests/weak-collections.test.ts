import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

test('WeakMap and WeakSet accept object keys and reject primitive additions',()=>expectProgram(`
 var key={},other={},map=new WeakMap(),set=new WeakSet();
 console.log(map instanceof WeakMap,set instanceof WeakSet,Object.prototype.toString.call(map),Object.prototype.toString.call(set));
 map.set(key,7);set.add(key);console.log(map.get(key),map.has(key),map.has(other),set.has(key),set.has(other));
 console.log(map.get(1),map.has(1),map.delete(1),set.has(1),set.delete(1));
 console.log(map.delete(key),map.has(key),set.delete(key),set.has(key));
 try{map.set(1,2)}catch(error){console.log(error.name)}
 try{set.add(1)}catch(error){console.log(error.name)}
`,'true true [object WeakMap] [object WeakSet]\n7 true false true false\nundefined false false false false\ntrue false true false\nTypeError\nTypeError\n'));

test('collection constructors expose ES2020 arity zero',()=>expectProgram(`
 console.log(Map.length,Set.length,WeakMap.length,WeakSet.length);
`,'0 0 0 0\n'));

test('WeakMap ephemeron values survive while their keys are live',()=>{
 const source=`var key={id:7},map=new WeakMap(),set=new WeakSet();map.set(key,{id:9});set.add(key);for(var i=0;i<40;i++)({i:i});console.log(map.get(key).id,map.has(key),set.has(key));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),'9 true true\n');
});

test('WeakMap ephemeron marking reaches keys through earlier values',()=>{
 const source=`var first={id:1},second={id:2},map=new WeakMap();map.set(second,{id:9});map.set(first,second);second=null;for(var i=0;i<40;i++)({i:i});var recovered=map.get(first);console.log(recovered.id,map.get(recovered).id);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),'2 9\n');
});

test('Weak collections remain usable after dead keys are pruned',()=>{
 const source=`var map=new WeakMap(),set=new WeakSet();(function(){var dead={};map.set(dead,{id:1});set.add(dead)})();for(var i=0;i<40;i++)({i:i});var live={id:7};map.set(live,{id:9});set.add(live);console.log(map.get(live).id,set.has(live),map.delete(live),set.delete(live));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),'9 true true true\n');
});

test('WeakMap and WeakSet constructors consume iterables',()=>expectProgram(`
 var a={},b={},map=new WeakMap([[a,1],[b,2]]),set=new WeakSet([a,b,a]);
 console.log(map.get(a),map.get(b),set.has(a),set.has(b));
 var mapSet=WeakMap.prototype.set,mapCalls=0;WeakMap.prototype.set=function(k,v){mapCalls++;return mapSet.call(this,k,v)};
 new WeakMap([[a,3]]);WeakMap.prototype.set=mapSet;
 var setAdd=WeakSet.prototype.add,setCalls=0;WeakSet.prototype.add=function(v){setCalls++;return setAdd.call(this,v)};
 new WeakSet([a]);WeakSet.prototype.add=setAdd;
 console.log(mapCalls,setCalls);
`,'1 2 true true\n1 1\n'));

test('Weak collection constructors close iterators when adders throw',()=>expectProgram(`
 var a={},closed=0,iterable={[Symbol.iterator](){return {next(){return {value:a,done:false}},return(){closed++;return {done:true}}}}};
 var original=WeakSet.prototype.add;WeakSet.prototype.add=function(){throw new Error('stop')};
 try{new WeakSet(iterable)}catch(error){console.log(error.message)}WeakSet.prototype.add=original;
 console.log(closed);
`,'stop\n1\n'));
