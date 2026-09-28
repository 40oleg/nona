import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O,ProxyKind,ProxyCallable,ProxyConstructable} from './object-layout.js';
import {FunctionLayout as F,FunctionKind} from './functions.js';
import {emitFunctionBuiltin,prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {rootedFn} from './root-scope.js';
import {BoundDataLayout as B} from './bound-layout.js';
import {stringLiteral} from './value.js';

const PromiseConstructorFlag=0x10000;

export const sourceStaticProperties=[...builtinPropertyRoots('rt.functionToString','toString'),
 ...builtinPropertyRoots('rt.markNativeBuiltin','__nonaMarkNativeInternal'),
 ...builtinPropertyRoots('rt.markPromiseBuiltin','__nonaMarkPromiseInternal'),
 ...builtinPropertyRoots('rt.reflectConstructInternal','__nonaReflectConstructInternal')];
export function emitFunctionSource(b:RuntimeBuilder):void {
 emitFunctionBuiltin(b,'rt.functionToString','toString',0,'rt.functionPrototype.bind');
 prependFunctionBuiltin(b,'rt.markNativeBuiltin','__nonaMarkNativeInternal',1,'rt.functionPrototype');
 prependFunctionBuiltin(b,'rt.markPromiseBuiltin','__nonaMarkPromiseInternal',1,'rt.functionPrototype');
 prependFunctionBuiltin(b,'rt.reflectConstructInternal','__nonaReflectConstructInternal',3,'rt.functionPrototype');
 b.bundle.fragments.push(stringLiteral('rt.promiseIndexZero','0'));
 // The JS bootstrap validates constructors and builds a private dense list.
 // This native entry supplies an independent new.target to the existing
 // constructor path, preserving both receiver prototype and new.target.
 rootedFn(b,'rt.reflectConstructInternal.code',184,[
  {kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},
  {kind:'locals',offset:80,count:6},
 ],a=>{
  a.store(slot(48),'rcx');a.store(slot(56),'rdx');a.store(slot(64),'r8');
  a.cmp('rdx',3);failIf(a,'b','rt.throwTypeError');
  for(const [index,offset] of [[0,80],[1,96],[2,112]] as const){
   a.load('r10',slot(64));for(const part of [0,8]){a.load('rax',{base:'r10',disp:index*16+part});a.store(slot(offset+part),'rax');}
  }
  for(const offset of [80,112]){
   a.load('rax',slot(offset));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
   a.load('r10',slot(offset+8));a.load('rax',{base:'r10',disp:O.kind});const proxy=a.unique('proxy'),valid=a.unique('valid');a.cmp('rax',ProxyKind);a.jcc('e',proxy);a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
   a.load('rax',{base:'r10',disp:F.constructable});a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.jmp(valid);
   a.label(proxy);a.load('rax',{base:'r10',disp:O.flags});a.and('rax',ProxyConstructable);a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.label(valid);
  }
  a.lea('rcx',slot(80));a.lea('rdx',slot(96));a.call('rt.validatePromiseExecutorArray');
  for(const part of [0,8]){a.load('rax',slot(80+part));a.store(slot(160+part),'rax');}
  const bound=a.unique('reflectBound'),ready=a.unique('reflectTargetReady'),unchanged=a.unique('reflectUnchanged');
  a.label(bound);a.load('r10',slot(168));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('e',ready);a.load('r11',{base:'r10',disp:F.bound});a.test('r11','r11');a.jcc('e',ready);
  a.load('rax',slot(120));a.cmp('rax','r10');a.jcc('ne',unchanged);
  for(const part of [0,8]){a.load('rax',{base:'r11',disp:B.target+part});a.store(slot(112+part),'rax');}
  a.label(unchanged);
  for(const part of [0,8]){a.load('rax',{base:'r11',disp:B.target+part});a.store(slot(160+part),'rax');}
  a.jmp(bound);a.label(ready);
  a.load('r10',slot(168));a.load('rax',{base:'r10',disp:O.kind});const proxyTarget=a.unique('proxyTarget'),receiverReady=a.unique('receiverReady');a.cmp('rax',ProxyKind);a.jcc('e',proxyTarget);
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.newInstanceRaw');a.jmp(receiverReady);
  a.label(proxyTarget);a.lea('r10',{rip:'rt.undefinedValue'});for(const part of [0,8]){a.load('rax',{base:'r10',disp:part});a.store(slot(128+part),'rax');}a.label(receiverReady);
  a.mov('rax',1);a.store(slot(32),'rax');a.lea('rax',slot(112));a.store(slot(40),'rax');
  a.lea('rcx',slot(144));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.lea('r9',slot(128));a.call('rt.invokeArray');
  a.load('rcx',slot(48));a.lea('rdx',slot(144));a.lea('r8',slot(128));a.call('rt.constructorResult');
 });
 b.fn('rt.markNativeBuiltin.code',40,a=>{
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r8',disp:8});a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.lea('r10',{rip:'rt.str.nativeFunction'});a.store({base:'rax',disp:F.sourceText},'r10');
  a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
 b.fn('rt.markPromiseBuiltin.code',40,a=>{
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r8',disp:8});a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'rax',disp:O.flags});a.or('r10',PromiseConstructorFlag);a.store({base:'rax',disp:O.flags},'r10');
  a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
 b.fn('rt.isPromiseConstructor',40,a=>{
  const no=a.unique('no'),done=a.unique('done'),unwrap=a.unique('unwrap'),target=a.unique('target');a.label(unwrap);
  a.load('rax',{base:'rcx'});a.cmp('rax',5);a.jcc('ne',no);
  a.load('r10',{base:'rcx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',FunctionKind);a.jcc('ne',no);
  a.load('rax',{base:'r10',disp:F.bound});a.test('rax','rax');a.jcc('e',target);
  a.lea('rcx',{base:'rax',disp:B.target});a.jmp(unwrap);
  a.label(target);a.load('rax',{base:'r10',disp:O.flags});a.and('rax',PromiseConstructorFlag);a.test('rax','rax');a.jcc('e',no);
  a.mov('rax',1);a.jmp(done);a.label(no);a.mov('rax',0);a.label(done);
 });
 b.fn('rt.validatePromiseExecutor',56,a=>{
  a.store(slot(40),'rdx');a.store(slot(48),'rcx');a.call('rt.isPromiseConstructor');const done=a.unique('done');a.test('rax','rax');a.jcc('e',done);
  const bound=a.unique('bound'),effective=a.unique('effective');a.load('rcx',slot(48));a.label(bound);
  a.load('r10',{base:'rcx',disp:8});a.load('r11',{base:'r10',disp:F.bound});a.test('r11','r11');a.jcc('e',effective);
  a.load('rax',{base:'r11',disp:B.count});a.test('rax','rax');const noArgs=a.unique('noArgs');a.jcc('e',noArgs);
  a.lea('rax',{base:'r11',disp:B.args});a.store(slot(40),'rax');a.label(noArgs);
  a.lea('rcx',{base:'r11',disp:B.target});a.jmp(bound);a.label(effective);
  a.load('rdx',slot(40));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',FunctionKind);a.jcc('e',done);
  a.cmp('rax',ProxyKind);failIf(a,'ne','rt.throwTypeError');a.load('rax',{base:'r10',disp:O.flags});a.and('rax',ProxyCallable);a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
  a.label(done);
 });
 rootedFn(b,'rt.validatePromiseExecutorArray',104,[{kind:'value',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.call('rt.isPromiseConstructor');const done=a.unique('done');a.test('rax','rax');a.jcc('e',done);
  a.lea('r10',{rip:'rt.undefinedValue'});for(const part of [0,8]){a.load('rax',{base:'r10',disp:part});a.store(slot(80+part),'rax');}
  a.load('r10',slot(48));a.load('r10',{base:'r10',disp:8});a.load('rax',{base:'r10',disp:O.length});a.test('rax','rax');const argumentReady=a.unique('argumentReady');a.jcc('e',argumentReady);
  a.mov('rax',4);a.store(slot(64),'rax');a.lea('rax',{rip:'rt.promiseIndexZero'});a.store(slot(72),'rax');
  a.lea('rcx',slot(80));a.load('rdx',slot(48));a.lea('r8',slot(64));a.call('rt.getProperty');a.label(argumentReady);
  a.load('rcx',slot(40));a.lea('rdx',slot(80));a.call('rt.validatePromiseExecutor');a.label(done);
 });
 b.fn('rt.functionToString.code',40,a=>{a.load('rdx',slot(80));a.call('rt.functionSource');});
 // RCX output, RDX receiver Value*. Source descriptors are immutable static
 // literals; neither name mutation nor deletion changes this representation.
 b.fn('rt.functionSource',40,a=>{
  a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('rdx',{base:'rdx',disp:8});
  a.load('rax',{base:'rdx',disp:O.kind});const ordinary=a.unique('ordinary');a.cmp('rax',ProxyKind);a.jcc('ne',ordinary);
  a.load('rax',{base:'rdx',disp:O.flags});a.and('rax',ProxyCallable);a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.lea('rax',{rip:'rt.str.nativeFunction'});const save=a.unique('save');a.jmp(save);
  a.label(ordinary);a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rdx',disp:F.sourceText});a.label(save);a.store({base:'rcx',disp:8},'rax');a.mov('rax',4);a.store({base:'rcx'},'rax');
 });
}
