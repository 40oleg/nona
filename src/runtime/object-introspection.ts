import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {rootedFn} from './root-scope.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import type {Assembler} from '../backend/x64/assembler.js';
import {TypedArrayKind,TypedArrayLayout} from './typed-array.js';
import {ArrayBufferLayout} from './array-buffer.js';
import {ProxyKind} from './proxy.js';

const methods=[
 ['rt.objectHasOwn','hasOwnProperty',1,'rt.objectPrototype'],
 ['rt.objectEnumerable','propertyIsEnumerable',1,'rt.objectPrototype'],
 ['rt.objectIsPrototype','isPrototypeOf',1,'rt.objectPrototype'],
 ['rt.objectLocale','toLocaleString',0,'rt.objectPrototype'],
 ['rt.objectGetPrototype','getPrototypeOf',1,'rt.Object'],
 ['rt.objectSetPrototype','setPrototypeOf',2,'rt.Object'],
 ['rt.objectIs','is',2,'rt.Object'],
] as const;
export const inspectionRoots=methods.map(([symbol])=>symbol);
export const inspectionPropertyRoots=methods.flatMap(([symbol,method,,owner])=>builtinPropertyRoots(symbol,method,owner));
function result(a:Assembler,from:number):void {
 a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',slot(from+offset));a.store({base:'rcx',disp:offset},'rax');}
}
function booleanResult(a:Assembler):void {
 a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',2);a.store({base:'rcx'},'rax');
}

