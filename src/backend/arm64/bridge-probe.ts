import {Arm64Assembler} from './assembler.js';
import {linkElf} from '../elf/writer.js';
import type {NativeArgumentKind} from '../x64/assembler.js';
import type {NamedFragment} from '../pe/model.js';

/** Execute the Windows A64 call bridge against native ABI callees on Linux. */
export function arm64BridgeProbe():Uint8Array {
  const a=new Arm64Assembler('bridge.start','win32'),fragments:NamedFragment[]=[];
  a.initializeStack();a.sub('rsp',280);
  const addCallee=(name:string,words:number[])=>{
    const bytes=new Uint8Array(words.length*4),v=new DataView(bytes.buffer);words.forEach((w,i)=>v.setUint32(i*4,w,true));
    fragments.push({name:name+'.code',section:'.text',bytes,symbols:{},fixups:[]},{name,section:'.rdata',alignment:8,bytes:new Uint8Array(8),symbols:{},fixups:[{offset:0,kind:'va64',target:name+'.code',addend:0}]});
  };
  const gpSum=Array.from({length:7},(_,i)=>0x8b000000|((i+1)<<16));
  const clobber=[0xd2800c83,0xd2800ca4,0xd2800cc5,0xd2800ce6,0x4ea01c06,0x4ea01c07];
  addCallee('bridge.integer',[...gpSum,0xf94003e9,0x8b090000,0xf94007e9,0x8b090000,0xf9400be9,0x8b090000,...clobber,0xd65f03c0]);
  addCallee('bridge.mixed',[...gpSum,0xf94003e9,0x8b090000,...Array.from({length:7},(_,i)=>0x1e602800|((i+1)<<16)),0xfd4007f0,0x1e702800,0x9e620010,0x1e702800,...clobber,0xd65f03c0]);
  const bits=(value:number)=>{const v=new DataView(new ArrayBuffer(8));v.setFloat64(0,value,true);return v.getBigUint64(0,true);};
  const call=(name:string,kinds:NativeArgumentKind[])=>{
    a.mov('rbx',0x123);a.mov('rbp',0x456);a.mov('rsi',0x789);a.mov('rdi',0xabc);
    let gp=0,fp=0;
    kinds.forEach((kind,i)=>{
      const value=kind==='gp'?++gp:bits(++fp+.5);
      if(i<4){if(kind==='gp')a.mov((['rcx','rdx','r8','r9'] as const)[i]!,value);else{a.mov('rax',value);a.movqToXmm((['xmm0','xmm1','xmm2','xmm3'] as const)[i]!,'rax');}}
      else{a.mov('rax',value);a.store({base:'rsp',disp:32+(i-4)*8},'rax');}
    });
    a.callImport(name,kinds);a.cmp('rax',gp*(gp+1)/2);a.jcc('ne','bridge.failed');
    for(const [reg,value] of [['rbx',0x123],['rbp',0x456],['rsi',0x789],['rdi',0xabc]] as const){a.cmp(reg,value);a.jcc('ne','bridge.failed');}
    if(fp){a.movqFromXmm('rax','xmm0');a.mov('r10',bits(94.5));a.cmp('rax','r10');a.jcc('ne','bridge.failed');}
  };
  call('bridge.integer',Array<NativeArgumentKind>(11).fill('gp'));
  call('bridge.mixed',Array.from({length:18},(_,i)=>i%2?'f64':'gp'));
  // Redirected output never reaches WriteConsoleW in CI. Verify the default
  // import signature with a native callee that exposes lpReserved in x4.
  addCallee('WriteConsoleW',[0xaa0403e0,0xd65f03c0]);
  a.mov('rbp',0x456);a.mov('rax',0);a.store({base:'rsp',disp:32},'rax');a.callImport('WriteConsoleW');
  a.test('rax','rax');a.jcc('ne','bridge.failed');a.cmp('rbp',0x456);a.jcc('ne','bridge.failed');
  a.nativeImmediate(0,1);a.lea('rcx',{rip:'bridge.message'});a.nativeImmediate(2,6);a.nativeImmediate(8,64);a.nativeWord(0xd4000001);
  a.nativeImmediate(0,0);a.nativeImmediate(8,93);a.nativeWord(0xd4000001);
  a.label('bridge.failed');a.nativeImmediate(0,1);a.nativeImmediate(8,93);a.nativeWord(0xd4000001);
  fragments.push({...a.finish(),name:'bridge.start',section:'.text'},{name:'bridge.message',section:'.rdata',bytes:new TextEncoder().encode('hello\n'),symbols:{},fixups:[]});
  return linkElf({entry:'bridge.start',functions:[],imports:[],fragments},{machine:'arm64'});
}
