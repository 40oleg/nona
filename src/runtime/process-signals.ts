import {RuntimeBuilder} from './abi.js';
import {createAssembler} from '../backend/machine/context.js';
import {Arm64Assembler} from '../backend/arm64/assembler.js';
import type {Target} from '../target.js';

/** OS callbacks touch only native flags, never the JS stack or allocator. */
export function emitProcessSignals(b:RuntimeBuilder,target:Target):void {
 if(target==='linux-arm64'){
  // Kernel signal frames use hardware SP; Nona frames live on logical x28.
  // A separate signal stack prevents the kernel frame from overlapping them.
  b.data('process.signalStack',new Uint8Array(65536),'.data');
  b.fn('process.signalStackAddress.code',40,a=>a.lea('rax',{rip:'process.signalStack'}));
 }
 b.data('process.signalPending',new Uint8Array(64*8),'.data');
 b.data('process.signalEnabled',new Uint8Array(64*8),'.data');
 b.data('process.signalAcknowledgement',new Uint8Array(64*8),'.data');
 function handler(name:string,windows:boolean):void {
 const a=createAssembler(name),done=a.unique('done');
 function nativeCall(symbol:string):void {if(a instanceof Arm64Assembler){a.lea('r11',{rip:symbol});a.load('r11',{base:'r11'});a.nativeWord(0xd63f0140)}else a.callImport(symbol)}
 function nativeStore(reg:'rax'|'r11',offset:number):void {if(a instanceof Arm64Assembler)a.nativeWord((0xf90003e0|((offset/8)<<10)|(reg==='rax'?0:10))>>>0);else a.store({base:'rsp',disp:offset},reg)}
 function nativeLoad(reg:'rax'|'r11'|'r10',offset:number):void {if(a instanceof Arm64Assembler)a.nativeWord((0xf94003e0|((offset/8)<<10)|(reg==='rax'?0:reg==='r11'?10:9))>>>0);else a.load(reg,{base:'rsp',disp:offset})}
 // A native ARM64 callback arrives on the hardware stack, not Nona's x28 stack.
 // Logical condition/parity helpers use native callee-saved x23 and x24.
 // Keep their saved pair separate from the native return address and deadline.
 if(a instanceof Arm64Assembler){if(windows){a.nativeWord(0xd100c3ff);a.nativeWord(0xa90063f7);a.nativeWord(0xf90013fe)}else{a.nativeWord(0xa9be63f7);a.nativeWord(0xf9000bfe)}a.mov('r10','rax')}
 else{if(windows)a.sub('rsp',56);a.mov('r10',windows?'rcx':'rdi')}
 if(windows){const interrupt=a.unique('interrupt'),close=a.unique('close'),record=a.unique('record');a.cmp('r10',0);a.jcc('e',interrupt);a.cmp('r10',2);a.jcc('e',close);a.cmp('r10',1);a.jcc('ne',done);a.mov('r10',21);a.jmp(record);a.label(close);a.mov('r10',1);a.jmp(record);a.label(interrupt);a.mov('r10',2);a.label(record)}
 a.cmp('r10',1);a.jcc('b',done);a.cmp('r10',64);a.jcc('ae',done);a.shl('r10',3);
 a.lea('r11',{rip:'process.signalEnabled'});a.add('r11','r10');a.load('rax',{base:'r11'});a.test('rax','rax');a.jcc('e',done);
 if(windows){const ordinary=a.unique('ordinary');a.cmp('r10',8);a.jcc('ne',ordinary);a.lea('r11',{rip:'process.signalAcknowledgement',addend:8});a.mov('rax',1);a.atomicExchange({base:'r11'},'rax',64);a.label(ordinary)}
 a.lea('r11',{rip:'process.signalPending'});a.add('r11','r10');a.mov('rax',1);a.atomicExchange({base:'r11'},'rax',64);
 // CTRL_CLOSE terminates after return. Give JS its cleanup opportunity, bounded
 // by the documented default 5000ms deadline. Calls use the native hardware
 // stack directly; a console thread never initializes or accesses Nona's x28.
 if(windows){const ordinary=a.unique('ordinary'),wait=a.unique('wait');a.cmp('r10',8);a.jcc('ne',ordinary);a.lea('r11',{rip:'process.signalAcknowledgement',addend:8});nativeStore('r11',a instanceof Arm64Assembler?24:40);nativeCall('GetTickCount64');a.add('rax',5000);nativeStore('rax',a instanceof Arm64Assembler?16:32);a.label(wait);nativeLoad('r11',a instanceof Arm64Assembler?24:40);a.load('rax',{base:'r11'});a.test('rax','rax');a.jcc('e',ordinary);if(a instanceof Arm64Assembler)a.mov('rax',1);else a.mov('rcx',1);nativeCall('Sleep');nativeCall('GetTickCount64');nativeLoad('r10',a instanceof Arm64Assembler?16:32);a.cmp('rax','r10');a.jcc('b',wait);a.label(ordinary)}
 a.mov('rax',1);
 const finish=a.unique('finish');a.jmp(finish);a.label(done);a.mov('rax',0);a.label(finish);
 if(a instanceof Arm64Assembler){if(windows){a.nativeWord(0xf94013fe);a.nativeWord(0xa94063f7);a.nativeWord(0x9100c3ff)}else{a.nativeWord(0xf9400bfe);a.nativeWord(0xa8c263f7)}a.nativeWord(0xd65f03c0)}else{if(windows)a.add('rsp',56);a.ret()}
 b.bundle.fragments.push({...a.finish(),name,section:'.text'});
 }
 handler('process.signalHandler',target==='win32-arm64');
 if(target.startsWith('win32-')){for(const name of ['GetTickCount64','Sleep'])b.bundle.imports.push({dll:'KERNEL32.dll',name,symbol:name});handler('process.consoleHandler',true);b.fn('process.consoleHandlerAddress.code',40,a=>a.lea('rax',{rip:'process.consoleHandler'}))}
 b.fn('process.signalHandlerAddress.code',40,a=>a.lea('rax',{rip:'process.signalHandler'}));
 b.fn('process.signalAcknowledge.code',40,a=>{const done=a.unique('done');a.cmp('rcx',1);a.jcc('b',done);a.cmp('rcx',64);a.jcc('ae',done);a.shl('rcx',3);a.lea('r10',{rip:'process.signalAcknowledgement'});a.add('r10','rcx');a.mov('rax',0);a.atomicExchange({base:'r10'},'rax',64);a.label(done)});
 b.fn('process.signalEnable.code',40,a=>{const end=a.unique('end'),enable=a.unique('enable');a.cmp('rcx',1);a.jcc('b',end);a.cmp('rcx',64);a.jcc('ae',end);a.shl('rcx',3);a.lea('r9',{rip:'process.signalEnabled'});a.add('r9','rcx');a.test('rdx','rdx');a.jcc('ne',enable);a.mov('rax',0);a.atomicExchange({base:'r9'},'rax',64);a.label(enable);a.lea('r10',{rip:'process.signalPending'});a.add('r10','rcx');a.mov('rax',0);a.atomicExchange({base:'r10'},'rax',64);a.test('rdx','rdx');a.jcc('e',end);a.mov('rax',1);a.atomicExchange({base:'r9'},'rax',64);a.label(end)});
 b.fn('process.signalPoll.code',40,a=>{const loop=a.unique('loop'),found=a.unique('found'),end=a.unique('end');a.mov('r9',1);a.lea('r10',{rip:'process.signalPending',addend:8});a.label(loop);a.mov('rax',0);a.atomicExchange({base:'r10'},'rax',64);a.test('rax','rax');a.jcc('ne',found);a.add('r10',8);a.add('r9',1);a.cmp('r9',64);a.jcc('b',loop);a.mov('rax',0);a.jmp(end);a.label(found);a.mov('rax','r9');a.label(end)});
 if(target.startsWith('linux-')||target==='win32-x64'){
  const restorer=createAssembler('process.signalRestorer');
  if(restorer instanceof Arm64Assembler){restorer.nativeImmediate(8,139);restorer.nativeWord(0xd4000001)}else restorer.syscall(15);
  b.bundle.fragments.push({...restorer.finish(),name:'process.signalRestorer',section:'.text'});
  b.fn('process.signalRestorerAddress.code',40,a=>a.lea('rax',{rip:'process.signalRestorer'}));
 }
}

