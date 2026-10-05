import {Arm64Assembler} from './assembler.js';
import {RuntimeBuilder,slot} from '../../runtime/abi.js';
import {withNativeTarget} from '../machine/context.js';
import {linkPe,type PeOptions} from '../pe/writer.js';
import type {NativeProgram} from '../pe/model.js';

/** Bridge the OS thread callback ABI to the runtime's logical call frames. */
export function linkWindowsArm64(program:NativeProgram,options:PeOptions={}):Uint8Array {
  return withNativeTarget('win32-arm64',()=>{
    if(!program.imports.some(i=>i.symbol==='CreateThread'))return linkPe(program,{...options,arch:'arm64'});
    const b=new RuntimeBuilder();
    b.bundle.fragments.push({name:'CreateThread',section:'.rdata',alignment:8,bytes:new Uint8Array(8),symbols:{},fixups:[{offset:0,kind:'va64',target:'windows.arm64.CreateThread',addend:0}]});
    b.fn('windows.arm64.CreateThread',120,a=>{
      a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
      a.load('rax',slot(160));a.store(slot(72),'rax');a.load('rax',slot(168));a.store(slot(80),'rax');
      a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.mov('r8',16);a.callImport('HeapAlloc');
      const done=a.unique('threadDone');a.test('rax','rax');a.jcc('e',done);a.store(slot(88),'rax');
      a.load('r10',slot(56));a.store({base:'rax'},'r10');a.load('r10',slot(64));a.store({base:'rax',disp:8},'r10');
      a.load('rcx',slot(40));a.load('rdx',slot(48));a.lea('r8',{rip:'windows.arm64.threadEntry'});a.mov('r9','rax');
      a.load('rax',slot(72));a.store(slot(32),'rax');a.load('rax',slot(80));a.store(slot(40),'rax');
      // Argument six is at logical SP+40; the saved attributes are no longer needed.
      a.callImport('CreateThread.native');a.test('rax','rax');a.jcc('ne',done);
      a.load('r8',slot(88));a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');a.mov('rax',0);a.label(done);
    });
    const a=new Arm64Assembler('windows.arm64.threadEntry','win32');
    a.nativeWord(0xd10383ff); // sub sp,sp,#224
    for(let i=19;i<=30;i++)a.nativeWord((0xf9000000|(((i-19)*8/8)<<10)|(31<<5)|i)>>>0);
    for(let i=8;i<16;i++)a.nativeWord((0x3d800000|(((96+16*(i-8))/16)<<10)|(31<<5)|i)>>>0);
    a.nativeWord(0x910143fd); // add x29,sp,#80 (frame chain)
    a.initializeStack();a.sub('rsp',88);a.store(slot(40),'rax');
    a.load('r11',{base:'rax'});a.store(slot(48),'r11');a.load('rcx',{base:'rax',disp:8});a.store(slot(56),'rcx');
    a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.load('r8',slot(40));a.callImport('HeapFree');
    a.load('r11',slot(48));a.load('rcx',slot(56));a.callRegister('r11');a.add('rsp',88);
    for(let i=8;i<16;i++)a.nativeWord((0x3dc00000|(((96+16*(i-8))/16)<<10)|(31<<5)|i)>>>0);
    for(let i=19;i<=30;i++)a.nativeWord((0xf9400000|(((i-19)*8/8)<<10)|(31<<5)|i)>>>0);
    a.nativeWord(0x910383ff);a.nativeWord(0xd65f03c0); // add sp,#224; ret x30
    b.bundle.fragments.push({...a.finish(),name:'windows.arm64.threadEntry',section:'.text'});
    return linkPe({...program,imports:[...program.imports.filter(i=>i.symbol!=='CreateThread'),{dll:'KERNEL32.dll',name:'CreateThread',symbol:'CreateThread.native'}],fragments:[...program.fragments,...b.bundle.fragments]},{...options,arch:'arm64'});
  });
}
