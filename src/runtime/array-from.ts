import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O} from './object-layout.js';
import {FunctionLayout as F,FunctionKind} from './functions.js';
import {DescriptorLayout as D,DescriptorFields as DF} from './descriptor-layout.js';
import {HandlerLayout as H,preservedGp,preservedXmm} from './exception-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import type {Assembler} from '../backend/x64/assembler.js';

export const arrayFromRoots=['rt.Array.from.fn'];
export const arrayFromPropertyRoots=builtinPropertyRoots('rt.Array.from.fn','from','rt.Array');

function pushHandler(a:Assembler,offset:number,target:string,error:number):void {
 a.load('rax',{rip:'rt.exceptionHandler'});a.store(slot(offset+H.next),'rax');
 a.mov('rax','rsp');a.store(slot(offset+H.stack),'rax');
 a.lea('rax',{rip:target});a.store(slot(offset+H.target),'rax');
 a.load('rax',{rip:'rt.gcRoots'});a.store(slot(offset+H.roots),'rax');
 a.lea('rax',slot(error));a.store(slot(offset+H.value),'rax');
 a.load('rax',{rip:'rt.cleanupHead'});a.store(slot(offset+H.cleanup),'rax');
 preservedGp.forEach((reg,i)=>a.store(slot(offset+H.gp+8*i),reg));
 preservedXmm.forEach((reg,i)=>a.storeXmm128(slot(offset+H.xmm+16*i),reg));
 a.mov('rax',0);a.store(slot(offset+H.kind),'rax');
 a.lea('rax',slot(offset));a.store({rip:'rt.exceptionHandler'},'rax');
}
function popHandler(a:Assembler):void {
 a.load('rax',{rip:'rt.exceptionHandler'});a.load('rax',{base:'rax',disp:H.next});a.store({rip:'rt.exceptionHandler'},'rax');
}

