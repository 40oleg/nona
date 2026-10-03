import {RuntimeBuilder,slot,failIf} from './abi.js';
import {emitCallStats} from './call-stats.js';
import {HeapLayout as H} from './heap-layout.js';
import type {Assembler} from '../backend/x64/assembler.js';

/**
 * Managed heap: size-classed cells carved from fixed chunks.
 *
 * Every managed allocation used to be its own HeapAlloc block on a global
 * linked list. The collector then had to sort all blocks by address before
 * each mark phase (to recognise pointers), binary-search that index for every
 * pointer it marked, walk the whole list to sweep, and call HeapFree for
 * every dead block: with a few hundred thousand live objects a collection
 * cost tens of milliseconds and allocation-heavy code spent half its time
 * in the collector.
 *
 * Now a block lives in a cell of a chunk: a 256 KiB page mapping that holds
 * cells of a single size class, carved from its front as needed. Freed cells
 * go on their class's free list and are reused before new ones are carved;
 * their payload is zeroed on reuse, so every allocation still starts cleared.
 * Blocks larger than the biggest class get a page mapping of their own. The
 * page map — a hash table from the 64 KiB granule of an address to its
 * mapping that changes only when a mapping is created or released — turns
 * any pointer, interior ones included, into its block header with one probe
 * and one multiplication (rt.blockOf), so the collector no longer builds an
 * index, and the sweep visits cells in address order instead of chasing a
 * list. Released large mappings are kept for reuse (rt.largeCache, at most
 * largeCacheLimit of them) because a program that grows a string or a
 * buffer step by step frees one large block for every one it allocates,
 * and mapping fresh pages costs a system call plus a page fault per 4 KiB
 * while a cached mapping only needs its bytes zeroed. Large mappings are
 * whole granules (64 KiB) so that the blocks of such a program keep
 * fitting the mappings it just released.
 *
 * The 40-byte block header (HeapLayout) is unchanged: `next` links a free
 * cell to the next one, `bytes` is the payload size that was requested, and
 * `kind` is FreeKind for a free cell. rt.liveBytes counts the cell bytes of
 * live blocks and rt.blocks their number. Page mappings come from
 * VirtualAlloc/VirtualFree (Linux: mmap/munmap shims).
 */
export const FreeKind=255;
/** Chunk header: next chunk, cell size, first cell, end of the carved cells,
 * and ceil(2^40 / cell size), which turns the division of rt.blockOf into a
 * multiplication (exact for every offset inside a chunk). */
export const ChunkLayout={next:0,cellSize:8,cells:16,carved:24,magic:32,size:64} as const;
/** Large mapping header, followed by the block header. */
export const LargeLayout={next:0,bytes:8,size:64} as const;
export const chunkBytes=1<<16;
/** Total block sizes (header included): 16-byte steps up to 1024, then doublings to 16384. */
export const smallClasses=62,classCount=66,largestClass=16384;
/** Released large mappings kept for reuse, and the largest one worth keeping. */
export const largeCacheLimit=16,largeCacheMaxBytes=8<<20;
const C=ChunkLayout,L=LargeLayout;
/** Page map entry: granule, mapping base, large flag. */
const T={key:0,base:8,large:16,size:24} as const;
const times24=(a:Assembler,dst:'r11'|'r10'|'rax',src:'rax'|'r11'|'r10'|'r9')=>{a.mov(dst,src);a.shl(dst,1);a.add(dst,src);a.shl(dst,3);};

