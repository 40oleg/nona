import type {NativeProgram} from '../pe/model.js';
import {linkElf} from '../elf/writer.js';
import {linuxShims} from './shims.js';
import {withNativeTarget} from '../machine/context.js';
import type {NativeArch} from '../../target.js';
import type {Assembler} from '../x64/assembler.js';

// Linux AArch64 uses the asm-generic syscall table. The runtime services
// retain their existing logical ABI; only the kernel boundary is adapted.
function arm64Call(a:Assembler,number:number):void {
 if(number===2){
  // open(path, flags, mode) -> openat(AT_FDCWD, path, flags, mode).
  a.mov('r10','rdx');a.mov('rdx','rsi');a.mov('rsi','rdi');a.mov('rdi',-100);a.syscall(56);return;
 }
 const mapped=new Map([[1,64],[3,57],[9,222],[10,226],[11,215],[35,101],[39,172],[56,220],[60,93],[202,98],[228,113],[231,94]]).get(number);
 if(mapped===undefined)throw new Error('Unadapted Linux ARM64 runtime syscall '+number);
 a.syscall(mapped);
}
export function linkLinux(program:NativeProgram,arch:NativeArch='x64'):Uint8Array {
 return withNativeTarget(`linux-${arch}`,()=>linkElf({...program,imports:[],fragments:[...program.fragments,...linuxShims(program.imports,arch==='arm64'?{syscall:arm64Call,pageSize:65536}:{})]},{machine:arch}));
}
