import type { RuntimeBundle } from '../abi.js';
import { Native } from './native.js';

/** Emit unsigned, bounded scratch integer primitives. All preserve Win64 nonvolatiles.
 * RCX destination, RDX source/small operand. No helper allocates. */
export function emitBiguint(b:RuntimeBundle):void {
  {
    const f=new Native('num.init'),a=f.a;
    a.mov('rax',1);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rdx',32);
    a.shr('rdx',32);a.test('rdx','rdx');a.jcc('e','num.init.done');
    a.mov('rax',2);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:12},'rdx',32);
    a.label('num.init.done');f.end(b);
  }
  {
    const f=new Native('num.copy'),a=f.a;a.load('r8',{base:'rdx'});a.store({base:'rcx'},'r8');a.add('r8',2);
    a.label('num.copy.loop');a.load('rax',{base:'rdx'},32);a.store({base:'rcx'},'rax',32);a.add('rcx',4);a.add('rdx',4);a.sub('r8',1);a.jcc('ne','num.copy.loop');f.end(b);
  }
  {
    const f=new Native('num.mul'),a=f.a;a.mov('r9','rdx');a.load('r8',{base:'rcx'});a.mov('r10','rcx');a.add('r10',8);a.xor('r11','r11');
    a.label('num.mul.loop');a.load('rax',{base:'r10'},32);a.imul('rax','r9');a.add('rax','r11');a.store({base:'r10'},'rax',32);a.shr('rax',32);a.mov('r11','rax');a.add('r10',4);a.sub('r8',1);a.jcc('ne','num.mul.loop');
    a.test('r11','r11');a.jcc('e','num.mul.done');a.store({base:'r10'},'r11',32);a.load('rax',{base:'rcx'});a.add('rax',1);a.store({base:'rcx'},'rax');a.label('num.mul.done');f.end(b);
  }
  {
    const f=new Native('num.add'),a=f.a;a.mov('r8','rcx');a.add('r8',8);a.load('r9',{base:'rcx'});a.xor('r10','r10');
    a.label('num.add.loop');a.load('rax',{base:'r8'},32);a.add('rax','rdx');a.store({base:'r8'},'rax',32);a.shr('rax',32);a.mov('rdx','rax');a.test('rdx','rdx');a.jcc('e','num.add.done');a.add('r8',4);a.add('r10',1);a.cmp('r10','r9');a.jcc('b','num.add.loop');a.store({base:'r8'},'rdx',32);a.add('r9',1);a.store({base:'rcx'},'r9');a.label('num.add.done');f.end(b);
  }
  {
    const f=new Native('num.cmp'),a=f.a;a.load('r8',{base:'rcx'});a.load('r9',{base:'rdx'});a.cmp('r8','r9');a.jcc('b','num.cmp.less');a.jcc('a','num.cmp.more');a.shl('r8',2);a.add('rcx','r8');a.add('rdx','r8');
    a.label('num.cmp.loop');a.load('rax',{base:'rcx',disp:4},32);a.load('r10',{base:'rdx',disp:4},32);a.cmp('rax','r10');a.jcc('b','num.cmp.less');a.jcc('a','num.cmp.more');a.sub('rcx',4);a.sub('rdx',4);a.sub('r8',4);a.jcc('ne','num.cmp.loop');a.xor('rax','rax');a.jmp('num.cmp.done');a.label('num.cmp.less');a.mov('rax',-1);a.jmp('num.cmp.done');a.label('num.cmp.more');a.mov('rax',1);a.label('num.cmp.done');f.end(b);
  }
  {
    const f=new Native('num.sub'),a=f.a;a.mov('rsi','rcx');a.load('r8',{base:'rcx'});a.load('r9',{base:'rdx'});a.add('rcx',8);a.add('rdx',8);a.xor('r10','r10');a.xor('r11','r11');
    a.label('num.sub.loop');a.xor('rax','rax');a.cmp('r11','r9');a.jcc('ae','num.sub.zero');a.load('rax',{base:'rdx'},32);a.label('num.sub.zero');a.add('rax','r10');a.load('rbx',{base:'rcx'},32);a.sub('rbx','rax');a.mov('r10','rbx');a.shr('r10',63);a.store({base:'rcx'},'rbx',32);a.add('rcx',4);a.add('rdx',4);a.add('r11',1);a.cmp('r11','r8');a.jcc('b','num.sub.loop');
    a.label('num.sub.trim');a.cmp('r8',1);a.jcc('be','num.sub.done');a.load('rax',{base:'rcx',disp:-4},32);a.test('rax','rax');a.jcc('ne','num.sub.done');a.sub('rcx',4);a.sub('r8',1);a.jmp('num.sub.trim');a.label('num.sub.done');a.store({base:'rsi'},'r8');f.end(b);
  }
  {
    const f=new Native('num.shl'),a=f.a;a.mov('rsi','rcx');a.mov('rdi','rdx');a.test('rdi','rdi');a.jcc('e','num.shl.done');a.label('num.shl.loop');a.mov('rcx','rsi');a.mov('rdx',2);a.call('num.mul');a.sub('rdi',1);a.jcc('ne','num.shl.loop');a.label('num.shl.done');f.end(b);
  }
  {
    const f=new Native('num.shr'),a=f.a;a.load('r8',{base:'rcx'});a.mov('r9','r8');a.shl('r9',2);a.add('r9','rcx');a.add('r9',4);a.xor('r10','r10');a.mov('r11','r8');
    a.label('num.shr.loop');a.load('rax',{base:'r9'},32);a.mov('rdx','rax');a.shl('rdx',31);a.shr('rax',1);a.or('rax','r10');a.store({base:'r9'},'rax',32);a.mov('r10','rdx');a.sub('r9',4);a.sub('r11',1);a.jcc('ne','num.shr.loop');a.cmp('r8',1);a.jcc('be','num.shr.done');a.mov('r9','r8');a.shl('r9',2);a.add('r9','rcx');a.load('rax',{base:'r9',disp:4},32);a.test('rax','rax');a.jcc('ne','num.shr.done');a.sub('r8',1);a.store({base:'rcx'},'r8');a.label('num.shr.done');f.end(b);
  }
  {
    const f=new Native('num.bits'),a=f.a;a.load('r8',{base:'rcx'});a.mov('r9','r8');a.shl('r9',2);a.add('rcx','r9');a.load('r9',{base:'rcx',disp:4},32);a.sub('r8',1);a.shl('r8',5);a.mov('rax','r8');a.label('num.bits.loop');a.test('r9','r9');a.jcc('e','num.bits.done');a.add('rax',1);a.shr('r9',1);a.jmp('num.bits.loop');a.label('num.bits.done');f.end(b);
  }
  {
    const f=new Native('num.divSmall'),a=f.a;a.mov('r10','rdx');a.load('r8',{base:'rcx'});a.mov('r9','r8');a.shl('r9',2);a.add('r9','rcx');a.add('r9',4);a.mov('r11','r8');a.xor('rdx','rdx');
    a.label('num.divSmall.loop');a.shl('rdx',32);a.load('rax',{base:'r9'},32);a.or('rax','rdx');a.xor('rdx','rdx');a.div('r10');a.store({base:'r9'},'rax',32);a.sub('r9',4);a.sub('r11',1);a.jcc('ne','num.divSmall.loop');a.mov('rax','rdx');a.cmp('r8',1);a.jcc('be','num.divSmall.done');a.mov('r9','r8');a.shl('r9',2);a.add('r9','rcx');a.load('rdx',{base:'r9',disp:4},32);a.test('rdx','rdx');a.jcc('ne','num.divSmall.done');a.sub('r8',1);a.store({base:'rcx'},'r8');a.label('num.divSmall.done');f.end(b);
  }
}
