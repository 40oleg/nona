import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';

export function emitJsonComposite(b:RuntimeBuilder):void {
 // A copy of part of a string. RCX output Value*, RDX source string record,
 // R8 start and R9 exclusive end.
 rootedFn(b,'rt.jsonSlice',120,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',4);a.store(slot(64),'rax');a.store(slot(72),'rdx');a.store(slot(96),'r8');a.store(slot(104),'r9');
  const invalid=a.unique('invalid');a.cmp('r9','r8');a.jcc('b',invalid);a.load('rax',{base:'rdx'});a.cmp('r9','rax');a.jcc('a',invalid);
  a.mov('rax','r9');a.sub('rax','r8');a.store(slot(112),'rax');a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');a.store(slot(88),'rax');a.mov('r10',4);a.store(slot(80),'r10');a.load('r10',slot(112));a.store({base:'rax'},'r10');
  a.mov('r8',0);const copy=a.unique('copy'),finish=a.unique('finish');a.label(copy);a.load('r10',slot(112));a.cmp('r8','r10');a.jcc('ae',finish);
  a.mov('r10','r8');a.load('r11',slot(96));a.add('r10','r11');a.shl('r10',1);a.load('r11',slot(72));a.add('r11','r10');a.load('r11',{base:'r11',disp:8},16);
  a.mov('r10','r8');a.shl('r10',1);a.load('rax',slot(88));a.add('rax','r10');a.store({base:'rax',disp:8},'r11',16);a.add('r8',1);a.jmp(copy);
  a.label(finish);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(88));a.store({base:'rcx',disp:8},'rax');const done=a.unique('done');a.jmp(done);a.label(invalid);a.call('rt.throwSyntaxError');a.label(done);
 });

}
