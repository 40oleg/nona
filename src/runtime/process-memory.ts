import {RuntimeBuilder} from './abi.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';
import {ChunkLayout as C,LargeLayout as L,chunkBytes} from './memory.js';
import {ArrayBufferKind,ArrayBufferLayout as B} from './array-buffer.js';

/** Snapshot allocator state without allocating, collecting, or calling host code. */
export function emitProcessMemory(b:RuntimeBuilder):void {
 b.fn('process.heapSnapshot.code',40,a=>{
  a.mov('r9','rcx');a.mov('rax',0);a.store({base:'r9'},'rax');
  a.load('rax',{rip:'rt.sharedArrayBufferBytes'});a.store({base:'r9',disp:16},'rax');
  a.load('rax',{rip:'rt.liveBytes'});a.store({base:'r9',disp:8},'rax');
  a.load('rax',{rip:'rt.blocks'});a.store({base:'r9',disp:24},'rax');
  // Ordinary ArrayBuffer backing stores are managed raw allocations. Shared
  // stores use OS heap allocations without GC headers and are counted above.
  const inspect=(prefix:string)=>{
   const done=a.unique(prefix+'done'),yes=a.unique(prefix+'buffer');
   a.load('r10',{base:'rdx',disp:H.kind});a.cmp('r10',HeapKind.object);a.jcc('ne',done);
   a.load('r10',{base:'rdx',disp:H.size});a.cmp('r10',ArrayBufferKind);a.jcc('ne',done);a.label(yes);
   a.load('r10',{base:'rdx',disp:H.size+B.bytes});a.test('r10','r10');a.jcc('e',done);
   a.load('r10',{base:'r10',disp:H.bytes-H.size});a.load('rax',{base:'r9',disp:16});a.add('rax','r10');a.store({base:'r9',disp:16},'rax');a.label(done);
  };
  a.load('r8',{rip:'rt.chunks'});const chunks=a.unique('chunks'),chunksDone=a.unique('chunksDone');
  a.label(chunks);a.test('r8','r8');a.jcc('e',chunksDone);
  a.load('rax',{base:'r9'});a.add('rax',chunkBytes);a.store({base:'r9'},'rax');
  a.load('rdx',{base:'r8',disp:C.cells});a.load('r11',{base:'r8',disp:C.carved});const cells=a.unique('cells'),next=a.unique('nextChunk');
  a.label(cells);a.cmp('rdx','r11');a.jcc('ae',next);inspect('cell');a.load('r10',{base:'r8',disp:C.cellSize});a.add('rdx','r10');a.jmp(cells);
  a.label(next);a.load('r8',{base:'r8',disp:C.next});a.jmp(chunks);a.label(chunksDone);
  for(const name of ['rt.largeList','rt.largeCache']){
   a.load('r8',{rip:name});const loop=a.unique('large'),done=a.unique('largeDone');
   a.label(loop);a.test('r8','r8');a.jcc('e',done);a.load('r10',{base:'r8',disp:L.bytes});a.load('rax',{base:'r9'});a.add('rax','r10');a.store({base:'r9'},'rax');
   if(name==='rt.largeList'){a.lea('rdx',{base:'r8',disp:L.size});inspect('large')}
   a.load('r8',{base:'r8',disp:L.next});a.jmp(loop);a.label(done);
  }
 });
}
