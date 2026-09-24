import {RuntimeBuilder,slot,failIf} from './abi.js';
import {HeapLayout as H,HeapKind,ValueListLayout as L} from './heap-layout.js';
import {CellTag} from './environment-layout.js';

export function emitValueList(b:RuntimeBuilder):void {
 // RCX internal Value result, RDX initialized slot count. Leaf allocation;
 // publish only after all slots are safe for precise tracing.
 b.fn('rt.newValueList',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.mov('rax',0x07fffffffffffffcn);a.cmp('rdx','rax');failIf(a,'a');
  a.mov('rcx','rdx');a.shl('rcx',4);a.add('rcx',L.size);a.call('rt.alloc');a.mov('r10',HeapKind.valueList);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.load('r8',slot(48));a.store({base:'rax',disp:L.count},'r8');a.lea('r9',{base:'rax',disp:L.values});a.mov('r10',0);const loop=a.unique('loop'),done=a.unique('done');
  a.label(loop);a.test('r8','r8');a.jcc('e',done);a.store({base:'r9'},'r10');a.store({base:'r9',disp:8},'r10');a.add('r9',16);a.sub('r8',1);a.jmp(loop);a.label(done);
  a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',CellTag);a.store({base:'rcx'},'rax');
 });
 // RCX fresh/private array Value*, RDX item Value*. Own definitions bypass
 // inherited setters. Numeric formatting and allocation cannot call JS here.
 b.fn('rt.appendArrayValue',88,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.load('rax',{base:'rcx',disp:8});a.load('rax',{base:'rax',disp:16});a.mov('r10',0xffffffff);a.cmp('rax','r10');failIf(a,'ae','rt.throwRangeError');
  a.cvtsi2sd('xmm0','rax');a.storesd(slot(72),'xmm0');a.mov('rax',3);a.store(slot(64),'rax');a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toString');
  a.load('rcx',slot(40));a.lea('rdx',slot(64));a.load('r8',slot(48));a.mov('r9',1);a.call('rt.setProperty');
 });
}
