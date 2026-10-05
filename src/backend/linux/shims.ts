import type {Assembler} from '../x64/assembler.js';
import {RuntimeBuilder,slot} from '../../runtime/abi.js';
import {GeneratorStack} from '../../runtime/generator-stack.js';
import type {NamedFragment,NativeProgram} from '../pe/model.js';

/** Linux syscall implementations of the small Win64-style native ABI used by
 * the existing runtime. They let semantic runtime code remain target-neutral.
 */
export interface PosixShimOptions {pageSize?:4096|16384|65536;syscall?:(a:Assembler,number:number)=>void;replace?:ReadonlySet<string>}
export function linuxShims(imports:NativeProgram['imports'],options:PosixShimOptions={}):NamedFragment[] {
 const b=new RuntimeBuilder(),pageSize=options.pageSize??4096;
 const systemCall=options.syscall??((a:Assembler,number:number)=>a.syscall(number));
 const fn=(name:string,size:number,body:(a:Assembler)=>void)=>{if(!options.replace?.has(name))b.fn(name,size,body);};
 for(const {symbol} of imports){
  b.bundle.fragments.push({name:symbol,section:'.rdata',alignment:8,bytes:new Uint8Array(8),symbols:{},fixups:[
   {offset:0,kind:'va64',target:'linux.'+symbol+'.code',addend:0},
  ]});
 }
 fn('linux.GetProcessHeap.code',40,a=>a.mov('rax',1));
 // Windows thread handles are unavailable here; the process adapter queries
 // Linux/BSD RUSAGE_THREAD directly instead of claiming a successful Win32 call.
 fn('linux.GetThreadTimes.code',40,a=>a.mov('rax',0));
 // Heap: size classes of 32..4096 bytes (header included) carved from 1 MiB
 // mmap chunks with per-class free lists; larger blocks map their own pages.
 // The 16-byte header holds the block size. A spin lock serializes agents.
 // HEAP_ZERO_MEMORY (flag 8) zeroes recycled blocks; fresh chunk memory is
 // already zero.
 b.data('linux.heapLock',new Uint8Array(8),'.data');
 b.data('linux.heapFree',new Uint8Array(8*8),'.data');
 b.data('linux.heapCursor',new Uint8Array(8),'.data');
 b.data('linux.heapEnd',new Uint8Array(8),'.data');
 const lock=(a:import('../x64/assembler.js').Assembler)=>{
  const spin=a.unique('spin');a.label(spin);a.mov('rax',0);a.mov('r11',1);a.atomicCompareExchange({rip:'linux.heapLock'},'r11',64);a.jcc('ne',spin);
 };
 const unlock=(a:import('../x64/assembler.js').Assembler)=>{a.mov('r11',0);a.atomicExchange({rip:'linux.heapLock'},'r11',64);};
 fn('linux.HeapAlloc.code',88,a=>{
  a.store(slot(48),'rsi');a.store(slot(56),'rdi');a.store(slot(64),'rdx');
  const bad=a.unique('bad'),done=a.unique('done'),large=a.unique('large'),small=a.unique('small');
  a.mov('rsi','r8');a.add('rsi',16);a.jcc('b',bad);a.cmp('rsi',4096);a.jcc('a',large);
  // Small: class size s (power of two >= 32) and index i.
  a.mov('rdi',32);a.mov('r9',0);const grow=a.unique('grow'),sized=a.unique('sized');
  a.label(grow);a.cmp('rdi','rsi');a.jcc('ae',sized);a.shl('rdi',1);a.add('r9',1);a.jmp(grow);a.label(sized);
  a.store(slot(40),'rdi');a.store(slot(72),'r9');lock(a);
  a.load('r9',slot(72));a.shl('r9',3);a.lea('r10',{rip:'linux.heapFree'});a.add('r10','r9');a.load('rax',{base:'r10'});a.test('rax','rax');
  const carve=a.unique('carve'),got=a.unique('got');a.jcc('e',carve);
  a.load('r11',{base:'rax',disp:16});a.store({base:'r10'},'r11');unlock(a);
  // Recycled block: zero it when asked.
  a.load('rdx',slot(64));a.and('rdx',8);a.test('rdx','rdx');a.jcc('e',got);
  {const zero=a.unique('zero');a.load('rdi',slot(40));a.lea('r10',{base:'rax',disp:16});a.add('rdi','rax');a.mov('r11',0);
   a.label(zero);a.cmp('r10','rdi');a.jcc('ae',got);a.store({base:'r10'},'r11');a.add('r10',8);a.jmp(zero);}
  a.label(carve);a.load('rax',{rip:'linux.heapCursor'});a.load('rdi',slot(40));a.lea('r10',{base:'rax'});a.add('r10','rdi');
  a.load('r11',{rip:'linux.heapEnd'});a.cmp('r10','r11');const fits=a.unique('fits');a.test('rax','rax');a.jcc('e',small);a.cmp('r10','r11');a.jcc('be',fits);
  a.label(small);
  // New 1 MiB chunk (syscalls clobber RCX/R11).
  a.mov('rdi',0);a.mov('rsi',1<<20);a.mov('rdx',3);a.mov('r10',0x22);a.mov('r8',-1);a.mov('r9',0);systemCall(a,9);
  const mapped=a.unique('mapped');a.cmp('rax',-4095);a.jcc('b',mapped);unlock(a);a.jmp(bad);
  a.label(mapped);a.mov('r10','rax');a.add('r10',1<<20);a.store({rip:'linux.heapEnd'},'r10');
  a.load('rdi',slot(40));a.lea('r10',{base:'rax'});a.add('r10','rdi');
  a.label(fits);a.store({rip:'linux.heapCursor'},'r10');unlock(a);
  a.label(got);a.load('r10',slot(40));a.store({base:'rax'},'r10');a.add('rax',16);a.jmp(done);
  a.label(large);a.add('rsi',pageSize-1);a.and('rsi',-pageSize);
  a.store(slot(40),'rsi');a.mov('rdi',0);a.mov('rdx',3);a.mov('r10',0x22);a.mov('r8',-1);a.mov('r9',0);systemCall(a,9);
  a.cmp('rax',-4095);a.jcc('ae',bad);a.load('r10',slot(40));a.store({base:'rax'},'r10');a.add('rax',16);a.jmp(done);
  a.label(bad);a.mov('rax',0);a.label(done);a.load('rsi',slot(48));a.load('rdi',slot(56));
 });
 fn('linux.HeapFree.code',72,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');
  const no=a.unique('no'),done=a.unique('done'),large=a.unique('large');a.test('r8','r8');a.jcc('e',no);
  a.mov('rdi','r8');a.sub('rdi',16);a.load('rsi',{base:'rdi'});a.cmp('rsi',4096);a.jcc('a',large);
  // Small block: push on its class free list.
  a.mov('r9',0);a.mov('r10',32);const find=a.unique('find'),found=a.unique('found');
  a.label(find);a.cmp('r10','rsi');a.jcc('ae',found);a.shl('r10',1);a.add('r9',1);a.jmp(find);a.label(found);
  a.store(slot(56),'r9');lock(a);a.load('r9',slot(56));a.shl('r9',3);a.lea('r10',{rip:'linux.heapFree'});a.add('r10','r9');
  a.load('r11',{base:'r10'});a.store({base:'rdi',disp:16},'r11');a.store({base:'r10'},'rdi');unlock(a);a.mov('rax',1);a.jmp(done);
  a.label(large);systemCall(a,11);
  a.test('rax','rax');a.jcc('ne',no);a.mov('rax',1);a.jmp(done);
  a.label(no);a.mov('rax',0);a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 // VirtualAlloc(0, bytes, MEM_COMMIT|MEM_RESERVE, PAGE_READWRITE) maps zeroed
 // pages; the managed heap (runtime/memory.ts) and the guarded generator
 // stack use it.
 // Like Windows, the mapping is aligned to the 64 KiB allocation granularity
 // (the managed heap's page map relies on it): 64 KiB more is mapped and the
 // unaligned head and tail are unmapped again.
 fn('linux.VirtualAlloc.code',88,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');
  const bad=a.unique('bad'),done=a.unique('done'),noHead=a.unique('noHead'),noTail=a.unique('noTail');
  a.test('rcx','rcx');a.jcc('ne',bad);a.cmp('r8',0x3000);a.jcc('ne',bad);a.cmp('r9',4);a.jcc('ne',bad);a.store(slot(56),'rdx');
  a.mov('rdi',0);a.mov('rsi','rdx');a.add('rsi',1<<16);a.mov('rdx',3);a.mov('r10',0x22);a.mov('r8',-1);a.mov('r9',0);systemCall(a,9);
  a.cmp('rax',-4095);a.jcc('ae',bad);a.store(slot(64),'rax');
  a.mov('r10','rax');a.add('r10',0xffff);a.and('r10',-65536);a.store(slot(72),'r10');
  a.mov('rsi','r10');a.sub('rsi','rax');a.test('rsi','rsi');a.jcc('e',noHead);a.mov('rdi','rax');systemCall(a,11);
  a.label(noHead);a.load('rdi',slot(72));a.load('rax',slot(56));a.add('rdi','rax');a.load('rsi',slot(64));a.add('rsi','rax');a.add('rsi',1<<16);a.sub('rsi','rdi');a.test('rsi','rsi');a.jcc('e',noTail);systemCall(a,11);
  a.label(noTail);a.load('rax',slot(72));a.jmp(done);
  a.label(bad);a.mov('rax',0);a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 fn('linux.VirtualProtect.code',72,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');
  const bad=a.unique('bad'),done=a.unique('done');
  a.cmp('rdx',GeneratorStack.guard);a.jcc('ne',bad);a.cmp('r8',1);a.jcc('ne',bad);
  a.mov('rax',4);a.store({base:'r9'},'rax',32);
  a.mov('rdi','rcx');a.mov('rsi','rdx');a.mov('rdx',0);systemCall(a,10);
  a.test('rax','rax');a.jcc('ne',bad);a.mov('rax',1);a.jmp(done);
  a.label(bad);a.mov('rax',0);a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 // VirtualFree(address, 0, MEM_RELEASE) releases a generator stack;
 // VirtualFree(address, bytes, MEM_DECOMMIT) returns a heap mapping.
 fn('linux.VirtualFree.code',72,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');
  const bad=a.unique('bad'),done=a.unique('done'),sized=a.unique('sized');
  a.cmp('r8',0x4000);a.jcc('e',sized);
  a.test('rdx','rdx');a.jcc('ne',bad);a.cmp('r8',0x8000);a.jcc('ne',bad);a.mov('rdx',GeneratorStack.bytes);
  a.label(sized);a.mov('rdi','rcx');a.mov('rsi','rdx');systemCall(a,11);
  a.test('rax','rax');a.jcc('ne',bad);a.mov('rax',1);a.jmp(done);
  a.label(bad);a.mov('rax',0);a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 fn('linux.GetStdHandle.code',40,a=>{
  const stdout=a.unique('stdout'),done=a.unique('done');a.cmp('rcx',-12);a.jcc('ne',stdout);a.mov('rax',2);a.jmp(done);
  a.label(stdout);a.mov('rax',1);a.label(done);
 });
 fn('linux.GetConsoleMode.code',40,a=>a.mov('rax',0));
 fn('linux.WaitOnAddress.code',104,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.store(slot(56),'rcx');a.load('rdx',{base:'rdx'},32);
  a.mov('r10',0);a.mov('r11',0xffffffffn);a.cmp('r9','r11');const infinite=a.unique('infinite');a.jcc('e',infinite);
  a.mov('rax','r9');a.mov('rdx',0);a.mov('r11',1000);a.div('r11');a.store(slot(72),'rax');a.mov('rax','rdx');a.mov('r11',1000000);a.imul('rax','r11');a.store(slot(80),'rax');a.lea('r10',slot(72));a.load('rdx',slot(56));a.load('rdx',{base:'rdx'},32);
  a.label(infinite);a.load('rdi',slot(56));a.mov('rsi',128);systemCall(a,202);
  const failed=a.unique('failed'),done=a.unique('done');a.test('rax','rax');a.jcc('ne',failed);a.mov('rax',1);a.jmp(done);a.label(failed);a.mov('rax',0);a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 // Threads for Test262 agents: RCX attributes, RDX stack size, R8 start
 // address, R9 parameter. The child runs start(parameter) on a fresh mapped
 // stack, then exits only its own thread.
 fn('linux.CreateThread.code',72,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.store(slot(56),'r8');a.store(slot(64),'r9');
  const bad=a.unique('bad'),done=a.unique('done'),child=a.unique('child');
  a.mov('rdi',0);a.mov('rsi',64*1024*1024);a.mov('rdx',3);a.mov('r10',0x22);a.mov('r8',-1);a.mov('r9',0);systemCall(a,9);
  a.cmp('rax',-4095);a.jcc('ae',bad);
  a.mov('rsi','rax');a.add('rsi',64*1024*1024-16);
  a.load('r10',slot(56));a.store({base:'rsi'},'r10');a.load('r10',slot(64));a.store({base:'rsi',disp:8},'r10');
  a.mov('rdi',0x50f00);a.mov('rdx',0);a.mov('r10',0);a.mov('r8',0);systemCall(a,56);
  a.test('rax','rax');a.jcc('e',child);a.cmp('rax',-4095);a.jcc('ae',bad);a.jmp(done);
  a.label(child);
  a.load('r11',{base:'rsp'});a.load('rcx',{base:'rsp',disp:8});a.add('rsp',16);a.sub('rsp',48);a.callRegister('r11');
  a.mov('rdi',0);systemCall(a,60);
  a.label(bad);a.mov('rax',0);a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 fn('linux.Sleep.code',72,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');
  a.mov('rax','rcx');a.mov('rdx',0);a.mov('r11',1000);a.div('r11');a.store(slot(56),'rax');a.mov('rax','rdx');a.mov('r11',1000000);a.imul('rax','r11');a.store(slot(64),'rax');
  a.lea('rdi',slot(56));a.mov('rsi',0);systemCall(a,35);
  a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 fn('linux.WakeByAddressSingle.code',56,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');
  a.mov('rdi','rcx');a.mov('rsi',129);a.mov('rdx',1);systemCall(a,202);
  a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 fn('linux.GetSystemTimeAsFileTime.code',104,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.store(slot(56),'rcx');
  a.mov('rdi',0);a.lea('rsi',slot(72));systemCall(a,228);
  const done=a.unique('done');a.test('rax','rax');a.jcc('ne',done);
  a.load('rax',slot(72));a.mov('r10',10000000);a.imul('rax','r10');
  a.store(slot(64),'rax');a.load('rax',slot(80));a.xor('rdx','rdx');a.mov('r10',100);a.div('r10');
  a.load('r10',slot(64));a.add('rax','r10');
  a.mov('r10',116444736000000000n);a.add('rax','r10');
  a.load('r10',slot(56));a.store({base:'r10'},'rax');
  a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 fn('linux.WriteConsoleW.code',40,a=>a.mov('rax',0));
 // CreateFileW for coverage output: RCX UTF-16 path (NUL-terminated); opened
 // write-only, created or truncated (CREATE_ALWAYS), mode 0644. The path is
 // converted to UTF-8 (code points up to U+FFFF) in a 4 KiB stack buffer.
 fn('linux.CreateFileW.code',4168,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');
  const loop=a.unique('loop'),one=a.unique('one'),two=a.unique('two'),next=a.unique('next'),end=a.unique('end'),failed=a.unique('failed'),done=a.unique('done');
  a.lea('r11',slot(64));a.lea('r9',slot(64+4090));
  a.label(loop);a.load('rax',{base:'rcx'},16);a.add('rcx',2);a.test('rax','rax');a.jcc('e',end);a.cmp('r11','r9');a.jcc('ae',failed);
  a.cmp('rax',0x80);a.jcc('b',one);a.cmp('rax',0x800);a.jcc('b',two);
  a.mov('r10','rax');a.shr('r10',12);a.or('r10',0xe0);a.store({base:'r11'},'r10',8);a.add('r11',1);
  a.mov('r10','rax');a.shr('r10',6);a.and('r10',0x3f);a.or('r10',0x80);a.store({base:'r11'},'r10',8);a.add('r11',1);
  a.and('rax',0x3f);a.or('rax',0x80);a.jmp(one);
  a.label(two);a.mov('r10','rax');a.shr('r10',6);a.or('r10',0xc0);a.store({base:'r11'},'r10',8);a.add('r11',1);a.and('rax',0x3f);a.or('rax',0x80);
  a.label(one);a.store({base:'r11'},'rax',8);a.add('r11',1);a.jmp(loop);
  a.label(end);a.mov('rax',0);a.store({base:'r11'},'rax',8);
  a.lea('rdi',slot(64));a.mov('rsi',0x241);a.mov('rdx',0o644);systemCall(a,2);
  a.cmp('rax',-4095);a.jcc('b',done);
  a.label(failed);a.mov('rax',-1);
  a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 fn('linux.CloseHandle.code',56,a=>{a.store(slot(40),'rdi');a.mov('rdi','rcx');systemCall(a,3);a.load('rdi',slot(40));a.mov('rax',1);});
 fn('linux.GetCurrentProcessId.code',40,a=>{systemCall(a,39);});
 fn('linux.WriteFile.code',72,a=>{
  a.store(slot(40),'r9');a.store(slot(48),'rsi');a.store(slot(56),'rdi');a.mov('rdi','rcx');a.mov('rsi','rdx');a.mov('rdx','r8');systemCall(a,1);
  const failed=a.unique('failed'),done=a.unique('done');a.cmp('rax',-4095);a.jcc('ae',failed);
  a.load('r10',slot(40));a.store({base:'r10'},'rax',32);a.mov('rax',1);a.jmp(done);
  a.label(failed);a.mov('rax',0);a.label(done);a.load('rsi',slot(48));a.load('rdi',slot(56));
 });
 // FFI is Windows-only; tests link ELF images with FFI stubs, which never set an error.
 fn('linux.GetLastError.code',40,a=>a.mov('rax',0));
 // Monotonic clock in nanoseconds; the frequency is fixed at 1e9.
 fn('linux.QueryPerformanceCounter.code',72,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.store(slot(56),'rcx');
  a.mov('rdi',1);a.lea('rsi',slot(24));systemCall(a,228);
  a.load('rax',slot(24));a.mov('r10',1000000000);a.imul('rax','r10');a.load('r10',slot(32));a.add('rax','r10');
  a.load('rcx',slot(56));a.store({base:'rcx'},'rax');a.mov('rax',1);a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 fn('linux.QueryPerformanceFrequency.code',40,a=>{a.mov('rax',1000000000);a.store({base:'rcx'},'rax');a.mov('rax',1);});
 fn('linux.ExitProcess.code',40,a=>{a.mov('rdi','rcx');systemCall(a,231);});
 fn('linux.WideCharToMultiByte.code',120,a=>{
  a.store(slot(40),'r8');a.store(slot(48),'r9');a.load('rax',slot(160));a.store(slot(56),'rax');a.load('rax',slot(168));a.store(slot(64),'rax');a.mov('rax',0);a.store(slot(72),'rax');
  const loop=a.unique('loop'),done=a.unique('done'),invalid=a.unique('invalid'),encoded=a.unique('encoded');
  const lowCheck=a.unique('lowCheck'),pair=a.unique('pair'),size2=a.unique('size2'),size3=a.unique('size3'),size4=a.unique('size4'),sized=a.unique('sized');
  const write=a.unique('write'),next=a.unique('next'),one=a.unique('one'),two=a.unique('two'),three=a.unique('three'),four=a.unique('four'),bad=a.unique('bad');
  a.label(loop);a.load('r10',slot(48));a.test('r10','r10');a.jcc('e',done);
  a.load('r11',slot(40));a.load('rax',{base:'r11'},16);a.add('r11',2);a.store(slot(40),'r11');a.sub('r10',1);a.store(slot(48),'r10');
  a.cmp('rax',0xd800);a.jcc('b',encoded);a.cmp('rax',0xdbff);a.jcc('a',lowCheck);
  a.test('r10','r10');a.jcc('e',invalid);a.load('r11',{base:'r11'},16);a.cmp('r11',0xdc00);a.jcc('b',invalid);a.cmp('r11',0xdfff);a.jcc('a',invalid);
  a.sub('rax',0xd800);a.shl('rax',10);a.sub('r11',0xdc00);a.add('rax','r11');a.add('rax',0x10000);
  a.load('r11',slot(40));a.add('r11',2);a.store(slot(40),'r11');a.load('r10',slot(48));a.sub('r10',1);a.store(slot(48),'r10');a.jmp(encoded);
  a.label(lowCheck);a.cmp('rax',0xdc00);a.jcc('b',encoded);a.cmp('rax',0xdfff);a.jcc('a',encoded);
  a.label(invalid);a.mov('rax',0xfffd);
  a.label(encoded);a.mov('r8',1);a.cmp('rax',0x80);a.jcc('b',sized);a.mov('r8',2);a.cmp('rax',0x800);a.jcc('b',sized);a.mov('r8',3);a.cmp('rax',0x10000);a.jcc('b',sized);a.mov('r8',4);
  a.label(sized);a.load('r10',slot(72));a.load('r11',slot(56));a.test('r11','r11');a.jcc('e',next);
  a.mov('rdx','r10');a.add('rdx','r8');a.load('rcx',slot(64));a.cmp('rdx','rcx');a.jcc('a',bad);a.add('r11','r10');
  a.cmp('r8',1);a.jcc('e',one);a.cmp('r8',2);a.jcc('e',two);a.cmp('r8',3);a.jcc('e',three);a.jmp(four);
  a.label(one);a.store({base:'r11'},'rax',8);a.jmp(next);
  a.label(two);a.mov('rdx','rax');a.shr('rdx',6);a.or('rdx',0xc0);a.store({base:'r11'},'rdx',8);
  a.mov('rdx','rax');a.and('rdx',0x3f);a.or('rdx',0x80);a.store({base:'r11',disp:1},'rdx',8);a.jmp(next);
  a.label(three);a.mov('rdx','rax');a.shr('rdx',12);a.or('rdx',0xe0);a.store({base:'r11'},'rdx',8);
  a.mov('rdx','rax');a.shr('rdx',6);a.and('rdx',0x3f);a.or('rdx',0x80);a.store({base:'r11',disp:1},'rdx',8);
  a.mov('rdx','rax');a.and('rdx',0x3f);a.or('rdx',0x80);a.store({base:'r11',disp:2},'rdx',8);a.jmp(next);
  a.label(four);a.mov('rdx','rax');a.shr('rdx',18);a.or('rdx',0xf0);a.store({base:'r11'},'rdx',8);
  a.mov('rdx','rax');a.shr('rdx',12);a.and('rdx',0x3f);a.or('rdx',0x80);a.store({base:'r11',disp:1},'rdx',8);
  a.mov('rdx','rax');a.shr('rdx',6);a.and('rdx',0x3f);a.or('rdx',0x80);a.store({base:'r11',disp:2},'rdx',8);
  a.mov('rdx','rax');a.and('rdx',0x3f);a.or('rdx',0x80);a.store({base:'r11',disp:3},'rdx',8);
  a.label(next);a.add('r10','r8');a.store(slot(72),'r10');a.jmp(loop);
  a.label(bad);a.mov('rax',0);a.jmp(write);
  a.label(done);a.load('rax',slot(72));a.label(write);
 });
 return b.bundle.fragments;
}
