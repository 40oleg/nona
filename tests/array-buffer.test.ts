import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

test('ArrayBuffer construction allocates zero-length or sized native backing',()=>expectProgram(`
  var a=new ArrayBuffer(4),empty=new ArrayBuffer();
  console.log(a instanceof ArrayBuffer,a.byteLength,empty.byteLength);
  console.log(Object.getPrototypeOf(a)===ArrayBuffer.prototype);
  console.log(Object.prototype.toString.call(a),ArrayBuffer[Symbol.species]===ArrayBuffer);
  class SubBuffer extends ArrayBuffer{};
  console.log(new SubBuffer(2) instanceof SubBuffer);
  console.log(new ArrayBuffer(3.9).byteLength,new ArrayBuffer(-0.5).byteLength);
  try{ArrayBuffer(1)}catch(error){console.log(error.name)}
  try{new ArrayBuffer(-1)}catch(error){console.log(error.name)}
  try{Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get.call({})}catch(error){console.log(error.name)}
`,'true 4 0\ntrue\n[object ArrayBuffer] true\ntrue\n3 0\nTypeError\nRangeError\nTypeError\n'));

test('ArrayBuffer object and backing survive stress GC',()=>{
 const source=`var kept=new ArrayBuffer(128);for(var i=0;i<40;i++){new ArrayBuffer(i);String(i)+String(i)}console.log(kept.byteLength,Object.prototype.toString.call(kept));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'128 [object ArrayBuffer]\n');
});

test('ArrayBuffer slice applies bounds and species',()=>expectProgram(`
  var original=new ArrayBuffer(8);
  console.log(original.slice(2,6).byteLength,original.slice(-3).byteLength,original.slice(9).byteLength);
  console.log(original.slice(2,-2).byteLength,original.slice(6,2).byteLength);
  class Larger extends ArrayBuffer{};
  var sub=new Larger(6),copy=sub.slice(1,4);
  console.log(copy instanceof Larger,copy.byteLength);
  var seen=0;
  original.constructor={[Symbol.species]:function(length){seen=length;return new ArrayBuffer(length+2)}};
  var grown=original.slice(2,5);
  console.log(seen,grown.byteLength);
  original.constructor={[Symbol.species]:function(){return new ArrayBuffer(1)}};
  try{original.slice(1,4)}catch(error){console.log(error.name)}
`,'4 3 0\n4 0\ntrue 3\n3 5\nTypeError\n'));

test('ArrayBuffer.isView identifies current non-view values',()=>expectProgram(`
  console.log(ArrayBuffer.isView(),ArrayBuffer.isView(null),ArrayBuffer.isView({}),ArrayBuffer.isView(new ArrayBuffer(1)));
  console.log(ArrayBuffer.isView.length,ArrayBuffer.isView.name);
  try{new ArrayBuffer.isView({})}catch(error){console.log(error.name)}
`,'false false false false\n1 isView\nTypeError\n'));

test('DataView construction, getters, brand and bounds',()=>expectProgram(`
  var buffer=new ArrayBuffer(8),view=new DataView(buffer,2,3);
  console.log(view instanceof DataView,view.buffer===buffer,view.byteOffset,view.byteLength,ArrayBuffer.isView(view));
  console.log(new DataView(buffer,2).byteLength,new DataView(buffer).byteLength);
  console.log(Object.prototype.toString.call(view));
  console.log(DataView.length,DataView.name);
  class ChildView extends DataView{}; console.log(new ChildView(buffer) instanceof ChildView);
  try{DataView(buffer)}catch(error){console.log(error.name)}
  try{new DataView({})}catch(error){console.log(error.name)}
  try{new DataView(buffer,9)}catch(error){console.log(error.name)}
  try{new DataView(buffer,6,3)}catch(error){console.log(error.name)}
  try{Object.getOwnPropertyDescriptor(DataView.prototype,'buffer').get.call(buffer)}catch(error){console.log(error.name)}
`,'true true 2 3 true\n6 8\n[object DataView]\n3 DataView\ntrue\nTypeError\nTypeError\nRangeError\nRangeError\nTypeError\n'));

test('DataView retains its ArrayBuffer through stress GC',()=>{
 const source=`var kept=new DataView(new ArrayBuffer(32),7,11);for(var i=0;i<40;i++){new ArrayBuffer(i);String(i)+String(i)}console.log(kept.byteOffset,kept.byteLength,kept.buffer.byteLength,ArrayBuffer.isView(kept));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'7 11 32 true\n');
});