export function emitMemory(b:RuntimeBuilder):void {
 // rt.fail reports call statistics, so they live with it (call-stats.ts).
 emitCallStats(b);
 b.data('rt.heap',new Uint8Array(8),'.data');
 for(const name of ['rt.blocks','rt.liveBytes','rt.chunks','rt.largeList','rt.largeCache','rt.largeCacheCount','rt.chunkTable','rt.chunkCount','rt.chunkUsed','rt.chunkCapacity'])b.data(name,new Uint8Array(8),'.data');
 // Per-class state, one blob: free list heads, carve cursors, carve limits, current chunks.
 b.data('rt.classState',new Uint8Array(4*8*classCount),'.data');
 for(const name of ['GetProcessHeap','HeapAlloc','HeapFree','GetStdHandle','GetConsoleMode','WriteConsoleW','WriteFile','WideCharToMultiByte','ExitProcess','VirtualAlloc','VirtualFree'])if(!b.bundle.imports.some(i=>i.symbol===name))b.bundle.imports.push({dll:'KERNEL32.dll',name,symbol:name});
 // Per-process seed of the string and number hashes (property index, Map/Set
 // index), so colliding keys cannot be precomputed (hash flooding).
 b.data('rt.hashSeed',new Uint8Array(8),'.data');
 b.fn('rt.init',40,a=>{
  a.emit([0x0f,0x31]);a.shl('rdx',32);a.or('rax','rdx');a.mov('r10',0x9E3779B97F4A7C15n);a.imul('rax','r10');a.store({rip:'rt.hashSeed'},'rax');
  a.callImport('GetProcessHeap');a.store({rip:'rt.heap'},'rax');a.test('rax','rax');failIf(a,'e');
 });

 // RCX bytes -> RAX zeroed page mapping (fails the process when exhausted).
 b.fn('rt.mapPages',40,a=>{
  a.mov('rdx','rcx');a.mov('rcx',0);a.mov('r8',0x3000);a.mov('r9',4);a.callImport('VirtualAlloc');a.test('rax','rax');failIf(a,'e');
 });
 // RCX mapping, RDX bytes: returns the pages to the system.
 b.fn('rt.unmapPages',40,a=>{a.mov('r8',0x4000);a.callImport('VirtualFree');});

 // RCX class index -> RAX cell size. Pure.
 b.fn('rt.classSize',40,a=>{
  const big=a.unique('big'),done=a.unique('done');a.cmp('rcx',smallClasses);a.jcc('ae',big);
  a.mov('rax','rcx');a.shl('rax',4);a.add('rax',48);a.jmp(done);
  a.label(big);a.sub('rcx',smallClasses-1);a.mov('rax',1024);a.shl('rax','cl');a.label(done);
 });
 // RCX cell size -> RAX class index. Pure.
 b.fn('rt.classOf',40,a=>{
  const big=a.unique('big'),done=a.unique('done');a.cmp('rcx',1024);a.jcc('a',big);
  a.mov('rax','rcx');a.sub('rax',48);a.shr('rax',4);a.jmp(done);
  a.label(big);a.mov('rax',smallClasses);a.mov('r10',2048);const loop=a.unique('loop');
  a.label(loop);a.cmp('rcx','r10');a.jcc('be',done);a.shl('r10',1);a.add('rax',1);a.jmp(loop);a.label(done);
 });

 // Page map: open-addressing hash table from the 64 KiB granule of an address
 // to the mapping it belongs to. Entries are {granule, base, large}; granule
 // 0 is empty and -1 a removed entry. rt.chunkCount is the number of live
 // entries, rt.chunkUsed the number of live and removed ones: a probe stops
 // only at an empty entry, so removed entries count towards the load and the
 // table is rebuilt (dropping them) when they would fill more than half of it.
 const hashGranule=(a:Assembler,src:'rcx'|'rax')=>{a.mov('rax',src);a.shr('rax',16);a.mov('r11',0x9E3779B97F4A7C15n);a.imul('rax','r11');a.shr('rax',32);};
 // RCX granule, RDX mapping base, R8 large flag.
 b.fn('rt.pageMapInsert',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  const room=a.unique('room'),probe=a.unique('probe'),place=a.unique('place'),fresh=a.unique('fresh');
  a.load('rax',{rip:'rt.chunkUsed'});a.add('rax',1);a.shl('rax',1);a.load('r10',{rip:'rt.chunkCapacity'});a.cmp('rax','r10');a.jcc('be',room);a.call('rt.pageMapGrow');
  a.label(room);a.load('rcx',slot(40));hashGranule(a,'rcx');a.load('r9',{rip:'rt.chunkCapacity'});a.sub('r9',1);a.and('rax','r9');a.load('r8',{rip:'rt.chunkTable'});
  a.label(probe);times24(a,'r10','rax');a.add('r10','r8');a.load('r11',{base:'r10',disp:T.key});a.test('r11','r11');a.jcc('e',fresh);a.cmp('r11',-1);a.jcc('e',place);
  a.add('rax',1);a.and('rax','r9');a.jmp(probe);
  // An empty entry becomes used; a removed one already was.
  a.label(fresh);a.load('rax',{rip:'rt.chunkUsed'});a.add('rax',1);a.store({rip:'rt.chunkUsed'},'rax');
  a.label(place);a.load('rax',slot(40));a.store({base:'r10',disp:T.key},'rax');a.load('rax',slot(48));a.store({base:'r10',disp:T.base},'rax');a.load('rax',slot(56));a.store({base:'r10',disp:T.large},'rax');
  a.load('rax',{rip:'rt.chunkCount'});a.add('rax',1);a.store({rip:'rt.chunkCount'},'rax');
 });
 // Rebuilds the table (64 entries at first) with room for four times the
 // live entries, dropping the removed ones, and reinserts the live entries.
 b.fn('rt.pageMapGrow',72,a=>{
  a.load('rax',{rip:'rt.chunkTable'});a.store(slot(40),'rax');a.load('rax',{rip:'rt.chunkCapacity'});a.store(slot(48),'rax');
  const sized=a.unique('sized'),widen=a.unique('widen');a.test('rax','rax');a.jcc('ne',sized);a.mov('rax',64);a.label(sized);
  a.load('r10',{rip:'rt.chunkCount'});a.add('r10',1);a.shl('r10',2);
  a.label(widen);a.cmp('r10','rax');a.jcc('be','rt.pageMapGrow.sizedUp');a.shl('rax',1);a.jmp(widen);a.label('rt.pageMapGrow.sizedUp');a.store({rip:'rt.chunkCapacity'},'rax');
  times24(a,'r11','rax');a.mov('r8','r11');a.load('rcx',{rip:'rt.heap'});a.mov('rdx',8);a.callImport('HeapAlloc');a.test('rax','rax');failIf(a,'e');
  a.store({rip:'rt.chunkTable'},'rax');a.mov('rax',0);a.store({rip:'rt.chunkCount'},'rax');a.store({rip:'rt.chunkUsed'},'rax');a.store(slot(56),'rax');
  const loop=a.unique('loop'),skip=a.unique('skip'),done=a.unique('done'),fresh=a.unique('fresh');
  a.label(loop);a.load('rax',slot(56));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('ae',done);
  times24(a,'r10','rax');a.load('rax',slot(40));a.add('r10','rax');a.load('rcx',{base:'r10',disp:T.key});a.test('rcx','rcx');a.jcc('e',skip);a.cmp('rcx',-1);a.jcc('e',skip);
  a.load('rdx',{base:'r10',disp:T.base});a.load('r8',{base:'r10',disp:T.large});a.call('rt.pageMapInsert');
  a.label(skip);a.load('rax',slot(56));a.add('rax',1);a.store(slot(56),'rax');a.jmp(loop);
  a.label(done);a.load('r8',slot(40));a.test('r8','r8');a.jcc('e',fresh);a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');a.label(fresh);
 });
 // RCX granule: removes its entry. Pure.
 b.fn('rt.pageMapRemove',40,a=>{
  const probe=a.unique('probe'),done=a.unique('done'),next=a.unique('next');
  hashGranule(a,'rcx');a.load('r9',{rip:'rt.chunkCapacity'});a.sub('r9',1);a.and('rax','r9');a.load('r8',{rip:'rt.chunkTable'});
  a.label(probe);times24(a,'r10','rax');a.add('r10','r8');a.load('r11',{base:'r10',disp:T.key});a.test('r11','r11');a.jcc('e',done);a.cmp('r11','rcx');a.jcc('ne',next);
  a.mov('r11',-1);a.store({base:'r10',disp:T.key},'r11');a.load('r11',{rip:'rt.chunkCount'});a.sub('r11',1);a.store({rip:'rt.chunkCount'},'r11');a.jmp(done);
  a.label(next);a.add('rax',1);a.and('rax','r9');a.jmp(probe);
  a.label(done);
 });
 // RCX pointer -> RAX page map entry of its mapping, or 0. Pure.
 b.fn('rt.chunkTableFind',40,a=>{
  const probe=a.unique('probe'),miss=a.unique('miss'),done=a.unique('done'),next=a.unique('next');
  a.load('r8',{rip:'rt.chunkTable'});a.test('r8','r8');a.jcc('e',miss);
  a.mov('rdx','rcx');a.shr('rdx',16);a.shl('rdx',16);hashGranule(a,'rcx');a.load('r9',{rip:'rt.chunkCapacity'});a.sub('r9',1);a.and('rax','r9');
  a.label(probe);times24(a,'r10','rax');a.add('r10','r8');a.load('r11',{base:'r10',disp:T.key});a.test('r11','r11');a.jcc('e',miss);a.cmp('r11','rdx');a.jcc('ne',next);a.mov('rax','r10');a.jmp(done);
  a.label(next);a.add('rax',1);a.and('rax','r9');a.jmp(probe);
  a.label(miss);a.mov('rax',0);a.label(done);
 });
 // RCX pointer -> RAX header of the live block whose payload contains it, or 0.
 b.fn('rt.blockOf',56,a=>{
  const miss=a.unique('miss'),done=a.unique('done'),large=a.unique('large'),check=a.unique('check');
  a.store(slot(40),'rcx');a.call('rt.chunkTableFind');a.test('rax','rax');a.jcc('e',done);
  a.load('rcx',slot(40));a.load('r8',{base:'rax',disp:T.base});a.load('r10',{base:'rax',disp:T.large});a.test('r10','r10');a.jcc('ne',large);
  a.load('r9',{base:'r8',disp:C.cells});a.cmp('rcx','r9');a.jcc('b',miss);a.load('r10',{base:'r8',disp:C.carved});a.cmp('rcx','r10');a.jcc('ae',miss);
  a.mov('rax','rcx');a.sub('rax','r9');a.load('r10',{base:'r8',disp:C.magic});a.imul('rax','r10');a.shr('rax',40);a.load('r10',{base:'r8',disp:C.cellSize});a.imul('rax','r10');a.add('rax','r9');a.jmp(check);
  a.label(large);a.lea('rax',{base:'r8',disp:L.size});
  a.label(check);a.load('r10',{base:'rax',disp:H.kind});a.cmp('r10',FreeKind);a.jcc('e',miss);
  a.lea('r10',{base:'rax',disp:H.size});a.cmp('rcx','r10');a.jcc('b',miss);a.sub('rcx','r10');a.load('r10',{base:'rax',disp:H.bytes});a.cmp('rcx','r10');a.jcc('ae',miss);a.jmp(done);
  a.label(miss);a.mov('rax',0);a.label(done);
 });

 // RCX class index: maps a chunk for the class and makes it current.
 b.fn('rt.newChunk',72,a=>{
  a.store(slot(40),'rcx');a.call('rt.classSize');a.store(slot(48),'rax');
  a.mov('rcx',chunkBytes);a.call('rt.mapPages');a.store(slot(56),'rax');
  a.load('r10',{rip:'rt.chunks'});a.store({base:'rax',disp:C.next},'r10');a.store({rip:'rt.chunks'},'rax');
  a.load('r10',slot(48));a.store({base:'rax',disp:C.cellSize},'r10');a.lea('r11',{base:'rax',disp:C.size});a.store({base:'rax',disp:C.cells},'r11');a.store({base:'rax',disp:C.carved},'r11');
  a.store(slot(64),'rax');a.mov('rax',1);a.shl('rax',40);a.add('rax','r10');a.sub('rax',1);a.mov('rdx',0);a.div('r10');a.mov('r11','rax');a.load('rax',slot(64));a.store({base:'rax',disp:C.magic},'r11');a.lea('r11',{base:'rax',disp:C.size});
  a.load('rcx',slot(40));a.shl('rcx',3);a.lea('r9',{rip:'rt.classState',addend:8*classCount});a.add('r9','rcx');a.store({base:'r9'},'r11');
  a.lea('r9',{rip:'rt.classState',addend:24*classCount});a.add('r9','rcx');a.store({base:'r9'},'rax');
  // Limit: the last cell that fits entirely.
  a.mov('rax',chunkBytes-C.size);a.mov('rdx',0);a.div('r10');a.imul('rax','r10');a.add('rax','r11');a.lea('r9',{rip:'rt.classState',addend:16*classCount});a.add('r9','rcx');a.store({base:'r9'},'rax');
  a.load('rcx',slot(56));a.mov('rdx','rcx');a.mov('r8',0);a.call('rt.pageMapInsert');
 });

 // RCX payload bytes -> RAX payload (header before it) whose contents the
 // caller writes completely before any safepoint: a recycled cell or cached
 // mapping is not zeroed. For string records and other pointer-free
 // payloads this halves the memory traffic of an allocation.
 b.data('rt.allocNoZero',new Uint8Array(8),'.data');
 b.data('rt.gcPoison',new Uint8Array(8),'.data');
 b.fn('rt.allocRaw',40,a=>{
  a.mov('rax',1);a.store({rip:'rt.allocNoZero'},'rax');a.call('rt.alloc');a.mov('r10',0);a.store({rip:'rt.allocNoZero'},'r10');
 });
 // RCX payload bytes -> RAX zeroed payload (header before it).
 b.fn('rt.alloc',72,a=>{
  a.store(slot(40),'rcx');a.add('rcx',H.size+15);failIf(a,'b');a.and('rcx',-16);a.store(slot(48),'rcx');
  const large=a.unique('large'),recycled=a.unique('recycled'),carve=a.unique('carve'),ready=a.unique('ready'),zero=a.unique('zero'),zeroed=a.unique('zeroed');
  a.cmp('rcx',largestClass);a.jcc('a',large);
  a.call('rt.classOf');a.store(slot(56),'rax');a.mov('rcx','rax');a.call('rt.classSize');a.store(slot(64),'rax');
  a.load('rcx',slot(56));a.shl('rcx',3);a.lea('r9',{rip:'rt.classState'});a.add('r9','rcx');a.load('rax',{base:'r9'});a.test('rax','rax');a.jcc('e',carve);
  a.load('r10',{base:'rax',disp:H.next});a.store({base:'r9'},'r10');
  // A recycled cell: clear its payload (the header is rewritten below).
  a.lea('r10',{base:'rax',disp:H.size});a.load('r11',slot(64));a.add('r11','rax');a.mov('r8',0);
  {a.load('r8',{rip:'rt.allocNoZero'});a.test('r8','r8');a.jcc('ne',zeroed);a.mov('r8',0);}
  a.label(zero);a.cmp('r10','r11');a.jcc('ae',zeroed);a.store({base:'r10'},'r8');a.add('r10',8);a.jmp(zero);a.label(zeroed);a.jmp(ready);
  a.label(carve);a.lea('r9',{rip:'rt.classState',addend:8*classCount});a.add('r9','rcx');a.load('rax',{base:'r9'});a.load('r10',slot(64));a.add('r10','rax');
  a.lea('r11',{rip:'rt.classState',addend:16*classCount});a.add('r11','rcx');a.load('r11',{base:'r11'});a.cmp('r10','r11');const fits=a.unique('fits');a.jcc('be',fits);
  a.load('rcx',slot(56));a.call('rt.newChunk');a.load('rcx',slot(56));a.shl('rcx',3);a.lea('r9',{rip:'rt.classState',addend:8*classCount});a.add('r9','rcx');a.load('rax',{base:'r9'});a.load('r10',slot(64));a.add('r10','rax');
  a.label(fits);a.store({base:'r9'},'r10');a.lea('r11',{rip:'rt.classState',addend:24*classCount});a.add('r11','rcx');a.load('r11',{base:'r11'});a.store({base:'r11',disp:C.carved},'r10');
  a.label(ready);a.load('r10',slot(40));a.store({base:'rax',disp:H.bytes},'r10');a.mov('r10',0);for(const offset of [H.next,H.kind,H.marked,H.greyNext])a.store({base:'rax',disp:offset},'r10');
  a.load('r10',slot(64));a.load('r11',{rip:'rt.liveBytes'});a.add('r11','r10');a.store({rip:'rt.liveBytes'},'r11');
  a.load('r11',{rip:'rt.blocks'});a.add('r11',1);a.store({rip:'rt.blocks'},'r11');
  a.add('rax',H.size);const done=a.unique('done');a.jmp(done);
  // Large: a mapping of its own, listed for the sweep; a cached mapping of
  // a fitting size (at most twice the need) is zeroed and reused.
  a.label(large);a.add('rcx',L.size+chunkBytes-1);a.and('rcx',-chunkBytes);a.store(slot(64),'rcx');
  {const scan=a.unique('scan'),skip=a.unique('skip'),mapped=a.unique('mapped');
   a.lea('r9',{rip:'rt.largeCache'});
   a.label(scan);a.load('rax',{base:'r9'});a.test('rax','rax');a.jcc('e',skip);a.load('r10',{base:'rax',disp:L.bytes});a.cmp('r10','rcx');a.jcc('b','rt.alloc.cacheNext');
   a.mov('r11','rcx');a.add('r11','r11');a.cmp('r10','r11');a.jcc('a','rt.alloc.cacheNext');
   // Unlink it, record the mapping size actually held, and clear the block.
   a.load('r10',{base:'rax',disp:L.next});a.store({base:'r9'},'r10');a.load('r10',{rip:'rt.largeCacheCount'});a.sub('r10',1);a.store({rip:'rt.largeCacheCount'},'r10');
   a.load('r10',{base:'rax',disp:L.bytes});a.store(slot(64),'r10');a.store(slot(56),'rax');
   {const raw=a.unique('raw');a.load('rcx',{rip:'rt.allocNoZero'});a.test('rcx','rcx');a.jcc('ne',raw);
    a.lea('rcx',{base:'rax',disp:L.size});a.mov('rdx','r10');a.sub('rdx',L.size);a.call('rt.zeroBytes');a.label(raw);}a.load('rax',slot(56));a.jmp(mapped);
   a.label('rt.alloc.cacheNext');a.lea('r9',{base:'rax',disp:L.next});a.jmp(scan);
   a.label(skip);a.call('rt.mapPages');
   a.label(mapped);}
  a.load('r10',slot(64));a.store({base:'rax',disp:L.bytes},'r10');a.load('r10',{rip:'rt.largeList'});a.store({base:'rax',disp:L.next},'r10');a.store({rip:'rt.largeList'},'rax');
  a.store(slot(56),'rax');a.mov('rcx','rax');a.load('rdx',slot(64));a.call('rt.largeMapPages');
  // The block header is written in full: a reused mapping still carries the old one.
  a.load('rax',slot(56));a.add('rax',L.size);a.load('r10',slot(40));a.store({base:'rax',disp:H.bytes},'r10');a.mov('r10',0);for(const offset of [H.next,H.kind,H.marked,H.greyNext])a.store({base:'rax',disp:offset},'r10');
  a.load('r10',slot(64));a.load('r11',{rip:'rt.liveBytes'});a.add('r11','r10');a.store({rip:'rt.liveBytes'},'r11');
  a.load('r11',{rip:'rt.blocks'});a.add('r11',1);a.store({rip:'rt.blocks'},'r11');
  a.add('rax',H.size);a.label(done);
 });
 // RCX destination, RDX bytes (a multiple of 8): clears the memory with
 // `rep stosq`. RDI is a preserved register and is saved around the store.
 b.fn('rt.zeroBytes',56,a=>{
  a.store(slot(40),'rdi');a.mov('rdi','rcx');a.mov('rcx','rdx');a.shr('rcx',3);a.mov('rax',0);a.repStosq();a.load('rdi',slot(40));
 });
 // RCX large mapping (already unlinked from rt.largeList and unregistered):
 // keeps it at the head of the cache for reuse, dropping the oldest cached
 // mapping when the cache is full, or returns it to the system when it is
 // too big to be worth keeping. Newest-first order matters for a growing
 // program: the mappings it released last are the ones its next blocks fit.
 b.fn('rt.releaseLarge',56,a=>{
  const unmap=a.unique('unmap'),done=a.unique('done'),room=a.unique('room'),tail=a.unique('tail');
  a.load('rax',{base:'rcx',disp:L.bytes});a.cmp('rax',largeCacheMaxBytes);a.jcc('a',unmap);
  a.mov('r10',FreeKind);a.store({base:'rcx',disp:L.size+H.kind},'r10');
  a.load('r10',{rip:'rt.largeCache'});a.store({base:'rcx',disp:L.next},'r10');a.store({rip:'rt.largeCache'},'rcx');
  a.load('rax',{rip:'rt.largeCacheCount'});a.add('rax',1);a.store({rip:'rt.largeCacheCount'},'rax');a.cmp('rax',largeCacheLimit);a.jcc('be',room);
  // Full: unlink the last entry and unmap it instead.
  a.sub('rax',1);a.store({rip:'rt.largeCacheCount'},'rax');a.lea('r9',{rip:'rt.largeCache'});
  a.label(tail);a.load('rax',{base:'r9'});a.load('r10',{base:'rax',disp:L.next});a.test('r10','r10');a.jcc('e','rt.releaseLarge.last');a.lea('r9',{base:'rax',disp:L.next});a.jmp(tail);
  a.label('rt.releaseLarge.last');a.mov('r10',0);a.store({base:'r9'},'r10');a.mov('rcx','rax');a.jmp(unmap);
  a.label(room);a.jmp(done);
  a.label(unmap);a.load('rdx',{base:'rcx',disp:L.bytes});a.call('rt.unmapPages');
  a.label(done);
 });
 // RCX large mapping base, RDX its size: registers every granule of the mapping.
 b.fn('rt.largeMapPages',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(56),'rcx');a.add('rdx','rcx');a.store(slot(48),'rdx');
  const loop=a.unique('loop'),done=a.unique('done');
  a.label(loop);a.load('rcx',slot(40));a.load('r10',slot(48));a.cmp('rcx','r10');a.jcc('ae',done);
  a.load('rdx',slot(56));a.mov('r8',1);a.call('rt.pageMapInsert');a.load('rax',slot(40));a.add('rax',chunkBytes);a.store(slot(40),'rax');a.jmp(loop);
  a.label(done);
 });
 // RCX large mapping base, RDX its size: unregisters its granules.
 b.fn('rt.largeUnmapPages',56,a=>{
  a.store(slot(40),'rcx');a.add('rdx','rcx');a.store(slot(48),'rdx');
  const loop=a.unique('loop'),done=a.unique('done');
  a.label(loop);a.load('rcx',slot(40));a.load('r10',slot(48));a.cmp('rcx','r10');a.jcc('ae',done);a.call('rt.pageMapRemove');a.load('rax',slot(40));a.add('rax',chunkBytes);a.store(slot(40),'rax');a.jmp(loop);
  a.label(done);
 });
 // RCX cell header of a dead block in a chunk of cell size RDX: frees the cell.
 b.fn('rt.freeCell',56,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.mov('rcx','rdx');a.call('rt.classOf');a.shl('rax',3);a.lea('r9',{rip:'rt.classState'});a.add('r9','rax');
  a.load('rcx',slot(40));a.load('r10',{base:'r9'});a.store({base:'rcx',disp:H.next},'r10');a.store({base:'r9'},'rcx');a.mov('r10',FreeKind);a.store({base:'rcx',disp:H.kind},'r10');
  a.load('r10',slot(48));a.load('r11',{rip:'rt.liveBytes'});a.sub('r11','r10');a.store({rip:'rt.liveBytes'},'r11');
  a.load('r11',{rip:'rt.blocks'});a.sub('r11',1);a.store({rip:'rt.blocks'},'r11');
  // Under GC stress the payload is filled with 0xDD: a Value read through a
  // missing root then has an invalid tag and a pointer that faults, instead
  // of looking valid until the cell is reused. rt.alloc clears it again.
  {const done=a.unique('done'),loop=a.unique('loop');a.load('rax',{rip:'rt.gcPoison'});a.test('rax','rax');a.jcc('e',done);
   a.load('r10',slot(40));a.load('r11',slot(48));a.add('r11','r10');a.add('r10',H.size);a.mov('rax',0xddddddddddddddddn);
   a.label(loop);a.cmp('r10','r11');a.jcc('ae',done);a.store({base:'r10'},'rax');a.add('r10',8);a.jmp(loop);a.label(done);}
 });
 // Releases every mapping (process exit, tests).
 b.fn('rt.dispose',56,a=>{
  const chunks=a.unique('chunks'),chunksDone=a.unique('chunksDone'),larges=a.unique('larges'),largesDone=a.unique('largesDone');
  a.label(chunks);a.load('rcx',{rip:'rt.chunks'});a.test('rcx','rcx');a.jcc('e',chunksDone);a.load('rax',{base:'rcx',disp:C.next});a.store({rip:'rt.chunks'},'rax');a.mov('rdx',chunkBytes);a.call('rt.unmapPages');a.jmp(chunks);
  a.label(chunksDone);a.label(larges);a.load('rcx',{rip:'rt.largeList'});a.test('rcx','rcx');a.jcc('e',largesDone);a.load('rax',{base:'rcx',disp:L.next});a.store({rip:'rt.largeList'},'rax');a.load('rdx',{base:'rcx',disp:L.bytes});a.call('rt.unmapPages');a.jmp(larges);
  a.label(largesDone);
  {const cached=a.unique('cached'),cacheDone=a.unique('cacheDone');
   a.label(cached);a.load('rcx',{rip:'rt.largeCache'});a.test('rcx','rcx');a.jcc('e',cacheDone);a.load('rax',{base:'rcx',disp:L.next});a.store({rip:'rt.largeCache'},'rax');a.load('rdx',{base:'rcx',disp:L.bytes});a.call('rt.unmapPages');a.jmp(cached);
   a.label(cacheDone);}
  a.mov('rax',0);a.store({rip:'rt.liveBytes'},'rax');a.store({rip:'rt.blocks'},'rax');a.store({rip:'rt.chunkCount'},'rax');a.store({rip:'rt.chunkUsed'},'rax');a.store({rip:'rt.largeCacheCount'},'rax');
  // The page map keeps its allocation; its entries are now stale.
  {const clearMap=a.unique('clearMap'),mapCleared=a.unique('mapCleared');a.load('r9',{rip:'rt.chunkTable'});a.load('r11',{rip:'rt.chunkCapacity'});times24(a,'r10','r11');
   a.label(clearMap);a.test('r10','r10');a.jcc('e',mapCleared);a.store({base:'r9'},'rax');a.add('r9',8);a.sub('r10',8);a.jmp(clearMap);a.label(mapCleared);}
  a.lea('r10',{rip:'rt.classState'});a.mov('r11',4*classCount*8);const clear=a.unique('clear'),cleared=a.unique('cleared');
  a.label(clear);a.test('r11','r11');a.jcc('e',cleared);a.store({base:'r10'},'rax');a.add('r10',8);a.sub('r11',8);a.jmp(clear);
  a.label(cleared);
 });
 b.fn('rt.fail',72,a=>{a.call('rt.callStatsReport');a.mov('rcx',-12);a.callImport('GetStdHandle');a.mov('rcx','rax');a.lea('rdx',{rip:'rt.error'});a.mov('r8',20);a.lea('r9',slot(48));a.mov('rax',0);a.store(slot(32),'rax');a.callImport('WriteFile');a.mov('rcx',1);a.callImport('ExitProcess');});
 b.data('rt.error',new TextEncoder().encode('Nona runtime error\r\n'));
}
