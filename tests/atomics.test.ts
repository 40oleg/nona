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
