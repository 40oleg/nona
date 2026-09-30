import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O} from './object-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const arrayFlatRoots=['rt.arrayFlat.fn','rt.arrayFlatMap.fn'];
export const arrayFlatPropertyRoots=[...builtinPropertyRoots('rt.arrayFlat.fn','flat','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayFlatMap.fn','flatMap','rt.arrayPrototype')];

export function emitArrayFlat(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.arrayFlat.fn','flat',0,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayFlatMap.fn','flatMap',1,'rt.arrayPrototype');
 // LengthOfArrayLike(source), with ToLength clamped to MAX_SAFE_INTEGER.
 rootedFn(b,'rt.arrayFlattenLength',120,[{kind:'value',register:'rcx'},{kind:'locals',offset:64,count:3}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',4);a.store(slot(64),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(72),'rax');
  a.lea('rcx',slot(80));a.load('rdx',slot(40));a.lea('r8',slot(64));a.call('rt.getProperty');
  a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.call('rt.toNumber');a.movsd('xmm0',slot(104));
  const zero=a.unique('zero'),ready=a.unique('ready');a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zero);a.jcc('be',zero);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',ready);a.cvttsd2si('rax','xmm0');a.jmp(ready);
  a.label(zero);a.mov('rax',0);a.label(ready);
 });
 // RCX target*, RDX source*, R8 sourceLength, R9 start; stack arguments:
 // depth, mapper Value* (or zero), thisArg Value* (or zero). Return next index.
 rootedFn(b,'rt.arrayFlattenInto',264,[{kind:'value',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:80,count:7}],(a,frame)=>{
  a.store(slot(56),'rcx');a.store(slot(64),'rdx');a.store(slot(72),'r8');a.store(slot(240),'r9');
  a.load('rax',slot(frame+40));a.store(slot(232),'rax');a.load('rax',slot(frame+48));a.store(slot(216),'rax');a.load('rax',slot(frame+56));a.store(slot(224),'rax');
  a.mov('rax',0);a.store(slot(208),'rax');const loop=a.unique('loop'),next=a.unique('next'),done=a.unique('done'),append=a.unique('append');
  a.label(loop);a.load('rax',slot(208));a.load('r10',slot(72));a.cmp('rax','r10');a.jcc('ae',done);
  a.lea('rcx',slot(80));a.mov('rdx','rax');a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(96));a.load('rdx',slot(64));a.lea('r8',slot(80));a.call('rt.hasProperty');
  a.load('rax',slot(104));a.test('rax','rax');a.jcc('e',next);
  a.lea('rcx',slot(112));a.load('rdx',slot(64));a.lea('r8',slot(80));a.call('rt.getProperty');
  const noMapper=a.unique('noMapper');a.load('rax',slot(216));a.test('rax','rax');a.jcc('e',noMapper);
  for(const offset of [0,8]){a.load('rax',slot(112+offset));a.store(slot(144+offset),'rax');a.load('rax',slot(64));a.load('rax',{base:'rax',disp:offset});a.store(slot(176+offset),'rax');}
  a.mov('rax',3);a.store(slot(160),'rax');a.load('rax',slot(208));a.cvtsi2sd('xmm0','rax');a.storesd(slot(168),'xmm0');
  a.load('rax',slot(224));a.store(slot(32),'rax');a.lea('rcx',slot(128));a.load('rdx',slot(216));a.mov('r8',3);a.lea('r9',slot(144));a.call('rt.invoke');
  for(const offset of [0,8]){a.load('rax',slot(128+offset));a.store(slot(112+offset),'rax');}
  a.label(noMapper);a.load('rax',slot(232));a.test('rax','rax');a.jcc('e',append);
  a.lea('rcx',slot(112));a.call('rt.isArray');a.test('rax','rax');a.jcc('e',append);
  a.lea('rcx',slot(112));a.call('rt.arrayFlattenLength');a.store(slot(248),'rax');
  a.load('rax',slot(232));a.sub('rax',1);a.store(slot(32),'rax');a.mov('rax',0);a.store(slot(40),'rax');a.store(slot(48),'rax');
  a.load('rcx',slot(56));a.lea('rdx',slot(112));a.load('r8',slot(248));a.load('r9',slot(240));a.call('rt.arrayFlattenInto');a.store(slot(240),'rax');a.jmp(next);
  a.label(append);a.load('rax',slot(240));a.mov('r10',9007199254740991n);a.cmp('rax','r10');failIf(a,'ae','rt.throwTypeError');
  a.load('rcx',slot(56));a.mov('rdx','rax');a.lea('r8',slot(112));a.call('rt.arrayConcatDefine');
  a.load('rax',slot(240));a.add('rax',1);a.store(slot(240),'rax');
  a.label(next);a.load('rax',slot(208));a.add('rax',1);a.store(slot(208),'rax');a.jmp(loop);
  a.label(done);a.load('rax',slot(240));
 });
 for(const method of ['flat','flatMap'] as const){
  rootedFn(b,'rt.array'+(method==='flat'?'Flat':'FlatMap')+'.fn.code',200,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:5}],(a,frame)=>{
   a.store(slot(56),'rcx');a.store(slot(64),'rdx');a.store(slot(72),'r8');
   a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
   a.lea('rcx',slot(80));a.call('rt.arrayFlattenLength');a.store(slot(160),'rax');
   if(method==='flatMap'){
    a.load('rax',slot(64));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
    a.load('rdx',slot(72));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(112+offset),'rax');}
    a.load('rax',slot(112));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('rax',slot(120));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',2);failIf(a,'ne','rt.throwTypeError');
    const noThis=a.unique('noThis');a.load('rax',slot(64));a.cmp('rax',2);a.jcc('b',noThis);a.load('rdx',slot(72));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:16+offset});a.store(slot(128+offset),'rax');}a.label(noThis);
    a.mov('rax',1);a.store(slot(168),'rax');
   }else{
    a.mov('rax',1);a.store(slot(168),'rax');const defaultDepth=a.unique('defaultDepth');
    a.load('rax',slot(64));a.test('rax','rax');a.jcc('e',defaultDepth);a.load('rdx',slot(72));a.load('rax',{base:'rdx'});a.test('rax','rax');a.jcc('e',defaultDepth);
    a.load('rdx',slot(72));a.lea('rcx',slot(144));a.call('rt.toNumber');a.movsd('xmm0',slot(152));
    const zero=a.unique('zero'),ready=a.unique('ready');a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zero);a.jcc('be',zero);
    a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',ready);a.cvttsd2si('rax','xmm0');a.jmp(ready);
    a.label(zero);a.mov('rax',0);a.label(ready);a.store(slot(168),'rax');a.label(defaultDepth);
   }
   a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.mov('r8',0);a.call('rt.arraySpeciesCreate');
   a.load('rax',slot(168));a.store(slot(32),'rax');
   if(method==='flatMap'){a.lea('rax',slot(112));a.store(slot(40),'rax');a.lea('rax',slot(128));a.store(slot(48),'rax');}
   else {a.mov('rax',0);a.store(slot(40),'rax');a.store(slot(48),'rax');}
   a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.load('r8',slot(160));a.mov('r9',0);a.call('rt.arrayFlattenInto');
   a.load('rcx',slot(56));for(const offset of [0,8]){a.load('rax',slot(96+offset));a.store({base:'rcx',disp:offset},'rax');}
  });
 }
}
