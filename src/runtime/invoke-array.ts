import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O} from './object-layout.js';
import {ValueListLayout as L} from './heap-layout.js';
import {maxApplyArguments} from './function-apply.js';

/** Invoke with a private dense argument array produced by spread lowering.
 * RCX output, RDX callee, R8 array, R9 receiver, stack fifth = construct,
 * stack sixth = optional new.target Value pointer.
 */
export function emitInvokeArray(b:RuntimeBuilder):void {
 rootedFn(b,'rt.invokeArray',168,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'value',register:'r9'},{kind:'locals',offset:96,count:2}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.load('rax',slot(frame+48));a.store(slot(88),'rax');
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.length});
  a.cmp('rax',maxApplyArguments+1);failIf(a,'ae','rt.throwRangeError');a.store(slot(72),'rax');
  a.lea('rcx',slot(112));a.mov('rdx','rax');a.call('rt.newValueList');
  a.mov('rax',0);a.store(slot(80),'rax');
  const loop=a.unique('loop'),invoke=a.unique('invoke'),construct=a.unique('construct'),done=a.unique('done');
  a.label(loop);a.load('rax',slot(80));a.load('r10',slot(72));a.cmp('rax','r10');a.jcc('ae',invoke);
  a.cvtsi2sd('xmm0','rax');a.storesd(slot(104),'xmm0');a.mov('rax',3);a.store(slot(96),'rax');
  a.lea('rcx',slot(96));a.lea('rdx',slot(96));a.call('rt.toString');
  a.load('rax',slot(80));a.shl('rax',4);a.load('rcx',slot(120));a.add('rcx',L.values);a.add('rcx','rax');
  a.load('rdx',slot(56));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.load('rax',slot(80));a.add('rax',1);a.store(slot(80),'rax');a.jmp(loop);
  a.label(invoke);a.load('rax',slot(64));a.store(slot(32),'rax');
  a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(72));a.load('r9',slot(120));a.add('r9',L.values);
  a.load('rax',slot(frame+40));a.test('rax','rax');a.jcc('ne',construct);
  a.call('rt.invoke');a.jmp(done);
  a.label(construct);a.load('rax',slot(88));a.store(slot(40),'rax');a.call('rt.invokeConstruct');a.label(done);
 });
}