test('DataView getUint8 and setUint8 access shared bytes',()=>expectProgram(`
  var buffer=new ArrayBuffer(5),whole=new DataView(buffer),middle=new DataView(buffer,1,3);
  middle.setUint8(0,257);middle.setUint8(1,-1);middle.setUint8(2,NaN);
  console.log(whole.getUint8(1),whole.getUint8(2),whole.getUint8(3));
  console.log(middle.getUint8(0),middle.getUint8(1),middle.getUint8(2));
  var copy=buffer.slice(1,4),copied=new DataView(copy);
  console.log(copied.getUint8(0),copied.getUint8(1),copied.getUint8(2));
  whole.setUint8(2,7);console.log(copied.getUint8(1));
  whole.setInt8(0,-2);console.log(whole.getInt8(0),whole.getUint8(0));
  whole.setUint8(0,129);console.log(whole.getInt8(0));
  console.log(middle.setUint8(0,11)===undefined,middle.getUint8());
  try{middle.getUint8(3)}catch(error){console.log(error.name)}
  try{middle.setUint8(-1,1)}catch(error){console.log(error.name)}
  try{DataView.prototype.getUint8.call(buffer,0)}catch(error){console.log(error.name)}
`,'1 255 0\n1 255 0\n1 255 0\n255\n-2 254\n-127\ntrue 11\nRangeError\nRangeError\nTypeError\n'));

test('DataView byte access survives coercion and stress GC',()=>{
 const source=`var v=new DataView(new ArrayBuffer(4));var index={valueOf(){for(var i=0;i<20;i++)new ArrayBuffer(i);return 1.9}};var value={valueOf(){for(var i=0;i<20;i++)new ArrayBuffer(i);return 1e20}};v.setUint8(index,value);console.log(v.getUint8(index),v.buffer.byteLength);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'0 4\n');
});

test('DataView 16 and 32 bit integer access handles byte order and signs',()=>expectProgram(`
  var view=new DataView(new ArrayBuffer(8));
  view.setUint16(0,0x1234);view.setInt16(2,-2,true);view.setUint32(4,0x89abcdef,true);
  console.log(view.getUint16(0),view.getUint16(0,true),view.getInt16(2,true),view.getInt16(2));
  console.log(view.getUint32(4,true),view.getInt32(4,true),view.getUint32(4));
  var bytes=[];for(var i=0;i<8;i++)bytes.push(view.getUint8(i));console.log(bytes.join(' '));
  try{view.getUint32(5)}catch(error){console.log(error.name)}
  try{view.setUint16(7,1)}catch(error){console.log(error.name)}
`,'4660 13330 -2 -257\n2309737967 -1985229329 4023233417\n18 52 254 255 239 205 171 137\nRangeError\nRangeError\n'));

test('DataView Float32 and Float64 preserve byte order and special values',()=>expectProgram(`
  var view=new DataView(new ArrayBuffer(24));
  view.setFloat32(0,1.5);view.setFloat32(4,-0,true);view.setFloat64(8,-Math.PI,true);
  var bytes=[];for(var i=0;i<16;i++)bytes.push(view.getUint8(i));console.log(bytes.join(' '));
  console.log(view.getFloat32(0),Object.is(view.getFloat32(4,true),-0),view.getFloat64(8,true));
  view.setFloat32(16,Infinity,true);view.setFloat64(16,NaN);
  console.log(view.getFloat64(16)!==view.getFloat64(16));
  try{view.getFloat64(17)}catch(error){console.log(error.name)}
`,'63 192 0 0 0 0 0 128 24 45 68 84 251 33 9 192\n1.5 true -3.141592653589793\ntrue\nRangeError\n'));

test('DataView float value coercion survives stress GC',()=>{
 const source=`var v=new DataView(new ArrayBuffer(8));var value={valueOf(){for(var i=0;i<20;i++)new ArrayBuffer(i);return -0}};v.setFloat64(0,value,true);console.log(Object.is(v.getFloat64(0,true),-0),v.buffer.byteLength);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'true 8\n');
});

test('DataView BigInt64 and BigUint64 preserve all bits',()=>expectProgram(`
  var view=new DataView(new ArrayBuffer(16));
  view.setBigUint64(0,0x0123456789abcdefn);
  view.setBigInt64(8,-2n,true);
  console.log(view.getBigUint64(0).toString(16),view.getBigUint64(0,true).toString(16));
  console.log(String(view.getBigInt64(8,true)),view.getBigUint64(8,true).toString(16));
  var bytes=[];for(var i=0;i<16;i++)bytes.push(view.getUint8(i));console.log(bytes.join(' '));
  view.setBigUint64(0,-1n);console.log(view.getBigInt64(0),view.getBigUint64(0));
  console.log(DataView.prototype.getBigInt64.length,DataView.prototype.setBigUint64.length);
  try{view.setBigInt64(0,1)}catch(error){console.log(error.name)}
  try{view.getBigUint64(9)}catch(error){console.log(error.name)}
  try{DataView.prototype.getBigInt64.call({})}catch(error){console.log(error.name)}
`,'123456789abcdef efcdab8967452301\n-2 fffffffffffffffe\n1 35 69 103 137 171 205 239 254 255 255 255 255 255 255 255\n-1 18446744073709551615\n1 2\nTypeError\nRangeError\nTypeError\n'));

