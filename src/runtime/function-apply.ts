import {rootedFn} from './root-scope.js';
import {RuntimeBuilder,slot,failIf} from './abi.js';
import {RootLayout as R} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A,ProxyKind,ProxyCallable} from './object-layout.js';
import {FunctionKind} from './functions.js';
import {emitFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const applyStaticProperties=builtinPropertyRoots('rt.functionApply','apply');
export const maxApplyArguments=65536;
export function emitFunctionApply(b:RuntimeBuilder):void {
 emitFunctionBuiltin(b,'rt.functionApply','apply',2,'rt.functionPrototype.call');
 // Frame: outgoing this +32; saved out/argc/argv/target +40..64;
 // root records +72/+96/+120; buffer/count/index +144..160; key Value +168;
 // thisArg/list pointers +184/+192; length/number Values +200/+216.
 // Only the final invoke reenters JS today. Getter/coercion support must root
 // key and length temporaries before making the list-building helpers reentrant.
 rootedFn(b,'rt.functionApply.code',248,[{kind:'output',register:'rcx'},{kind:'locals',offset:168,count:1},{kind:'locals',offset:200,count:2}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rax',slot(frame+40));a.store(slot(64),'rax');
  a.load('r10',{base:'rax'});a.cmp('r10',5);failIf(a,'ne','rt.throwTypeError');a.load('rax',{base:'rax',disp:8});
  a.load('r10',{base:'rax',disp:O.kind});const callable=a.unique('callable');a.cmp('r10',FunctionKind);a.jcc('e',callable);a.cmp('r10',ProxyKind);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'rax',disp:O.flags});a.and('r10',ProxyCallable);a.test('r10','r10');failIf(a,'e','rt.throwTypeError');a.label(callable);
  a.load('rax',{rip:'rt.gcRoots'});a.store(slot(72+R.next),'rax');a.load('rax',slot(64));a.store(slot(72+R.values),'rax');a.mov('rax',1);a.store(slot(72+R.count),'rax');
  a.lea('rax',slot(72));a.store(slot(96+R.next),'rax');a.load('rax',slot(56));a.store(slot(96+R.values),'rax');a.load('rax',slot(48));a.store(slot(96+R.count),'rax');
  a.lea('rax',slot(96));a.store(slot(120+R.next),'rax');a.lea('rax',{rip:'rt.undefinedValue'});a.store(slot(120+R.values),'rax');a.store(slot(144),'rax');a.store(slot(184),'rax');
  a.mov('rax',0);a.store(slot(120+R.count),'rax');a.store(slot(152),'rax');a.store(slot(160),'rax');a.lea('rax',slot(120));a.store({rip:'rt.gcRoots'},'rax');
  const invoke=a.unique('invoke'),loop=a.unique('loop');
  a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',invoke);
  a.load('rdx',slot(56));a.store(slot(184),'rdx');a.cmp('rax',1);a.jcc('e',invoke);a.add('rdx',16);a.store(slot(192),'rdx');
  a.load('rax',{base:'rdx'});a.cmp('rax',1);a.jcc('be',invoke);a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.lea('rcx',slot(200));a.lea('r8',{rip:'rt.key.length'});a.call('rt.getProperty');
  a.lea('rcx',slot(216));a.lea('rdx',slot(200));a.call('rt.toNumber');a.movsd('xmm0',slot(224));
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',invoke);a.jcc('be',invoke);
  // An explicit implementation resource bound avoids huge untrusted allocations.
  a.mov('rax',maxApplyArguments+1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'ae','rt.throwRangeError');
  a.cvttsd2si('rax','xmm0');a.store(slot(152),'rax');a.test('rax','rax');a.jcc('e',invoke);
  a.shl('rax',4);a.mov('rcx','rax');a.call('rt.alloc');a.store(slot(144),'rax');a.store(slot(120+R.values),'rax');
  // A dense ordinary array built by ascending indexed writes has exactly
  // length own data nodes in descending order. Verify the whole chain before
  // copying, so a failed check leaves the destination uninitialized and the
  // generic Get loop can still observe accessors, holes and inherited keys.
  const slow=a.unique('slow'),check=a.unique('denseCheck'),checked=a.unique('denseChecked'),copyDense=a.unique('denseCopy'),fastReady=a.unique('fastReady');
  a.load('r10',slot(192));a.load('rax',{base:'r10'});a.cmp('rax',5);a.jcc('ne',slow);
  a.load('r10',{base:'r10',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('ne',slow);
  a.load('rax',{base:'r10',disp:O.properties});a.store(slot(232),'rax');a.load('rax',slot(152));a.store(slot(240),'rax');
  a.label(check);a.load('rax',slot(240));a.test('rax','rax');a.jcc('e',checked);a.sub('rax',1);a.store(slot(240),'rax');
  a.load('r10',slot(232));a.test('r10','r10');a.jcc('e',slow);
  a.load('rax',{base:'r10',disp:P.attributes});a.cmp('rax',A.ordinary);a.jcc('ne',slow);
  a.load('rcx',{base:'r10',disp:P.key});a.call('rt.arrayIndex');a.load('r10',slot(240));a.cmp('rax','r10');a.jcc('ne',slow);
  a.load('r10',slot(232));a.load('rax',{base:'r10',disp:P.next});a.store(slot(232),'rax');a.jmp(check);
  a.label(checked);a.load('rax',slot(232));a.test('rax','rax');a.jcc('ne',slow);
  a.load('r10',slot(192));a.load('r10',{base:'r10',disp:8});a.load('rax',{base:'r10',disp:O.properties});a.store(slot(232),'rax');a.load('rax',slot(152));a.store(slot(240),'rax');
  a.label(copyDense);a.load('rax',slot(240));a.test('rax','rax');a.jcc('e',fastReady);a.sub('rax',1);a.store(slot(240),'rax');a.shl('rax',4);
  a.load('r10',slot(144));a.add('r10','rax');a.load('rdx',slot(232));for(const part of [0,8]){a.load('rax',{base:'rdx',disp:P.value+part});a.store({base:'r10',disp:part},'rax');}
  a.load('rax',{base:'rdx',disp:P.next});a.store(slot(232),'rax');a.jmp(copyDense);
  a.label(fastReady);a.load('rax',slot(152));a.store(slot(120+R.count),'rax');a.jmp(invoke);
  a.label(slow);
  a.label(loop);a.load('rax',slot(160));a.load('r10',slot(152));a.cmp('rax','r10');a.jcc('ae',invoke);
  a.cvtsi2sd('xmm0','rax');a.storesd(slot(176),'xmm0');a.mov('rax',3);a.store(slot(168),'rax');
  // The Number index is converted by rt.getProperty (typed arrays use it directly).
  a.load('rax',slot(160));a.shl('rax',4);a.load('rcx',slot(144));a.add('rcx','rax');a.load('rdx',slot(192));a.lea('r8',slot(168));a.call('rt.getProperty');
  a.load('rax',slot(160));a.add('rax',1);a.store(slot(160),'rax');a.store(slot(120+R.count),'rax');a.jmp(loop);
  a.label(invoke);a.load('rax',slot(184));a.store(slot(32),'rax');a.load('rcx',slot(40));a.load('rdx',slot(64));a.load('r8',slot(152));a.load('r9',slot(144));a.call('rt.invoke');
  a.load('rax',slot(72+R.next));a.store({rip:'rt.gcRoots'},'rax');
 });
}
