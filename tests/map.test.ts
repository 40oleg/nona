import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

test('Map stores keys with SameValueZero and updates in insertion order',()=>expectProgram(`
 var map=new Map();console.log(map instanceof Map,map.size,Object.prototype.toString.call(map));
 map.set(NaN,'first').set(NaN,'second').set(-0,'zero');
 console.log(map.size,map.get(NaN),map.get(+0),map.has(-0),map.has(5));
 console.log(map.delete(NaN),map.size,map.has(NaN),map.delete(NaN));
 map.clear();console.log(map.size,map.get(0));
 try{Map()}catch(error){console.log(error.name)}
 try{Map.prototype.get.call({},1)}catch(error){console.log(error.name)}
`,'true 0 [object Map]\n2 second zero true false\ntrue 1 false false\n0 undefined\nTypeError\nTypeError\n'));

test('Map retains live object keys and values across GC',()=>{
 const source=`var map=new Map(),key={id:7},value={id:9};map.set(key,value);for(var i=0;i<40;i++)({i:i});console.log(map.get(key).id,map.has(key),map.size);map.delete(key);for(var i=0;i<40;i++)({i:i});console.log(map.size,map.has(key));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),'9 true 1\n0 false\n');
});

test('Map subclass keeps its prototype and distinct object keys',()=>expectProgram(`
 class SubMap extends Map{};var a={},b={},map=new SubMap();map.set(a,1).set(b,2);
 console.log(map instanceof SubMap,Object.getPrototypeOf(map)===SubMap.prototype,map.size,map.get(a),map.get(b));
 map.delete(a);map.set(a,3);console.log(map.size,map.get(a),map.get(b));
`,'true true 2 1 2\n2 3 2\n'));

test('Map constructor reads iterable pairs with its current adder',()=>expectProgram(`
 var map=new Map([[1,'one'],[2,'two'],[1,'again']]);console.log(map.size,map.get(1),map.get(2));
 var original=Map.prototype.set,calls=[];Map.prototype.set=function(key,value){calls.push(key);return original.call(this,key,value)};
 var other=new Map([[3,4],[5,6]]);Map.prototype.set=original;
 console.log(calls.join(','),other.get(5));
`,'2 again two\n3,5 6\n'));

test('Map constructor closes its iterator when the adder throws',()=>expectProgram(`
 var closed=0,iterable={[Symbol.iterator](){return {next(){return {value:[1,2],done:false}},return(){closed++;return {done:true}}}}};
 var original=Map.prototype.set;Map.prototype.set=function(){throw new Error('stop')};
 try{new Map(iterable)}catch(error){console.log(error.message)}Map.prototype.set=original;
 console.log(closed);
`,'stop\n1\n'));

test('Map.forEach observes appends and skips deleted entries',()=>expectProgram(`
 var map=new Map([[1,'one'],[2,'two']]),seen=[];
 map.forEach(function(value,key,current){seen.push(key+':'+value+':'+(this.flag));if(key===1){current.delete(2);current.set(3,'three')}},{flag:7});
 console.log(seen.join(','),map.size);
`,'1:one:7,3:three:7 2\n'));

test('Map iterators preserve order and observe later additions',()=>expectProgram(`
 var map=new Map([[1,'one'],[2,'two']]),entries=map.entries();
 console.log(entries[Symbol.iterator]()===entries,Map.prototype[Symbol.iterator]===Map.prototype.entries);
 console.log(entries.next().value.join(':'));map.delete(2);map.set(3,'three');
 console.log(entries.next().value.join(':'),entries.next().done,entries.next().done);
 console.log(Array.from(map.keys()).join(','),Array.from(map.values()).join(','),Array.from(map).map(pair=>pair.join(':')).join(','));
`,'true true\n1:one\n3:three true true\n1,3 one,three 1:one,3:three\n'));

test('Map iterator retains its source and entries across GC',()=>{
 const source=`var iterator=(function(){var map=new Map([[{id:7},{id:9}]]);return map.entries()})();for(var i=0;i<40;i++)({i:i});var pair=iterator.next().value;console.log(pair[0].id,pair[1].id,iterator.next().done);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),'7 9 true\n');
});
