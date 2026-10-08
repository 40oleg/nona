import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O,ObjectFlags as OF,ProxyKind,ProxyCallable,ProxyConstructable} from './object-layout.js';
import {FunctionLayout as F,FunctionKind} from './functions.js';
import {emitFunctionBuiltin,prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {rootedFn} from './root-scope.js';
import {BoundDataLayout as B} from './bound-layout.js';
import {stringLiteral} from './value.js';
import {RealmFlagShift,realmTable} from './constructor-prototype.js';

const PromiseConstructorFlag=0x10000;

export const sourceStaticProperties=[...builtinPropertyRoots('rt.functionToString','toString'),
 ...builtinPropertyRoots('rt.markNativeBuiltin','__nonaMarkNativeInternal'),
 ...builtinPropertyRoots('rt.markPromiseBuiltin','__nonaMarkPromiseInternal'),
 ...builtinPropertyRoots('rt.promiseRealmBuiltin','__nonaPromiseRealmInternal'),
 ...builtinPropertyRoots('rt.reflectConstructInternal','__nonaReflectConstructInternal')];
export function emitFunctionSource(b:RuntimeBuilder):void {
 emitFunctionBuiltin(b,'rt.functionToString','toString',0,'rt.functionPrototype.bind');
 prependFunctionBuiltin(b,'rt.markNativeBuiltin','__nonaMarkNativeInternal',1,'rt.functionPrototype');
 prependFunctionBuiltin(b,'rt.markPromiseBuiltin','__nonaMarkPromiseInternal',1,'rt.functionPrototype');
 prependFunctionBuiltin(b,'rt.promiseRealmBuiltin','__nonaPromiseRealmInternal',2,'rt.functionPrototype');
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
  // DataView validates the offset before obtaining newTarget.prototype.
  // Its construct code allocates the result after that validation.
  // TypedArray(length) likewise converts the length first (ES2020 22.2.4.2).
  const dataViewReceiver=a.unique('dataViewReceiver');a.load('rax',{base:'r10',disp:F.constructCode});
  for(const target of ['rt.DataView.construct',...['Uint8Array','Int8Array','Uint8ClampedArray','Uint16Array','Int16Array','Uint32Array','Int32Array','Float32Array','Float64Array','BigInt64Array','BigUint64Array'].map(name=>'rt.'+name+'.construct')]){a.lea('r11',{rip:target});a.cmp('rax','r11');a.jcc('e',dataViewReceiver);}
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.newInstanceRaw');a.jmp(receiverReady);
  a.label(dataViewReceiver);a.lea('rcx',slot(128));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
  a.load('r10',slot(136));a.mov('rax',OF.deferredConstructPrototype);a.store({base:'r10',disp:O.flags},'rax');a.jmp(receiverReady);
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
 // __nonaPromiseRealmInternal(object, register). With register true the
 // prelude records this realm's intrinsic %Promise.prototype% (third prelude
 // global, a GC root of the realm). Otherwise object is a receiver that the
 // ordinary [[Construct]] of Promise created: when new.target.prototype was
 // not an object it got %Object.prototype% of new.target's realm
 // (rt.newInstance records that realm in its flags), and it takes that
 // realm's %Promise.prototype% instead (GetPrototypeFromConstructor,
 // ES2020 25.6.3.1 step 3).
 b.fn('rt.promiseRealmBuiltin.code',40,a=>{
  const done=a.unique('done'),adjust=a.unique('adjust');
  a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
  a.cmp('rdx',2);a.jcc('b',done);a.load('rax',{base:'r8'});a.cmp('rax',5);a.jcc('ne',done);
  a.load('rax',{base:'r8',disp:24});a.test('rax','rax');a.jcc('e',adjust);
  for(const part of [0,8]){a.load('rax',{base:'r8',disp:part});a.store({rip:'rt.preludeGlobals',addend:32+part},'rax');}a.jmp(done);
  a.label(adjust);a.load('r10',{base:'r8',disp:8});a.load('r11',{base:'r10',disp:O.flags});a.mov('rax','r11');a.and('rax',OF.defaultPrototypeFallback);a.jcc('e',done);
  a.shr('r11',RealmFlagShift);a.and('r11',255);a.shl('r11',3);a.lea('r9',{rip:realmTable('rt.preludeGlobals')});a.add('r9','r11');a.load('r9',{base:'r9'});
  a.load('rax',{base:'r9',disp:32});a.cmp('rax',5);a.jcc('ne',done);a.load('rax',{base:'r9',disp:40});a.store({base:'r10',disp:O.prototype},'rax');
  a.label(done);
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
 b.fn('rt.functionSource',56,a=>{
  a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('rdx',{base:'rdx',disp:8});
  a.load('rax',{base:'rdx',disp:O.kind});const ordinary=a.unique('ordinary');a.cmp('rax',ProxyKind);a.jcc('ne',ordinary);
  a.load('rax',{base:'rdx',disp:O.flags});a.and('rax',ProxyCallable);a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.lea('rax',{rip:'rt.str.nativeFunction'});const save=a.unique('save');a.jmp(save);
  a.label(ordinary);a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  // A user function's source is a range of its module's text (a static
  // descriptor, tagged with bit 0): the string is created on each call.
  a.load('rax',{base:'rdx',disp:F.sourceText});a.mov('r10','rax');a.and('r10',1);a.test('r10','r10');a.jcc('e',save);
  a.store(slot(40),'rcx');a.mov('rcx','rax');a.call('rt.sourceSlice');a.load('rcx',slot(40));
  a.label(save);a.store({base:'rcx',disp:8},'rax');a.mov('rax',4);a.store({base:'rcx'},'rax');
 });
 // RCX tagged descriptor {source, start, length}; the source is
 // {length, wide, characters} with one byte per character unless wide.
 // -> RAX new string.
 b.fn('rt.sourceSlice',56,a=>{
  a.and('rcx',-2);a.store(slot(40),'rcx');a.load('rcx',{base:'rcx',disp:16});a.shl('rcx',1);a.add('rcx',8);a.call('rt.allocRaw');
  a.load('r10',slot(40));a.load('r8',{base:'r10',disp:16});a.store({base:'rax'},'r8');
  a.load('r9',{base:'r10'});a.load('r11',{base:'r10',disp:8});a.lea('rdx',{base:'rax',disp:8});
  const wide=a.unique('wide'),narrow=a.unique('narrow'),done=a.unique('done');
  a.load('r10',{base:'r9',disp:8});a.add('r9',16);a.test('r10','r10');a.jcc('ne',wide);
  a.add('r9','r11');
  a.label(narrow);a.test('r8','r8');a.jcc('e',done);a.load('r10',{base:'r9'},8);a.store({base:'rdx'},'r10',16);a.add('r9',1);a.add('rdx',2);a.sub('r8',1);a.jmp(narrow);
  a.label(wide);a.add('r9','r11');a.add('r9','r11');const loop=a.unique('loop');
  a.label(loop);a.test('r8','r8');a.jcc('e',done);a.load('r10',{base:'r9'},16);a.store({base:'rdx'},'r10',16);a.add('r9',2);a.add('rdx',2);a.sub('r8',1);a.jmp(loop);
  a.label(done);
 });
}
