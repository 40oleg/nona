import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O} from './object-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const arraySortRoots=['rt.arraySort.fn'];
export const arraySortPropertyRoots=builtinPropertyRoots('rt.arraySort.fn','sort','rt.arrayPrototype');

export function emitArraySort(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.arraySort.fn','sort',1,'rt.arrayPrototype');
 // The temporary ordinary Array is an internal List: DefineOwnProperty avoids
 // inherited setters while precise roots retain entries during comparisons.
 rootedFn(b,'rt.arraySort.fn.code',344,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:12}],(a,frame)=>{
  a.store(slot(48),'rcx');a.store(slot(56),'rdx');a.store(slot(64),'r8');
  a.mov('rax',0);a.store(slot(208),'rax');
  const noCompare=a.unique('noCompare');a.test('rdx','rdx');a.jcc('e',noCompare);
  a.load('rax',{base:'r8'});a.test('rax','rax');a.jcc('e',noCompare);
  for(const off of [0,8]){a.load('rax',{base:'r8',disp:off});a.store(slot(208+off),'rax');}
  a.load('rax',slot(208));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',slot(216));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',2);failIf(a,'ne','rt.throwTypeError');
  a.label(noCompare);
  a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.lea('rcx',slot(80));a.call('rt.arrayFlattenLength');a.store(slot(304),'rax');
  a.lea('rcx',slot(96));a.mov('rdx',1);a.mov('r8',0);a.call('rt.newObject');
  a.mov('rax',0);a.store(slot(288),'rax');a.store(slot(320),'rax');
  const gather=a.unique('gather'),gatherNext=a.unique('gatherNext'),gatherDone=a.unique('gatherDone');
  a.label(gather);a.load('rax',slot(320));a.load('r10',slot(304));a.cmp('rax','r10');a.jcc('ae',gatherDone);
  a.lea('rcx',slot(112));a.mov('rdx','rax');a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(128));a.lea('rdx',slot(80));a.lea('r8',slot(112));a.call('rt.hasProperty');
  a.load('rax',slot(136));a.test('rax','rax');a.jcc('e',gatherNext);
  a.lea('rcx',slot(144));a.lea('rdx',slot(80));a.lea('r8',slot(112));a.call('rt.getProperty');
  a.lea('rcx',slot(96));a.load('rdx',slot(288));a.lea('r8',slot(144));a.call('rt.arrayConcatDefine');
  a.load('rax',slot(288));a.add('rax',1);a.store(slot(288),'rax');
  a.label(gatherNext);a.load('rax',slot(320));a.add('rax',1);a.store(slot(320),'rax');a.jmp(gather);
  a.label(gatherDone);a.mov('rax',1);a.store(slot(296),'rax');
  const outer=a.unique('outer'),outerNext=a.unique('outerNext'),sorted=a.unique('sorted');
  a.label(outer);a.load('rax',slot(296));a.load('r10',slot(288));a.cmp('rax','r10');a.jcc('ae',sorted);
  a.lea('rcx',slot(112));a.mov('rdx','rax');a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(144));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.call('rt.getProperty');
  a.load('rax',slot(296));a.store(slot(312),'rax');
  const inner=a.unique('inner'),place=a.unique('place');a.label(inner);
  a.load('rax',slot(312));a.test('rax','rax');a.jcc('e',place);
  a.sub('rax',1);a.lea('rcx',slot(112));a.mov('rdx','rax');a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(160));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.call('rt.getProperty');
  // Undefined follows every other value; the callback is not invoked for it.
  const shift=a.unique('shift'),compare=a.unique('compare');
  a.load('rax',slot(160));a.test('rax','rax');a.jcc('e',compare);
  a.load('rax',slot(144));a.test('rax','rax');a.jcc('e',place);
  a.jmp(compare);a.label(compare);
  a.load('rax',slot(144));a.test('rax','rax');a.jcc('e',place);
  a.load('rax',slot(160));a.test('rax','rax');a.jcc('e',shift);
  a.load('rax',slot(208));a.test('rax','rax');const defaultCompare=a.unique('defaultCompare');a.jcc('e',defaultCompare);
  for(const off of [0,8]){a.load('rax',slot(144+off));a.store(slot(240+off),'rax');a.load('rax',slot(160+off));a.store(slot(256+off),'rax');}
  a.lea('rcx',slot(224));a.lea('rdx',slot(208));a.mov('r8',2);a.lea('r9',slot(240));a.lea('rax',{rip:'rt.undefinedValue'});a.store(slot(32),'rax');a.call('rt.invoke');
  a.lea('rcx',slot(176));a.lea('rdx',slot(224));a.call('rt.toNumber');
  a.movsd('xmm0',slot(184));a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('b',shift);a.jmp(place);
  a.label(defaultCompare);a.lea('rcx',slot(176));a.lea('rdx',slot(144));a.call('rt.toString');
  a.lea('rcx',slot(192));a.lea('rdx',slot(160));a.call('rt.toString');
  a.load('rcx',slot(184));a.load('rdx',slot(200));a.call('rt.compareStrings');a.test('rax','rax');a.jcc('ns',place);
  a.label(shift);a.lea('rcx',slot(96));a.load('rdx',slot(312));a.lea('r8',slot(160));a.call('rt.arrayConcatDefine');
  a.load('rax',slot(312));a.sub('rax',1);a.store(slot(312),'rax');a.jmp(inner);
  a.label(place);a.lea('rcx',slot(96));a.load('rdx',slot(312));a.lea('r8',slot(144));a.call('rt.arrayConcatDefine');
  a.label(outerNext);a.load('rax',slot(296));a.add('rax',1);a.store(slot(296),'rax');a.jmp(outer);
  a.label(sorted);a.mov('rax',0);a.store(slot(320),'rax');
  const write=a.unique('write'),erase=a.unique('erase'),done=a.unique('done');a.label(write);
  a.load('rax',slot(320));a.load('r10',slot(288));a.cmp('rax','r10');a.jcc('ae',erase);
  a.lea('rcx',slot(112));a.mov('rdx','rax');a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(144));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.call('rt.getProperty');
  a.lea('rcx',slot(80));a.lea('rdx',slot(112));a.lea('r8',slot(144));a.mov('r9',2);a.call('rt.setProperty');
  a.load('rax',slot(320));a.add('rax',1);a.store(slot(320),'rax');a.jmp(write);
  a.label(erase);a.load('rax',slot(320));a.load('r10',slot(304));a.cmp('rax','r10');a.jcc('ae',done);
  a.lea('rcx',slot(112));a.mov('rdx','rax');a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(128));a.lea('rdx',slot(80));a.lea('r8',slot(112));a.call('rt.deleteProperty');
  a.load('rax',slot(136));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
  a.load('rax',slot(320));a.add('rax',1);a.store(slot(320),'rax');a.jmp(erase);
  a.label(done);a.load('rcx',slot(48));for(const off of [0,8]){a.load('rax',slot(80+off));a.store({base:'rcx',disp:off},'rax');}
 });
}
