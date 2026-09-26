import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {ObjectLayout as O} from './object-layout.js';
import {FunctionKind} from './functions.js';

export const stringReplaceRoots=['rt.stringReplace.fn'];
export const stringReplacePropertyRoots=builtinPropertyRoots('rt.stringReplace.fn','replace','rt.stringPrototype');

export function emitStringReplace(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.stringReplace.fn','replace',2,'rt.stringPrototype');
 rootedFn(b,'rt.stringReplace.fn.code',376,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:13}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}a.load('rax',slot(64));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
  a.mov('rax',0);for(const off of [80,88,96,104])a.store(slot(off),'rax');
  const args=a.unique('args'),replaceArg=a.unique('replaceArg');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',args);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(80+n),'rax');}
  a.label(args);a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',replaceArg);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:16+n});a.store(slot(96+n),'rax');}a.label(replaceArg);
  const noHook=a.unique('noHook'),invokeHook=a.unique('invokeHook'),functional=a.unique('functional'),replacementReady=a.unique('replacementReady'),notFound=a.unique('notFound'),found=a.unique('found'),done=a.unique('done');
  a.load('rax',slot(80));a.cmp('rax',5);a.jcc('ne',noHook);
  a.mov('rax',6);a.store(slot(256),'rax');a.lea('rax',{rip:'rt.Symbol.replace.value'});a.store(slot(264),'rax');
  a.lea('rcx',slot(240));a.lea('rdx',slot(80));a.lea('r8',slot(256));a.call('rt.getProperty');a.load('rax',slot(240));a.cmp('rax',1);a.jcc('a',invokeHook);
  a.label(noHook);a.lea('rcx',slot(112));a.lea('rdx',slot(64));a.call('rt.toString');a.lea('rcx',slot(128));a.lea('rdx',slot(80));a.call('rt.toString');
  // Non-callable replacement values are converted even if the search fails.
  a.load('rax',slot(96));a.cmp('rax',5);a.jcc('ne',replacementReady);a.load('r10',slot(104));a.load('r10',{base:'r10',disp:O.kind});a.cmp('r10',FunctionKind);a.jcc('e',functional);
  a.label(replacementReady);a.lea('rcx',slot(144));a.lea('rdx',slot(96));a.call('rt.toString');a.mov('rax',0);a.store(slot(312),'rax');a.jmp(replacementReady+'.done');
  a.label(functional);a.mov('rax',1);a.store(slot(312),'rax');a.label(replacementReady+'.done');
  a.load('r10',slot(120));a.load('rax',{base:'r10'});a.store(slot(280),'rax');a.load('r10',slot(136));a.load('rax',{base:'r10'});a.store(slot(288),'rax');a.mov('rax',0);a.store(slot(272),'rax');
  const outer=a.unique('outer'),compare=a.unique('compare'),mismatch=a.unique('mismatch');a.label(outer);a.load('rax',slot(272));a.load('r10',slot(288));a.add('rax','r10');a.load('r10',slot(280));a.cmp('rax','r10');a.jcc('a',notFound);
  a.load('rax',slot(272));a.shl('rax',1);a.load('rdx',slot(120));a.add('rdx',8);a.add('rdx','rax');a.load('r8',slot(136));a.add('r8',8);a.load('r9',slot(288));
  a.label(compare);a.test('r9','r9');a.jcc('e',found);a.load('r10',{base:'rdx'},16);a.load('r11',{base:'r8'},16);a.cmp('r10','r11');a.jcc('ne',mismatch);a.add('rdx',2);a.add('r8',2);a.sub('r9',1);a.jmp(compare);
  a.label(mismatch);a.load('rax',slot(272));a.add('rax',1);a.store(slot(272),'rax');a.jmp(outer);
  a.label(found);a.lea('rcx',slot(176));a.load('rdx',slot(120));a.mov('r8',0);a.load('r9',slot(272));a.call('rt.splitSubstring');
  a.lea('rcx',slot(192));a.load('rdx',slot(120));a.load('r8',slot(272));a.load('r10',slot(288));a.add('r8','r10');a.load('r9',slot(280));a.call('rt.splitSubstring');
  a.load('rax',slot(312));a.test('rax','rax');const stringReplace=a.unique('stringReplace');a.jcc('e',stringReplace);
  // Invoke functional replacement with (matched, position, full string).
  for(const n of [0,8]){a.load('rax',slot(128+n));a.store(slot(320+n),'rax');a.load('rax',slot(112+n));a.store(slot(352+n),'rax');}
  a.mov('rax',3);a.store(slot(336),'rax');a.load('rax',slot(272));a.cvtsi2sd('xmm0','rax');a.storesd(slot(344),'xmm0');
  a.lea('rax',{rip:'rt.undefinedValue'});a.store(slot(32),'rax');a.lea('rcx',slot(208));a.lea('rdx',slot(96));a.mov('r8',3);a.lea('r9',slot(320));a.call('rt.invoke');
  a.lea('rcx',slot(208));a.lea('rdx',slot(208));a.call('rt.toString');a.jmp(stringReplace+'.done');
  a.label(stringReplace);
  a.mov('rax',4);a.store(slot(208),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(216),'rax');a.mov('rax',0);a.store(slot(296),'rax');a.load('r10',slot(152));a.load('rax',{base:'r10'});a.store(slot(304),'rax');
  const scan=a.unique('scan'),scanDone=a.unique('scanDone'),literal=a.unique('literal'),dollar=a.unique('dollar'),append=a.unique('append'),next=a.unique('next');
  a.label(scan);a.load('rax',slot(296));a.load('r10',slot(304));a.cmp('rax','r10');a.jcc('ae',scanDone);
  a.shl('rax',1);a.load('r10',slot(152));a.add('r10',8);a.add('r10','rax');a.load('rax',{base:'r10'},16);a.cmp('rax',36);a.jcc('ne',literal);
  a.load('rax',slot(296));a.add('rax',1);a.load('r11',slot(304));a.cmp('rax','r11');a.jcc('ae',literal);
  a.load('rax',{base:'r10',disp:2},16);a.cmp('rax',36);a.jcc('e',dollar);a.cmp('rax',38);const matched=a.unique('matched');a.jcc('e',matched);a.cmp('rax',96);const prefix=a.unique('prefix');a.jcc('e',prefix);a.cmp('rax',39);const suffix=a.unique('suffix');a.jcc('e',suffix);a.jmp(literal);
  a.label(matched);for(const n of [0,8]){a.load('rax',slot(128+n));a.store(slot(160+n),'rax');}a.jmp(next);
  a.label(prefix);for(const n of [0,8]){a.load('rax',slot(176+n));a.store(slot(160+n),'rax');}a.jmp(next);
  a.label(suffix);for(const n of [0,8]){a.load('rax',slot(192+n));a.store(slot(160+n),'rax');}a.jmp(next);
  a.label(dollar);a.load('r8',slot(296));a.add('r8',1);a.mov('r9','r8');a.add('r9',1);a.lea('rcx',slot(160));a.load('rdx',slot(152));a.call('rt.splitSubstring');a.jmp(next);
  a.label(literal);a.load('r8',slot(296));a.mov('r9','r8');a.add('r9',1);a.lea('rcx',slot(160));a.load('rdx',slot(152));a.call('rt.splitSubstring');a.jmp(append);
  a.label(next);a.load('rax',slot(296));a.add('rax',1);a.store(slot(296),'rax');
  a.label(append);a.lea('rcx',slot(208));a.lea('rdx',slot(208));a.lea('r8',slot(160));a.call('rt.concat');a.load('rax',slot(296));a.add('rax',1);a.store(slot(296),'rax');a.jmp(scan);
  a.label(scanDone);a.label(stringReplace+'.done');a.lea('rcx',slot(224));a.lea('rdx',slot(176));a.lea('r8',slot(208));a.call('rt.concat');
  a.load('rcx',slot(40));a.lea('rdx',slot(224));a.lea('r8',slot(192));a.call('rt.concat');a.jmp(done);
  a.label(notFound);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(112+n));a.store({base:'rcx',disp:n},'rax');}a.jmp(done);
  a.label(invokeHook);for(const n of [0,8]){a.load('rax',slot(64+n));a.store(slot(320+n),'rax');a.load('rax',slot(96+n));a.store(slot(336+n),'rax');}
  a.lea('rax',slot(80));a.store(slot(32),'rax');a.load('rcx',slot(40));a.lea('rdx',slot(240));a.mov('r8',2);a.lea('r9',slot(320));a.call('rt.invoke');
  a.label(done);
 });
}
