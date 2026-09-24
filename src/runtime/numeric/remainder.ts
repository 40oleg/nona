import type { RuntimeBundle } from '../abi.js';
import { Native } from './native.js';

/** Exact significand reduction; never forms the overflowing quotient x/y. */
export function emitRemainder(b:RuntimeBundle):void {
  const f=new Native('rt.remainder'),a=f.a;
  a.movqFromXmm('r8','xmm0');a.movqFromXmm('r9','xmm1');a.mov('r10',0x7fffffffffffffffn);a.mov('r11','r8');a.and('r8','r10');a.and('r9','r10');a.xor('r11','r8');
  a.mov('rax',0x7ff0000000000000n);a.cmp('r8','rax');a.jcc('ae','rem.nan');a.cmp('r9','rax');a.jcc('a','rem.nan');a.test('r9','r9');a.jcc('e','rem.nan');a.cmp('r8','r9');a.jcc('b','rem.original');a.jcc('e','rem.zero');
  a.mov('r12','r8');a.shr('r12',52);a.mov('r13','r9');a.shr('r13',52);a.mov('rax',0xfffffffffffffn);a.and('r8','rax');a.and('r9','rax');a.mov('rax',0x10000000000000n);
  a.test('r12','r12');a.jcc('e','rem.subx');a.or('r8','rax');a.jmp('rem.normy');a.label('rem.subx');a.mov('r12',1);a.label('rem.normx');a.cmp('r8','rax');a.jcc('ae','rem.normy');a.shl('r8',1);a.sub('r12',1);a.jmp('rem.normx');
  a.label('rem.normy');a.test('r13','r13');a.jcc('e','rem.suby');a.or('r9','rax');a.jmp('rem.reduce');a.label('rem.suby');a.mov('r13',1);a.label('rem.normyloop');a.cmp('r9','rax');a.jcc('ae','rem.reduce');a.shl('r9',1);a.sub('r13',1);a.jmp('rem.normyloop');
  a.label('rem.reduce');a.cmp('r8','r9');a.jcc('b','rem.shift');a.sub('r8','r9');a.test('r8','r8');a.jcc('e','rem.zero');a.label('rem.shift');a.cmp('r12','r13');a.jcc('e','rem.normalize');a.shl('r8',1);a.sub('r12',1);a.jmp('rem.reduce');
  a.label('rem.normalize');a.cmp('r8','rax');a.jcc('ae','rem.pack');a.shl('r8',1);a.sub('r12',1);a.jmp('rem.normalize');
  a.label('rem.pack');a.cmp('r12',0);a.jcc('le','rem.packsub');a.sub('r8','rax');a.shl('r12',52);a.or('r8','r12');a.jmp('rem.sign');
  a.label('rem.packsub');a.mov('rcx',1);a.sub('rcx','r12');a.shr('r8','cl');a.jmp('rem.sign');a.label('rem.zero');a.xor('r8','r8');a.label('rem.sign');a.or('r8','r11');a.movqToXmm('xmm0','r8');a.jmp('rem.done');a.label('rem.nan');a.mov('rax',0x7ff8000000000000n);a.movqToXmm('xmm0','rax');a.jmp('rem.done');a.label('rem.original');a.label('rem.done');f.end(b);
}