export function emitArrayFrom(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.Array.from.fn','from',1,'rt.Array');
 // RCX result, RDX this constructor candidate, R8 length, R9 hasLength.
 rootedFn(b,'rt.arrayFromConstruct',232,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:80,count:6}],a=>{
  a.store(slot(48),'rcx');a.store(slot(56),'rdx');a.store(slot(64),'r8');a.store(slot(72),'r9');
  const fallback=a.unique('fallback'),done=a.unique('done');
  a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('ne',fallback);
  a.load('rax',{base:'rdx',disp:8});a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',FunctionKind);a.jcc('ne',fallback);
  a.load('r10',{base:'rax',disp:F.constructable});a.test('r10','r10');a.jcc('e',fallback);
  for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(80+offset),'rax');}
  a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.call('rt.newInstance');
  a.mov('rax',3);a.store(slot(112),'rax');a.load('rax',slot(64));a.cvtsi2sd('xmm0','rax');a.storesd(slot(120),'xmm0');
  a.lea('rax',slot(96));a.store(slot(32),'rax');a.lea('rax',slot(80));a.store(slot(40),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(80));a.load('r8',slot(72));a.lea('r9',slot(112));a.call('rt.invokeConstruct');
  a.load('rcx',slot(48));a.lea('rdx',slot(128));a.lea('r8',slot(96));a.call('rt.constructorResult');a.jmp(done);
  a.label(fallback);a.load('rcx',slot(48));a.mov('rdx',1);a.load('r8',slot(64));a.call('rt.newObject');a.label(done);
 });
 // RCX target object, RDX index, R8 value. Create an own data property.
 rootedFn(b,'rt.arrayFromDefine',216,[{kind:'value',register:'rcx'},{kind:'value',register:'r8'},{kind:'locals',offset:80,count:7}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.lea('rcx',slot(80));a.load('rdx',slot(48));a.call('rt.arrayIndexKey');
  a.mov('rax',2);for(const offset of [D.enumerable,D.configurable,D.writable])a.store(slot(96+offset),'rax');
  a.mov('rax',1);for(const offset of [D.enumerable,D.configurable,D.writable])a.store(slot(96+offset+8),'rax');
  a.load('rdx',slot(56));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(96+D.value+offset),'rax');}
  a.mov('rax',DF.data);a.store(slot(96+D.present),'rax');
  a.load('rcx',slot(40));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.defineOwnProperty');a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
 });
 // RCX result, RDX mapfn, R8 thisArg, R9 element, fifth argument index.
 rootedFn(b,'rt.arrayFromMap',152,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'value',register:'r9'},{kind:'locals',offset:80,count:2}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.load('rdx',slot(64));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(80+offset),'rax');}
  a.mov('rax',3);a.store(slot(96),'rax');a.load('rax',slot(frame+40));a.cvtsi2sd('xmm0','rax');a.storesd(slot(104),'xmm0');
  a.load('rax',slot(56));a.store(slot(32),'rax');a.load('rcx',slot(40));a.load('rdx',slot(48));a.mov('r8',2);a.lea('r9',slot(80));a.call('rt.invoke');
 });
 rootedFn(b,'rt.Array.from.fn.code',952,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:16}],(a,frame)=>{
  a.store(slot(48),'rcx');a.store(slot(56),'rdx');a.store(slot(64),'r8');
  a.mov('rax',0);a.store(slot(72),'rax');
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  a.load('rdx',slot(64));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(80+offset),'rax');}
  a.load('rax',slot(56));const noMap=a.unique('noMap'),mapReady=a.unique('mapReady');a.cmp('rax',2);a.jcc('b',noMap);
  a.load('rdx',slot(64));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:16+offset});a.store(slot(96+offset),'rax');}
  a.label(noMap);a.load('rax',slot(96));a.test('rax','rax');a.jcc('e',mapReady);
  a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('rax',slot(104));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',1);a.store(slot(72),'rax');
  a.load('rax',slot(56));a.cmp('rax',3);a.jcc('b',mapReady);
  a.load('rdx',slot(64));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:32+offset});a.store(slot(112+offset),'rax');}
  a.label(mapReady);
  a.load('rdx',slot(frame+40));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(128+offset),'rax');}
  a.mov('rax',6);a.store(slot(272),'rax');a.lea('rax',{rip:'rt.Symbol.iterator.value'});a.store(slot(280),'rax');
  a.lea('rcx',slot(144));a.lea('rdx',slot(80));a.lea('r8',slot(272));a.call('rt.getProperty');
  const arrayLike=a.unique('arrayLike'),iterable=a.unique('iterable'),iterLoop=a.unique('iterLoop'),iterDone=a.unique('iterDone');
  a.load('rax',slot(144));a.cmp('rax',1);a.jcc('be',arrayLike);
  a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('rax',slot(152));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.label(iterable);a.lea('rcx',slot(192));a.lea('rdx',slot(128));a.mov('r8',0);a.mov('r9',0);a.call('rt.arrayFromConstruct');
  a.lea('rax',slot(80));a.store(slot(32),'rax');a.lea('rcx',slot(160));a.lea('rdx',slot(144));a.mov('r8',0);a.lea('r9',{rip:'rt.undefinedValue'});a.call('rt.invoke');
  a.load('rax',slot(160));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',4);a.store(slot(272),'rax');a.lea('rax',{rip:'rt.iter.next'});a.store(slot(280),'rax');
  a.lea('rcx',slot(176));a.lea('rdx',slot(160));a.lea('r8',slot(272));a.call('rt.getProperty');
  a.load('rax',slot(176));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('rax',slot(184));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(344),'rax');a.label(iterLoop);
  a.load('rax',slot(344));a.mov('r10',9007199254740991n);a.cmp('rax','r10');const safeIndex=a.unique('safeIndex');a.jcc('b',safeIndex);
  const caught=a.unique('caught'),closeFailed=a.unique('closeFailed'),rethrow=a.unique('rethrow'),exit=a.unique('exit');
  pushHandler(a,368,caught,320);a.call('rt.throwTypeError');a.label(safeIndex);
  a.lea('rcx',slot(224));a.lea('rdx',slot(256));a.lea('r8',slot(160));a.lea('r9',slot(176));a.call('rt.iteratorStep');
  a.load('rax',slot(264));a.test('rax','rax');a.jcc('ne',iterDone);
  pushHandler(a,368,caught,320);
  a.load('rax',slot(72));a.test('rax','rax');const rawIter=a.unique('rawIter'),definedIter=a.unique('definedIter');a.jcc('e',rawIter);
  a.load('rax',slot(344));a.store(slot(32),'rax');a.lea('rcx',slot(240));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.lea('r9',slot(224));a.call('rt.arrayFromMap');a.jmp(definedIter);
  a.label(rawIter);for(const offset of [0,8]){a.load('rax',slot(224+offset));a.store(slot(240+offset),'rax');}a.label(definedIter);
  a.lea('rcx',slot(192));a.load('rdx',slot(344));a.lea('r8',slot(240));a.call('rt.arrayFromDefine');popHandler(a);
  a.load('rax',slot(344));a.add('rax',1);a.store(slot(344),'rax');a.jmp(iterLoop);
  a.label(iterDone);a.load('rax',slot(344));a.store(slot(336),'rax');const finish=a.unique('finish');a.jmp(finish);
  a.label(caught);pushHandler(a,648,closeFailed,256);a.lea('rcx',slot(160));a.call('rt.iteratorClose');popHandler(a);a.jmp(rethrow);
  a.label(closeFailed);a.label(rethrow);a.lea('rcx',slot(320));a.call('rt.throw');
  a.label(arrayLike);a.lea('rcx',slot(160));a.lea('rdx',slot(80));a.call('rt.toObject');
  a.mov('rax',4);a.store(slot(272),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(280),'rax');
  a.lea('rcx',slot(288));a.lea('rdx',slot(160));a.lea('r8',slot(272));a.call('rt.getProperty');
  a.lea('rcx',slot(304));a.lea('rdx',slot(288));a.call('rt.toNumber');a.movsd('xmm0',slot(312));
  const zeroLength=a.unique('zeroLength'),lengthReady=a.unique('lengthReady');a.mov('rax',0);a.movqToXmm('xmm1','rax');
  a.ucomisd('xmm0','xmm1');a.jcc('p',zeroLength);a.jcc('be',zeroLength);a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');
  a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);
  a.label(zeroLength);a.mov('rax',0);a.label(lengthReady);a.store(slot(336),'rax');
  a.lea('rcx',slot(192));a.lea('rdx',slot(128));a.load('r8',slot(336));a.mov('r9',1);a.call('rt.arrayFromConstruct');
  a.mov('rax',0);a.store(slot(344),'rax');const likeLoop=a.unique('likeLoop'),likeDone=a.unique('likeDone');a.label(likeLoop);
  a.load('rax',slot(344));a.load('r10',slot(336));a.cmp('rax','r10');a.jcc('ae',likeDone);
  a.lea('rcx',slot(208));a.mov('rdx','rax');a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(224));a.lea('rdx',slot(160));a.lea('r8',slot(208));a.call('rt.getProperty');
  a.load('rax',slot(72));a.test('rax','rax');const rawLike=a.unique('rawLike'),definedLike=a.unique('definedLike');a.jcc('e',rawLike);
  a.load('rax',slot(344));a.store(slot(32),'rax');a.lea('rcx',slot(240));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.lea('r9',slot(224));a.call('rt.arrayFromMap');a.jmp(definedLike);
  a.label(rawLike);for(const offset of [0,8]){a.load('rax',slot(224+offset));a.store(slot(240+offset),'rax');}a.label(definedLike);
  a.lea('rcx',slot(192));a.load('rdx',slot(344));a.lea('r8',slot(240));a.call('rt.arrayFromDefine');
  a.load('rax',slot(344));a.add('rax',1);a.store(slot(344),'rax');a.jmp(likeLoop);
  a.label(likeDone);a.label(finish);
  a.mov('rax',4);a.store(slot(272),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(280),'rax');
  a.mov('rax',3);a.store(slot(288),'rax');a.load('rax',slot(336));a.cvtsi2sd('xmm0','rax');a.storesd(slot(296),'xmm0');
  a.lea('rcx',slot(192));a.lea('rdx',slot(272));a.lea('r8',slot(288));a.mov('r9',2);a.call('rt.setProperty');
  a.load('rcx',slot(48));for(const offset of [0,8]){a.load('rax',slot(192+offset));a.store({base:'rcx',disp:offset},'rax');}a.label(exit);
 });
}
