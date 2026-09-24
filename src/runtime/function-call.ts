import {RuntimeBuilder,slot} from './abi.js';
import {RootLayout as R} from './heap-layout.js';
import {emitFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const callStaticProperties=builtinPropertyRoots('rt.functionCall','call');
export function emitFunctionCall(b:RuntimeBuilder):void {
 emitFunctionBuiltin(b,'rt.functionCall','call',1,'rt.functionPrototype.name');
 // JS ABI. This builtin receives its target as raw this. Root both that Value
 // and the entire incoming argument range while re-entering user JavaScript.
 b.fn('rt.functionCall.code',136,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rax',slot(176));a.store(slot(64),'rax');
  a.load('r10',{rip:'rt.gcRoots'});a.store(slot(72+R.next),'r10');a.store(slot(72+R.values),'rax');a.mov('r10',1);a.store(slot(72+R.count),'r10');
  a.lea('rax',slot(72));a.store(slot(96+R.next),'rax');a.store(slot(96+R.values),'r8');a.store(slot(96+R.count),'rdx');a.lea('rax',slot(96));a.store({rip:'rt.gcRoots'},'rax');
  a.lea('rax',{rip:'rt.undefinedValue'});a.load('r8',slot(48));a.load('r9',slot(56));
  const ready=a.unique('ready');a.test('r8','r8');a.jcc('e',ready);a.mov('rax','r9');a.add('r9',16);a.sub('r8',1);
  a.label(ready);a.store(slot(32),'rax');a.load('rcx',slot(40));a.load('rdx',slot(64));a.call('rt.invoke');
  a.load('rax',slot(72+R.next));a.store({rip:'rt.gcRoots'},'rax');
 });
}