test('DataView BigInt value conversion survives stress GC',()=>{
 const source=`var v=new DataView(new ArrayBuffer(8));var value={valueOf(){for(var i=0;i<20;i++)new ArrayBuffer(i);return -1n}};v.setBigInt64(0,value,true);console.log(v.getBigUint64(0,true).toString(16),v.buffer.byteLength);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'ffffffffffffffff 8\n');
});

test('DataView prototype keeps ES method order',()=>expectProgram(`
 console.log(Object.getOwnPropertyNames(DataView.prototype).join(','));
`,'constructor,buffer,byteLength,byteOffset,getInt8,setInt8,getUint8,setUint8,getInt16,setInt16,getUint16,setUint16,getInt32,setInt32,getUint32,setUint32,getFloat32,setFloat32,getFloat64,setFloat64,getBigInt64,setBigInt64,getBigUint64,setBigUint64\n'));

test('buffer methods retain native calls after Function.prototype.call changes',()=>expectProgram(`
 var buffer=new ArrayBuffer(8),view=new DataView(buffer);
 Function.prototype.call=function(){throw new Error('poisoned call')};
 Number=function(){throw new Error('poisoned Number')};
 Math.trunc=function(){throw new Error('poisoned trunc')};
 view.setBigUint64(0,0x123456789abcdef0n,true);
 console.log(view.getBigUint64(0,true).toString(16),buffer.slice(0.9,8).byteLength);
`,'123456789abcdef0 8\n'));

test('Uint8Array construction creates a shared view',()=>expectProgram(`
  var owned=new Uint8Array(4),empty=new Uint8Array(),buffer=new ArrayBuffer(8),view=new Uint8Array(buffer,2,3);
  console.log(owned.length,owned.byteLength,owned.buffer.byteLength,empty.length);
  console.log(view.length,view.byteOffset,view.byteLength,view.buffer===buffer,ArrayBuffer.isView(view));
  console.log(view instanceof Uint8Array,Object.prototype.toString.call(view));
  class Child extends Uint8Array{};console.log(new Child(2) instanceof Child);
  try{Uint8Array(2)}catch(error){console.log(error.name)}
  try{new Uint8Array(buffer,9)}catch(error){console.log(error.name)}
`,'4 4 4 0\n3 2 3 true true\ntrue [object Uint8Array]\ntrue\nTypeError\nRangeError\n'));

test('Uint8Array indexed bytes alias DataView and obey bounds',()=>expectProgram(`
  var buffer=new ArrayBuffer(6),bytes=new Uint8Array(buffer,1,4),view=new DataView(buffer);
  bytes[0]=257;bytes[1]=-1;bytes[2]=3.9;
  console.log(bytes[0],bytes[1],bytes[2],view.getUint8(1),view.getUint8(2),view.getUint8(3));
  view.setUint8(4,77);console.log(bytes[3],0 in bytes,3 in bytes,4 in bytes,bytes[4]);
  bytes[4]=99;console.log(view.getUint8(5));
  console.log(delete bytes[0],delete bytes[4],bytes[0]);
`,'1 255 3 1 255 3\n77 true true false undefined\n0\nfalse true 1\n'));

test('Uint8Array keeps backing bytes through stress GC',()=>{
 const source=`var bytes=new Uint8Array(16);bytes[0]=201;bytes[15]=47;for(var i=0;i<40;i++){new Uint8Array(i);String(i)+String(i)}console.log(bytes[0],bytes[15],bytes.buffer.byteLength);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'201 47 16\n');
});

test('Uint8Array index enumeration and descriptors read backing bytes',()=>expectProgram(`
  var bytes=new Uint8Array(3);bytes[0]=7;bytes[2]=9;
  console.log(Object.keys(bytes).join(','),Object.getOwnPropertyNames(bytes).join(','));
  var descriptor=Object.getOwnPropertyDescriptor(bytes,'2');
  console.log(descriptor.value,descriptor.writable,descriptor.enumerable,descriptor.configurable);
  console.log(bytes.hasOwnProperty('0'),bytes.propertyIsEnumerable('1'),bytes.hasOwnProperty('3'));
  console.log(Object.values(bytes).join(','));
`,'0,1,2 0,1,2\n9 true true true\ntrue true false\n7,0,9\n'));

