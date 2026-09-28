import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O} from './object-layout.js';
import {DescriptorLayout as D,DescriptorFields as DF} from './descriptor-layout.js';

// InternalizeJSONProperty: visit children first, then invoke the reviver with
// the holder as this. Each recursion owns precise roots for mutable values.
export function emitJsonReviver(b:RuntimeBuilder):void {
 rootedFn(b,'rt.jsonRevive',392,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'value',register:'r9'},{kind:'locals',offset:80,count:10},{kind:'locals',offset:272,count:6}],a=>{
  a.store(slot(40),'rcx');for(const [register,offset] of [['rdx',80],['r8',96],['r9',112]] as const)for(const n of [0,8]){a.load('rax',{base:register,disp:n});a.store(slot(offset+n),'rax');}
  a.lea('rcx',slot(128));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.getProperty');
  const invoke=a.unique('invoke'),array=a.unique('array'),object=a.unique('object'),loop=a.unique('loop'),next=a.unique('next');
  a.load('rax',slot(128));a.cmp('rax',5);a.jcc('ne',invoke);a.lea('rcx',slot(128));a.call('rt.isArray');a.test('rax','rax');a.jcc('ne',array);a.jmp(object);
  a.label(array);a.mov('rax',1);a.store(slot(256),'rax');a.mov('rax',4);a.store(slot(160),'rax');a.lea('rax',{rip:'rt.str.length'});a.store(slot(168),'rax');
  a.lea('rcx',slot(224));a.lea('rdx',slot(128));a.lea('r8',slot(160));a.call('rt.getProperty');a.lea('rcx',slot(224));a.lea('rdx',slot(224));a.call('rt.toNumber');
  a.movsd('xmm0',slot(232));a.ucomisd('xmm0','xmm0');const zero=a.unique('zero'),lengthReady=a.unique('lengthReady');a.jcc('p',zero);a.mov('rax',0);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',zero);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zero);a.mov('rax',0);a.label(lengthReady);a.store(slot(248),'rax');a.jmp('rt.jsonRevive.loopStart');
  a.label(object);a.mov('rax',0);a.store(slot(256),'rax');a.lea('rcx',slot(144));a.mov('rdx',1);a.lea('r8',slot(128));a.call('rt.Object.keys.fn.code');a.load('r10',slot(152));a.load('rax',{base:'r10',disp:O.length});a.store(slot(248),'rax');
  a.label('rt.jsonRevive.loopStart');a.mov('rax',0);a.store(slot(240),'rax');a.label(loop);a.load('rax',slot(240));a.load('r10',slot(248));a.cmp('rax','r10');a.jcc('ae',invoke);
  a.cvtsi2sd('xmm0','rax');a.storesd(slot(168),'xmm0');a.mov('rax',3);a.store(slot(160),'rax');a.lea('rcx',slot(160));a.lea('rdx',slot(160));a.call('rt.toString');
  a.load('rax',slot(256));a.test('rax','rax');a.jcc('ne',next);
  a.lea('rcx',slot(224));a.lea('rdx',slot(144));a.lea('r8',slot(160));a.call('rt.getProperty');for(const n of [0,8]){a.load('rax',slot(224+n));a.store(slot(160+n),'rax');}
  a.label(next);a.lea('rcx',slot(176));a.lea('rdx',slot(128));a.lea('r8',slot(160));a.lea('r9',slot(112));a.call('rt.jsonRevive');
  a.load('rax',slot(176));const define=a.unique('define'),advance=a.unique('advance');a.test('rax','rax');a.jcc('ne',define);
  a.lea('rcx',slot(224));a.lea('rdx',slot(128));a.lea('r8',slot(160));a.call('rt.deleteProperty');a.jmp(advance);
  a.label(define);a.mov('rax',2);for(const offset of [D.enumerable,D.configurable,D.writable])a.store(slot(272+offset),'rax');
  a.mov('rax',1);for(const offset of [D.enumerable,D.configurable,D.writable])a.store(slot(272+offset+8),'rax');
  for(const n of [0,8]){a.load('rax',slot(176+n));a.store(slot(272+D.value+n),'rax');}
  a.mov('rax',DF.data);a.store(slot(272+D.present),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(160));a.lea('r8',slot(272));a.call('rt.defineOwnProperty');
  a.label(advance);a.load('rax',slot(240));a.add('rax',1);a.store(slot(240),'rax');a.jmp(loop);
  a.label(invoke);for(const n of [0,8]){a.load('rax',slot(96+n));a.store(slot(192+n),'rax');a.load('rax',slot(128+n));a.store(slot(208+n),'rax');}
  a.lea('rax',slot(80));a.store(slot(32),'rax');a.load('rcx',slot(40));a.lea('rdx',slot(112));a.mov('r8',2);a.lea('r9',slot(192));a.call('rt.invoke');
 });
}
