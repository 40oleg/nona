import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O} from './object-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const DateKind=7;
export const DateLayout={time:O.size,size:O.size+8} as const;
export const dateRoots=['rt.dateValueOf.fn','rt.dateGetTime.fn','rt.Date.now.fn'];
export const datePropertyRoots=[
 ...builtinPropertyRoots('rt.dateValueOf.fn','valueOf','rt.datePrototype'),
 ...builtinPropertyRoots('rt.dateGetTime.fn','getTime','rt.datePrototype'),
 ...builtinPropertyRoots('rt.Date.now.fn','now','rt.Date'),
];

export function emitDatePrototype(b:RuntimeBuilder):void {
 const bytes=new Uint8Array(O.size);
 b.bundle.fragments.push({name:'rt.datePrototype',section:'.data',alignment:8,bytes,symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
 ]});
 prependFunctionBuiltin(b,'rt.dateValueOf.fn','valueOf',0,'rt.datePrototype');
 prependFunctionBuiltin(b,'rt.dateGetTime.fn','getTime',0,'rt.datePrototype');
}

export function emitDate(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.Date.now.fn','now',0,'rt.Date');
 b.fn('rt.Date.now.fn.code',40,a=>{
  a.store(slot(32),'rcx');a.call('rt.currentTimeMs');a.cvtsi2sd('xmm0','rax');
  a.load('rcx',slot(32));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 for(const name of ['dateValueOf','dateGetTime'])b.fn('rt.'+name+'.fn.code',40,a=>{
  a.load('rdx',slot(80));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',DateKind);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',{base:'r10',disp:DateLayout.time});a.store({base:'rcx',disp:8},'rax');
 });
 // Date() string formatting and calendar parsing are added with the rest of
 // the Date surface. Until then a call cannot masquerade as a correct date.
 b.fn('rt.Date.code',40,a=>a.call('rt.throwTypeError'));
 rootedFn(b,'rt.Date.construct',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:3}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  const supplied=a.unique('supplied'),ready=a.unique('ready');a.test('rdx','rdx');a.jcc('ne',supplied);
  a.call('rt.currentTimeMs');a.cvtsi2sd('xmm0','rax');a.storesd(slot(88),'xmm0');a.jmp(ready);
  a.label(supplied);a.lea('rcx',slot(80));a.mov('rdx','r8');a.call('rt.toNumber');
  // TimeClip rejects non-finite and out-of-range values, then truncates.
  a.movsd('xmm0',slot(88));a.mov('rax',8640000000000000n);a.cvtsi2sd('xmm1','rax');
  a.ucomisd('xmm0','xmm0');const invalid=a.unique('invalid');a.jcc('p',invalid);
  a.ucomisd('xmm0','xmm1');a.jcc('a',invalid);
  a.mov('rax',-8640000000000000n);a.cvtsi2sd('xmm2','rax');a.ucomisd('xmm0','xmm2');a.jcc('b',invalid);
  a.movsd('xmm0',slot(88));a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm0','rax');a.storesd(slot(88),'xmm0');a.jmp(ready);
  a.label(invalid);a.mov('rax',0x7ff8000000000000n);a.store(slot(88),'rax');
  a.label(ready);a.mov('rcx',DateLayout.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',DateKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying,O.flags])a.store({base:'rax',disp:offset},'r10');
  a.load('r10',slot(frame+40));a.load('r10',{base:'r10',disp:8});a.load('r10',{base:'r10',disp:O.prototype});a.store({base:'rax',disp:O.prototype},'r10');
  a.load('r10',slot(88));a.store({base:'rax',disp:DateLayout.time},'r10');
  a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',5);a.store({base:'rcx'},'rax');
 });
}