test('Uint8Array defineProperty updates indexed bytes and enforces attributes',()=>expectProgram(`
  var bytes=new Uint8Array(2),view=new DataView(bytes.buffer);
  console.log(Object.defineProperty(bytes,'1',{value:258})===bytes,bytes[1],view.getUint8(1));
  console.log(Object.defineProperty(bytes,'0',{writable:true,enumerable:true,configurable:true})===bytes);
  for(var descriptor of [{writable:false},{enumerable:false},{configurable:false},{get(){return 1}}]){
    try{Object.defineProperty(bytes,'0',descriptor)}catch(error){console.log(error.name)}
  }
  try{Object.defineProperty(bytes,'2',{value:9})}catch(error){console.log(error.name)}
  console.log(bytes[0],bytes[1],Object.keys(bytes).join(','));
`,'true 2 2\ntrue\nTypeError\nTypeError\nTypeError\nTypeError\nTypeError\n0 2 0,1\n'));

test('Uint8Array rejects canonical numeric keys outside valid indices',()=>expectProgram(`
  var bytes=new Uint8Array(2);bytes[0]=3;bytes[1]=4;
  for(var key of ['-0','-1','1.5','NaN','Infinity','4294967295']){
    bytes[key]=7;
    console.log(key in bytes,bytes[key],bytes.hasOwnProperty(key),delete bytes[key]);
    try{Object.defineProperty(bytes,key,{value:8})}catch(error){console.log(error.name)}
  }
  bytes['01']=9;bytes['1e0']=10;
  console.log(bytes['01'],bytes['1e0'],Object.keys(bytes).join(','),bytes[0],bytes[1]);
`,'false undefined false true\nTypeError\nfalse undefined false true\nTypeError\nfalse undefined false true\nTypeError\nfalse undefined false true\nTypeError\nfalse undefined false true\nTypeError\nfalse undefined false true\nTypeError\n9 10 0,1,01,1e0 3 4\n'));

test('Uint8Array canonical numeric keys bypass inherited properties under stress GC',()=>{
 const source=`var bytes=new Uint8Array(1),key='-'+'1';Uint8Array.prototype[key]=42;for(var i=0;i<20;i++)new ArrayBuffer(i);console.log(bytes[key],key in bytes,Object.getOwnPropertyDescriptor(bytes,key));bytes[key]=8;console.log(bytes[key],Uint8Array.prototype[key]);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'undefined false undefined\nundefined 42\n');
});

test('Uint8Array copies iterable and array-like sources',()=>expectProgram(`
  var values=new Uint8Array([257,-1,3.9]);console.log(values.length,values[0],values[1],values[2]);
  var like={0:5,2:258,length:3};var copied=new Uint8Array(like);
  console.log(copied[0],copied[1],copied[2],copied.buffer.byteLength);
  var iterable={[Symbol.iterator]:function*(){yield 6;yield 259}};
  var iterated=new Uint8Array(iterable);console.log(iterated.length,iterated[0],iterated[1]);
`,'3 1 255 3\n5 0 2 3\n2 6 3\n'));

test('Uint8Array converts iterable values during iteration and closes on error',()=>expectProgram(`
  var trace='',source={
    [Symbol.iterator](){var i=0;return {
      next(){trace+='n';return i++<2?{value:i===1?{valueOf(){trace+='c';return 257}}:{valueOf(){trace+='x';throw Error('bad')}},done:false}:{done:true}},
      return(){trace+='r';return {done:true}}
    }}
  };
  try{new Uint8Array(source)}catch(error){console.log(error.message,trace)}
`,'bad ncnxr\n'));

test('Uint8Array source copying survives intrinsic changes and stress GC',()=>{
 const source=`var source=new Uint8Array(2);source[0]=8;source[1]=259;Array.from=function(){throw Error('changed')};var copy=new Uint8Array(source);var values=new Uint8Array([{valueOf(){for(var i=0;i<20;i++)new ArrayBuffer(i);return 258}}]);console.log(copy.length,copy[0],copy[1],values[0]);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'2 8 3 2\n');
});

test('Uint8Array values, keys, entries and default iteration use shared bytes',()=>expectProgram(`
  var bytes=new Uint8Array([4,5]),values=[];for(var value of bytes)values.push(value);
  console.log(values.join(','),bytes[Symbol.iterator]===bytes.values);
  var keys=bytes.keys(),entries=bytes.entries();console.log(keys.next().value,keys.next().value,keys.next().done);
  var first=entries.next().value;bytes[1]=9;var second=entries.next().value;
  console.log(first[0],first[1],second[0],second[1],entries.next().done);
  try{Uint8Array.prototype.values.call({})}catch(error){console.log(error.name)}
`,'4,5 true\n0 1 true\n0 4 1 9 true\nTypeError\n'));

