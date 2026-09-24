import {RuntimeBuilder,slot,failIf} from './abi.js';
import {HeapLayout as H} from './heap-layout.js';

export function emitMemory(b:RuntimeBuilder):void {
 b.data('rt.heap',new Uint8Array(8),'.data');b.data('rt.blocks',new Uint8Array(8),'.data');
 b.data('rt.liveBytes',new Uint8Array(8),'.data');
 for(const name of ['GetProcessHeap','HeapAlloc','HeapFree','GetStdHandle','GetConsoleMode','WriteConsoleW','WriteFile','WideCharToMultiByte','ExitProcess'])b.bundle.imports.push({dll:'KERNEL32.dll',name,symbol:name});
 b.fn('rt.init',40,a=>{a.callImport('GetProcessHeap');a.store({rip:'rt.heap'},'rax');a.test('rax','rax');failIf(a,'e');});
 b.fn('rt.alloc',56,a=>{
  a.add('rcx',H.size);failIf(a,'b');a.store(slot(40),'rcx');a.mov('r8','rcx');a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapAlloc');a.test('rax','rax');failIf(a,'e');
  a.load('r10',{rip:'rt.blocks'});a.store({base:'rax',disp:H.next},'r10');a.store({rip:'rt.blocks'},'rax');
  a.load('r10',slot(40));a.load('r11',{rip:'rt.liveBytes'});a.add('r11','r10');a.store({rip:'rt.liveBytes'},'r11');
  a.sub('r10',H.size);a.store({base:'rax',disp:H.bytes},'r10');a.mov('r10',0);
  for(const offset of [H.kind,H.marked,H.greyNext])a.store({base:'rax',disp:offset},'r10');
  a.add('rax',H.size);
 });
 b.fn('rt.dispose',56,a=>{a.label('rt.dispose.loop');a.load('r8',{rip:'rt.blocks'});a.test('r8','r8');a.jcc('e','rt.dispose.done');a.load('rax',{base:'r8'});a.store({rip:'rt.blocks'},'rax');a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');a.jmp('rt.dispose.loop');a.label('rt.dispose.done');a.mov('rax',0);a.store({rip:'rt.liveBytes'},'rax');});
 b.fn('rt.fail',72,a=>{a.mov('rcx',-12);a.callImport('GetStdHandle');a.mov('rcx','rax');a.lea('rdx',{rip:'rt.error'});a.mov('r8',20);a.lea('r9',slot(48));a.mov('rax',0);a.store(slot(32),'rax');a.callImport('WriteFile');a.mov('rcx',1);a.callImport('ExitProcess');});
 b.data('rt.error',new TextEncoder().encode('Nona runtime error\r\n'));
}
