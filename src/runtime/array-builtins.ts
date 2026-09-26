import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O} from './object-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';

export const arrayBuiltinRoots=['rt.Array.isArray.fn','rt.arrayPush.fn','rt.arrayPop.fn','rt.arrayIncludes.fn'];
export const arrayBuiltinPropertyRoots=[...builtinPropertyRoots('rt.Array.isArray.fn','isArray','rt.Array'),...builtinPropertyRoots('rt.arrayPush.fn','push','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayPop.fn','pop','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayIncludes.fn','includes','rt.arrayPrototype')];

export function emitArrayBuiltins(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.Array.isArray.fn','isArray',1,'rt.Array');
 prependFunctionBuiltin(b,'rt.arrayPush.fn','push',1,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayPop.fn','pop',0,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayIncludes.fn','includes',1,'rt.arrayPrototype');
 b.fn('rt.Array.isArray.fn.code',40,a=>{
  a.mov('rax',0);const save=a.unique('save');a.test('rdx','rdx');a.jcc('e',save);a.load('r10',{base:'r8'});a.cmp('r10',5);a.jcc('ne',save);a.load('r10',{base:'r8',disp:8});a.load('r10',{base:'r10',disp:O.kind});a.cmp('r10',1);a.jcc('ne',save);a.mov('rax',1);
  a.label(save);a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 b.bundle.fragments.push(stringLiteral('rt.arrayPush.length','length'));
 rootedFn(b,'rt.arrayPush.fn.code',232,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:6}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(136));
  const zero=a.unique('zero'),lengthReady=a.unique('lengthReady');a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zero);a.jcc('be',zero);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zero);a.mov('rax',0);a.label(lengthReady);a.store(slot(64),'rax');
  a.load('r10',slot(48));a.add('rax','r10');a.mov('r11',9007199254740991n);a.cmp('rax','r11');failIf(a,'a','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(72),'rax');const loop=a.unique('loop'),finish=a.unique('finish');a.label(loop);a.load('rax',slot(72));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('ae',finish);
  a.load('r10',slot(64));a.add('rax','r10');a.cvtsi2sd('xmm0','rax');a.storesd(slot(152),'xmm0');a.mov('rax',3);a.store(slot(144),'rax');
  a.lea('rcx',slot(160));a.lea('rdx',slot(144));a.call('rt.toString');
  a.load('rax',slot(72));a.shl('rax',4);a.load('r8',slot(56));a.add('r8','rax');
  a.lea('rcx',slot(80));a.lea('rdx',slot(160));a.mov('r9',2);a.call('rt.setProperty');
  a.load('rax',slot(72));a.add('rax',1);a.store(slot(72),'rax');a.jmp(loop);
  a.label(finish);a.load('rax',slot(64));a.load('r10',slot(48));a.add('rax','r10');a.cvtsi2sd('xmm0','rax');a.storesd(slot(120),'xmm0');a.mov('rax',3);a.store(slot(112),'rax');
  a.lea('rcx',slot(80));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.mov('r9',2);a.call('rt.setProperty');
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(120));a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.arrayIncludes.fn.code',232,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:7}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.mov('rax',4);a.store(slot(128),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(136),'rax');
  a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.lea('r8',slot(128));a.call('rt.getProperty');
  a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.call('rt.toNumber');a.movsd('xmm0',slot(120));
  const zero=a.unique('zero'),lengthReady=a.unique('lengthReady'),no=a.unique('no'),yes=a.unique('yes');
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zero);a.jcc('be',zero);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);
  a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zero);a.mov('rax',0);a.label(lengthReady);a.store(slot(72),'rax');a.test('rax','rax');a.jcc('e',no);
  a.load('rax',slot(48));const missingSearch=a.unique('missingSearch'),searchReady=a.unique('searchReady');a.test('rax','rax');a.jcc('e',missingSearch);
  a.load('rdx',slot(56));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(160+offset),'rax');}a.jmp(searchReady);
  a.label(missingSearch);a.mov('rax',0);a.store(slot(160),'rax');a.store(slot(168),'rax');a.label(searchReady);
  a.mov('rax',0);a.store(slot(64),'rax');a.load('rax',slot(48));a.cmp('rax',2);const startReady=a.unique('startReady');a.jcc('b',startReady);
  a.load('rdx',slot(56));a.lea('rcx',slot(112));a.lea('rdx',{base:'rdx',disp:16});a.call('rt.toNumber');a.movsd('xmm0',slot(120));
  a.ucomisd('xmm0','xmm0');a.jcc('p',startReady);
  a.load('rax',slot(72));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',no);
  a.mov('r10',0);a.sub('r10','rax');a.cvtsi2sd('xmm1','r10');a.ucomisd('xmm0','xmm1');a.jcc('be',startReady);
  a.cvttsd2si('rax','xmm0');a.test('rax','rax');const positive=a.unique('positive');a.jcc('ns',positive);a.load('r10',slot(72));a.add('rax','r10');a.label(positive);a.store(slot(64),'rax');a.label(startReady);
  const loop=a.unique('loop'),next=a.unique('next');a.label(loop);a.load('rax',slot(64));a.load('r10',slot(72));a.cmp('rax','r10');a.jcc('ae',no);
  a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(112),'rax');a.storesd(slot(120),'xmm0');
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toString');
  a.lea('rcx',slot(144));a.lea('rdx',slot(80));a.lea('r8',slot(128));a.call('rt.getProperty');
  a.lea('rcx',slot(176));a.lea('rdx',slot(144));a.lea('r8',slot(160));a.call('rt.strictEq');a.load('rax',slot(184));a.test('rax','rax');a.jcc('ne',yes);
  a.load('rax',slot(144));a.cmp('rax',3);a.jcc('ne',next);a.load('rax',slot(160));a.cmp('rax',3);a.jcc('ne',next);
  a.movsd('xmm0',slot(152));a.ucomisd('xmm0','xmm0');a.jcc('np',next);a.movsd('xmm0',slot(168));a.ucomisd('xmm0','xmm0');a.jcc('p',yes);
  a.label(next);a.load('rax',slot(64));a.add('rax',1);a.store(slot(64),'rax');a.jmp(loop);
  a.label(no);a.mov('rax',0);a.jmp(no+'.result');a.label(yes);a.mov('rax',1);a.label(no+'.result');a.load('rcx',slot(40));a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.arrayPop.fn.code',248,[{kind:'output',register:'rcx'},{kind:'locals',offset:80,count:8}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(136));
  const zero=a.unique('zero'),lengthReady=a.unique('lengthReady'),empty=a.unique('empty'),setLength=a.unique('setLength');
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zero);a.jcc('be',zero);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);
  a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zero);a.mov('rax',0);a.label(lengthReady);a.test('rax','rax');a.jcc('e',empty);a.sub('rax',1);a.store(slot(64),'rax');
  a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(128),'rax');a.storesd(slot(136),'xmm0');
  a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.call('rt.toString');
  a.lea('rcx',slot(160));a.lea('rdx',slot(80));a.lea('r8',slot(144));a.call('rt.getProperty');
  a.lea('rcx',slot(176));a.lea('rdx',slot(80));a.lea('r8',slot(144));a.call('rt.deleteProperty');
  a.load('rax',slot(184));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.jmp(setLength);
  a.label(empty);a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(160),'rax');a.store(slot(168),'rax');
  a.label(setLength);a.load('rax',slot(64));a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(192),'rax');a.storesd(slot(200),'xmm0');
  a.lea('rcx',slot(80));a.lea('rdx',slot(96));a.lea('r8',slot(192));a.mov('r9',2);a.call('rt.setProperty');
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(160+n));a.store({base:'rcx',disp:n},'rax');}
 });
}