test('Uint8Array iterator retains backing bytes under stress GC',()=>{
 const source=`var bytes=new Uint8Array([7,8]),iterator=bytes.values();bytes=null;for(var i=0;i<30;i++)new ArrayBuffer(i);console.log(iterator.next().value,iterator.next().value,iterator.next().done);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'7 8 true\n');
});

test('Uint8Array inherits abstract TypedArray constructor and shared accessors',()=>expectProgram(`
  var TypedArray=Object.getPrototypeOf(Uint8Array),common=Object.getPrototypeOf(Uint8Array.prototype);
  var bytes=new Uint8Array([1,2]);
  console.log(TypedArray.name,TypedArray.length,TypedArray.prototype===common,common.constructor===TypedArray);
  console.log(Object.getPrototypeOf(TypedArray)===Function.prototype,Object.getOwnPropertyDescriptor(TypedArray,'prototype').writable);
  console.log(Object.getOwnPropertyDescriptor(common,'length').get.call(bytes),common.values===bytes.values);
  try{new TypedArray(1)}catch(error){console.log(error.name)}
  try{TypedArray()}catch(error){console.log(error.name)}
`,'TypedArray 0 true true\ntrue false\n2 true\nTypeError\nTypeError\n'));

test('TypedArray.of constructs receiver and converts each element',()=>expectProgram(`
  var bytes=Uint8Array.of(1,257,-1);console.log(bytes instanceof Uint8Array,bytes.length,bytes[0],bytes[1],bytes[2]);
  class Child extends Uint8Array{};var child=Child.of(4,260);console.log(child instanceof Child,child.length,child[0],child[1]);
  var TypedArray=Object.getPrototypeOf(Uint8Array);console.log(TypedArray.of.length,TypedArray.of.call(Uint8Array).length);
  try{TypedArray.of.call({},1)}catch(error){console.log(error.name)}
  class Short extends Uint8Array{constructor(){super(1)}}
  try{Short.of(1,2)}catch(error){console.log(error.name)}
`,'true 3 1 1 255\ntrue 2 4 4\n0 0\nTypeError\nTypeError\n'));

test('TypedArray.of keeps values rooted during coercion',()=>{
 const source=`var value={valueOf(){for(var i=0;i<20;i++)new ArrayBuffer(i);return 258}};var bytes=Uint8Array.of(value,7);console.log(bytes[0],bytes[1],bytes.length);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'2 7 2\n');
});

test('Int8Array shares backing bytes and reads signed values',()=>expectProgram(`
  var buffer=new ArrayBuffer(4),signed=new Int8Array(buffer),unsigned=new Uint8Array(buffer);
  signed[0]=-1;signed[1]=128;unsigned[2]=254;
  console.log(signed[0],signed[1],signed[2],unsigned[0],unsigned[1],ArrayBuffer.isView(signed));
  console.log(new Int8Array([255,256,-129]).length,Int8Array.of(255,-129)[0],Int8Array.of(255,-129)[1]);
  console.log(signed instanceof Int8Array,Object.prototype.toString.call(signed),Object.getPrototypeOf(Int8Array)===Object.getPrototypeOf(Uint8Array));
  var view=new Int8Array(buffer,1,2);console.log(view.byteOffset,view.byteLength,view.length,view[0],view[1]);
`,'-1 -128 -2 255 128 true\n3 -1 127\ntrue [object Int8Array] true\n1 2 2 -128 -2\n'));

test('Int8Array indexed descriptors and iterator survive stress GC',()=>{
 const source=`var bytes=Int8Array.of(127,128,255);var iterator=bytes.values();for(var i=0;i<30;i++)new ArrayBuffer(i);console.log(Object.keys(bytes).join(','),Object.getOwnPropertyDescriptor(bytes,'1').value,iterator.next().value,iterator.next().value,iterator.next().value);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'0,1,2 -128 127 -128 -1\n');
});

test('Uint8ClampedArray clamps and rounds ties to even in every write path',()=>expectProgram(`
  var bytes=new Uint8ClampedArray([0.5,1.5,2.5,3.5,-1,255.5,Infinity,NaN]);
  console.log(bytes.length,Array.from(bytes).join(','));
  bytes[0]=254.5;bytes[1]=254.6;Object.defineProperty(bytes,'2',{value:7.5});
  console.log(bytes[0],bytes[1],bytes[2],Uint8ClampedArray.of(8.5,9.5)[0],Uint8ClampedArray.of(8.5,9.5)[1]);
  var shared=new Uint8Array(bytes.buffer);console.log(shared[0],shared[1],shared[2],ArrayBuffer.isView(bytes));
  console.log(Object.prototype.toString.call(bytes),Object.getPrototypeOf(Uint8ClampedArray)===Object.getPrototypeOf(Uint8Array));
`,'8 0,2,2,4,0,255,255,0\n254 255 8 8 10\n254 255 8 true\n[object Uint8ClampedArray] true\n'));

test('Uint8ClampedArray conversion survives stress GC',()=>{
 const source=`var bytes=new Uint8ClampedArray(2),value={valueOf(){for(var i=0;i<20;i++)new ArrayBuffer(i);return 12.5}};bytes[0]=value;Object.defineProperty(bytes,'1',{value});console.log(bytes[0],bytes[1],bytes.buffer.byteLength);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'12 12 2\n');
});

