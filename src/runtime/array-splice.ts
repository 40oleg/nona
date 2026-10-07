import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {DescriptorLayout as D,DescriptorFields as DF} from './descriptor-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {ObjectLayout as O} from './object-layout.js';

export const arraySpliceRoots=['rt.arraySplice.fn'];
export const arraySplicePropertyRoots=builtinPropertyRoots('rt.arraySplice.fn','splice','rt.arrayPrototype');

export function emitArraySplice(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.arraySplice.fn','splice',2,'rt.arrayPrototype');
 // RCX result Value*, RDX nonnegative integer index.
 // RCX result Value*, RDX index. The key is a Number: every property operation
 // converts it when it must, and the indexed fast paths (array-elements.ts)
 // use it as it is instead of formatting and re-parsing a string.
 b.fn('rt.arrayIndexKey',40,a=>{
  a.mov('rax',3);a.store({base:'rcx'},'rax');a.cvtsi2sd('xmm0','rdx');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 // Move one property, preserving holes and inherited values. RCX object
 // Value*, RDX source index, R8 destination index.
 rootedFn(b,'rt.arraySpliceMove',168,[{kind:'value',register:'rcx'},{kind:'locals',offset:80,count:4}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.lea('rcx',slot(80));a.load('rdx',slot(48));a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(96));a.load('rdx',slot(56));a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(112));a.load('rdx',slot(40));a.lea('r8',slot(80));a.call('rt.hasProperty');
  const absent=a.unique('absent'),done=a.unique('done');a.load('rax',slot(120));a.test('rax','rax');a.jcc('e',absent);
  a.lea('rcx',slot(128));a.load('rdx',slot(40));a.lea('r8',slot(80));a.call('rt.getProperty');
  a.load('rcx',slot(40));a.lea('rdx',slot(96));a.lea('r8',slot(128));a.mov('r9',2);a.call('rt.setProperty');a.jmp(done);
  a.label(absent);a.lea('rcx',slot(112));a.load('rdx',slot(40));a.lea('r8',slot(96));a.call('rt.deleteProperty');
  a.load('rax',slot(120));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.label(done);
 });
 rootedFn(b,'rt.arraySplice.fn.code',392,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:14}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.lea('rcx',slot(96));a.lea('rdx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(104));
  const zeroLength=a.unique('zeroLength'),lengthReady=a.unique('lengthReady');
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zeroLength);a.jcc('be',zeroLength);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);
  a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zeroLength);a.mov('rax',0);a.label(lengthReady);a.store(slot(64),'rax');
  const noStart=a.unique('noStart'),startZero=a.unique('startZero'),startNegative=a.unique('startNegative'),startAtEnd=a.unique('startAtEnd'),startDone=a.unique('startDone');
  a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',noStart);
  a.load('rdx',slot(56));a.lea('rcx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(120));
  a.ucomisd('xmm0','xmm0');a.jcc('p',startZero);
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('b',startNegative);
  a.load('rax',slot(64));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',startAtEnd);
  a.cvttsd2si('rax','xmm0');a.jmp(startDone);
  a.label(startNegative);a.load('rax',slot(64));a.neg('rax');a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',startZero);
  a.cvttsd2si('rax','xmm0');a.load('r10',slot(64));a.add('rax','r10');a.jmp(startDone);
  a.label(startAtEnd);a.load('rax',slot(64));a.jmp(startDone);
  a.label(noStart);a.label(startZero);a.mov('rax',0);a.label(startDone);a.store(slot(72),'rax');
  a.load('rax',slot(48));a.sub('rax',2);const noItems=a.unique('noItems');a.jcc('ns',noItems);a.mov('rax',0);a.label(noItems);a.store(slot(312),'rax');
  const deleteZero=a.unique('deleteZero'),deleteRest=a.unique('deleteRest'),deleteDone=a.unique('deleteDone');
  a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',deleteZero);a.cmp('rax',1);a.jcc('e',deleteRest);
  a.load('rdx',slot(56));a.lea('rdx',{base:'rdx',disp:16});a.lea('rcx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(120));
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',deleteZero);a.jcc('be',deleteZero);
  a.load('rax',slot(64));a.load('r10',slot(72));a.sub('rax','r10');a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',deleteRest);
  a.cvttsd2si('rax','xmm0');a.jmp(deleteDone);
  a.label(deleteRest);a.load('rax',slot(64));a.load('r10',slot(72));a.sub('rax','r10');a.jmp(deleteDone);
  a.label(deleteZero);a.mov('rax',0);a.label(deleteDone);a.store(slot(320),'rax');
  a.load('rax',slot(64));a.load('r10',slot(312));a.add('rax','r10');a.load('r10',slot(320));a.sub('rax','r10');
  a.mov('r10',9007199254740991n);a.cmp('rax','r10');failIf(a,'a','rt.throwTypeError');a.store(slot(328),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(80));a.load('r8',slot(320));a.call('rt.arraySpeciesCreate');
  a.mov('rax',0);a.store(slot(336),'rax');const copy=a.unique('copy'),copyNext=a.unique('copyNext'),copyDone=a.unique('copyDone');a.label(copy);
  a.load('rax',slot(336));a.load('r10',slot(320));a.cmp('rax','r10');a.jcc('ae',copyDone);
  a.load('rdx',slot(72));a.add('rdx','rax');a.lea('rcx',slot(144));a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(192));a.lea('rdx',slot(80));a.lea('r8',slot(144));a.call('rt.hasProperty');
  a.load('rax',slot(200));a.test('rax','rax');a.jcc('e',copyNext);
  a.lea('rcx',slot(176));a.lea('rdx',slot(80));a.lea('r8',slot(144));a.call('rt.getProperty');
  a.lea('rcx',slot(160));a.load('rdx',slot(336));a.call('rt.arrayIndexKey');
  a.mov('rax',2);for(const offset of [D.enumerable,D.configurable,D.writable])a.store(slot(208+offset),'rax');
  a.mov('rax',1);for(const offset of [D.enumerable,D.configurable,D.writable])a.store(slot(208+offset+8),'rax');
  for(const offset of [0,8]){a.load('rax',slot(176+offset));a.store(slot(208+D.value+offset),'rax');}
  a.mov('rax',DF.data);a.store(slot(208+D.present),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(160));a.lea('r8',slot(208));a.call('rt.defineOwnProperty');a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
  a.label(copyNext);a.load('rax',slot(336));a.add('rax',1);a.store(slot(336),'rax');a.jmp(copy);
  a.label(copyDone);
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(104),'rax');
  a.mov('rax',3);a.store(slot(112),'rax');a.load('rax',slot(320));a.cvtsi2sd('xmm0','rax');a.storesd(slot(120),'xmm0');
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.mov('r9',2);a.call('rt.setProperty');
  const moveRight=a.unique('moveRight'),insert=a.unique('insert'),left=a.unique('left'),leftDelete=a.unique('leftDelete'),right=a.unique('right');
  // An array still holding exactly `len` dense elements (the species
  // constructor above may have changed it) moves its tail in one step.
  {const generic=a.unique('moveGeneric');
   a.load('rax',slot(80));a.cmp('rax',5);a.jcc('ne',generic);a.load('r10',slot(88));a.load('rax',{base:'r10',disp:O.length});a.load('r11',slot(64));a.cmp('rax','r11');a.jcc('ne',generic);
   a.lea('rcx',slot(80));a.load('rdx',slot(72));a.load('r8',slot(320));a.load('r9',slot(312));a.call('rt.elementsSpliceDense');a.test('rax','rax');a.jcc('ne',insert);
   a.label(generic);}
  a.load('rax',slot(312));a.load('r10',slot(320));a.cmp('rax','r10');a.jcc('a',moveRight);a.jcc('e',insert);
  a.load('rax',slot(72));a.store(slot(336),'rax');a.label(left);
  a.load('rax',slot(64));a.load('r10',slot(320));a.sub('rax','r10');a.load('r10',slot(336));a.cmp('r10','rax');a.jcc('ae',leftDelete);
  a.load('rdx',slot(336));a.load('r10',slot(320));a.add('rdx','r10');
  a.load('r8',slot(336));a.load('r10',slot(312));a.add('r8','r10');a.lea('rcx',slot(80));a.call('rt.arraySpliceMove');
  a.load('rax',slot(336));a.add('rax',1);a.store(slot(336),'rax');a.jmp(left);
  a.label(leftDelete);a.load('rax',slot(64));a.store(slot(336),'rax');const deleteTail=a.unique('deleteTail');a.label(deleteTail);
  a.load('rax',slot(336));a.load('r10',slot(328));a.cmp('rax','r10');a.jcc('be',insert);a.sub('rax',1);a.store(slot(336),'rax');
  a.lea('rcx',slot(144));a.mov('rdx','rax');a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(192));a.lea('rdx',slot(80));a.lea('r8',slot(144));a.call('rt.deleteProperty');
  a.load('rax',slot(200));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.jmp(deleteTail);
  a.label(moveRight);a.load('rax',slot(64));a.load('r10',slot(320));a.sub('rax','r10');a.store(slot(336),'rax');a.label(right);
  a.load('rax',slot(336));a.load('r10',slot(72));a.cmp('rax','r10');a.jcc('be',insert);
  a.load('rdx',slot(336));a.load('r10',slot(320));a.add('rdx','r10');a.sub('rdx',1);
  a.load('r8',slot(336));a.load('r10',slot(312));a.add('r8','r10');a.sub('r8',1);
  a.lea('rcx',slot(80));a.call('rt.arraySpliceMove');a.load('rax',slot(336));a.sub('rax',1);a.store(slot(336),'rax');a.jmp(right);
  a.label(insert);a.mov('rax',0);a.store(slot(360),'rax');const put=a.unique('put'),putDone=a.unique('putDone');a.label(put);
  a.load('rax',slot(360));a.load('r10',slot(312));a.cmp('rax','r10');a.jcc('ae',putDone);
  a.load('rdx',slot(72));a.add('rdx','rax');a.lea('rcx',slot(160));a.call('rt.arrayIndexKey');
  a.load('rax',slot(360));a.add('rax',2);a.shl('rax',4);a.load('r8',slot(56));a.add('r8','rax');
  a.lea('rcx',slot(80));a.lea('rdx',slot(160));a.mov('r9',2);a.call('rt.setProperty');
  a.load('rax',slot(360));a.add('rax',1);a.store(slot(360),'rax');a.jmp(put);
  a.label(putDone);a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(104),'rax');
  a.mov('rax',3);a.store(slot(112),'rax');a.load('rax',slot(328));a.cvtsi2sd('xmm0','rax');a.storesd(slot(120),'xmm0');
  a.lea('rcx',slot(80));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.mov('r9',2);a.call('rt.setProperty');
  a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',slot(128+offset));a.store({base:'rcx',disp:offset},'rax');}
 });
}
