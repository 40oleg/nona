import {RuntimeBuilder,slot} from '../../runtime/abi.js';
import {linuxShims} from '../linux/shims.js';
import {linkMachO} from '../macho/writer.js';
import {withNativeTarget} from '../machine/context.js';
import type {Assembler} from '../x64/assembler.js';
import type {NativeProgram} from '../pe/model.js';
import {linkDarwinArm64} from './arm64.js';

function nativeCall(a:Assembler,number:number):void {
  a.syscall(0x2000000+number);const done=a.unique('syscallDone');a.jcc('ae',done);a.neg('rax');a.label(done);
}

/** Intel Darwin nanotime uses the kernel's seqlock-protected commpage data. */
function monotonic(a:Assembler):void {
  const retry=a.unique('nanotimeRetry');a.label(retry);
  a.mov('r11',0x7fffffe00050n);a.load('r9',{base:'r11',disp:24},32);a.test('r9','r9');a.jcc('e',retry);
  a.load('r10',{base:'r11'});a.load('r8',{base:'r11',disp:8},32);a.load('rcx',{base:'r11',disp:12},32);a.load('r11',{base:'r11',disp:16});
  a.emit([0x0f,0xae,0xe8]);a.timestamp();a.emit([0x0f,0xae,0xe8]);
  a.shl('rdx',32);a.or('rax','rdx');a.sub('rax','r10');a.shl('rax','cl');a.mul('r8');
  a.shl('rdx',32);a.shr('rax',32);a.or('rax','rdx');a.add('rax','r11');
  a.mov('r10',0x7fffffe00068n);a.load('r10',{base:'r10'},32);a.cmp('r9','r10');a.jcc('ne',retry);
}