test('Uint16Array and Int16Array use two-byte elements and signed reads',()=>expectProgram(`
  var buffer=new ArrayBuffer(8),unsigned=new Uint16Array(buffer,2,2),signed=new Int16Array(buffer,2,2),view=new DataView(buffer);
  unsigned[0]=0x1234;signed[1]=-2;
  console.log(unsigned.length,unsigned.byteLength,unsigned.byteOffset,unsigned[0],unsigned[1],signed[0],signed[1]);
  console.log(view.getUint16(2,true),view.getUint16(4,true),ArrayBuffer.isView(signed));
  var a=new Uint16Array([65537,-1,3.9]),b=Int16Array.of(65535,32768,-32769);
  console.log(a.length,a.byteLength,a.buffer.byteLength,a[0],a[1],a[2]);
  console.log(b[0],b[1],b[2],Object.prototype.toString.call(b));
  try{new Uint16Array(buffer,1)}catch(error){console.log(error.name)}
  try{new Int16Array(new ArrayBuffer(3))}catch(error){console.log(error.name)}
  console.log(new Uint16Array(new ArrayBuffer(3),0,1).byteLength);
`,'2 4 2 4660 65534 4660 -2\n4660 65534 true\n3 6 6 1 65535 3\n-1 -32768 32767 [object Int16Array]\nRangeError\nRangeError\n2\n'));

test('sixteen-bit indexed descriptors and iterators survive stress GC',()=>{
 const source=`var view=new Int16Array([32768,65535]),value={valueOf(){for(var i=0;i<20;i++)new ArrayBuffer(i);return 65534}};Object.defineProperty(view,'0',{value});var iterator=view.values();for(var i=0;i<20;i++)new ArrayBuffer(i);console.log(view.byteLength,Object.getOwnPropertyDescriptor(view,'0').value,iterator.next().value,iterator.next().value);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'4 -2 -2 -1\n');
});

test('Uint32Array and Int32Array use four-byte elements and signed reads',()=>expectProgram(`
  var buffer=new ArrayBuffer(12),unsigned=new Uint32Array(buffer,4,2),signed=new Int32Array(buffer,4,2),view=new DataView(buffer);
  unsigned[0]=0x89abcdef;signed[1]=-2;
  console.log(unsigned.length,unsigned.byteLength,unsigned.byteOffset,unsigned[0],unsigned[1],signed[0],signed[1]);
  console.log(view.getUint32(4,true),view.getUint32(8,true),ArrayBuffer.isView(signed));
  var a=new Uint32Array([4294967295,4294967296,-1]),b=Int32Array.of(4294967295,2147483648,-2147483649);
  console.log(a.length,a.byteLength,a[0],a[1],a[2]);
  console.log(b[0],b[1],b[2],Object.prototype.toString.call(b));
  try{new Uint32Array(buffer,2)}catch(error){console.log(error.name)}
  try{new Int32Array(new ArrayBuffer(5))}catch(error){console.log(error.name)}
  console.log(new Uint32Array(new ArrayBuffer(5),0,1).byteLength);
`,'2 8 4 2309737967 4294967294 -1985229329 -2\n2309737967 4294967294 true\n3 12 4294967295 0 4294967295\n-1 -2147483648 2147483647 [object Int32Array]\nRangeError\nRangeError\n4\n'));

test('thirty-two-bit indexed descriptors and iterators survive stress GC',()=>{
 const source=`var view=Int32Array.of(2147483648,4294967295),value={valueOf(){for(var i=0;i<20;i++)new ArrayBuffer(i);return 4294967294}};Object.defineProperty(view,'0',{value});var iterator=view.values();for(var i=0;i<20;i++)new ArrayBuffer(i);console.log(view.byteLength,Object.getOwnPropertyDescriptor(view,'0').value,iterator.next().value,iterator.next().value);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'8 -2 -2 -1\n');
});

