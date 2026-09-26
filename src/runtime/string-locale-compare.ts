import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const stringLocaleCompareRoots=['rt.stringLocaleCompare.fn'];
export const stringLocaleComparePropertyRoots=builtinPropertyRoots('rt.stringLocaleCompare.fn','localeCompare','rt.stringPrototype');

export function emitStringLocaleCompare(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.stringLocaleCompare.fn','localeCompare',1,'rt.stringPrototype');
 // Without ECMA-402, use a deterministic C-locale ordering of NFC strings.
 // Normalization makes canonically equivalent strings compare equal.
 rootedFn(b,'rt.stringLocaleCompare.fn.code',184,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:6}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
  a.load('rax',slot(64));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
  a.lea('rcx',slot(80));a.lea('rdx',slot(64));a.call('rt.toString');
  const missing=a.unique('missing'),converted=a.unique('converted');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',missing);
  a.load('rdx',slot(56));a.jmp(converted);
  a.label(missing);a.lea('rdx',{rip:'rt.undefinedValue'});
  a.label(converted);a.lea('rcx',slot(96));a.call('rt.toString');
  a.mov('rax',5);a.store(slot(144),'rax');a.lea('rax',{rip:'rt.stringNormalize.fn'});a.store(slot(152),'rax');
  for(const [source,result] of [[80,112],[96,128]] as const){
   a.lea('rax',slot(source));a.store(slot(32),'rax');a.lea('rcx',slot(result));a.lea('rdx',slot(144));a.mov('r8',0);a.lea('r9',{rip:'rt.undefinedValue'});a.call('rt.invoke');
  }
  a.load('r8',slot(120));a.load('r9',slot(136));a.load('r10',{base:'r8'});a.load('r11',{base:'r9'});
  a.mov('rax',0);const loop=a.unique('loop'),shorter=a.unique('shorter'),less=a.unique('less'),greater=a.unique('greater'),equal=a.unique('equal'),done=a.unique('done');
  a.label(loop);a.cmp('rax','r10');a.jcc('ae',shorter);a.cmp('rax','r11');a.jcc('ae',greater);
  a.mov('rcx','rax');a.shl('rcx',1);
  a.mov('rdx','r8');a.add('rdx',8);a.add('rdx','rcx');a.load('rdx',{base:'rdx'},16);
  a.mov('rcx','r9');a.add('rcx',8);a.mov('r8','rax');a.shl('r8',1);a.add('rcx','r8');a.load('rcx',{base:'rcx'},16);a.load('r8',slot(120));
  a.cmp('rdx','rcx');a.jcc('b',less);a.jcc('a',greater);a.add('rax',1);a.jmp(loop);
  a.label(shorter);a.cmp('rax','r11');a.jcc('ae',equal);
  a.label(less);a.mov('rax',-1);a.jmp(done);
  a.label(greater);a.mov('rax',1);a.jmp(done);
  a.label(equal);a.mov('rax',0);
  a.label(done);a.cvtsi2sd('xmm0','rax');a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
}
