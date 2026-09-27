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