test('Float32Array and Float64Array round, alias DataView, and preserve special numbers',()=>expectProgram(`
  var buffer=new ArrayBuffer(16),f32=new Float32Array(buffer,4,2),f64=new Float64Array(buffer,8,1),view=new DataView(buffer);
  f32[0]=1/3;f32[1]=-0;
  console.log(f32.length,f32.byteLength,f32.byteOffset,f32[0]===Math.fround(1/3),1/f32[1]);
  console.log(view.getFloat32(4,true)===f32[0],1/view.getFloat32(8,true));
  f64[0]=Math.PI;console.log(f64[0]===Math.PI,view.getFloat64(8,true)===Math.PI);
  var a=new Float32Array([1/3,Infinity,NaN]),b=Float64Array.of(1/3,-Infinity,NaN);
  console.log(a.length,a.byteLength,a[0]===Math.fround(1/3),a[1],Number.isNaN(a[2]));
  console.log(b.length,b.byteLength,b[0]===1/3,b[1],Number.isNaN(b[2]),Object.prototype.toString.call(b));
  Object.defineProperty(a,'0',{value:2.5});console.log(a[0],ArrayBuffer.isView(a));
  try{new Float64Array(buffer,4)}catch(error){console.log(error.name)}
  try{new Float32Array(new ArrayBuffer(5))}catch(error){console.log(error.name)}
`,'2 8 4 true -Infinity\ntrue -Infinity\ntrue true\n3 12 true Infinity true\n3 24 true -Infinity true [object Float64Array]\n2.5 true\nRangeError\nRangeError\n'));

test('floating-point indexed conversion and iteration survive stress GC',()=>{
 const source=`var a=new Float32Array(2),v={valueOf(){for(var i=0;i<20;i++)new ArrayBuffer(i);return 1/3}};a[0]=v;Object.defineProperty(a,'1',{value:v});var it=a.values();for(var j=0;j<20;j++)new ArrayBuffer(j);console.log(a[0]===Math.fround(1/3),Object.getOwnPropertyDescriptor(a,'1').value===Math.fround(1/3),it.next().value===a[0],it.next().value===a[1]);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'true true true true\n');
});

test('BigInt64Array and BigUint64Array preserve exact 64-bit values',()=>expectProgram(`
  var buffer=new ArrayBuffer(24),signed=new BigInt64Array(buffer,8,2),unsigned=new BigUint64Array(buffer,8,2),view=new DataView(buffer);
  signed[0]=-1n;unsigned[1]=0x8000000000000000n;
  console.log(signed.length,signed.byteLength,signed.byteOffset,String(signed[0]),String(unsigned[0]),String(signed[1]));
  console.log(view.getBigUint64(8,true)===18446744073709551615n,view.getBigUint64(16,true)===9223372036854775808n);
  var a=new BigInt64Array([18446744073709551615n,9223372036854775808n]),b=BigUint64Array.of(-1n,18446744073709551616n);
  console.log(String(a[0]),String(a[1]),String(b[0]),String(b[1]));
  Object.defineProperty(a,'0',{value:5n});console.log(String(a[0]),ArrayBuffer.isView(a),Object.prototype.toString.call(b));
  try{a[0]=1}catch(error){console.log(error.name)}
  try{new BigUint64Array(buffer,4)}catch(error){console.log(error.name)}
  try{new BigInt64Array(new ArrayBuffer(9))}catch(error){console.log(error.name)}
`,'2 16 8 -1 18446744073709551615 -9223372036854775808\ntrue true\n-1 -9223372036854775808 18446744073709551615 0\n5 true [object BigUint64Array]\nTypeError\nRangeError\nRangeError\n'));

test('BigInt typed array coercion and iteration survive stress GC',()=>{
 const source=`var a=new BigUint64Array(2),value={valueOf(){for(var i=0;i<20;i++)new ArrayBuffer(i);return -1n}};a[0]=value;Object.defineProperty(a,'1',{value});var it=a.values();for(var j=0;j<20;j++)new ArrayBuffer(j);console.log(a[0]===18446744073709551615n,Object.getOwnPropertyDescriptor(a,'1').value===a[0],it.next().value===a[0],it.next().value===a[1]);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'true true true true\n');
});

test('TypedArray reverse swaps element bytes in place across numeric and BigInt views',()=>expectProgram(`
  var bytes=new Uint8Array([1,2,3,4]);console.log(bytes.reverse()===bytes,Array.from(bytes).join(','));
  var b=new ArrayBuffer(12),a=new Int32Array(b),v=new DataView(b);a[0]=0x12345678;a[1]=-2;a[2]=3;a.reverse();
  console.log(Array.from(a).join(','),v.getInt32(8,true)===0x12345678);
  var f=new Float32Array([1,-0,NaN]);f.reverse();console.log(Number.isNaN(f[0]),1/f[1],f[2]);
  var big=BigUint64Array.of(1n,2n,3n);console.log(big.reverse()===big,String(big[0]),String(big[1]),String(big[2]));
  console.log(new Uint8Array(0).reverse().length,new Int16Array([7]).reverse()[0]);
  try{Uint8Array.prototype.reverse.call({})}catch(error){console.log(error.name)}
`,'true 4,3,2,1\n3,-2,305419896 true\ntrue -Infinity 1\ntrue 3 2 1\n0 7\nTypeError\n'));

