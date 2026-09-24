import {rootedFn} from './root-scope.js';
import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O,PropertyAttributes as A} from './object-layout.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';
import {FunctionKind,FunctionLayout as F} from './functions.js';
import {BoundDataLayout as B,maxBoundArguments} from './bound-layout.js';
import {emitFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';

export const bindStaticProperties=builtinPropertyRoots('rt.functionBind','bind');
export function emitFunctionBind(b:RuntimeBuilder):void {
 emitFunctionBuiltin(b,'rt.functionBind','bind',1,'rt.functionPrototype.apply');
 b.bundle.fragments.push(stringLiteral('rt.str.boundPrefix','bound '));
 // Creation and metadata reads are leaf helpers today. When getters are added,
 // out/target/name/length temporaries must be rooted across those callbacks.
 b.fn('rt.functionBind.code',104,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.load('rax',slot(144));a.store(slot(64),'rax');
  a.load('r10',{base:'rax'});a.cmp('r10',5);failIf(a,'ne','rt.throwTypeError');a.load('rax',{base:'rax',disp:8});a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',0);a.load('r10',slot(48));const countReady=a.unique('countReady');a.test('r10','r10');a.jcc('e',countReady);a.mov('rax','r10');a.sub('rax',1);a.label(countReady);
  a.cmp('rax',maxBoundArguments);failIf(a,'a','rt.throwRangeError');a.store(slot(72),'rax');a.shl('rax',4);a.add('rax',B.size);a.mov('rcx','rax');a.call('rt.alloc');a.store(slot(80),'rax');
  a.mov('r10',HeapKind.boundData);a.store({base:'rax',disp:H.kind-H.size},'r10');a.load('r10',slot(72));a.store({base:'rax',disp:B.count},'r10');
  a.load('rdx',slot(64));for(const offset of [0,8]){a.load('r10',{base:'rdx',disp:offset});a.store({base:'rax',disp:B.target+offset},'r10');}
  a.lea('rdx',{rip:'rt.undefinedValue'});a.load('r10',slot(48));const receiverReady=a.unique('receiverReady');a.test('r10','r10');a.jcc('e',receiverReady);a.load('rdx',slot(56));a.label(receiverReady);
  for(const offset of [0,8]){a.load('r10',{base:'rdx',disp:offset});a.store({base:'rax',disp:B.receiver+offset},'r10');}
  a.lea('r9',{base:'rax',disp:B.args});a.load('r8',slot(72));a.load('rdx',slot(56));a.add('rdx',16);
  const loop=a.unique('copy'),copied=a.unique('copied');a.label(loop);a.test('r8','r8');a.jcc('e',copied);
  for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store({base:'r9',disp:offset},'rax');}
  a.add('rdx',16);a.add('r9',16);a.sub('r8',1);a.jmp(loop);a.label(copied);
  a.mov('rcx',F.size);a.call('rt.alloc');a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',FunctionKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying,O.flags,F.environment,F.constructCode,F.homeObject])a.store({base:'rax',disp:offset},'r10');
  a.mov('r10',1);a.store({base:'rax',disp:F.rawThis},'r10');a.lea('r10',{rip:'rt.emptyFunction'});a.store({base:'rax',disp:F.code},'r10');
  a.lea('r10',{rip:'rt.str.nativeFunction'});a.store({base:'rax',disp:F.sourceText},'r10');
  a.load('r10',slot(80));a.store({base:'rax',disp:F.bound},'r10');a.load('rdx',slot(64));a.load('rdx',{base:'rdx',disp:8});
  for(const offset of [O.prototype,F.constructable]){a.load('r10',{base:'rdx',disp:offset});a.store({base:'rax',disp:offset},'r10');}
  a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',5);a.store({base:'rcx'},'rax');
  a.load('rdx',slot(64));a.load('r8',slot(72));a.call('rt.initBoundMetadata');
 });
 // RCX fresh bound Value*, RDX target Value*, R8 bound argument count.
 rootedFn(b,'rt.initBoundMetadata',136,[{kind:'value',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:4}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.mov('rax',3);a.store(slot(80),'rax');a.mov('rax',0);a.store(slot(88),'rax');
  a.load('rcx',{base:'rdx',disp:8});a.lea('rdx',{rip:'rt.str.length'});a.call('rt.findOwnProperty');
  const install=a.unique('install'),subtract=a.unique('subtract');a.test('rax','rax');a.jcc('e',install);
  a.lea('rcx',slot(64));a.load('rdx',slot(48));a.lea('r8',{rip:'rt.key.length'});a.call('rt.getProperty');
  a.load('rax',slot(64));a.cmp('rax',3);a.jcc('ne',install);a.movsd('xmm0',slot(72));a.mov('rax',0);a.movqToXmm('xmm1','rax');
  a.ucomisd('xmm0','xmm1');a.jcc('p',install);a.jcc('be',install);
  // All binary64 values >= 2^52 are integral; avoid signed conversion overflow
  // for huge finite lengths and preserve positive Infinity.
  a.mov('rax',4503599627370496n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',subtract);
  a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm0','rax');
  a.label(subtract);a.load('rax',slot(56));a.cvtsi2sd('xmm1','rax');a.subsd('xmm0','xmm1');a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',install);a.storesd(slot(88),'xmm0');
  a.label(install);a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.key.length'});a.lea('r8',slot(80));a.mov('r9',A.configurable);a.call('rt.initFunctionProperty');
  a.lea('rcx',slot(64));a.load('rdx',slot(48));a.lea('r8',{rip:'rt.key.name'});a.call('rt.getProperty');
  a.load('rax',slot(64));const stringName=a.unique('stringName');a.cmp('rax',4);a.jcc('e',stringName);a.mov('rax',4);a.store(slot(64),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(72),'rax');a.label(stringName);
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.str.boundPrefix'});a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.lea('r8',slot(64));a.call('rt.concat');
  a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.key.name'});a.lea('r8',slot(112));a.mov('r9',A.configurable);a.call('rt.initFunctionProperty');
 });
}
