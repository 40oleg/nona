import type {RuntimeBundle} from '../abi.js';
import {Native} from './native.js';

// RCX: significant decimal digits (1..101), RDX: 0 exponential / 1 precision.
// XMM0: Number. The exact decimal integer and all formatting buffers live on
// the native stack; allocation happens only after the final UTF-16 text exists.
export function emitSignificant(b:RuntimeBundle):void {
 const f=new Native('rt.formatSignificant',3504),a=f.a;
 f.set(0,'rcx');f.set(1,'rdx');a.movqFromXmm('r12','xmm0');
 a.mov('r13',0x7fffffffffffffffn);a.and('r13','r12');
 a.mov('rax',0x7ff0000000000000n);a.cmp('r13','rax');a.jcc('ae','sig.special');
 a.mov('rax','r12');a.shr('rax',63);a.test('r13','r13');a.jcc('ne','sig.sign');a.xor('rax','rax');
 a.label('sig.sign');f.set(3,'rax');a.lea('rdi',{base:'rsp',disp:1500});
 a.test('r13','r13');a.jcc('e','sig.zero');
 a.lea('r12',{base:'rsp',disp:400});
 a.mov('rdx',0xfffffffffffffn);a.and('rdx','r13');a.mov('r14','r13');a.shr('r14',52);
 a.test('r14','r14');a.jcc('e','sig.subnormal');
 a.mov('rax',0x10000000000000n);a.or('rdx','rax');a.sub('r14',1075);a.jmp('sig.init');
 a.label('sig.subnormal');a.mov('r14',-1074);
 a.label('sig.init');a.mov('rcx','r12');a.call('num.init');
 a.cmp('r14',0);a.jcc('l','sig.power5');a.mov('rax',0);f.set(4,'rax');
 a.test('r14','r14');a.jcc('e','sig.digits');a.mov('rcx','r12');a.mov('rdx','r14');a.call('num.shl');a.jmp('sig.digits');
 a.label('sig.power5');f.set(4,'r14');a.neg('r14');
 a.label('sig.powerLoop');a.mov('rcx','r12');a.mov('rdx',5);a.call('num.mul');a.sub('r14',1);a.jcc('ne','sig.powerLoop');
 a.label('sig.digits');a.xor('r15','r15');
 a.label('sig.divide');a.mov('rcx','r12');a.mov('rdx',10);a.call('num.divSmall');a.add('rax',48);
 a.store({base:'rdi'},'rax',8);a.add('rdi',1);a.add('r15',1);
 a.mov('rcx','r12');a.call('num.bits');a.test('rax','rax');a.jcc('ne','sig.divide');
 a.jmp('sig.select');
 a.label('sig.zero');a.mov('rax',48);a.store({base:'rdi'},'rax',8);a.add('rdi',1);a.mov('r15',1);a.mov('rax',0);f.set(4,'rax');
 a.label('sig.select');a.mov('r14','r15');f.get('rax',4);a.add('r14','rax');a.sub('r14',1);f.set(5,'r14');
 a.lea('rsi',{base:'rsp',disp:2300});f.get('r9',0);a.xor('r8','r8');
 a.label('sig.choose');a.cmp('r8','r9');a.jcc('ae','sig.round');
 a.mov('rax',48);a.cmp('r8','r15');a.jcc('ae','sig.chooseWrite');
 a.mov('r10','r15');a.sub('r10','r8');a.sub('r10',1);a.lea('r11',{base:'rsp',disp:1500});a.add('r10','r11');a.load('rax',{base:'r10'},8);
 a.label('sig.chooseWrite');a.mov('r10','rsi');a.add('r10','r8');a.store({base:'r10'},'rax',8);a.add('r8',1);a.jmp('sig.choose');
 a.label('sig.round');a.cmp('r15','r9');a.jcc('be','sig.layout');
 a.mov('rax','r15');a.sub('rax','r9');a.sub('rax',1);a.lea('r10',{base:'rsp',disp:1500});a.add('r10','rax');a.load('rax',{base:'r10'},8);a.cmp('rax',53);a.jcc('b','sig.layout');
 a.mov('r8','r9');a.sub('r8',1);
 a.label('sig.carry');a.mov('r10','rsi');a.add('r10','r8');a.load('rax',{base:'r10'},8);a.cmp('rax',57);a.jcc('ne','sig.increment');
 a.mov('rax',48);a.store({base:'r10'},'rax',8);a.test('r8','r8');a.jcc('e','sig.carryTop');a.sub('r8',1);a.jmp('sig.carry');
 a.label('sig.increment');a.add('rax',1);a.store({base:'r10'},'rax',8);a.jmp('sig.layout');
 a.label('sig.carryTop');a.mov('rax',49);a.store({base:'rsi'},'rax',8);a.add('r14',1);f.set(5,'r14');
 a.label('sig.layout');a.xor('r13','r13');f.get('rax',3);a.test('rax','rax');a.jcc('e','sig.chooseLayout');a.mov('rax',45);put();
 a.label('sig.chooseLayout');a.mov('rax',0);f.set(7,'rax');f.get('rax',1);a.test('rax','rax');a.jcc('e','sig.scientific');
 f.get('r9',0);a.cmp('r14',-6);a.jcc('l','sig.scientific');a.mov('rax','r9');a.sub('rax',1);a.cmp('r14','rax');a.jcc('g','sig.scientific');
 a.cmp('r14',0);a.jcc('l','sig.smallFixed');
 a.mov('r8',0);a.label('sig.integerPart');a.mov('r10','rsi');a.add('r10','r8');a.load('rax',{base:'r10'},8);put();a.add('r8',1);a.cmp('r8','r14');a.jcc('be','sig.integerPart');
 a.cmp('r8','r9');a.jcc('ae','sig.finishText');a.mov('rax',46);put();a.jmp('sig.remaining');
 a.label('sig.smallFixed');a.mov('rax',48);put();a.mov('rax',46);put();a.mov('r8','r14');a.neg('r8');a.sub('r8',1);
 a.label('sig.leadingZero');a.test('r8','r8');a.jcc('e','sig.smallDigits');a.mov('rax',48);put();a.sub('r8',1);a.jmp('sig.leadingZero');
 a.label('sig.smallDigits');a.mov('r8',0);a.jmp('sig.remaining');
 a.label('sig.scientific');a.mov('rax',1);f.set(7,'rax');a.load('rax',{base:'rsi'},8);put();f.get('r9',0);a.cmp('r9',1);a.jcc('e','sig.exponent');
 a.mov('rax',46);put();a.mov('r8',1);a.label('sig.remaining');a.cmp('r8','r9');a.jcc('ae','sig.exponentOrFinish');
 a.mov('r10','rsi');a.add('r10','r8');a.load('rax',{base:'r10'},8);put();a.add('r8',1);a.jmp('sig.remaining');
 a.label('sig.exponentOrFinish');f.get('rax',7);a.test('rax','rax');a.jcc('e','sig.finishText');
 a.label('sig.exponent');a.mov('rax',101);put();a.mov('rax',43);a.cmp('r14',0);a.jcc('ge','sig.expSign');a.mov('rax',45);a.neg('r14');
 a.label('sig.expSign');put();a.mov('r8','r14');a.lea('r9',{base:'rsp',disp:3300});a.xor('r15','r15');
 a.label('sig.expDivide');a.mov('rax','r8');a.xor('rdx','rdx');a.mov('r11',10);a.div('r11');a.add('rdx',48);a.store({base:'r9'},'rdx',8);a.add('r9',1);a.add('r15',1);a.mov('r8','rax');a.test('r8','r8');a.jcc('ne','sig.expDivide');
 a.label('sig.expCopy');a.sub('r9',1);a.load('rax',{base:'r9'},8);put();a.sub('r15',1);a.jcc('ne','sig.expCopy');
 a.label('sig.finishText');f.set(6,'r13');a.mov('rax','r13');a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');
 a.mov('r12','rax');f.get('r13',6);a.store({base:'r12'},'r13');a.lea('rsi',{base:'rsp',disp:2500});a.lea('rdi',{base:'r12',disp:8});
 a.label('sig.copy');a.test('r13','r13');a.jcc('e','sig.done');a.load('rax',{base:'rsi'},16);a.store({base:'rdi'},'rax',16);a.add('rsi',2);a.add('rdi',2);a.sub('r13',1);a.jmp('sig.copy');
 a.label('sig.done');a.mov('rax','r12');a.jmp('sig.return');
 a.label('sig.special');a.call('rt.formatNumber');a.label('sig.return');f.end(b);

 function put():void {a.lea('r10',{base:'rsp',disp:2500});a.mov('r11','r13');a.shl('r11',1);a.add('r10','r11');a.store({base:'r10'},'rax',16);a.add('r13',1);}

 // Count significant digits in the already shortest Number::toString form.
 // Its temporary string is read completely before formatSignificant allocates.
 const short=new Native('rt.shortestSignificant'),s=short.a;
 s.call('rt.formatNumber');s.mov('r12','rax');s.load('r13',{base:'r12'});s.xor('r14','r14');s.xor('r15','r15');
 short.imm(0,-1);short.imm(1,-1);
 s.label('sig.shortLoop');s.cmp('r14','r13');s.jcc('ae','sig.shortDone');
 s.mov('r10','r14');s.shl('r10',1);s.add('r10','r12');s.load('rax',{base:'r10',disp:8},16);s.cmp('rax',101);s.jcc('e','sig.shortDone');
 s.cmp('rax',48);s.jcc('b','sig.shortNext');s.cmp('rax',57);s.jcc('a','sig.shortNext');
 s.cmp('rax',48);s.jcc('e','sig.shortDigit');short.get('r10',0);s.cmp('r10',-1);s.jcc('ne','sig.shortLast');short.set(0,'r15');
 s.label('sig.shortLast');short.set(1,'r15');
 s.label('sig.shortDigit');s.add('r15',1);
 s.label('sig.shortNext');s.add('r14',1);s.jmp('sig.shortLoop');
 s.label('sig.shortDone');short.get('rax',1);s.cmp('rax',-1);s.jcc('ne','sig.shortLength');s.mov('rax',1);s.jmp('sig.shortReturn');
 s.label('sig.shortLength');short.get('r10',0);s.sub('rax','r10');s.add('rax',1);s.label('sig.shortReturn');short.end(b);
}
