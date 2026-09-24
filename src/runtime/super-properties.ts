import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O} from './object-layout.js';
import {DescriptorLayout as D,DescriptorFields as F} from './descriptor-layout.js';

export function emitSuperProperties(b:RuntimeBuilder):void {
 // Initialized descriptor output RCX, super base RDX, normalized key R8.
 rootedFn(b,'rt.superDescriptor',88,[{kind:'range',register:'rcx',count:6},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'r8');a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
  const loop=a.unique('loop'),done=a.unique('done');a.label(loop);a.load('rcx',slot(40));a.lea('rdx',slot(64));a.load('r8',slot(48));a.call('rt.getOwnDescriptor');
  a.load('rax',slot(40));a.load('rax',{base:'rax',disp:D.present});a.cmp('rax',-1);a.jcc('ne',done);
  a.load('rax',slot(72));a.load('rax',{base:'rax',disp:O.prototype});a.test('rax','rax');a.jcc('e',done);a.store(slot(72),'rax');a.jmp(loop);a.label(done);
 });
 rootedFn(b,'rt.superGet',200,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'value',register:'r9'},{kind:'locals',offset:64,count:8}],a=>{
  a.store(slot(40),'rcx');for(const n of [0,8]){a.load('rax',{base:'r9',disp:n});a.store(slot(64+n),'rax');}
  a.lea('rcx',slot(96));a.call('rt.superDescriptor');const missing=a.unique('missing'),data=a.unique('data'),done=a.unique('done');
  a.load('rax',slot(96+D.present));a.cmp('rax',-1);a.jcc('e',missing);a.and('rax',F.get|F.set);a.test('rax','rax');a.jcc('e',data);
  a.load('rax',slot(96+D.get));a.test('rax','rax');a.jcc('e',missing);
  a.lea('rax',slot(64));a.store(slot(32),'rax');a.load('rcx',slot(40));a.lea('rdx',slot(96+D.get));a.mov('r8',0);a.lea('r9',{rip:'rt.undefinedValue'});a.call('rt.invoke');a.jmp(done);
  a.label(data);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(96+D.value+n));a.store({base:'rcx',disp:n},'rax');}a.jmp(done);
  a.label(missing);a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
 // Base RCX, key RDX, receiver R8, assigned value R9. Sloppy failed writes
 // return silently. Accessor dispatch always receives the original receiver.
 rootedFn(b,'rt.superSet',360,[{kind:'value',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'value',register:'r9'},{kind:'locals',offset:64,count:10},{kind:'locals',offset:240,count:6}],a=>{
  for(const [reg,offset] of [['rcx',64],['rdx',80],['r8',96],['r9',112]] as const)for(const n of [0,8]){a.load('rax',{base:reg,disp:n});a.store(slot(offset+n),'rax');}
  a.lea('rcx',slot(128));a.lea('rdx',slot(64));a.lea('r8',slot(80));a.call('rt.superDescriptor');
  const data=a.unique('data'),accessor=a.unique('accessor'),create=a.unique('create'),apply=a.unique('apply'),done=a.unique('done'),rejected=a.unique('rejected');
  a.load('rax',slot(128+D.present));a.cmp('rax',-1);a.jcc('e',data);a.and('rax',F.get|F.set);a.test('rax','rax');a.jcc('ne',accessor);
  a.load('rax',slot(128+D.writable+8));a.test('rax','rax');a.jcc('e',rejected);
  a.label(data);a.load('rax',slot(96));a.cmp('rax',5);a.jcc('ne',rejected);
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.lea('r8',slot(80));a.call('rt.getOwnDescriptor');
  a.load('rax',slot(128+D.present));a.cmp('rax',-1);a.jcc('e',create);a.and('rax',F.get|F.set);a.test('rax','rax');a.jcc('ne',rejected);
  a.load('rax',slot(128+D.writable+8));a.test('rax','rax');a.jcc('e',rejected);a.mov('rax',F.value);a.jmp(apply);
  a.label(create);for(const field of [D.enumerable,D.configurable,D.writable]){a.mov('rax',2);a.store(slot(240+field),'rax');a.mov('rax',1);a.store(slot(240+field+8),'rax');}a.mov('rax',F.data);
  a.label(apply);a.store(slot(240+D.present),'rax');for(const n of [0,8]){a.load('rax',slot(112+n));a.store(slot(240+D.value+n),'rax');}
  a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.lea('r8',slot(240));a.call('rt.defineOwnProperty');a.jmp(done);
  a.label(accessor);a.load('rax',slot(128+D.set));a.test('rax','rax');a.jcc('e',rejected);
  a.lea('rax',slot(96));a.store(slot(32),'rax');a.lea('rcx',slot(240));a.lea('rdx',slot(128+D.set));a.mov('r8',1);a.lea('r9',slot(112));a.call('rt.invoke');a.mov('rax',1);a.jmp(done);a.label(rejected);a.mov('rax',0);a.label(done);
 });
}
