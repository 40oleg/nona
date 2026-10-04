import {Assembler} from './x64/assembler.js';
import {linkElf} from './elf/writer.js';
import {linkMachO} from './macho/writer.js';
import {getTarget,type Target} from '../target.js';
import type {CodeFragment,NativeProgram} from './pe/model.js';

export const loaderProbeOutput='hello\n';
/** Refuse accidental emulation (including Rosetta) in native verification. */
export function assertNativeHost(target:string,platform:string=process.platform,arch:string=process.arch):void {
  const descriptor=getTarget(target);
  if(!descriptor)throw new Error(`Unknown probe target ${target}`);
  if(descriptor.os!==platform||descriptor.arch!==arch)throw new Error(`Native host ${platform}/${arch} does not match target ${target}`);
}

/** This is a loader/ABI probe, not a claim that the JavaScript backend works. */
export function loaderProbe(target:Target):Uint8Array {
  const descriptor=getTarget(target);if(!descriptor||descriptor.os==='win32')throw new Error(`Loader probe is not implemented for ${target}`);
  let code:CodeFragment;
  if(descriptor.arch==='x64'){
    const a=new Assembler('probe.start');
    a.mov('rdi',1);a.lea('rsi',{rip:'probe.message'});a.mov('rdx',6);
    a.syscall(descriptor.os==='linux'?1:descriptor.os==='darwin'?0x2000004:4);
    a.mov('rdi',0);a.syscall(descriptor.os==='linux'?60:descriptor.os==='darwin'?0x2000001:1);
    code=a.finish();
  }else{
    // ARM64 uses x0..x2 arguments; Linux uses x8/SVC 0, Darwin x16/SVC 0x80.
    const bytes:number[]=[],word=(value:number)=>{for(let i=0;i<4;i++)bytes.push(value>>>(i*8)&255);};
    word(0xd2800020); // mov x0, #1
    word(0x58000041);word(0x14000003); // ldr x1, literal; skip address
    const pointer=bytes.length;for(let i=0;i<8;i++)bytes.push(0);
    word(0xd28000c2); // mov x2, #6
    const linux=descriptor.os==='linux';
    word(linux?0xd2800808:0xd2800090);word(linux?0xd4000001:0xd4001001);
    word(0xd2800000);word(linux?0xd2800ba8:0xd2800030);word(linux?0xd4000001:0xd4001001);
    code={bytes:Uint8Array.from(bytes),symbols:{},fixups:[{offset:pointer,kind:'va64',target:'probe.message',addend:0}]};
  }
  const program:NativeProgram={entry:'probe.start',imports:[],functions:[],fragments:[
    {...code,name:'probe.start',section:'.text'},
    {name:'probe.message',section:'.rdata',bytes:new TextEncoder().encode(loaderProbeOutput),fixups:[],symbols:{}},
  ]};
  if(descriptor.os==='darwin')return linkMachO(program,{arch:descriptor.arch});
  return linkElf(program,{machine:descriptor.arch,os:descriptor.os,...(descriptor.os==='openbsd'?{
    syscallPins:code.syscalls!.map(call=>({symbol:'probe.start',...call})),
  }:{})});
}
