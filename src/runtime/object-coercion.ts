import {rootedFn} from './root-scope.js';
import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O} from './object-layout.js';
import {stringLiteral} from './value.js';
import {FunctionKind} from './functions.js';

/** Ordinary coercion and array string conversion with precise roots for reentry. */
export function emitObjectCoercion(b:RuntimeBuilder):void {
  b.bundle.fragments.push(stringLiteral('rt.str.join','join'));
  b.bundle.fragments.push(stringLiteral('rt.str.valueOf','valueOf'));
  b.fn('rt.toPrimitive',40,a=>{
    const copy=a.unique('copy'),done=a.unique('done');a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('ne',copy);
    a.call('rt.objectToPrimitive');a.jmp(done);a.label(copy);a.store({base:'rcx'},'rax');a.load('rax',{base:'rdx',disp:8});a.store({base:'rcx',disp:8},'rax');a.label(done);
  });
  // OrdinaryToPrimitive: get each method immediately before calling it.
  // Symbol.toPrimitive is added with Symbol support; default hint is numeric.
  for(const stringHint of [false,true])rootedFn(b,stringHint?'rt.objectToPrimitiveString':'rt.objectToPrimitive',136,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:4}],a=>{
    a.store(slot(40),'rcx');
    a.load('rax',{base:'rdx'});a.store(slot(112),'rax');a.load('rax',{base:'rdx',disp:8});a.store(slot(120),'rax');
    const done=a.unique('done');
    for(const method of stringHint?['toString','valueOf']:['valueOf','toString']){
      const next=a.unique('next');
      a.mov('rax',4);a.store(slot(64),'rax');a.lea('rax',{rip:'rt.str.'+method});a.store(slot(72),'rax');
      a.lea('rcx',slot(80));a.lea('rdx',slot(112));a.lea('r8',slot(64));a.call('rt.getProperty');
      a.load('rax',slot(80));a.cmp('rax',5);a.jcc('ne',next);a.load('rax',slot(88));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',FunctionKind);a.jcc('ne',next);
      a.lea('rax',slot(112));a.store(slot(32),'rax');a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.mov('r8',0);a.lea('r9',{rip:'rt.undefinedValue'});a.call('rt.invoke');
      a.load('rax',slot(96));a.cmp('rax',5);a.jcc('e',next);a.load('rcx',slot(40));a.store({base:'rcx'},'rax');a.load('rax',slot(104));a.store({base:'rcx',disp:8},'rax');a.jmp(done);a.label(next);
    }
    a.call('rt.throwTypeError');a.label(done);
  });
  // R8 separator Value*. This helper is leaf-only until coercion/getter
  // callbacks acquire roots for its receiver, accumulator and item temporaries.
  rootedFn(b,'rt.arrayJoinBody',232,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:80,count:6}],a=>{
    a.store(slot(184),'r8');
    a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.load('r10',{base:'rdx',disp:8});a.store(slot(56),'r10');
    a.mov('rax',4);a.store(slot(80),'rax');a.store(slot(160),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(88),'rax');
    a.lea('rax',{rip:'rt.str.comma'});a.store(slot(168),'rax');
    const finish=a.unique('finish'),loop=a.unique('loop'),next=a.unique('next'),clear=a.unique('clear'),item=a.unique('item');
    // Array.prototype.join is generic: inherited array methods can be used by
    // ordinary objects, whose length is a property rather than header metadata.
    a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.str.length'});a.store(slot(104),'rax');
    a.lea('rcx',slot(112));a.load('rdx',slot(48));a.lea('r8',slot(96));a.call('rt.getProperty');
    a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(136));
    const zero=a.unique('zeroLength'),lengthReady=a.unique('lengthReady');
    a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zero);a.jcc('be',zero);
    a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);
    a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zero);a.mov('rax',0);a.label(lengthReady);a.store(slot(64),'rax');
    a.load('rdx',slot(184));a.load('rax',{base:'rdx'});const separatorReady=a.unique('separatorReady');a.test('rax','rax');a.jcc('e',separatorReady);
    a.lea('rcx',slot(160));a.call('rt.toString');a.label(separatorReady);
    // Convert the separator before entering the cycle guard: a.join(a) must
    // stringify a as the separator, not mistake it for a recursive element.
    a.load('r10',slot(56));a.load('rax',{base:'r10',disp:O.stringifying});a.test('rax','rax');a.jcc('ne',finish);
    a.mov('rax',1);a.store({base:'r10',disp:O.stringifying},'rax');
    a.load('rax',{rip:'rt.cleanupHead'});a.store(slot(200),'rax');a.store(slot(208),'r10');a.lea('rax',slot(200));a.store({rip:'rt.cleanupHead'},'rax');
    a.mov('rax',0);a.store(slot(72),'rax');
    a.label(loop);a.load('rax',slot(72));a.load('r10',slot(64));a.cmp('rax','r10');a.jcc('ae',clear);
    a.test('rax','rax');a.jcc('e',item);a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.lea('r8',slot(160));a.call('rt.concat');
    a.label(item);a.load('rax',slot(72));a.cvtsi2sd('xmm0','rax');a.storesd(slot(104),'xmm0');a.mov('rax',3);a.store(slot(96),'rax');
    a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.call('rt.toString');
    a.lea('rcx',slot(128));a.load('rdx',slot(48));a.lea('r8',slot(112));a.call('rt.getProperty');
    a.load('rax',slot(128));a.cmp('rax',1);a.jcc('be',next);
    a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.call('rt.toString');
    a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.lea('r8',slot(144));a.call('rt.concat');
    a.label(next);a.load('rax',slot(72));a.add('rax',1);a.store(slot(72),'rax');a.jmp(loop);
    a.label(clear);a.load('rax',slot(200));a.store({rip:'rt.cleanupHead'},'rax');a.load('r10',slot(56));a.mov('rax',0);a.store({base:'r10',disp:O.stringifying},'rax');
    a.label(finish);a.load('rcx',slot(40));a.load('rax',slot(80));a.store({base:'rcx'},'rax');a.load('rax',slot(88));a.store({base:'rcx',disp:8},'rax');
  });
}
