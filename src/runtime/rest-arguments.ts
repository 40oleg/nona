import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';

export function emitRestArguments(b:RuntimeBuilder):void {
 rootedFn(b,'rt.newRestArray',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:1}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.lea('rcx',slot(80));a.mov('rdx',1);a.mov('r8',0);a.call('rt.newObject');
  const loop=a.unique('loop'),done=a.unique('done');a.label(loop);
  a.load('rax',slot(64));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('ae',done);
  a.shl('rax',4);a.load('rdx',slot(56));a.add('rdx','rax');a.lea('rcx',slot(80));a.call('rt.appendArrayValue');
  a.load('rax',slot(64));a.add('rax',1);a.store(slot(64),'rax');a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
 });
}
