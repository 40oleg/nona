import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O} from './object-layout.js';
import {FunctionLayout as F,FunctionKind} from './functions.js';
import {DescriptorLayout as D,DescriptorFields as DF} from './descriptor-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const arrayOfRoots=['rt.Array.of.fn'];
export const arrayOfPropertyRoots=builtinPropertyRoots('rt.Array.of.fn','of','rt.Array');

export function emitArrayOf(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.Array.of.fn','of',0,'rt.Array');
 rootedFn(b,'rt.Array.of.fn.code',344,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:14}],(a,frame)=>{
  a.store(slot(48),'rcx');a.store(slot(56),'rdx');a.store(slot(64),'r8');
  a.load('rdx',slot(frame+40));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(80+offset),'rax');}
  const fallback=a.unique('fallback'),populate=a.unique('populate');
  a.load('rax',slot(80));a.cmp('rax',5);a.jcc('ne',fallback);
  a.load('rax',slot(88));a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',FunctionKind);a.jcc('ne',fallback);
  a.load('r10',{base:'rax',disp:F.constructable});a.test('r10','r10');a.jcc('e',fallback);
  a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.call('rt.newInstance');
  a.mov('rax',3);a.store(slot(112),'rax');a.load('rax',slot(56));a.cvtsi2sd('xmm0','rax');a.storesd(slot(120),'xmm0');
  a.lea('rax',slot(96));a.store(slot(32),'rax');a.lea('rax',slot(80));a.store(slot(40),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(80));a.mov('r8',1);a.lea('r9',slot(112));a.call('rt.invokeConstruct');
  a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.lea('r8',slot(96));a.call('rt.constructorResult');a.jmp(populate);
  a.label(fallback);a.lea('rcx',slot(144));a.mov('rdx',1);a.load('r8',slot(56));a.call('rt.newObject');
  a.label(populate);a.mov('rax',0);a.store(slot(320),'rax');const loop=a.unique('loop'),done=a.unique('done');a.label(loop);
  a.load('rax',slot(320));a.load('r10',slot(56));a.cmp('rax','r10');a.jcc('ae',done);
  a.lea('rcx',slot(160));a.mov('rdx','rax');a.call('rt.arrayIndexKey');
  a.load('rax',slot(320));a.shl('rax',4);a.load('rdx',slot(64));a.add('rdx','rax');
  for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(192+offset),'rax');}
  a.mov('rax',2);for(const offset of [D.enumerable,D.configurable,D.writable])a.store(slot(208+offset),'rax');
  a.mov('rax',1);for(const offset of [D.enumerable,D.configurable,D.writable])a.store(slot(208+offset+8),'rax');
  for(const offset of [0,8]){a.load('rax',slot(192+offset));a.store(slot(208+D.value+offset),'rax');}
  a.mov('rax',DF.data);a.store(slot(208+D.present),'rax');
  a.lea('rcx',slot(144));a.lea('rdx',slot(160));a.lea('r8',slot(208));a.call('rt.defineOwnProperty');a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
  a.load('rax',slot(320));a.add('rax',1);a.store(slot(320),'rax');a.jmp(loop);
  a.label(done);a.mov('rax',4);a.store(slot(160),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(168),'rax');
  a.mov('rax',3);a.store(slot(176),'rax');a.load('rax',slot(56));a.cvtsi2sd('xmm0','rax');a.storesd(slot(184),'xmm0');
  a.lea('rcx',slot(144));a.lea('rdx',slot(160));a.lea('r8',slot(176));a.mov('r9',2);a.call('rt.setProperty');
  a.load('rcx',slot(48));for(const offset of [0,8]){a.load('rax',slot(144+offset));a.store({base:'rcx',disp:offset},'rax');}
 });
}
