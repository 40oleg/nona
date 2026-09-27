import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Assembler} from '../src/backend/x64/assembler.js';

test('x64 atomic memory instructions encode width, lock and byte REX',()=>{
 const a=new Assembler('atomic');
 a.atomicXadd({base:'rax'},'rsi',8);
 a.atomicXadd({base:'r11'},'r10',16);
 a.atomicXadd({base:'r11'},'r10',32);
 a.atomicXadd({base:'r11'},'r10',64);
 a.atomicExchange({base:'r11'},'r10',64);
 a.atomicCompareExchange({base:'r11'},'r10',64);
 a.mfence();
 assert.deepEqual(Array.from(a.finish().bytes),[
  0xf0,0x40,0x0f,0xc0,0x30,
  0xf0,0x66,0x45,0x0f,0xc1,0x13,
  0xf0,0x45,0x0f,0xc1,0x13,
  0xf0,0x4d,0x0f,0xc1,0x13,
  0x4d,0x87,0x13,
  0xf0,0x4d,0x0f,0xb1,0x13,
  0x0f,0xae,0xf0,
 ]);
});
