import {RuntimeBuilder,slot,failIf} from './abi.js';

// Both targets expose FILETIME ticks through the Win64-shaped runtime ABI.
// Keep the host clock conversion in one place before Date adds TimeClip and
// the observable constructor/prototype operations.
export function emitDateClock(b:RuntimeBuilder):void {
 b.bundle.imports.push({dll:'KERNEL32.dll',name:'GetSystemTimeAsFileTime',symbol:'GetSystemTimeAsFileTime'});
 b.fn('rt.currentTimeMs',72,a=>{
  a.lea('rcx',slot(48));a.callImport('GetSystemTimeAsFileTime');
  a.load('rax',slot(48));a.mov('r10',116444736000000000n);a.sub('rax','r10');
  a.xor('rdx','rdx');a.mov('r10',10000);a.div('r10');
 });
}
