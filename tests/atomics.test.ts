import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';

test('Atomics object and isLockFree cover x64 integer widths',()=>expectProgram(`
 console.log(Object.prototype.toString.call(Atomics),Object.getPrototypeOf(Atomics)===Object.prototype);
 console.log(Atomics.isLockFree(1),Atomics.isLockFree(2),Atomics.isLockFree(4),Atomics.isLockFree(8),Atomics.isLockFree(3));
 console.log(Atomics.isLockFree(1.9),Atomics.isLockFree(),Atomics.isLockFree(Infinity));
 try{Atomics.isLockFree(1n)}catch(error){console.log(error.name)}
`,'[object Atomics] true\ntrue true true true false\ntrue false false\nTypeError\n'));

test('Atomics.load reads signed and BigInt integer views',()=>expectProgram(`
 var buffer=new SharedArrayBuffer(32),u8=new Uint8Array(buffer),i16=new Int16Array(buffer),i32=new Int32Array(buffer);
 u8[0]=255;i16[1]=-123;i32[1]=123456789;console.log(Atomics.load(u8,0),Atomics.load(i16,1),Atomics.load(i32,1));
 var big=new BigInt64Array(new SharedArrayBuffer(8));big[0]=-5n;console.log(String(Atomics.load(big,0)));
 var ordinary=new Int8Array([7]);console.log(Atomics.load(ordinary,0));
 try{Atomics.load(new Float32Array(1),0)}catch(error){console.log(error.name)}
 try{Atomics.load(u8,32)}catch(error){console.log(error.name)}
`,'255 -123 123456789\n-5\n7\nTypeError\nRangeError\n'));

test('Atomics.store writes atomically and returns converted Number or BigInt',()=>expectProgram(`
 var byte=new Int8Array(new SharedArrayBuffer(1));console.log(Atomics.store(byte,0,257.9),Atomics.load(byte,0));
 var big=new BigInt64Array(new SharedArrayBuffer(8));console.log(String(Atomics.store(big,0,18446744073709551617n)),String(Atomics.load(big,0)));
 console.log(String(Atomics.store(big,0,{valueOf(){return 18446744073709551618n}})),String(Atomics.load(big,0)));
  try{Atomics.store(big,0,1)}catch(error){console.log(error.name)}
  try{Atomics.store(big,0,{valueOf(){return 1}})}catch(error){console.log(error.name)}
`,'257 1\n18446744073709551617 1\n18446744073709551618 2\nTypeError\nTypeError\n'));

test('Atomics add and sub wrap by element width and return old values',()=>expectProgram(`
 var bytes=new Uint8Array(new SharedArrayBuffer(2));bytes[0]=255;console.log(Atomics.add(bytes,0,2),bytes[0],Atomics.sub(bytes,0,3),bytes[0]);
 var signed=new Int8Array(new SharedArrayBuffer(1));signed[0]=-128;console.log(Atomics.sub(signed,0,1),signed[0]);
  var big=new BigInt64Array(new SharedArrayBuffer(8));big[0]=-1n;console.log(String(Atomics.add(big,0,2n)),String(big[0]),String(Atomics.sub(big,0,3n)),String(big[0]));
  console.log(Atomics.exchange(bytes,0,7),bytes[0],String(Atomics.exchange(big,0,9n)),String(big[0]));
`,'255 1 1 254\n-128 127\n-1 1 1 -2\n254 7 -2 9\n'));

test('Atomics bitwise operations return old values and update Number and BigInt views',()=>expectProgram(`
 var bytes=new Uint8Array(new SharedArrayBuffer(1));bytes[0]=15;console.log(Atomics.and(bytes,0,10),bytes[0],Atomics.or(bytes,0,1),bytes[0],Atomics.xor(bytes,0,3),bytes[0]);
 var big=new BigUint64Array(new SharedArrayBuffer(8));big[0]=15n;console.log(String(Atomics.and(big,0,10n)),String(Atomics.or(big,0,1n)),String(Atomics.xor(big,0,3n)),String(big[0]));
`,'15 10 10 11 11 8\n15 10 11 8\n'));

test('Atomics compareExchange matches converted expected values',()=>expectProgram(`
  for(var C of [Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array]){
    var view=new C(new SharedArrayBuffer(64));view[3]=-5;
    console.log(C.name,view[3],Atomics.compareExchange(view,3,-5,0),view[3]);
  }
`,'Uint8Array 251 251 0\nInt8Array -5 -5 0\nUint16Array 65531 65531 0\nInt16Array -5 -5 0\nUint32Array 4294967291 4294967291 0\nInt32Array -5 -5 0\n'));
