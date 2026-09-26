import type {RuntimeBundle} from '../abi.js';
import {Native} from './native.js';

// RCX: fraction digits 0..100. XMM0: this Number. RAX: UTF-16 string.
// The exact scaled integer lives on the native stack, so the final string
// allocation cannot invalidate it during a collection.
export function emitFixed(b:RuntimeBundle):void {
 const f=new Native('rt.formatFixed',3000),a=f.a;
 f.set(0,'rcx');a.movqFromXmm('r12','xmm0');a.mov('r13',0x7fffffffffffffffn);a.and('r13','r12');
 a.mov('rax',0x444b1ae4d6e2ef50n);a.cmp('r13','rax');a.jcc('ae','fixed.general');
 a.mov('r14','r12');a.shr('r14',63);a.test('r13','r13');a.jcc('ne','fixed.nonzero');a.xor('r14','r14');
 a.label('fixed.nonzero');f.set(1,'r14');
 a.lea('rsi',{base:'rsp',disp:400});a.mov('rdx',0xfffffffffffffn);a.and('rdx','r13');
 a.mov('r14','r13');a.shr('r14',52);a.test('r14','r14');a.jcc('e','fixed.subnormal');
 a.mov('rax',0x10000000000000n);a.or('rdx','rax');a.sub('r14',1075);a.jmp('fixed.init');
 a.label('fixed.subnormal');a.mov('r14',-1074);
 a.label('fixed.init');a.mov('rcx','rsi');a.call('num.init');
 f.get('r15',0);a.test('r15','r15');a.jcc('e','fixed.scale');
 a.label('fixed.power5');a.mov('rcx','rsi');a.mov('rdx',5);a.call('num.mul');a.sub('r15',1);a.jcc('ne','fixed.power5');
 a.label('fixed.scale');f.get('rax',0);a.add('r14','rax');a.cmp('r14',0);a.jcc('l','fixed.shiftRight');
 a.test('r14','r14');a.jcc('e','fixed.digits');a.mov('rcx','rsi');a.mov('rdx','r14');a.call('num.shl');a.jmp('fixed.digits');
 a.label('fixed.shiftRight');a.neg('r14');a.xor('r15','r15');
 a.label('fixed.shiftLoop');a.load('rax',{base:'rsi',disp:8},32);a.and('rax',1);a.mov('r15','rax');
 a.mov('rcx','rsi');a.call('num.shr');a.sub('r14',1);a.jcc('ne','fixed.shiftLoop');
 a.test('r15','r15');a.jcc('e','fixed.digits');a.mov('rcx','rsi');a.mov('rdx',1);a.call('num.add');
 a.label('fixed.digits');a.lea('rdi',{base:'rsp',disp:1500});a.xor('r15','r15');
 a.label('fixed.divide');a.mov('rcx','rsi');a.mov('rdx',10);a.call('num.divSmall');a.add('rax',48);
 a.store({base:'rdi'},'rax',8);a.add('rdi',1);a.add('r15',1);a.mov('rcx','rsi');a.call('num.bits');a.test('rax','rax');a.jcc('ne','fixed.divide');
 f.set(2,'r15');f.get('r14',0);f.get('r13',1);a.test('r14','r14');a.jcc('e','fixed.integerLength');
 a.cmp('r15','r14');a.jcc('a','fixed.longLength');a.mov('rax','r14');a.add('rax',2);a.jmp('fixed.length');
 a.label('fixed.longLength');a.mov('rax','r15');a.add('rax',1);a.jmp('fixed.length');
 a.label('fixed.integerLength');a.mov('rax','r15');
 a.label('fixed.length');a.add('rax','r13');f.set(3,'rax');a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');
 a.mov('r12','rax');f.get('rax',3);a.store({base:'r12'},'rax');a.xor('r13','r13');f.get('rax',1);a.test('rax','rax');a.jcc('e','fixed.layout');
 a.mov('rax',45);write();
 a.label('fixed.layout');f.get('r14',0);a.test('r14','r14');a.jcc('e','fixed.copyInteger');
 f.get('r15',2);a.cmp('r15','r14');a.jcc('a','fixed.long');
 a.mov('rax',48);write();a.mov('rax',46);write();a.mov('r10','r14');a.sub('r10','r15');
 a.label('fixed.leading');a.test('r10','r10');a.jcc('e','fixed.copyInteger');a.mov('rax',48);write();a.sub('r10',1);a.jmp('fixed.leading');
 a.label('fixed.long');a.mov('r10','r15');a.sub('r10','r14');a.mov('r11',0);a.call('fixed.copyDigits');a.mov('rax',46);write();a.mov('r10','r14');a.jmp('fixed.copyTail');
 a.label('fixed.copyInteger');f.get('r10',2);a.mov('r11',0);
 a.label('fixed.copyTail');a.call('fixed.copyDigits');a.mov('rax','r12');a.jmp('fixed.return');
 a.label('fixed.copyDigits');a.test('r10','r10');a.jcc('e','fixed.copyDigits.done');
 a.label('fixed.copyDigits.loop');a.mov('rax','rdi');a.sub('rax','r11');a.sub('rax',1);a.load('rax',{base:'rax'},8);
 a.mov('rdx','r13');a.shl('rdx',1);a.add('rdx','r12');a.store({base:'rdx',disp:8},'rax',16);
 a.add('r13',1);a.add('r11',1);a.sub('r10',1);a.jcc('ne','fixed.copyDigits.loop');
 a.label('fixed.copyDigits.done');a.ret();
 a.label('fixed.general');a.call('rt.formatNumber');
 a.label('fixed.return');f.end(b);

 function write():void {a.mov('rdx','r13');a.shl('rdx',1);a.add('rdx','r12');a.store({base:'rdx',disp:8},'rax',16);a.add('r13',1);}
}
