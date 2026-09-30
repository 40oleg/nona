import {RuntimeBuilder,slot} from './abi.js';

export const GeneratorStack={bytes:1024*1024,guard:4096} as const;

// The returned base includes a permanently inaccessible low page. The
// usable stack grows down from base+bytes; the caller owns the mapping.
export function emitGeneratorStack(b:RuntimeBuilder):void {
 for(const name of ['VirtualAlloc','VirtualProtect','VirtualFree'])
  b.bundle.imports.push({dll:'KERNEL32.dll',name,symbol:name});
 b.data('rt.generatorStackBytes',new Uint8Array(8),'.data');
 b.fn('rt.allocGeneratorStack',72,a=>{
  a.mov('rcx',0);a.mov('rdx',GeneratorStack.bytes);a.mov('r8',0x3000);a.mov('r9',4);a.callImport('VirtualAlloc');
  const done=a.unique('done');a.test('rax','rax');a.jcc('e',done);a.store(slot(40),'rax');
  a.mov('rcx','rax');a.mov('rdx',GeneratorStack.guard);a.mov('r8',1);a.lea('r9',slot(48));a.callImport('VirtualProtect');
  a.test('rax','rax');const ready=a.unique('ready');a.jcc('ne',ready);
  a.load('rcx',slot(40));a.mov('rdx',0);a.mov('r8',0x8000);a.callImport('VirtualFree');a.mov('rax',0);a.jmp(done);
  // Committed coroutine stacks count towards the collection threshold (see
  // rt.safepoint), so abandoned coroutines, whose stacks the sweep releases,
  // bring the next collection closer.
  a.label(ready);a.load('r10',{rip:'rt.generatorStackBytes'});a.add('r10',GeneratorStack.bytes);a.store({rip:'rt.generatorStackBytes'},'r10');
  a.load('rax',slot(40));a.label(done);
 });
 b.fn('rt.freeGeneratorStack',40,a=>{
  const done=a.unique('done');a.test('rcx','rcx');a.jcc('e',done);
  a.load('r10',{rip:'rt.generatorStackBytes'});a.sub('r10',GeneratorStack.bytes);a.store({rip:'rt.generatorStackBytes'},'r10');
  a.mov('rdx',0);a.mov('r8',0x8000);a.callImport('VirtualFree');a.label(done);
 });
}
