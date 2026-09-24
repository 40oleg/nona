import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {RuntimeBuilder,slot,failIf} from '../src/runtime/abi.js';
import {preservedGp,preservedXmm} from '../src/runtime/exception-layout.js';
import {prependFunctionBuiltin} from '../src/runtime/function-builtin.js';
import {runNative} from './helpers/native.js';

test('exception transfer restores all GP and full 128-bit XMM nonvolatile state',()=>{
 const program=generate(lower(bind(parse(lex('globalThis.seed();try{globalThis.corrupt(7);}catch(e){console.log(e,globalThis.check());}')))),{gcStress:true});
 const b=new RuntimeBuilder();b.bundle=program;
 for(const name of ['seed','corrupt','check'])prependFunctionBuiltin(b,'test.'+name,name,name==='corrupt'?1:0,'rt.globalObject');
 for(const [i] of preservedXmm.entries()){
  const bytes=new Uint8Array(16),view=new DataView(bytes.buffer);
  view.setBigUint64(0,0x1122334455667700n+BigInt(i),true);view.setBigUint64(8,0x8877665544332200n+BigInt(i),true);
  b.data('test.xmm'+i,bytes);
 }
 // Test-only helpers deliberately alter nonvolatile state. The source handler
 // must restore the seeded state rather than rely on normal callee epilogues.
 b.fn('test.seed.code',40,a=>{
  preservedGp.forEach((reg,i)=>a.mov(reg,0x123400+i));
  preservedXmm.forEach((reg,i)=>a.loadXmm128(reg,{rip:'test.xmm'+i}));
  a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
 b.fn('test.corrupt.code',40,a=>{
  preservedGp.forEach(reg=>a.mov(reg,0));a.mov('rax',0);
  preservedXmm.forEach(reg=>a.movqToXmm(reg,'rax'));
  a.mov('rcx','r8');a.call('rt.throw');
 });
 b.fn('test.check.code',72,a=>{
  a.store(slot(40),'rcx');preservedGp.forEach((reg,i)=>{a.cmp(reg,0x123400+i);failIf(a,'ne');});
  preservedXmm.forEach((reg,i)=>{
   a.storeXmm128(slot(48),reg);
   for(const [offset,bits] of [[0,0x1122334455667700n],[8,0x8877665544332200n]] as const){a.load('rax',slot(48+offset));a.mov('r10',bits+BigInt(i));a.cmp('rax','r10');failIf(a,'ne');}
  });
  a.load('rcx',slot(40));a.mov('rax',2);a.store({base:'rcx'},'rax');a.mov('rax',1);a.store({base:'rcx',disp:8},'rax');
 });
 const r=runNative(linkPe(program));assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stdout.toString(),'7 true\n');
});
