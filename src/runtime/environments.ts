import {RuntimeBuilder,slot,failIf} from './abi.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';
import {CellTag,CellLayout as C,EnvironmentLayout as E} from './environment-layout.js';

export function emitEnvironments(b:RuntimeBuilder):void {
 // RCX output internal Cell Value*, RDX initial JavaScript Value*.
 b.fn('rt.newCell',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.mov('rcx',C.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.cell);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.load('rdx',slot(48));a.load('r10',{base:'rdx'});a.load('r11',{base:'rdx',disp:8});
  a.store({base:'rax'},'r10');a.store({base:'rax',disp:8},'r11');
  a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',CellTag);a.store({base:'rcx'},'rax');
 });
 b.fn('rt.readCell',40,a=>{
  a.load('rax',{base:'rdx'});a.cmp('rax',CellTag);failIf(a,'ne');
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10'});a.store({base:'rcx'},'rax');
  a.load('rax',{base:'r10',disp:8});a.store({base:'rcx',disp:8},'rax');
 });
 b.fn('rt.writeCell',40,a=>{
  a.load('rax',{base:'rcx'});a.cmp('rax',CellTag);failIf(a,'ne');
  a.load('r10',{base:'rcx',disp:8});a.load('rax',{base:'rdx'});a.store({base:'r10'},'rax');
  a.load('rax',{base:'rdx',disp:8});a.store({base:'r10',disp:8},'rax');
 });
 // RCX count, RDX array of internal Cell Values. Return raw environment pointer.
 // Caller cannot enter a safepoint until it has linked this into its function.
 b.fn('rt.newEnvironment',72,a=>{
  const done=a.unique('done'),loop=a.unique('loop');a.mov('rax',0);a.test('rcx','rcx');a.jcc('e',done);
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  a.mov('rax',0x1ffffffffffffffen);a.cmp('rcx','rax');failIf(a,'a');a.shl('rcx',3);a.add('rcx',E.cells);a.call('rt.alloc');
  a.mov('r10',HeapKind.environment);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.load('r8',slot(40));a.store({base:'rax',disp:E.count},'r8');a.load('rdx',slot(48));a.lea('r9',{base:'rax',disp:E.cells});
  a.label(loop);a.load('r10',{base:'rdx'});a.cmp('r10',CellTag);failIf(a,'ne');
  a.load('r10',{base:'rdx',disp:8});a.store({base:'r9'},'r10');a.add('r9',8);a.add('rdx',16);a.sub('r8',1);a.jcc('ne',loop);
  a.label(done);
 });
}
