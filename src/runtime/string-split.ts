import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const stringSplitRoots=['rt.stringSplit.fn'];
export const stringSplitPropertyRoots=builtinPropertyRoots('rt.stringSplit.fn','split','rt.stringPrototype');

export function emitStringSplit(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.stringSplit.fn','split',2,'rt.stringPrototype');
 // RCX output Value*, RDX string descriptor, R8 start, R9 exclusive end.
 b.fn('rt.splitSubstring',104,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.mov('rax','r9');a.sub('rax','r8');a.store(slot(64),'rax');
  a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');a.store(slot(72),'rax');a.load('r10',slot(64));a.store({base:'rax'},'r10');
  a.load('r10',slot(56));a.shl('r10',1);a.load('rdx',slot(48));a.add('rdx',8);a.add('rdx','r10');a.load('r8',slot(72));a.add('r8',8);a.load('r9',slot(64));
  const loop=a.unique('copy'),done=a.unique('done');a.label(loop);a.test('r9','r9');a.jcc('e',done);a.load('rax',{base:'rdx'},16);a.store({base:'r8'},'rax',16);a.add('rdx',2);a.add('r8',2);a.sub('r9',1);a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(72));a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.stringSplit.fn.code',312,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:9}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}a.load('rax',slot(64));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
  a.mov('rax',0);for(const off of [80,88,96,104])a.store(slot(off),'rax');
  const args=a.unique('args'),limitArg=a.unique('limitArg');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',args);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(80+n),'rax');}
  a.label(args);a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',limitArg);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:16+n});a.store(slot(96+n),'rax');}a.label(limitArg);
  const noHook=a.unique('noHook'),invoke=a.unique('invoke'),done=a.unique('done'),noLimit=a.unique('noLimit'),limitReady=a.unique('limitReady'),undefinedSep=a.unique('undefinedSep'),emptySep=a.unique('emptySep'),emptyInput=a.unique('emptyInput');
  a.load('rax',slot(80));a.cmp('rax',5);a.jcc('ne',noHook);
  a.mov('rax',6);a.store(slot(192),'rax');a.lea('rax',{rip:'rt.Symbol.split.value'});a.store(slot(200),'rax');
  a.lea('rcx',slot(176));a.lea('rdx',slot(80));a.lea('r8',slot(192));a.call('rt.getProperty');a.load('rax',slot(176));a.cmp('rax',1);a.jcc('a',invoke);
  a.label(noHook);a.lea('rcx',slot(112));a.lea('rdx',slot(64));a.call('rt.toString');
  a.lea('rcx',slot(144));a.mov('rdx',1);a.mov('r8',0);a.call('rt.newObject');
  a.load('rax',slot(96));a.test('rax','rax');a.jcc('e',noLimit);a.lea('rcx',slot(96));a.call('rt.toInt32');a.mov('r10',0xffffffffn);a.and('rax','r10');a.jmp(limitReady);
  a.label(noLimit);a.mov('rax',0xffffffffn);a.label(limitReady);a.store(slot(264),'rax');
  a.load('rax',slot(80));a.test('rax','rax');a.jcc('e',undefinedSep);
  a.lea('rcx',slot(128));a.lea('rdx',slot(80));a.call('rt.toString');
  a.load('rax',slot(264));a.test('rax','rax');a.jcc('e',done);
  a.load('r10',slot(120));a.load('rax',{base:'r10'});a.store(slot(208),'rax');a.load('r10',slot(136));a.load('rax',{base:'r10'});a.store(slot(216),'rax');
  a.mov('rax',0);a.store(slot(248),'rax');a.store(slot(256),'rax');a.store(slot(272),'rax');
  a.load('rax',slot(216));a.test('rax','rax');a.jcc('e',emptySep);a.load('rax',slot(208));a.test('rax','rax');a.jcc('e',emptyInput);
  const outer=a.unique('outer'),compare=a.unique('compare'),mismatch=a.unique('mismatch'),match=a.unique('match'),appendTail=a.unique('appendTail'),appendPiece=a.unique('appendPiece');
  a.label(outer);a.load('rax',slot(256));a.load('r10',slot(216));a.add('rax','r10');a.load('r10',slot(208));a.cmp('rax','r10');a.jcc('a',appendTail);
  a.load('rax',slot(256));a.shl('rax',1);a.load('rdx',slot(120));a.add('rdx',8);a.add('rdx','rax');a.load('r8',slot(136));a.add('r8',8);a.load('r9',slot(216));
  a.label(compare);a.test('r9','r9');a.jcc('e',match);a.load('r10',{base:'rdx'},16);a.load('r11',{base:'r8'},16);a.cmp('r10','r11');a.jcc('ne',mismatch);a.add('rdx',2);a.add('r8',2);a.sub('r9',1);a.jmp(compare);
  a.label(mismatch);a.load('rax',slot(256));a.add('rax',1);a.store(slot(256),'rax');a.jmp(outer);
  a.label(match);a.load('r8',slot(248));a.load('r9',slot(256));a.jmp(appendPiece);
  a.label(appendTail);a.load('r8',slot(248));a.load('r9',slot(208));
  a.label(appendPiece);a.lea('rcx',slot(160));a.load('rdx',slot(120));a.call('rt.splitSubstring');a.lea('rcx',slot(144));a.lea('rdx',slot(160));a.call('rt.appendArrayValue');
  a.load('rax',slot(272));a.add('rax',1);a.store(slot(272),'rax');a.load('r10',slot(264));a.cmp('rax','r10');a.jcc('ae',done);
  a.load('rax',slot(256));a.load('r10',slot(216));a.add('rax','r10');a.store(slot(248),'rax');a.store(slot(256),'rax');a.load('r10',slot(208));a.cmp('rax','r10');a.jcc('a',done);a.jmp(outer);
  a.label(emptySep);a.load('rax',slot(208));a.test('rax','rax');a.jcc('e',done);
  const charLoop=a.unique('charLoop');a.label(charLoop);a.load('r8',slot(248));a.mov('r9','r8');a.add('r9',1);a.lea('rcx',slot(160));a.load('rdx',slot(120));a.call('rt.splitSubstring');a.lea('rcx',slot(144));a.lea('rdx',slot(160));a.call('rt.appendArrayValue');
  a.load('rax',slot(248));a.add('rax',1);a.store(slot(248),'rax');a.load('r10',slot(208));a.cmp('rax','r10');a.jcc('ae',done);a.load('r10',slot(264));a.cmp('rax','r10');a.jcc('ae',done);a.jmp(charLoop);
  a.label(emptyInput);a.mov('r8',0);a.mov('r9',0);a.lea('rcx',slot(160));a.load('rdx',slot(120));a.call('rt.splitSubstring');a.lea('rcx',slot(144));a.lea('rdx',slot(160));a.call('rt.appendArrayValue');a.jmp(done);
  a.label(undefinedSep);a.load('rax',slot(264));a.test('rax','rax');a.jcc('e',done);a.lea('rcx',slot(144));a.lea('rdx',slot(112));a.call('rt.appendArrayValue');a.jmp(done);
  a.label(invoke);for(const n of [0,8]){a.load('rax',slot(64+n));a.store(slot(224+n),'rax');a.load('rax',slot(96+n));a.store(slot(240+n),'rax');}
  a.lea('rax',slot(80));a.store(slot(32),'rax');a.load('rcx',slot(40));a.lea('rdx',slot(176));a.mov('r8',2);a.lea('r9',slot(224));a.call('rt.invoke');a.jmp(done+'.return');
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(144+n));a.store({base:'rcx',disp:n},'rax');}a.label(done+'.return');
 });
}
