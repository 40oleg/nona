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
