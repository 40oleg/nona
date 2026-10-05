import {Arm64Assembler} from '../arm64/assembler.js';
import {RuntimeBuilder,slot} from '../../runtime/abi.js';
import {linuxShims} from '../linux/shims.js';
import {linkMachO} from '../macho/writer.js';
import {withNativeTarget} from '../machine/context.js';
import type {Assembler} from '../x64/assembler.js';
import type {NativeProgram} from '../pe/model.js';

function syscall(a:Assembler,number:number):void {
  a.syscall(number);const done=a.unique('syscallDone');a.jcc('ae',done);a.neg('rax');a.label(done);
}
function system(a:Assembler,name:string,count:number):void {a.callImport('libSystem.'+name,Array(count).fill('gp'));}

/** Apple Silicon keeps Nona's compiled runtime and uses the OS's native pthread ABI. */
export function linkDarwinArm64(program:NativeProgram):Uint8Array {
 return withNativeTarget('darwin-arm64',()=>{
  const b=new RuntimeBuilder();
  const names=['clock_gettime','pthread_attr_init','pthread_attr_setstacksize','pthread_attr_destroy','pthread_create','pthread_detach'];
  const replace=new Set(['linux.Sleep.code','linux.WaitOnAddress.code','linux.WakeByAddressSingle.code','linux.CreateThread.code']);
  const fragments=linuxShims(program.imports,{pageSize:16384,replace,syscall:(a,number)=>{
   if(number===9){a.mov('r10',0x1002);syscall(a,197);}
   else if(number===228){
    const realtime=a.unique('realtime'),call=a.unique('clockCall');a.test('rdi','rdi');a.jcc('e',realtime);
    a.mov('rcx',6);a.jmp(call);a.label(realtime);a.mov('rcx',0);a.label(call);a.mov('rdx','rsi');system(a,'clock_gettime',2);
   }else if(number===2){a.mov('rsi',0x601);syscall(a,5);}
   else{
    const mapped=new Map([[1,4],[3,6],[10,74],[11,73],[39,20],[231,1]]).get(number);
    if(mapped===undefined)throw new Error(`Unadapted Darwin ARM64 syscall ${number}`);syscall(a,mapped);
   }
  }});
  b.fn('linux.Sleep.code',72,a=>{
   a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.store(slot(56),'rcx');
   const loop=a.unique('sleepChunk'),ready=a.unique('sleepReady');a.label(loop);
   a.load('rdx',slot(56));a.cmp('rdx',0x7fffffff);a.jcc('be',ready);a.mov('rdx',0x7fffffff);a.label(ready);a.store(slot(64),'rdx');
   a.mov('rdi',0);a.mov('rsi',0);syscall(a,417);
   a.load('rax',slot(56));a.load('r10',slot(64));a.sub('rax','r10');a.store(slot(56),'rax');a.test('rax','rax');a.jcc('ne',loop);
   a.load('rsi',slot(40));a.load('rdi',slot(48));
  });
  b.fn('linux.WaitOnAddress.code',104,a=>{
   a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.store(slot(56),'rcx');a.load('rdx',{base:'rdx'},32);
   const bad=a.unique('bad'),ready=a.unique('ready'),done=a.unique('done');a.cmp('r8',4);a.jcc('ne',bad);
   a.mov('r10','r9');a.mov('r11',0xffffffffn);a.cmp('r9','r11');a.jcc('ne',ready);a.mov('r10',0);a.jmp(ready+'.call');
   a.label(ready);a.mov('r11',1000000);a.imul('r10','r11');a.label(ready+'.call');a.load('rsi',slot(56));a.mov('rdi',1);a.mov('r8',0);syscall(a,544);
   a.test('rax','rax');a.jcc('ge',done);a.cmp('rax',-35);a.jcc('e',done);a.label(bad);a.mov('rax',0);a.jmp(done+'.return');
   a.label(done);a.mov('rax',1);a.label(done+'.return');a.load('rsi',slot(40));a.load('rdi',slot(48));
  });
  b.fn('linux.WakeByAddressSingle.code',56,a=>{
   a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.mov('rsi','rcx');a.mov('rdi',1);a.mov('rdx',0);syscall(a,516);a.load('rsi',slot(40));a.load('rdi',slot(48));
  });
  b.fn('linux.CreateThread.code',168,a=>{
   a.store(slot(40),'rsi');a.store(slot(48),'rdi');a.store(slot(56),'r8');a.store(slot(64),'r9');
   const bad=a.unique('bad'),destroy=a.unique('destroy'),free=a.unique('free'),done=a.unique('done');
   a.mov('rcx',1);a.mov('rdx',0);a.mov('r8',16);a.call('linux.HeapAlloc.code');a.store(slot(72),'rax');a.test('rax','rax');a.jcc('e',bad);
   a.load('r10',slot(56));a.store({base:'rax'},'r10');a.load('r10',slot(64));a.store({base:'rax',disp:8},'r10');
   // Darwin pthread_attr_t is opaque (56 bytes); reserve 64 bytes and a 64 MiB stack.
   a.lea('rcx',slot(88));system(a,'pthread_attr_init',1);a.test('rax','rax');a.jcc('ne',free);
   a.lea('rcx',slot(88));a.mov('rdx',64*1024*1024);system(a,'pthread_attr_setstacksize',2);a.test('rax','rax');a.jcc('ne',destroy);
   a.lea('rcx',slot(80));a.lea('rdx',slot(88));a.lea('r8',{rip:'darwin.arm64.threadEntry'});a.load('r9',slot(72));system(a,'pthread_create',4);
   a.store(slot(152),'rax');a.lea('rcx',slot(88));system(a,'pthread_attr_destroy',1);a.load('rax',slot(152));a.test('rax','rax');a.jcc('ne',free);
   a.load('rcx',slot(80));system(a,'pthread_detach',1);a.load('rax',slot(80));a.jmp(done);
   a.label(destroy);a.lea('rcx',slot(88));system(a,'pthread_attr_destroy',1);
   a.label(free);a.mov('rcx',1);a.mov('rdx',0);a.load('r8',slot(72));a.call('linux.HeapFree.code');
   a.label(bad);a.mov('rax',0);a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
  });
  const a=new Arm64Assembler('darwin.arm64.threadEntry','darwin');
  a.nativeWord(0xd10383ff); // sub sp,sp,#224
  for(let i=19;i<=30;i++)a.nativeWord((0xf9000000|(((i-19)*8/8)<<10)|(31<<5)|i)>>>0);
  for(let i=8;i<16;i++)a.nativeWord((0x3d800000|(((96+16*(i-8))/16)<<10)|(31<<5)|i)>>>0);
  a.nativeWord(0x910143fd);a.initializeStack();a.sub('rsp',88);a.store(slot(40),'rax');
  a.load('r11',{base:'rax'});a.store(slot(48),'r11');a.load('rcx',{base:'rax',disp:8});a.store(slot(56),'rcx');
  a.mov('rcx',1);a.mov('rdx',0);a.load('r8',slot(40));a.call('linux.HeapFree.code');
  a.load('r11',slot(48));a.load('rcx',slot(56));a.callRegister('r11');a.add('rsp',88);a.mov('rax',0);
  for(let i=8;i<16;i++)a.nativeWord((0x3dc00000|(((96+16*(i-8))/16)<<10)|(31<<5)|i)>>>0);
  for(let i=19;i<=30;i++)a.nativeWord((0xf9400000|(((i-19)*8/8)<<10)|(31<<5)|i)>>>0);
  a.nativeWord(0x910383ff);a.nativeWord(0xd65f03c0);
  b.bundle.fragments.push({...a.finish(),name:'darwin.arm64.threadEntry',section:'.text'});
  return linkMachO({...program,imports:names.map(name=>({dll:'/usr/lib/libSystem.B.dylib',name,symbol:'libSystem.'+name})),fragments:[...program.fragments,...fragments,...b.bundle.fragments]},{arch:'arm64'});
 });
}
