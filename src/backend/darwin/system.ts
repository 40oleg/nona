import {RuntimeBuilder,slot} from '../../runtime/abi.js';
import type {NativeProgram} from '../pe/model.js';
import type {Xmm} from '../x64/assembler.js';

/** Bridge Nona's logical Win64 boundary to the OS C ABI, without a C runtime. */
export function darwinProcessSystemAdapters(program:NativeProgram,arch:'x64'|'arm64'){
 const system=program.imports.filter(item=>item.dll==='/usr/lib/libSystem.B.dylib'),b=new RuntimeBuilder();
 const arity:Record<string,number>={mach_host_self:0,host_page_size:2,host_statistics64:4,setenv:3,unsetenv:1,getenv:1,__error:0,getpwnam:1,getpwuid:1,getgrnam:1,getgrgid:1,initgroups:2};
 for(const item of system){
  const count=arity[item.name];if(count===undefined)throw new Error('Unsupported Darwin process system API '+item.name);
  b.fn('linux.'+item.symbol+'.code',arch==='x64'?232:40,a=>{
   if(arch==='x64'){
    a.store(slot(40),'rdi');a.store(slot(48),'rsi');
    for(let i=6;i<16;i++)a.storeXmm128(slot(64+(i-6)*16),('xmm'+i) as Xmm);
    a.mov('rdi','rcx');a.mov('rsi','rdx');a.mov('rdx','r8');a.mov('rcx','r9');
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
  imports:system.map(item=>({...item,symbol:'libSystem.'+item.name}))};
}
