import {rootedFn} from './root-scope.js';
import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O,ObjectFlags} from './object-layout.js';
import {stringLiteral} from './value.js';
import {FunctionKind} from './functions.js';

/** Ordinary coercion and array string conversion with precise roots for reentry. */
export function emitObjectCoercion(b:RuntimeBuilder):void {
  b.bundle.fragments.push(stringLiteral('rt.str.join','join'));
  b.bundle.fragments.push(stringLiteral('rt.str.valueOf','valueOf'));
  for(const hint of ['default','number','string'])b.bundle.fragments.push(stringLiteral('rt.str.hint.'+hint,hint));
  b.fn('rt.toPrimitive',40,a=>{
    const copy=a.unique('copy'),done=a.unique('done');a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('ne',copy);
    a.call('rt.objectToPrimitive');a.jmp(done);a.label(copy);a.store({base:'rcx'},'rax');a.load('rax',{base:'rdx',disp:8});a.store({base:'rcx',disp:8},'rax');a.label(done);
  });
  b.fn('rt.objectToPrimitiveStringOrCopy',40,a=>{
    const copy=a.unique('copy'),done=a.unique('done');a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('ne',copy);
    a.call('rt.objectToPrimitiveString');a.jmp(done);a.label(copy);a.store({base:'rcx'},'rax');a.load('rax',{base:'rdx',disp:8});a.store({base:'rcx',disp:8},'rax');a.label(done);
  });
  // Exotic @@toPrimitive runs before the ordinary hint-specific method order.
  for(const hint of ['default','number','string'] as const){const stringHint=hint==='string';rootedFn(b,hint==='string'?'rt.objectToPrimitiveString':hint==='number'?'rt.objectToPrimitiveNumber':'rt.objectToPrimitive',168,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:6}],a=>{
    a.store(slot(40),'rcx');
    a.load('rax',{base:'rdx'});a.store(slot(112),'rax');a.load('rax',{base:'rdx',disp:8});a.store(slot(120),'rax');
    const done=a.unique('done');
    a.mov('rax',6);a.store(slot(64),'rax');a.lea('rax',{rip:'rt.Symbol.toPrimitive.value'});a.store(slot(72),'rax');
    a.lea('rcx',slot(80));a.lea('rdx',slot(112));a.lea('r8',slot(64));a.call('rt.getProperty');
    const ordinary=a.unique('ordinary');a.load('rax',slot(80));a.cmp('rax',1);a.jcc('be',ordinary);a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
    a.load('rax',slot(88));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
    a.mov('rax',4);a.store(slot(128),'rax');a.lea('rax',{rip:'rt.str.hint.'+hint});a.store(slot(136),'rax');
    a.lea('rax',slot(112));a.store(slot(32),'rax');a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.mov('r8',1);a.lea('r9',slot(128));a.call('rt.invoke');
    a.load('rax',slot(96));a.cmp('rax',5);failIf(a,'e','rt.throwTypeError');a.load('rcx',slot(40));a.store({base:'rcx'},'rax');a.load('rax',slot(104));a.store({base:'rcx',disp:8},'rax');a.jmp(done);
    a.label(ordinary);
    for(const method of stringHint?['toString','valueOf']:['valueOf','toString']){
      const next=a.unique('next');
      a.mov('rax',4);a.store(slot(64),'rax');a.lea('rax',{rip:'rt.str.'+method});a.store(slot(72),'rax');
      a.lea('rcx',slot(80));a.lea('rdx',slot(112));a.lea('r8',slot(64));a.call('rt.getProperty');
      a.load('rax',slot(80));a.cmp('rax',5);a.jcc('ne',next);a.load('rax',slot(88));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',FunctionKind);a.jcc('ne',next);
      a.lea('rax',slot(112));a.store(slot(32),'rax');a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.mov('r8',0);a.lea('r9',{rip:'rt.undefinedValue'});a.call('rt.invoke');
      a.load('rax',slot(96));a.cmp('rax',5);a.jcc('e',next);a.load('rcx',slot(40));a.store({base:'rcx'},'rax');a.load('rax',slot(104));a.store({base:'rcx',disp:8},'rax');a.jmp(done);a.label(next);
    }
    a.call('rt.throwTypeError');a.label(done);
  });}
  // R8 separator Value*. This helper is leaf-only until coercion/getter
  // callbacks acquire roots for its receiver, accumulator and item temporaries.
  // The pieces go to a string builder (string-builder.ts) at slot 216.
  rootedFn(b,'rt.arrayJoinBody',264,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:80,count:6}],a=>{
    a.store(slot(184),'r8');a.mov('rax',0);for(const offset of [216,224,232])a.store(slot(offset),'rax');
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
    a.load('r10',slot(56));a.load('rax',{base:'r10',disp:O.flags});a.and('rax',ObjectFlags.stringifying);a.test('rax','rax');a.jcc('ne',finish);
    a.load('rax',{base:'r10',disp:O.flags});a.or('rax',ObjectFlags.stringifying);a.store({base:'r10',disp:O.flags},'rax');
    a.load('rax',{rip:'rt.cleanupHead'});a.store(slot(200),'rax');a.store(slot(208),'r10');a.lea('rax',slot(200));a.store({rip:'rt.cleanupHead'},'rax');
    a.mov('rax',0);a.store(slot(72),'rax');
    a.label(loop);a.call('rt.safepoint');a.load('rax',slot(72));a.load('r10',slot(64));a.cmp('rax','r10');a.jcc('ae',clear);
    a.test('rax','rax');a.jcc('e',item);a.lea('rcx',slot(216));a.load('rdx',slot(168));a.call('rt.builderAppend');
    a.label(item);a.load('rax',slot(72));a.cvtsi2sd('xmm0','rax');a.storesd(slot(104),'xmm0');a.mov('rax',3);a.store(slot(96),'rax');
    a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.call('rt.toString');
    a.lea('rcx',slot(128));a.load('rdx',slot(48));a.lea('r8',slot(112));a.call('rt.getProperty');
    a.load('rax',slot(128));a.cmp('rax',1);a.jcc('be',next);
    a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.call('rt.toString');
    a.lea('rcx',slot(216));a.load('rdx',slot(152));a.call('rt.builderAppend');
    a.label(next);a.load('rax',slot(72));a.add('rax',1);a.store(slot(72),'rax');a.jmp(loop);
    a.label(clear);a.lea('rcx',slot(216));a.lea('rdx',slot(80));a.call('rt.builderFinish');a.load('rax',slot(200));a.store({rip:'rt.cleanupHead'},'rax');a.load('r10',slot(56));a.load('rax',{base:'r10',disp:O.flags});a.and('rax',~ObjectFlags.stringifying);a.store({base:'r10',disp:O.flags},'rax');
    a.label(finish);a.load('rcx',slot(40));a.load('rax',slot(80));a.store({base:'rcx'},'rax');a.load('rax',slot(88));a.store({base:'rcx',disp:8},'rax');
  });
}
