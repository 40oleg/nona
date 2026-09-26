import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {stringLiteral} from './value.js';

export function emitDateJson(b:RuntimeBuilder):void {
 b.bundle.fragments.push(stringLiteral('rt.str.toISOString','toISOString'));
 rootedFn(b,'rt.Date.toJSON.fn.code',168,[{kind:'output',register:'rcx'},{kind:'locals',offset:80,count:5}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('r10',slot(frame+40));
  a.load('rax',{base:'r10'});a.store(slot(80),'rax');a.load('rax',{base:'r10',disp:8});a.store(slot(88),'rax');
  a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.call('rt.toObject');
  a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.call('rt.objectToPrimitiveNumber');
  a.load('rax',slot(96));const invoke=a.unique('invoke'),nullResult=a.unique('nullResult'),done=a.unique('done');a.cmp('rax',3);a.jcc('ne',invoke);
  a.movsd('xmm0',slot(104));a.ucomisd('xmm0','xmm0');a.jcc('p',nullResult);
  a.mov('rax',0x7ff0000000000000n);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('e',nullResult);
  a.mov('rax',0xfff0000000000000n);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('e',nullResult);
  a.label(invoke);a.mov('rax',4);a.store(slot(128),'rax');a.lea('rax',{rip:'rt.str.toISOString'});a.store(slot(136),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(128));a.call('rt.getProperty');
  a.lea('rax',slot(80));a.store(slot(32),'rax');a.lea('rcx',slot(144));a.lea('rdx',slot(112));a.mov('r8',0);a.lea('r9',{rip:'rt.undefinedValue'});a.call('rt.invoke');
  a.load('rcx',slot(40));a.load('rax',slot(144));a.store({base:'rcx'},'rax');a.load('rax',slot(152));a.store({base:'rcx',disp:8},'rax');a.jmp(done);
  a.label(nullResult);a.load('rcx',slot(40));a.mov('rax',1);a.store({base:'rcx'},'rax');a.mov('rax',0);a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
}