export function linkDarwin(program:NativeProgram,arch:'x64'|'arm64'='x64'):Uint8Array {
  if(arch==='arm64')return linkDarwinArm64(program);
  return withNativeTarget('darwin-x64',()=>{
    const b=new RuntimeBuilder();
    const replace=new Set(['linux.Sleep.code','linux.WaitOnAddress.code','linux.WakeByAddressSingle.code','linux.CreateThread.code']);
    const fragments=linuxShims(program.imports,{replace,syscall:(a,number)=>{
      if(number===9){a.mov('r10',0x1002);nativeCall(a,197);}
      else if(number===228){
        const real=a.unique('realtime'),done=a.unique('clockDone');a.test('rdi','rdi');a.jcc('e',real);
        a.store(slot(8),'rsi');monotonic(a);a.mov('rdx',0);a.mov('r10',1000000000);a.div('r10');
        a.load('r10',slot(8));a.store({base:'r10'},'rax');a.store({base:'r10',disp:8},'rdx');a.mov('rax',0);a.jmp(done);
        a.label(real);a.store(slot(8),'rsi');a.mov('rdi','rsi');a.mov('rsi',0);nativeCall(a,116);
        const failed=a.unique('clockFailed');a.test('rax','rax');a.jcc('ne',failed);
        a.load('r10',slot(8));a.load('r11',{base:'r10',disp:8},32);a.mov('rdx',1000);a.imul('r11','rdx');a.store({base:'r10',disp:8},'r11');a.label(failed);a.label(done);
      }else if(number===2){a.mov('rsi',0x601);nativeCall(a,5);}
      else{
        const mapped=new Map([[1,4],[3,6],[10,74],[11,73],[39,20],[231,1]]).get(number);
        if(mapped===undefined)throw new Error(`Unadapted Darwin runtime syscall ${number}`);nativeCall(a,mapped);
      }
    }});
    b.fn('linux.Sleep.code',72,a=>{
      a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.store(slot(56),'rcx');
      const loop=a.unique('sleepChunk'),ready=a.unique('sleepReady');a.label(loop);
      a.load('rdx',slot(56));a.cmp('rdx',0x7fffffff);a.jcc('be',ready);a.mov('rdx',0x7fffffff);a.label(ready);a.store(slot(64),'rdx');
      // poll_nocancel with no descriptors blocks without a Mach semaphore.
      // Its timeout is a signed int, so larger delays use bounded chunks.
      a.mov('rdi',0);a.mov('rsi',0);nativeCall(a,417);
      a.load('rax',slot(56));a.load('r10',slot(64));a.sub('rax','r10');a.store(slot(56),'rax');a.test('rax','rax');a.jcc('ne',loop);
      a.load('rsi',slot(40));a.load('rdi',slot(48));
    });
    b.fn('linux.WaitOnAddress.code',104,a=>{
      a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.store(slot(56),'rcx');a.load('rdx',{base:'rdx'},32);
      const bad=a.unique('bad'),ready=a.unique('ready'),done=a.unique('done');a.cmp('r8',4);a.jcc('ne',bad);
      a.mov('r10','r9');a.mov('r11',0xffffffffn);a.cmp('r9','r11');a.jcc('ne',ready);a.mov('r10',0);a.jmp(ready+'.call');
      a.label(ready);a.mov('r11',1000000);a.imul('r10','r11');a.label(ready+'.call');a.load('rsi',slot(56));a.mov('rdi',1);a.mov('r8',0);nativeCall(a,544);
      a.test('rax','rax');a.jcc('ge',done);a.cmp('rax',-35);a.jcc('e',done);a.label(bad);a.mov('rax',0);a.jmp(done+'.return');
      a.label(done);a.mov('rax',1);a.label(done+'.return');a.load('rsi',slot(40));a.load('rdi',slot(48));
    });
    b.fn('linux.WakeByAddressSingle.code',56,a=>{
      a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.mov('rsi','rcx');a.mov('rdi',1);a.mov('rdx',0);nativeCall(a,516);a.load('rsi',slot(40));a.load('rdi',slot(48));
    });
    b.data('darwin.threadRegistered',new Uint8Array(8),'.data');
    // The kernel starts at a 16-byte-aligned RSP with function/argument in RDX/RCX.
    b.fn('darwin.threadEntry',48,a=>{
      a.store(slot(40),'rsi');a.callRegister('rdx');a.mov('rdi',0);a.mov('rsi',0);a.load('rdx',slot(40));a.mov('r10',0);nativeCall(a,361);
    });
    b.fn('linux.CreateThread.code',104,a=>{
      a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.store(slot(56),'r8');a.store(slot(64),'r9');
      const registered=a.unique('registered'),bad=a.unique('bad'),done=a.unique('done');
      a.load('rax',{rip:'darwin.threadRegistered'});a.test('rax','rax');a.jcc('ne',registered);
      a.lea('rdi',{rip:'darwin.threadEntry'});a.mov('rsi',0);a.mov('rdx',0);a.mov('r10',0);a.mov('r8',0);a.mov('r9',0);a.mov('rax',0);a.store(slot(8),'rax');nativeCall(a,366);
      a.cmp('rax',0);a.jcc('l',bad);a.mov('rax',1);a.store({rip:'darwin.threadRegistered'},'rax');
      a.label(registered);a.mov('rdi',0);a.mov('rsi',64*1024*1024);a.mov('rdx',3);a.mov('r10',0x1002);a.mov('r8',-1);a.mov('r9',0);nativeCall(a,197);
      a.cmp('rax',-4095);a.jcc('ae',bad);a.lea('rdx',{base:'rax',disp:64*1024*1024-16});
      a.mov('r10','rax');a.mov('r8',0x01000000);a.load('rdi',slot(56));a.load('rsi',slot(64));nativeCall(a,360);
      a.cmp('rax',-4095);a.jcc('b',done);a.label(bad);a.mov('rax',0);a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
    });
    return linkMachO({...program,imports:[],fragments:[...program.fragments,...fragments,...b.bundle.fragments]});
  });
}
