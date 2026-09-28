import {RuntimeBuilder,slot,failIf} from './abi.js';
import {RootLayout as R} from './heap-layout.js';
import {FunctionLayout as F} from './functions.js';
import {FunctionKind} from './functions.js';
import {ObjectLayout as O} from './object-layout.js';
import {BoundDataLayout as B,maxBoundArguments} from './bound-layout.js';

export function emitBoundCalls(b:RuntimeBuilder):void {
 // Prepared-constructor invoke has the normal invoke ABI. The receiver was
 // allocated/rooted by IR newInstance and must bypass every bound this value.
 b.fn('rt.invokeConstruct',56,a=>{
  a.load('rax',slot(96));a.store(slot(32),'rax');
  a.load('rax',slot(104));a.store(slot(40),'rax');
  a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rdx',disp:8});a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'rax',disp:F.constructable});a.test('r10','r10');failIf(a,'e','rt.throwTypeError');
  a.load('rax',{base:'rdx',disp:8});a.load('rax',{base:'rax',disp:F.bound});
  const unbound=a.unique('unbound'),ordinary=a.unique('ordinary'),done=a.unique('done');a.test('rax','rax');a.jcc('e',unbound);
  a.call('rt.invokeBound');a.jmp(done);a.label(unbound);
  a.load('rax',{base:'rdx',disp:8});a.load('r10',{base:'rax',disp:F.constructCode});a.test('r10','r10');a.jcc('e',ordinary);
  // Native construct entry uses the builtin call ABI, with the prepared
  // receiver in the fifth argument. It must never infer new from thisArg.
  a.mov('r11','r9');a.mov('r9','rax');a.mov('rdx','r8');a.mov('r8','r11');a.callRegister('r10');a.jmp(done);
  a.label(ordinary);a.call('rt.invokeSourceConstruct');a.label(done);
 });
 // RCX out, RDX bound Value*, R8 argc, R9 argv. Fifth argument is either
 // null (ordinary call) or the constructed receiver Value*. Root records
 // retain the bound object, incoming argv, and concatenated managed buffer.
 b.fn('rt.invokeBound',200,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.load('rax',slot(240));a.store(slot(72),'rax');
  a.load('rax',slot(248));a.store(slot(192),'rax');
  a.load('rax',{base:'rdx',disp:8});a.load('rax',{base:'rax',disp:F.bound});a.store(slot(80),'rax');
  a.load('r10',{base:'rax',disp:B.count});a.add('r10','r8');failIf(a,'b','rt.throwRangeError');a.cmp('r10',maxBoundArguments);failIf(a,'a','rt.throwRangeError');a.store(slot(88),'r10');
  a.load('rax',{rip:'rt.gcRoots'});a.store(slot(104+R.next),'rax');a.store(slot(104+R.values),'rdx');a.mov('rax',1);a.store(slot(104+R.count),'rax');
  a.lea('rax',slot(104));a.store(slot(128+R.next),'rax');a.store(slot(128+R.values),'r9');a.store(slot(128+R.count),'r8');
  a.lea('rax',slot(128));a.store(slot(152+R.next),'rax');a.lea('rax',{rip:'rt.undefinedValue'});a.store(slot(96),'rax');a.store(slot(152+R.values),'rax');
  a.mov('rax',0);a.store(slot(152+R.count),'rax');a.lea('rax',slot(152));a.store({rip:'rt.gcRoots'},'rax');
  const invoke=a.unique('invoke');a.load('rcx',slot(88));a.test('rcx','rcx');a.jcc('e',invoke);a.shl('rcx',4);a.call('rt.alloc');a.store(slot(96),'rax');a.store(slot(152+R.values),'rax');
  // No safepoint occurs during these copies. Publish the initialized count
  // only after both segments are written.
  a.mov('r9','rax');a.load('rdx',slot(80));a.load('r8',{base:'rdx',disp:B.count});a.add('rdx',B.args);
  for(const segment of ['bound','incoming']){
   if(segment==='incoming'){a.load('rdx',slot(64));a.load('r8',slot(56));}
   const loop=a.unique(segment),done=a.unique(segment+'Done');a.label(loop);a.test('r8','r8');a.jcc('e',done);
   for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store({base:'r9',disp:offset},'rax');}
   a.add('rdx',16);a.add('r9',16);a.sub('r8',1);a.jmp(loop);a.label(done);
  }
  a.load('rax',slot(88));a.store(slot(152+R.count),'rax');
  a.label(invoke);a.load('rdx',slot(80));a.load('rax',slot(72));
  const construct=a.unique('construct'),returned=a.unique('returned');a.test('rax','rax');a.jcc('ne',construct);
  a.lea('rax',{base:'rdx',disp:B.receiver});a.store(slot(32),'rax');a.add('rdx',B.target);
  a.load('rcx',slot(40));a.load('r8',slot(88));a.load('r9',slot(96));a.call('rt.invoke');a.jmp(returned);
  a.label(construct);a.store(slot(32),'rax');a.load('rcx',slot(40));
  // Bound [[Construct]] substitutes its target when new.target is this bound
  // function. Apply this at every level of a nested bound-function chain.
  const sameTarget=a.unique('sameNewTarget'),targetReady=a.unique('boundTargetReady');
  a.load('rax',slot(192));a.test('rax','rax');a.jcc('e',sameTarget);
  a.load('r10',{base:'rax',disp:8});a.load('r11',slot(48));a.load('r11',{base:'r11',disp:8});
  a.cmp('r10','r11');a.jcc('ne',targetReady);
  a.label(sameTarget);a.lea('rax',{base:'rdx',disp:B.target});
  a.label(targetReady);a.store(slot(40),'rax');a.add('rdx',B.target);
  a.load('r8',slot(88));a.load('r9',slot(96));a.call('rt.invokeConstruct');
  a.label(returned);a.load('rax',slot(104+R.next));a.store({rip:'rt.gcRoots'},'rax');
 });
}
