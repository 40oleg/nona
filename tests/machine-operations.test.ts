import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Assembler} from '../src/backend/x64/assembler.js';
import {encodeBaseImage,decodeBaseImage} from '../src/cache.js';

test('semantic syscall emission records the instruction address and preserves x64 bytes',()=>{
  const a=new Assembler('system') as Assembler&{syscall?:(number:number)=>void};
  assert.equal(typeof a.syscall,'function');
  a.syscall!(9);
  assert.deepEqual([...a.finish().bytes],[0x48,0xb8,9,0,0,0,0,0,0,0,0x0f,0x05]);
  assert.deepEqual((a.finish() as unknown as {syscalls:object[]}).syscalls,[{offset:10,number:9}]);
  assert.throws(()=>a.syscall!(-1),/syscall/i);
});

test('semantic sign extension and timestamp preserve their original x64 instructions',()=>{
  const a=new Assembler() as Assembler&{signExtendRax?:()=>void;timestamp?:()=>void};
  assert.equal(typeof a.signExtendRax,'function');assert.equal(typeof a.timestamp,'function');
  a.signExtendRax!();a.timestamp!();assert.deepEqual([...a.finish().bytes],[0x48,0x99,0x0f,0x31]);
});

test('semantic condition materialization zero-extends a boolean without changing comparison flags',()=>{
  const a=new Assembler() as Assembler&{setCondition?:(condition:string)=>void};
  assert.equal(typeof a.setCondition,'function');a.setCondition!('e');
  assert.deepEqual([...a.finish().bytes],[0x0f,0x94,0xc0,0x48,0x0f,0xb6,0xc0]);
});

test('cached syscall locations survive serialization and independent decoding',()=>{
  const a=new Assembler('sys');a.syscall(1);
  const decoded=decodeBaseImage(encodeBaseImage({fragments:[{...a.finish(),name:'sys',section:'.text'}],imports:[],functions:[],literals:new Map(),serial:1}));
  assert.deepEqual(decoded?.fragments[0]?.syscalls,[{offset:10,number:1}]);
});
