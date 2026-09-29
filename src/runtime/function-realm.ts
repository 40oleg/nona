import {RuntimeBuilder,failIf} from './abi.js';
import {ObjectLayout as O,ProxyKind} from './object-layout.js';
import {FunctionLayout,FunctionKind} from './functions.js';
import {BoundDataLayout as B} from './bound-layout.js';
import {ProxyLayout as PL} from './proxy.js';

export function emitFunctionRealm(b:RuntimeBuilder):void {
 // The realm index of this runtime copy (0: main realm; patched in clones).
 b.data('rt.realmIndex',new Uint8Array(8),'.data');
 // GetFunctionRealm: RCX function object pointer; RAX realm index.
 b.fn('rt.functionRealm',40,a=>{
  const loop=a.unique('loop'),proxy=a.unique('proxy'),bound=a.unique('bound'),done=a.unique('done'),other=a.unique('other');
  a.label(loop);a.load('rax',{base:'rcx',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('e',proxy);a.cmp('rax',FunctionKind);a.jcc('ne',other);
  a.load('rax',{base:'rcx',disp:FunctionLayout.bound});a.test('rax','rax');a.jcc('ne',bound);
  a.load('rax',{base:'rcx',disp:FunctionLayout.realm});a.jmp(done);
  a.label(bound);a.load('rcx',{base:'rax',disp:B.target+8});a.jmp(loop);
  a.label(proxy);a.load('rax',{base:'rcx',disp:PL.revoked});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  a.load('rcx',{base:'rcx',disp:PL.target+8});a.jmp(loop);
  a.label(other);a.load('rax',{rip:'rt.realmIndex'});a.label(done);
 });
}
