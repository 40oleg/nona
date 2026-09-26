import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {DescriptorLayout as D,DescriptorFields as DF} from './descriptor-layout.js';
import {ObjectLayout as O} from './object-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const arrayConcatRoots=['rt.arrayConcat.fn'];
export const arrayConcatPropertyRoots=builtinPropertyRoots('rt.arrayConcat.fn','concat','rt.arrayPrototype');

export function emitArrayConcat(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.arrayConcat.fn','concat',1,'rt.arrayPrototype');
 // CreateDataPropertyOrThrow(A, index, value). The descriptor and its value
 // remain rooted while user supplied species objects handle definition.
 rootedFn(b,'rt.arrayConcatDefine',248,[{kind:'value',register:'rcx'},{kind:'value',register:'r8'},{kind:'locals',offset:80,count:8}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.lea('rcx',slot(80));a.load('rdx',slot(48));a.call('rt.arrayIndexKey');
  a.mov('rax',2);for(const offset of [D.enumerable,D.configurable,D.writable])a.store(slot(112+offset),'rax');
  a.mov('rax',1);for(const offset of [D.enumerable,D.configurable,D.writable])a.store(slot(112+offset+8),'rax');
  a.load('rdx',slot(56));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(112+D.value+offset),'rax');}
  a.mov('rax',DF.data);a.store(slot(112+D.present),'rax');
  a.load('rcx',slot(40));a.lea('rdx',slot(80));a.lea('r8',slot(112));a.call('rt.defineOwnProperty');a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
 });
 rootedFn(b,'rt.arrayConcat.fn.code',312,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:9}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.mov('r8',0);a.call('rt.arraySpeciesCreate');
  a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');
  const item=a.unique('item'),argument=a.unique('argument'),gotItem=a.unique('gotItem'),nextItem=a.unique('nextItem'),done=a.unique('done');
  a.label(item);a.load('rax',slot(72));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('a',done);a.test('rax','rax');a.jcc('ne',argument);
  for(const offset of [0,8]){a.load('rax',slot(80+offset));a.store(slot(112+offset),'rax');}a.jmp(gotItem);
  a.label(argument);a.sub('rax',1);a.shl('rax',4);a.load('r10',slot(56));a.add('r10','rax');for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store(slot(112+offset),'rax');}
  a.label(gotItem);a.load('rax',slot(112));a.cmp('rax',5);const single=a.unique('single'),spread=a.unique('spread');a.jcc('ne',single);
  a.mov('rax',6);a.store(slot(176),'rax');a.lea('rax',{rip:'rt.Symbol.isConcatSpreadable.value'});a.store(slot(184),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.lea('r8',slot(176));a.call('rt.getProperty');
  a.load('rax',slot(128));a.test('rax','rax');const defaultSpread=a.unique('defaultSpread');a.jcc('e',defaultSpread);
  a.lea('rcx',slot(128));a.call('rt.toBoolean');a.test('rax','rax');a.jcc('ne',spread);a.jmp(single);
  a.label(defaultSpread);a.load('rax',slot(120));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',1);a.jcc('ne',single);
  a.label(spread);a.mov('rax',4);a.store(slot(176),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(184),'rax');
  a.lea('rcx',slot(144));a.lea('rdx',slot(112));a.lea('r8',slot(176));a.call('rt.getProperty');
  a.lea('rcx',slot(160));a.lea('rdx',slot(144));a.call('rt.toNumber');a.movsd('xmm0',slot(168));
  const zero=a.unique('zero'),lengthReady=a.unique('lengthReady');a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zero);a.jcc('be',zero);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);
  a.label(zero);a.mov('rax',0);a.label(lengthReady);a.store(slot(240),'rax');
  a.load('r10',slot(64));a.add('rax','r10');a.mov('r10',9007199254740991n);a.cmp('rax','r10');failIf(a,'a','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(248),'rax');const element=a.unique('element'),advance=a.unique('advance');
  a.label(element);a.load('rax',slot(248));a.load('r10',slot(240));a.cmp('rax','r10');a.jcc('ae',nextItem);
  a.lea('rcx',slot(176));a.mov('rdx','rax');a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(192));a.lea('rdx',slot(112));a.lea('r8',slot(176));a.call('rt.hasProperty');
  a.load('rax',slot(200));a.test('rax','rax');a.jcc('e',advance);
  a.lea('rcx',slot(208));a.lea('rdx',slot(112));a.lea('r8',slot(176));a.call('rt.getProperty');
  a.lea('rcx',slot(96));a.load('rdx',slot(64));a.lea('r8',slot(208));a.call('rt.arrayConcatDefine');
  a.label(advance);a.load('rax',slot(64));a.add('rax',1);a.store(slot(64),'rax');a.load('rax',slot(248));a.add('rax',1);a.store(slot(248),'rax');a.jmp(element);
  a.label(single);a.load('rax',slot(64));a.mov('r10',9007199254740991n);a.cmp('rax','r10');failIf(a,'ae','rt.throwTypeError');
  a.lea('rcx',slot(96));a.mov('rdx','rax');a.lea('r8',slot(112));a.call('rt.arrayConcatDefine');
  a.load('rax',slot(64));a.add('rax',1);a.store(slot(64),'rax');
  a.label(nextItem);a.load('rax',slot(72));a.add('rax',1);a.store(slot(72),'rax');a.jmp(item);
  a.label(done);a.mov('rax',4);a.store(slot(176),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(184),'rax');
  a.mov('rax',3);a.store(slot(192),'rax');a.load('rax',slot(64));a.cvtsi2sd('xmm0','rax');a.storesd(slot(200),'xmm0');
  a.lea('rcx',slot(96));a.lea('rdx',slot(176));a.lea('r8',slot(192));a.mov('r9',2);a.call('rt.setProperty');
  a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',slot(96+offset));a.store({base:'rcx',disp:offset},'rax');}
 });
}
