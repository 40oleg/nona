import {RuntimeBuilder,slot} from '../../runtime/abi.js';
import type {NativeProgram} from '../pe/model.js';
import type {Xmm} from '../x64/assembler.js';

/** Bridge Nona's logical Win64 boundary to the OS C ABI, without a C runtime. */
export function darwinProcessSystemAdapters(program:NativeProgram,arch:'x64'|'arm64'){
 const system=program.imports.filter(item=>item.dll==='/usr/lib/libSystem.B.dylib'),b=new RuntimeBuilder();
 const arity:Record<string,number>={abort:0,sigaction:3,kqueue:0,kevent:6,fcntl:3,mach_host_self:0,host_page_size:2,host_statistics64:4,setenv:3,unsetenv:1,getenv:1,__error:0,getpwnam:1,getpwuid:1,getgrnam:1,getgrgid:1,initgroups:2,mach_thread_self:0,thread_info:4};
 for(const item of system){
  const count=arity[item.name];if(count===undefined)throw new Error('Unsupported Darwin process system API '+item.name);
  const frame=arch==='x64'?232:count>4?56:40;
  b.fn('linux.'+item.symbol+'.code',frame,a=>{
   if(arch==='x64'){
    a.store(slot(40),'rdi');a.store(slot(48),'rsi');
    for(let i=6;i<16;i++)a.storeXmm128(slot(64+(i-6)*16),('xmm'+i) as Xmm);
    a.mov('rdi','rcx');a.mov('rsi','rdx');a.mov('rdx','r8');a.mov('rcx','r9');
    if(count>4)a.load('r8',slot(frame+40));
    if(count>5)a.load('r9',slot(frame+48));
   }else if(count>4){
    // Copy caller stack arguments into this adapter's outgoing logical frame.
    for(let i=4;i<count;i++){a.load('r10',slot(frame+40+(i-4)*8));a.store(slot(32+(i-4)*8),'r10')}
   }
   a.callImport('libSystem.'+item.name,Array(count).fill('gp'));
   if(arch==='x64'){
    for(let i=6;i<16;i++)a.loadXmm128(('xmm'+i) as Xmm,slot(64+(i-6)*16));
    a.load('rdi',slot(40));a.load('rsi',slot(48));
   }
  });
 }
 const replaced=new Set(system.map(item=>'linux.'+item.symbol+'.code'));
 return {fragments:[...program.fragments.filter(item=>!replaced.has(item.name)),...b.bundle.fragments],
  imports:Array.from(new Map(system.map(item=>[item.name,{...item,symbol:'libSystem.'+item.name}])).values())};
}
