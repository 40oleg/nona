import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {DescriptorLayout as D,DescriptorFields as F} from './descriptor-layout.js';

export function emitLiteralAccessor(b:RuntimeBuilder):void {
 // Target RCX, normalized key RDX, function R8, setter flag R9.
 // A partial accessor descriptor merges the other half of an existing pair.
 rootedFn(b,'rt.defineLiteralAccessor',184,[{kind:'value',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:80,count:6}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.mov('rax',2);a.store(slot(80+D.enumerable),'rax');a.store(slot(80+D.configurable),'rax');
  a.mov('rax',1);a.store(slot(80+D.enumerable+8),'rax');a.store(slot(80+D.configurable+8),'rax');
  const setter=a.unique('setter'),apply=a.unique('apply');a.test('r9','r9');a.jcc('ne',setter);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(80+D.get+n),'rax');}
  a.mov('rax',F.enumerable|F.configurable|F.get);a.jmp(apply);a.label(setter);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(80+D.set+n),'rax');}
  a.mov('rax',F.enumerable|F.configurable|F.set);a.label(apply);a.store(slot(80+D.present),'rax');
  a.load('rcx',slot(40));a.load('rdx',slot(48));a.lea('r8',slot(80));a.call('rt.defineOwnProperty');a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
 });
}
