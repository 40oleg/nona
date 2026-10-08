import {RuntimeBuilder,slot} from '../../runtime/abi.js';
import {linuxShims} from '../linux/shims.js';
import {linkElf} from '../elf/writer.js';
import type {Assembler} from '../x64/assembler.js';
import type {NativeProgram} from '../pe/model.js';
import {withNativeTarget} from '../machine/context.js';

export type BsdOS='freebsd'|'openbsd';
const numbers={
  freebsd:{mmap:477,clock:232,sleep:240,wait:454,thread:455,threadExit:431,monotonic:4},
  openbsd:{mmap:49,clock:87,sleep:91,wait:83,thread:8,threadExit:302,monotonic:3},
} as const;
/** BSD reports errno with carry set; runtime services use negative errno. */
function nativeCall(a:Assembler,number:number):void {
  a.syscall(number);const done=a.unique('syscallDone');a.jcc('ae',done);a.neg('rax');a.label(done);
}

export function linkBsd(program:NativeProgram,os:BsdOS):Uint8Array {
  return withNativeTarget(`${os}-x64`,()=>linkBsdOnTarget(program,os));
}
function linkBsdOnTarget(program:NativeProgram,os:BsdOS):Uint8Array {
  const sys=numbers[os],b=new RuntimeBuilder();
  const replace=new Set(['linux.WaitOnAddress.code','linux.WakeByAddressSingle.code','linux.CreateThread.code']);
  const fragments=linuxShims(program.imports,{replace,syscall:(a,number)=>{
    if(number===9){
      // MAP_PRIVATE|MAP_ANON; OpenBSD also needs MAP_STACK for suspended
      // generator stacks. Marking these private anonymous mappings is valid
      // for managed heap pages too and avoids changing the runtime ABI.
      a.mov('r10',os==='openbsd'?0x5002:0x1002);nativeCall(a,sys.mmap);
    }else if(number===228){
      const realtime=a.unique('realtime');a.test('rdi','rdi');a.jcc('e',realtime);a.mov('rdi',sys.monotonic);a.label(realtime);nativeCall(a,sys.clock);
    }else if(number===2){a.mov('rsi',0x601);nativeCall(a,5);}
    else {
      const mapped=new Map([[1,4],[3,6],[10,74],[11,73],[35,sys.sleep],[39,20],[231,1]]).get(number);
      if(mapped===undefined)throw new Error(`Unadapted BSD runtime syscall ${number}`);
      nativeCall(a,mapped);
    }
  }});
  b.fn('linux.WaitOnAddress.code',136,a=>{
    a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.store(slot(56),'rcx');a.load('r10',{base:'rdx'},32);a.store(slot(64),'r10');
    const bad=a.unique('bad'),infinite=a.unique('infinite'),ready=a.unique('ready'),done=a.unique('done');
    a.cmp('r8',4);a.jcc('ne',bad);a.mov('r10',0xffffffffn);a.cmp('r9','r10');a.jcc('e',infinite);
    a.mov('rax','r9');a.mov('rdx',0);a.mov('r11',1000);a.div('r11');a.store(slot(88),'rax');a.mov('rax','rdx');a.mov('r11',1000000);a.imul('rax','r11');a.store(slot(96),'rax');
    a.mov('rax',0);a.store(slot(104),'rax',32);a.mov('rax',sys.monotonic);a.store(slot(108),'rax',32);
    if(os==='freebsd'){a.mov('r10',24);a.lea('r8',slot(88));}else{a.lea('r10',slot(88));a.mov('r8',0);}
    a.jmp(ready);a.label(infinite);a.mov('r10',0);a.mov('r8',0);
    a.label(ready);a.load('rdi',slot(56));a.mov('rsi',os==='freebsd'?15:129);a.load('rdx',slot(64));nativeCall(a,sys.wait);
    a.test('rax','rax');const success=a.unique('success');a.jcc('e',success);a.cmp('rax',-35);a.jcc('ne',bad);
    a.label(success);a.mov('rax',1);a.jmp(done);a.label(bad);a.mov('rax',0);
    a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
  });
  b.fn('linux.WakeByAddressSingle.code',56,a=>{
    a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.mov('rdi','rcx');a.mov('rsi',os==='freebsd'?16:130);a.mov('rdx',1);a.mov('r10',0);a.mov('r8',0);nativeCall(a,sys.wait);a.load('rsi',slot(40));a.load('rdi',slot(48));
  });
  if(os==='freebsd')b.fn('bsd.threadEntry',40,a=>{
    // The FreeBSD kernel starts a SysV entry (argument in RDI).
    a.load('r11',{base:'rdi'});a.load('rcx',{base:'rdi',disp:8});a.callRegister('r11');a.mov('rdi',0);nativeCall(a,sys.threadExit);
  });
  b.fn('linux.CreateThread.code',232,a=>{
    a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.store(slot(56),'r8');a.store(slot(64),'r9');
    // As on Linux, the shared heap allocator takes its lock once a second
    // thread exists (linux.HeapAlloc.code).
    a.mov('rax',1);a.store({rip:'linux.threaded'},'rax');
    const bad=a.unique('bad'),done=a.unique('done'),failed=a.unique('failed');
    // FreeBSD MAP_STACK puts a non-shrinkable guard at the returned address.
    // This fixed-size allocation owns all its pages, including entry metadata.
    a.mov('rdi',0);a.mov('rsi',64*1024*1024);a.mov('rdx',3);a.mov('r10',os==='openbsd'?0x5002:0x1002);a.mov('r8',-1);a.mov('r9',0);nativeCall(a,sys.mmap);
    a.cmp('rax',-4095);a.jcc('ae',bad);a.store(slot(72),'rax');
    for(let offset=80;offset<184;offset+=8){a.mov('r10',0);a.store(slot(offset),'r10');}
    if(os==='freebsd'){
      a.load('r10',slot(56));a.store({base:'rax'},'r10');a.load('r10',slot(64));a.store({base:'rax',disp:8},'r10');
      a.lea('r10',{rip:'bsd.threadEntry'});a.store(slot(80),'r10');a.store(slot(88),'rax');
      a.lea('r10',{base:'rax',disp:4096});a.store(slot(96),'r10');a.mov('r10',64*1024*1024-4096);a.store(slot(104),'r10');
      a.lea('r10',{base:'rax',disp:16});a.store(slot(128),'r10');a.store(slot(136),'r10');
      a.lea('rdi',slot(80));a.mov('rsi',104);nativeCall(a,sys.thread);a.test('rax','rax');a.jcc('ne',failed);
      a.load('rax',slot(72));a.load('rax',{base:'rax',disp:16});a.jmp(done);
    }else{
      a.lea('r10',{base:'rax',disp:16});a.store(slot(88),'r10');a.add('rax',64*1024*1024-16);a.store(slot(96),'rax');
      a.lea('rdi',slot(80));a.mov('rsi',24);a.load('r8',slot(56));a.load('r9',slot(64));nativeCall(a,sys.thread);
      a.cmp('rax',-4095);a.jcc('ae',failed);a.test('rax','rax');a.jcc('ne',done);
      // __tfork resumes the child at this PC with its new kernel-set RSP.
      a.mov('rcx','r9');a.sub('rsp',32);a.callRegister('r8');a.mov('rdi',0);nativeCall(a,sys.threadExit);
    }
    a.label(failed);a.load('rdi',slot(72));a.mov('rsi',64*1024*1024);nativeCall(a,73);
    a.label(bad);a.mov('rax',0);a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
  });
  const resolved:NativeProgram={...program,imports:[],fragments:[...program.fragments,...fragments,...b.bundle.fragments]};
  return linkElf(resolved,{os,...(os==='openbsd'?{syscallPins:resolved.fragments.flatMap(fragment=>(fragment.syscalls??[]).map(call=>({symbol:fragment.name,...call})))}:{})});
}