test('TypedArray reverse keeps shared backing under stress GC',()=>{
 const source=`var b=new ArrayBuffer(16),a=new BigInt64Array(b);a[0]=-1n;a[1]=2n;for(var i=0;i<30;i++)new ArrayBuffer(i);a.reverse();console.log(String(a[0]),String(a[1]),new DataView(b).getBigUint64(8,true)===18446744073709551615n);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'2 -1 true\n');
});

test('TypedArray copyWithin handles overlap, ranges, and exact element bytes',()=>expectProgram(`
  var a=new Uint8Array([1,2,3,4,5]);console.log(a.copyWithin(1,0,4)===a,Array.from(a).join(','));
  var b=new Int16Array([1,2,3,4,5]);b.copyWithin(0,1,4);console.log(Array.from(b).join(','));
  var c=new Float64Array([1,-0,NaN,4]);c.copyWithin(-2,0,2);console.log(c[2],1/c[3]);
  var big=BigUint64Array.of(1n,2n,3n,4n);big.copyWithin(1,0,3);console.log(Array.from(big).map(String).join(','));
  var buffer=new ArrayBuffer(16),offset=new Uint16Array(buffer,4,4);offset[0]=10;offset[1]=20;offset[2]=30;offset[3]=40;offset.copyWithin(2,0,2);console.log(Array.from(offset).join(','),new DataView(buffer).getUint16(0,true));
  var d=new Uint8Array([1,2,3]);d.copyWithin(0,2,1);console.log(Array.from(d).join(','));
  console.log(new Uint8Array(0).copyWithin(0,0).length,Uint8Array.prototype.copyWithin.length);
  try{Uint8Array.prototype.copyWithin.call({})}catch(error){console.log(error.name)}
`,'true 1,1,2,3,4\n2,3,4,4,5\n1 -Infinity\n1,1,2,3\n10,20,10,20 0\n1,2,3\n0 2\nTypeError\n'));

test('TypedArray copyWithin keeps receiver and bounds rooted through coercion',()=>{
 const source=`var a=BigInt64Array.of(1n,2n,3n),target={valueOf(){for(var i=0;i<30;i++)new ArrayBuffer(i);return 1}};a.copyWithin(target,0,2);console.log(String(a[0]),String(a[1]),String(a[2]));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'1 1 2\n');
});

test('TypedArray fill converts once and writes numeric and BigInt element bytes',()=>expectProgram(`
  var a=Int16Array.of(1,2,3,4);console.log(a.fill(65535,1,-1)===a,Array.from(a).join(','));
  var c=new Uint8ClampedArray(4);c.fill(2.5);console.log(Array.from(c).join(','));
  var f=new Float32Array(3);f.fill(-0,1);console.log(f[0],1/f[1],1/f[2]);f.fill(NaN,0,1);console.log(Number.isNaN(f[0]));
  var b=new BigUint64Array(3);b.fill(-1n,1);console.log(String(b[0]),String(b[1]),String(b[2]));
  var buffer=new ArrayBuffer(16),view=new Uint32Array(buffer,4,2);view.fill(0x12345678);console.log(new DataView(buffer).getUint32(0,true),new DataView(buffer).getUint32(4,true));
  console.log(new Uint8Array(0).fill(7).length,Uint8Array.prototype.fill.length);
  try{b.fill(1)}catch(error){console.log(error.name)}
  try{Uint8Array.prototype.fill.call({},1)}catch(error){console.log(error.name)}
`,'true 1,-1,-1,4\n2,2,2,2\n0 -Infinity -Infinity\ntrue\n0 18446744073709551615 18446744073709551615\n0 305419896\n0 1\nTypeError\nTypeError\n'));

test('TypedArray fill roots receiver and converts the value once under stress GC',()=>{
 const source=`var a=new BigInt64Array(3),calls=0,value={valueOf(){calls++;for(var i=0;i<20;i++)new ArrayBuffer(i);return -2n}},start={valueOf(){for(var i=0;i<20;i++)new ArrayBuffer(i);return 1}};a.fill(value,start);console.log(calls,String(a[0]),String(a[1]),String(a[2]));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'1 0 -2 -2\n');
});