/** OS ABI declarations; no external runtime library is introduced. */
export function processSignalHostDeclarations(target:Target):[string,string,string,string][] {
 const list:[string,string,string,string][]=[['signalHandlerAddress','nona.internal','signalHandlerAddress','ptr()'],['signalEnable','nona.internal','signalEnable','void(i32,i32)'],['signalPoll','nona.internal','signalPoll','i32()'],['signalAcknowledge','nona.internal','signalAcknowledge','void(i32)']];
 if(target==='linux-arm64')list.push(['signalStackAddress','nona.internal','signalStackAddress','ptr()'],['signalStack','syscall','132','i32(buf,buf)']);
 if(target.startsWith('win32-')){list.push(['consoleHandlerAddress','nona.internal','consoleHandlerAddress','ptr()'],['SetConsoleCtrlHandler','KERNEL32.dll','SetConsoleCtrlHandler','bool(ptr,bool)']);if(target==='win32-arm64')return list}
 if(target.startsWith('linux-')||target==='win32-x64')return [...list,['signalRestorerAddress','nona.internal','signalRestorerAddress','ptr()'],['signalAction','syscall',target==='linux-arm64'?'134':'13','i32(i32,buf,buf,i64)']];
 if(target.startsWith('darwin-'))return [...list,['signalAction','/usr/lib/libSystem.B.dylib','sigaction','i32(i32,buf,buf)'],['signalQueue','/usr/lib/libSystem.B.dylib','kqueue','i32()'],['signalEvent','/usr/lib/libSystem.B.dylib','kevent','i32(i32,buf,i32,buf,i32,buf)'],['signalFcntl','/usr/lib/libSystem.B.dylib','fcntl','i32(i32,i32,i32)']];
 return [...list,['signalAction','syscall',target==='freebsd-x64'?'416':'46','i32(i32,buf,buf)'],['signalQueue','syscall',target==='freebsd-x64'?'362':'269','i32()'],['signalEvent','syscall',target==='freebsd-x64'?'560':'72','i32(i32,buf,i32,buf,i32,buf)'],['signalFcntl','syscall','92','i32(i32,i32,i32)']];
}
