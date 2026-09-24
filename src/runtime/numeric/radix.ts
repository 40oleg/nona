// Radix digit/rounding strategy adapted from V8 DoubleToRadixStringView.
// Copyright 2014, the V8 project authors. All rights reserved.
// BSD-3-Clause terms and upstream reference: THIRD_PARTY_NOTICES.md.
// The x64 emitter and UTF-16 managed buffer integration are Nona-specific.
import {RuntimeBuilder,slot,failIf} from '../abi.js';

/** RCX radix 2..36, XMM0 binary64 -> RAX immutable UTF-16 descriptor.
 * Keeps the same floating rounding decisions as V8 for nondecimal output.
 * Integer precision padding is intentional (not exact big-integer printing).
 */
export function emitRadix(b:RuntimeBuilder):void {
 b.fn('rt.formatRadix',168,a=>{
  // raw/abs 40/48, radixDouble 56, allocation 64, left/right/middle 72/80/88,
  // integer/fraction/delta 96/104/112, digit 120, radix 128, buffer end 136.
  a.store(slot(128),'rcx');a.movqFromXmm('rax','xmm0');a.store(slot(40),'rax');a.mov('r10',0x7fffffffffffffffn);a.and('rax','r10');a.store(slot(48),'rax');
  const decimal=a.unique('decimal'),done=a.unique('done');a.cmp('rcx',10);a.jcc('e',decimal);a.test('rax','rax');a.jcc('e',decimal);a.mov('r10',0x7ff0000000000000n);a.cmp('rax','r10');a.jcc('ae',decimal);
  a.cvtsi2sd('xmm1','rcx');a.storesd(slot(56),'xmm1');a.mov('rcx',4416);a.call('rt.alloc');a.store(slot(64),'rax');
  a.lea('r10',{base:'rax',disp:2208});for(const offset of [72,80,88])a.store(slot(offset),'r10');a.add('rax',4408);a.store(slot(136),'rax');
  a.load('rax',slot(48));a.movqToXmm('xmm0','rax');a.mov('r10','rax');a.shr('r10',52);const integral=a.unique('integral');a.cmp('r10',1075);a.jcc('ae',integral);
  a.cvttsd2si('r10','xmm0');a.cvtsi2sd('xmm1','r10');a.storesd(slot(96),'xmm1');a.subsd('xmm0','xmm1');a.storesd(slot(104),'xmm0');const split=a.unique('split');a.jmp(split);
  a.label(integral);a.storesd(slot(96),'xmm0');a.mov('r10',0);a.store(slot(104),'r10');a.label(split);
  a.movqToXmm('xmm0','rax');a.add('rax',1);a.movqToXmm('xmm1','rax');a.subsd('xmm1','xmm0');a.mov('rax',0x3fe0000000000000n);a.movqToXmm('xmm0','rax');a.mulsd('xmm1','xmm0');a.movqFromXmm('rax','xmm1');
  const deltaReady=a.unique('deltaReady');a.test('rax','rax');a.jcc('ne',deltaReady);a.mov('rax',1);a.movqToXmm('xmm1','rax');a.label(deltaReady);a.storesd(slot(112),'xmm1');
  const integers=a.unique('integers'),fractionLoop=a.unique('fractionLoop'),continueFraction=a.unique('continueFraction'),roundUp=a.unique('roundUp');
  a.movsd('xmm0',slot(104));a.ucomisd('xmm0','xmm1');a.jcc('b',integers);
  // Append UTF-16 character in RAX. The 2200-code-unit buffer exceeds the
  // 1074 fractional / 1024 integer binary digit bounds; every write is checked.
  const append=()=>{a.load('r10',slot(80));a.load('r11',slot(136));a.cmp('r10','r11');failIf(a,'ae');a.store({base:'r10'},'rax',16);a.add('r10',2);a.store(slot(80),'r10');};
  const prepend=()=>{a.load('r10',slot(72));a.sub('r10',2);a.load('r11',slot(64));a.add('r11',8);a.cmp('r10','r11');failIf(a,'b');a.store({base:'r10'},'rax',16);a.store(slot(72),'r10');};
  const encodeDigit=()=>{const digit=a.unique('digit'),encoded=a.unique('encoded');a.cmp('rax',10);a.jcc('b',digit);a.add('rax',87);a.jmp(encoded);a.label(digit);a.add('rax',48);a.label(encoded);};
  a.mov('rax',46);append();a.label(fractionLoop);
  a.movsd('xmm0',slot(104));a.mulsd('xmm0',slot(56));a.movsd('xmm1',slot(112));a.mulsd('xmm1',slot(56));a.storesd(slot(112),'xmm1');
  a.cvttsd2si('rax','xmm0');a.store(slot(120),'rax');a.cvtsi2sd('xmm1','rax');a.subsd('xmm0','xmm1');a.storesd(slot(104),'xmm0');encodeDigit();append();
  a.mov('rax',0x3fe0000000000000n);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('a',roundUp);a.jcc('b',continueFraction);a.load('rax',slot(120));a.and('rax',1);a.jcc('e',continueFraction);
  a.label(roundUp);a.addsd('xmm0',slot(112));a.mov('rax',0x3ff0000000000000n);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',continueFraction);
  const carry=a.unique('carry'),carryInteger=a.unique('carryInteger');a.label(carry);a.load('r10',slot(80));a.sub('r10',2);a.store(slot(80),'r10');a.load('r11',slot(88));a.cmp('r10','r11');a.jcc('e',carryInteger);
  a.load('rax',{base:'r10'},16);const numeric=a.unique('numeric'),decoded=a.unique('decoded');a.cmp('rax',57);a.jcc('be',numeric);a.sub('rax',87);a.jmp(decoded);a.label(numeric);a.sub('rax',48);a.label(decoded);a.add('rax',1);
  a.load('r11',slot(128));a.cmp('rax','r11');a.jcc('ae',carry);encodeDigit();append();a.jmp(integers);
  a.label(carryInteger);a.movsd('xmm0',slot(96));a.mov('rax',0x3ff0000000000000n);a.movqToXmm('xmm1','rax');a.addsd('xmm0','xmm1');a.storesd(slot(96),'xmm0');a.jmp(integers);
  a.label(continueFraction);a.movsd('xmm0',slot(104));a.ucomisd('xmm0',slot(112));a.jcc('ae',fractionLoop);
  a.label(integers);const padding=a.unique('padding'),digits=a.unique('digits');a.label(padding);a.movsd('xmm0',slot(96));a.divsd('xmm0',slot(56));a.movqFromXmm('rax','xmm0');a.shr('rax',52);a.cmp('rax',1075);a.jcc('be',digits);
  a.storesd(slot(96),'xmm0');a.mov('rax',48);prepend();a.jmp(padding);
  a.label(digits);a.movsd('xmm0',slot(96));a.movsd('xmm1',slot(56));a.call('rt.remainder');a.cvttsd2si('rax','xmm0');a.store(slot(120),'rax');
  a.movsd('xmm1',slot(96));a.subsd('xmm1','xmm0');a.divsd('xmm1',slot(56));a.storesd(slot(96),'xmm1');encodeDigit();prepend();
  a.movsd('xmm0',slot(96));a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('a',digits);
  a.load('rax',slot(40));a.shr('rax',63);const finish=a.unique('finish');a.test('rax','rax');a.jcc('e',finish);a.mov('rax',45);prepend();
  a.label(finish);a.load('rax',slot(72));a.load('r10',slot(80));a.sub('r10','rax');a.shr('r10',1);a.sub('rax',8);a.store({base:'rax'},'r10');a.jmp(done);
  a.label(decimal);a.load('rax',slot(40));a.movqToXmm('xmm0','rax');a.call('rt.formatNumber');a.label(done);
 });
}
