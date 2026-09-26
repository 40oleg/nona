import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const stringBuiltinRoots=['rt.stringIncludes.fn'];
export const stringBuiltinPropertyRoots=builtinPropertyRoots('rt.stringIncludes.fn','includes','rt.stringPrototype');

export function emitStringBuiltins(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.stringIncludes.fn','includes',1,'rt.stringPrototype');
 rootedFn(b,'rt.stringIncludes.fn.code',248,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:5}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}
  a.load('rax',slot(96));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
  a.lea('rcx',slot(64));a.lea('rdx',slot(96));a.call('rt.toString');
  a.load('r10',slot(72));a.load('rax',{base:'r10'});a.store(slot(152),'rax');
  a.mov('rax',0);a.store(slot(96),'rax');a.store(slot(104),'rax');
  const noSearch=a.unique('noSearch');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',noSearch);
  a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}a.label(noSearch);
  const searchReady=a.unique('searchReady');a.load('rax',slot(96));a.cmp('rax',5);a.jcc('ne',searchReady);
  a.mov('rax',6);a.store(slot(112),'rax');a.lea('rax',{rip:'rt.Symbol.match.value'});a.store(slot(120),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.call('rt.getProperty');
  a.lea('rcx',slot(128));a.call('rt.toBoolean');a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  a.label(searchReady);a.lea('rcx',slot(80));a.lea('rdx',slot(96));a.call('rt.toString');
  a.load('r10',slot(88));a.load('rax',{base:'r10'});a.store(slot(160),'rax');
  a.mov('rax',0);a.store(slot(144),'rax');const positionReady=a.unique('positionReady');a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',positionReady);
  a.load('rdx',slot(56));a.lea('rcx',slot(96));a.lea('rdx',{base:'rdx',disp:16});a.call('rt.toNumber');a.movsd('xmm0',slot(104));
  a.ucomisd('xmm0','xmm0');a.jcc('p',positionReady);a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',positionReady);
  a.load('rax',slot(152));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');const atEnd=a.unique('atEnd');a.jcc('ae',atEnd);
  a.cvttsd2si('rax','xmm0');a.store(slot(144),'rax');a.jmp(positionReady);
  a.label(atEnd);a.load('rax',slot(152));a.store(slot(144),'rax');a.label(positionReady);
  const yes=a.unique('yes'),no=a.unique('no'),outer=a.unique('outer'),inner=a.unique('inner'),mismatch=a.unique('mismatch');
  a.load('rax',slot(160));a.test('rax','rax');a.jcc('e',yes);a.load('r10',slot(152));a.cmp('rax','r10');a.jcc('a',no);a.sub('r10','rax');a.store(slot(168),'r10');
  a.label(outer);a.load('rax',slot(144));a.load('r10',slot(168));a.cmp('rax','r10');a.jcc('a',no);
  a.shl('rax',1);a.load('rdx',slot(72));a.add('rdx',8);a.add('rdx','rax');a.load('r8',slot(88));a.add('r8',8);a.load('r9',slot(160));
  a.label(inner);a.test('r9','r9');a.jcc('e',yes);a.load('r10',{base:'rdx'},16);a.load('r11',{base:'r8'},16);a.cmp('r10','r11');a.jcc('ne',mismatch);a.add('rdx',2);a.add('r8',2);a.sub('r9',1);a.jmp(inner);
  a.label(mismatch);a.load('rax',slot(144));a.add('rax',1);a.store(slot(144),'rax');a.jmp(outer);
  a.label(no);a.mov('rax',0);a.jmp(no+'.result');a.label(yes);a.mov('rax',1);a.label(no+'.result');a.load('rcx',slot(40));a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
}