export function emitObjectIntrospection(b:RuntimeBuilder):void {
 for(const [symbol,method,length,owner] of methods)prependFunctionBuiltin(b,symbol,method,length,owner);
 // RCX boxed receiver Value*, RDX normalized string descriptor; RAX attrs or -1.
 // Coercion happens in the rooted public caller.
 b.fn('rt.ownAttributes',88,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  const ordinaryProxy=a.unique('ordinaryProxy'),proxyDone=a.unique('proxyDone');a.load('r10',{base:'rcx'});a.cmp('r10',5);a.jcc('ne',ordinaryProxy);
  a.load('r10',{base:'rcx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('ne',ordinaryProxy);
  a.load('rcx',slot(40));a.load('rdx',slot(48));a.call('rt.proxyOwnAttributes');a.jmp(proxyDone);a.label(ordinaryProxy);
  const normal=a.unique('normal'),missing=a.unique('missing'),done=a.unique('done');
  a.call('rt.isStringOwn');a.test('rax','rax');a.jcc('e',normal);
  a.load('rcx',slot(48));a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');a.mov('rax',0);a.jcc('e',done);a.mov('rax',A.enumerable);a.jmp(done);
  a.label(normal);a.load('rax',slot(40));a.load('rax',{base:'rax',disp:8});a.store(slot(56),'rax');
  const ordinary=a.unique('ordinary');a.load('r10',{base:'rax',disp:O.kind});
  const notTyped=a.unique('notTyped');a.cmp('r10',TypedArrayKind);a.jcc('ne',notTyped);
  a.load('rcx',slot(48));a.call('rt.typedArrayNumericIndex');a.cmp('rax',-1);a.jcc('e',ordinary);a.cmp('rax',-2);a.jcc('e',missing);
  // IsValidIntegerIndex: a detached buffer has no elements (ES2021+, checked by the pinned Test262).
  a.load('r10',slot(56));a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('r11',{base:'r11',disp:ArrayBufferLayout.detached});a.test('r11','r11');a.jcc('ne',missing);
  a.load('r10',slot(56));a.load('r10',{base:'r10',disp:TypedArrayLayout.length});a.cmp('rax','r10');a.jcc('ae',missing);
  a.mov('rax',A.ordinary);a.jmp(done);
  a.label(notTyped);a.cmp('r10',1);a.jcc('ne',ordinary);
  a.load('rcx',slot(48));a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('ne',ordinary);a.load('rax',slot(56));a.load('rax',{base:'rax',disp:O.flags});a.and('rax',2);a.shr('rax',1);a.xor('rax',1);a.jmp(done);
  a.label(ordinary);a.load('rcx',slot(56));a.load('rdx',slot(48));a.call('rt.findGlobalBinding');a.test('rax','rax');
  const data=a.unique('data');a.jcc('e',data);a.load('rax',{base:'rdx'});a.jmp(done);
  a.label(data);a.load('rcx',slot(56));a.load('rdx',slot(48));a.call('rt.findOwnProperty');a.test('rax','rax');
  const virtual=a.unique('virtual');a.jcc('e',virtual);a.load('rax',{base:'rax',disp:P.attributes});a.jmp(done);
  a.label(virtual);a.load('rax',slot(56));a.lea('r10',{rip:'rt.objectPrototype'});a.cmp('rax','r10');a.jcc('ne',missing);
  a.load('rax',{rip:'rt.protoAccessorEnabled'});a.test('rax','rax');a.jcc('e',missing);
  a.load('rcx',slot(48));a.lea('rdx',{rip:'rt.str.proto'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('ne',missing);
  a.mov('rax',A.configurable);a.jmp(done);a.label(missing);a.mov('rax',-1);a.label(done);a.label(proxyDone);
 });
 for(const [symbol,method] of methods)rootedFn(b,symbol+'.code',136,[
  {kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:4},
 ],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(112+offset),'rax');}
  for(const i of [0,1]){
   const absent=a.unique('absent');a.load('rax',slot(48));a.cmp('rax',i);a.jcc('be',absent);
   a.load('rdx',slot(56));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:16*i+offset});a.store(slot(64+16*i+offset),'rax');}a.label(absent);
  }
  if(method==='hasOwnProperty'||method==='propertyIsEnumerable'){
   a.lea('rcx',slot(80));a.lea('rdx',slot(64));a.call('rt.toPropertyKey');
   a.lea('rcx',slot(96));a.lea('rdx',slot(112));a.call('rt.toObject');
   a.lea('rcx',slot(96));a.load('rdx',slot(88));a.call('rt.ownAttributes');
   const done=a.unique('done');a.mov('r10','rax');a.cmp('rax',-1);a.mov('rax',0);a.jcc('e',done);
   if(method==='propertyIsEnumerable'){a.and('r10',A.enumerable);a.test('r10','r10');a.jcc('e',done);}
   a.mov('rax',1);a.label(done);booleanResult(a);
  }else if(method==='getPrototypeOf'){
   a.load('rcx',slot(40));a.lea('rdx',slot(64));a.call('rt.getPrototype');
  }else if(method==='setPrototypeOf'){
   a.load('rax',slot(64));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
   a.load('rax',slot(80));a.cmp('rax',1);const valid=a.unique('valid');a.jcc('e',valid);a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.label(valid);
   const primitive=a.unique('primitive');a.load('rax',slot(64));a.cmp('rax',5);a.jcc('ne',primitive);
   a.lea('rcx',slot(64));a.lea('rdx',slot(80));a.call('rt.setPrototype');a.label(primitive);result(a,64);
  }else if(method==='isPrototypeOf'){
   const no=a.unique('no'),yes=a.unique('yes'),loop=a.unique('loop'),done=a.unique('done');
   a.load('rax',slot(64));a.cmp('rax',5);a.jcc('ne',no);
   a.lea('rcx',slot(96));a.lea('rdx',slot(112));a.call('rt.toObject');
   a.label(loop);a.lea('rcx',slot(80));a.lea('rdx',slot(64));a.call('rt.getPrototype');
   a.load('rax',slot(80));a.cmp('rax',1);a.jcc('e',no);a.load('rax',slot(88));a.load('r10',slot(104));a.cmp('rax','r10');a.jcc('e',yes);
   a.mov('rax',5);a.store(slot(64),'rax');a.load('rax',slot(88));a.store(slot(72),'rax');a.jmp(loop);
   a.label(no);a.mov('rax',0);a.jmp(done);a.label(yes);a.mov('rax',1);a.label(done);booleanResult(a);
  }else if(method==='toLocaleString'){
   a.mov('rax',4);a.store(slot(64),'rax');a.lea('rax',{rip:'rt.str.toString'});a.store(slot(72),'rax');
   a.lea('rcx',slot(80));a.lea('rdx',slot(112));a.lea('r8',slot(64));a.call('rt.getProperty');
   a.lea('rax',slot(112));a.store(slot(32),'rax');a.load('rcx',slot(40));a.lea('rdx',slot(80));a.mov('r8',0);a.lea('r9',{rip:'rt.undefinedValue'});a.call('rt.invoke');
  }else{
   const ordinary=a.unique('ordinary'),no=a.unique('no'),yes=a.unique('yes'),save=a.unique('save'),done=a.unique('done');
   a.load('rax',slot(64));a.cmp('rax',3);a.jcc('ne',ordinary);a.load('rax',slot(80));a.cmp('rax',3);a.jcc('ne',ordinary);
   a.load('rax',slot(72));a.load('r10',slot(88));a.cmp('rax','r10');a.jcc('e',yes);
   a.movsd('xmm0',slot(72));a.ucomisd('xmm0','xmm0');a.jcc('np',no);a.movsd('xmm0',slot(88));a.ucomisd('xmm0','xmm0');a.jcc('p',yes);
   a.label(no);a.mov('rax',0);a.jmp(save);a.label(yes);a.mov('rax',1);a.label(save);booleanResult(a);a.jmp(done);
   a.label(ordinary);a.load('rcx',slot(40));a.lea('rdx',slot(64));a.lea('r8',slot(80));a.call('rt.strictEq');a.label(done);
  }
 });
}
