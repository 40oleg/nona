import {RuntimeBuilder,slot} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {FunctionLayout as F} from './functions.js';
import {stringLiteral} from './value.js';
import {CellTag} from './environment-layout.js';

export const ArgumentsKind=3;
export function emitArguments(b:RuntimeBuilder):void {
 b.bundle.fragments.push(stringLiteral('rt.str.callee','callee'));
 const key=new Uint8Array(16);key[0]=4;
 b.bundle.fragments.push({name:'rt.key.callee',section:'.rdata',alignment:8,bytes:key,symbols:{},
  fixups:[{offset:8,kind:'va64',target:'rt.str.callee',addend:0}]});
 const iteratorKey=new Uint8Array(16);iteratorKey[0]=6;
 b.bundle.fragments.push({name:'rt.key.argumentsIterator',section:'.rdata',alignment:8,bytes:iteratorKey,symbols:{},
  fixups:[{offset:8,kind:'va64',target:'rt.Symbol.iterator.value',addend:0}]});
 // RCX out, RDX actual argc, R8 actual argv, R9 metadata:
 // formal count, callee header, then Cell Values or undefined for an earlier
 // duplicate name. Mapping selection considers every formal, even missing ones.
 // No GC inside this helper.
 b.fn('rt.newArguments',136,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.load('rax',{base:'r9'});a.mov('r11',1n<<62n);a.and('r11','rax');a.store(slot(128),'r11');
  a.mov('r11',~(1n<<62n)&0xffffffffffffffffn);a.and('rax','r11');a.store({base:'r9'},'rax');
  a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
  a.load('rcx',slot(40));a.load('rax',{base:'rcx',disp:8});a.mov('r10',ArgumentsKind);a.store({base:'rax',disp:O.kind},'r10');
  a.mov('rax',3);a.store(slot(96),'rax');a.load('rax',slot(48));a.cvtsi2sd('xmm0','rax');a.storesd(slot(104),'xmm0');
  a.lea('rdx',{rip:'rt.key.length'});a.lea('r8',slot(96));a.mov('r9',A.writable|A.configurable);a.call('rt.initFunctionProperty');
  a.mov('rax',5);a.store(slot(112),'rax');a.load('rax',slot(64));a.load('rax',{base:'rax',disp:8});a.store(slot(120),'rax');
  a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.key.callee'});a.lea('r8',slot(112));a.mov('r9',A.writable|A.configurable);a.call('rt.initFunctionProperty');
  a.mov('rax',5);a.store(slot(112),'rax');a.lea('rax',{rip:'rt.arrayIterator.fn'});a.store(slot(120),'rax');
  a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.key.argumentsIterator'});a.lea('r8',slot(112));a.mov('r9',A.writable|A.configurable);a.call('rt.initFunctionProperty');
  // Strict source functions retain the raw receiver and have an unmapped
  // arguments object with the shared nonconfigurable ThrowTypeError accessor.
  const sloppy=a.unique('sloppy'),restricted=a.unique('restricted');a.load('rax',slot(64));a.load('rax',{base:'rax',disp:8});a.load('rax',{base:'rax',disp:F.rawThis});a.test('rax','rax');a.jcc('ne',restricted);
  a.load('rax',slot(128));a.test('rax','rax');a.jcc('e',sloppy);a.label(restricted);
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:8});a.lea('rdx',{rip:'rt.str.callee'});a.call('rt.findOwnProperty');
  a.mov('r10',A.accessor);a.store({base:'rax',disp:P.attributes},'r10');a.mov('r10',0);a.store({base:'rax',disp:P.value},'r10');a.store({base:'rax',disp:P.value+8},'r10');
  a.mov('r10',5);a.store({base:'rax',disp:P.getter},'r10');a.store({base:'rax',disp:P.setter},'r10');a.lea('r10',{rip:'rt.strictThrower'});a.store({base:'rax',disp:P.getter+8},'r10');a.store({base:'rax',disp:P.setter+8},'r10');a.label(sloppy);
  a.mov('rax',0);a.store(slot(72),'rax');
  const loop=a.unique('loop'),extra=a.unique('extra'),sourceReady=a.unique('sourceReady'),done=a.unique('done');
  a.label(loop);a.load('rax',slot(72));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('ae',done);
  a.cvtsi2sd('xmm0','rax');a.storesd(slot(104),'xmm0');a.mov('rax',3);a.store(slot(96),'rax');
  a.lea('rcx',slot(80));a.lea('rdx',slot(96));a.call('rt.toString');
  a.load('rax',slot(72));a.load('r10',slot(64));a.load('r11',{base:'r10'});a.cmp('rax','r11');a.jcc('ae',extra);
  a.shl('rax',4);a.lea('r8',{base:'r10',disp:16});a.add('r8','rax');a.load('r11',{base:'r8'});a.cmp('r11',CellTag);a.jcc('e',sourceReady);
  a.label(extra);a.load('rax',slot(72));a.shl('rax',4);a.load('r8',slot(56));a.add('r8','rax');
  a.label(sourceReady);a.load('rcx',slot(40));a.lea('rdx',slot(80));a.mov('r9',1);a.call('rt.setProperty');
  a.load('rax',slot(72));a.add('rax',1);a.store(slot(72),'rax');a.jmp(loop);a.label(done);
 });
}
