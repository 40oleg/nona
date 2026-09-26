import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {stringLiteral} from './value.js';

export function emitBigInt(b:RuntimeBuilder):void {
 b.bundle.fragments.push(stringLiteral('rt.bigint.minus','-'));
 rootedFn(b,'rt.bigintNeg',136,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:3}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',7);a.store(slot(64),'rax');a.load('rax',{base:'rdx',disp:8});a.store(slot(72),'rax');a.load('r10',{base:'rax'});
  const zero=a.unique('zero'),negative=a.unique('negative'),done=a.unique('done');a.cmp('r10',1);a.jcc('ne','rt.bigintNeg.sign');a.load('r11',{base:'rax',disp:8},16);a.cmp('r11',48);a.jcc('e',zero);
  a.label('rt.bigintNeg.sign');a.load('r11',{base:'rax',disp:8},16);a.cmp('r11',45);a.jcc('e',negative);
  a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.bigint.minus'});a.store(slot(88),'rax');a.mov('rax',4);a.store(slot(96),'rax');a.load('rax',slot(72));a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.concat');a.jmp(done);
  a.label(negative);a.lea('rcx',slot(112));a.load('rdx',slot(72));a.mov('r8',1);a.mov('r9','r10');a.call('rt.jsonSlice');a.jmp(done);
  a.label(zero);a.mov('rax',4);a.store(slot(112),'rax');a.load('rax',slot(72));a.store(slot(120),'rax');
  a.label(done);a.load('rcx',slot(40));a.mov('rax',7);a.store({base:'rcx'},'rax');a.load('rax',slot(120));a.store({base:'rcx',disp:8},'rax');
 });
}
