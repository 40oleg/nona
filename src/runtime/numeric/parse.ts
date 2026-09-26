import type { RuntimeBundle } from '../abi.js';
import { BIG_BYTES, Native } from './native.js';

/** Decimal input keeps 1,200 significant digits and a sticky suffix digit.
 * Every finite binary64 rounding boundary is a terminating decimal with fewer
 * than 1,200 significant digits (its denominator divides 2^1075). Thus replacing
 * a longer nonzero suffix by a final 1 preserves which side of every boundary
 * the input occupies, including exact ties. Order checks precede powers of ten:
 * the largest intermediate is below 5,100 bits, fitting the 8,192-bit scratch.
 * Exponents saturate only beyond signed 64-bit range, not at a fixed decimal
 * limit: a long fractional prefix may legitimately cancel a large exponent.
 */
export function emitParse(b:RuntimeBundle):void {
  {
    const f=new Native('num.space'),a=f.a;
    for(const c of [9,10,11,12,13,32,0xa0,0x1680,0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff]){a.cmp('rcx',c);a.jcc('e','num.space.yes');}
    a.cmp('rcx',0x2000);a.jcc('b','num.space.no');a.cmp('rcx',0x200a);a.jcc('be','num.space.yes');a.label('num.space.no');a.xor('rax','rax');a.jmp('num.space.done');a.label('num.space.yes');a.mov('rax',1);a.label('num.space.done');f.end(b);
  }
  {
    const f=new Native('num.ratio'),a=f.a;
    a.mov('rsi','rcx');a.mov('rdi','rdx');a.mov('rcx',BIG_BYTES);a.call('rt.alloc');a.mov('r12','rax');
    a.mov('rcx','rsi');a.call('num.bits');a.test('rax','rax');a.jcc('e','ratio.zero');a.mov('r13','rax');a.mov('rcx','rdi');a.call('num.bits');a.sub('r13','rax');
    a.cmp('r13',0);a.jcc('l','ratio.negexp');a.mov('rcx','r12');a.mov('rdx','rdi');a.call('num.copy');a.mov('rcx','r12');a.mov('rdx','r13');a.call('num.shl');a.mov('rcx','rsi');a.mov('rdx','r12');a.call('num.cmp');a.jmp('ratio.adjust');
    a.label('ratio.negexp');a.mov('rcx','r12');a.mov('rdx','rsi');a.call('num.copy');a.mov('rcx','r12');a.mov('rdx','r13');a.neg('rdx');a.call('num.shl');a.mov('rcx','r12');a.mov('rdx','rdi');a.call('num.cmp');
    a.label('ratio.adjust');a.cmp('rax',0);a.jcc('ge','ratio.exponent');a.sub('r13',1);a.label('ratio.exponent');a.cmp('r13',1023);a.jcc('g','ratio.inf');a.cmp('r13',-1022);a.jcc('ge','ratio.scale');a.mov('r13',-1022);
    a.label('ratio.scale');a.mov('rdx',52);a.sub('rdx','r13');a.cmp('rdx',0);a.jcc('l','ratio.scaleden');a.mov('rcx','rsi');a.call('num.shl');a.jmp('ratio.divide');a.label('ratio.scaleden');a.neg('rdx');a.mov('rcx','rdi');a.call('num.shl');
    a.label('ratio.divide');a.mov('rcx','rsi');a.call('num.bits');a.mov('r14','rax');a.mov('rcx','rdi');a.call('num.bits');a.sub('r14','rax');a.xor('r15','r15');a.cmp('r14',0);a.jcc('l','ratio.round');a.mov('rcx','r12');a.mov('rdx','rdi');a.call('num.copy');a.mov('rcx','r12');a.mov('rdx','r14');a.call('num.shl');
    a.label('ratio.loop');a.shl('r15',1);a.mov('rcx','rsi');a.mov('rdx','r12');a.call('num.cmp');a.cmp('rax',0);a.jcc('l','ratio.next');a.mov('rcx','rsi');a.mov('rdx','r12');a.call('num.sub');a.add('r15',1);a.label('ratio.next');a.mov('rcx','r12');a.call('num.shr');a.sub('r14',1);a.jcc('ns','ratio.loop');
    a.label('ratio.round');a.mov('rcx','rsi');a.mov('rdx',2);a.call('num.mul');a.mov('rcx','rsi');a.mov('rdx','rdi');a.call('num.cmp');a.cmp('rax',0);a.jcc('g','ratio.up');a.jcc('l','ratio.pack');a.mov('rax','r15');a.and('rax',1);a.jcc('e','ratio.pack');a.label('ratio.up');a.add('r15',1);
    a.label('ratio.pack');a.add('r13',1022);a.shl('r13',52);a.add('r15','r13');a.mov('rax',0x7ff0000000000000n);a.cmp('r15','rax');a.jcc('ae','ratio.inf');a.movqToXmm('xmm0','r15');a.jmp('ratio.done');a.label('ratio.zero');a.xor('rax','rax');a.movqToXmm('xmm0','rax');a.jmp('ratio.done');a.label('ratio.inf');a.mov('rax',0x7ff0000000000000n);a.movqToXmm('xmm0','rax');a.label('ratio.done');f.end(b);
  }
  const f=new Native('rt.parseNumber'),a=f.a;
  a.load('rdi',{base:'rcx'});a.lea('rsi',{base:'rcx',disp:8});a.shl('rdi',1);a.add('rdi','rsi');
  a.label('parse.trimLeft');a.cmp('rsi','rdi');a.jcc('ae','parse.zero');a.load('rcx',{base:'rsi'},16);a.call('num.space');a.test('rax','rax');a.jcc('e','parse.trimRight');a.add('rsi',2);a.jmp('parse.trimLeft');
  a.label('parse.trimRight');a.load('rcx',{base:'rdi',disp:-2},16);a.call('num.space');a.test('rax','rax');a.jcc('e','parse.start');a.sub('rdi',2);a.jmp('parse.trimRight');
  a.label('parse.start');f.imm(4,0);f.imm(14,0);a.load('rax',{base:'rsi'},16);a.cmp('rax',43);a.jcc('e','parse.plus');a.cmp('rax',45);a.jcc('ne','parse.allocate');f.imm(4,0x8000000000000000n);a.label('parse.plus');f.imm(14,1);a.add('rsi',2);a.cmp('rsi','rdi');a.jcc('ae','parse.nan');
  a.label('parse.allocate');a.load('rax',{base:'rsi'},16);a.cmp('rax',73);a.jcc('e','parse.infinity');a.mov('rcx',BIG_BYTES*2);a.call('rt.alloc');a.mov('r12','rax');a.lea('r13',{base:'rax',disp:BIG_BYTES});a.mov('rcx','r12');a.mov('rdx',0);a.call('num.init');a.mov('rcx','r13');a.mov('rdx',1);a.call('num.init');
  for(const s of [5,6,7,8,9,11,12])f.imm(s,0);
  f.get('rax',14);a.test('rax','rax');a.jcc('ne','parse.decimal');a.mov('rax','rdi');a.sub('rax','rsi');a.cmp('rax',4);a.jcc('be','parse.decimal');a.load('rax',{base:'rsi'},16);a.cmp('rax',48);a.jcc('ne','parse.decimal');a.load('rax',{base:'rsi',disp:2},16);a.or('rax',32);a.cmp('rax',120);a.jcc('e','parse.hexstart');a.cmp('rax',98);a.jcc('e','parse.binarystart');a.cmp('rax',111);a.jcc('e','parse.octalstart');
  a.label('parse.decimal');a.cmp('rsi','rdi');a.jcc('ae','parse.decimalEnd');a.load('r14',{base:'rsi'},16);a.cmp('r14',48);a.jcc('b','parse.nondigit');a.cmp('r14',57);a.jcc('a','parse.nondigit');a.sub('r14',48);f.imm(6,1);f.get('rax',7);f.get('rdx',5);a.add('rdx','rax');f.set(5,'rdx');f.get('rax',9);a.test('rax','rax');a.jcc('ne','parse.significant');a.test('r14','r14');a.jcc('e','parse.advance');a.label('parse.significant');a.cmp('rax',1200);a.jcc('ae','parse.drop');a.add('rax',1);f.set(9,'rax');a.mov('rcx','r12');a.mov('rdx',10);a.call('num.mul');a.mov('rcx','r12');a.mov('rdx','r14');a.call('num.add');a.jmp('parse.advance');
  a.label('parse.drop');f.get('rax',11);a.add('rax',1);f.set(11,'rax');a.test('r14','r14');a.jcc('e','parse.advance');f.imm(12,1);a.label('parse.advance');a.add('rsi',2);a.jmp('parse.decimal');
  a.label('parse.nondigit');a.cmp('r14',46);a.jcc('ne','parse.exponent');f.get('rax',7);a.test('rax','rax');a.jcc('ne','parse.nan');f.imm(7,1);a.add('rsi',2);a.jmp('parse.decimal');
  a.label('parse.exponent');a.or('r14',32);a.cmp('r14',101);a.jcc('ne','parse.nan');f.get('rax',6);a.test('rax','rax');a.jcc('e','parse.nan');a.add('rsi',2);a.cmp('rsi','rdi');a.jcc('ae','parse.nan');f.imm(13,0);a.load('rax',{base:'rsi'},16);a.cmp('rax',43);a.jcc('e','parse.expsign');a.cmp('rax',45);a.jcc('ne','parse.expfirst');f.imm(13,1);a.label('parse.expsign');a.add('rsi',2);a.label('parse.expfirst');a.cmp('rsi','rdi');a.jcc('ae','parse.nan');a.xor('r15','r15');
  a.label('parse.exploop');a.load('rax',{base:'rsi'},16);a.sub('rax',48);a.cmp('rax',9);a.jcc('a','parse.nan');a.mov('rdx',922337203685477579n);a.cmp('r15','rdx');a.jcc('a','parse.expsaturate');a.mov('rdx',10);a.imul('r15','rdx');a.add('r15','rax');a.jmp('parse.expnext');a.label('parse.expsaturate');a.mov('r15',0x7fffffffffffffffn);a.label('parse.expnext');a.add('rsi',2);a.cmp('rsi','rdi');a.jcc('b','parse.exploop');f.get('rax',13);a.test('rax','rax');a.jcc('e','parse.expstore');a.neg('r15');a.label('parse.expstore');f.set(8,'r15');
  a.label('parse.decimalEnd');f.get('rax',6);a.test('rax','rax');a.jcc('e','parse.nan');f.get('rax',9);a.test('rax','rax');a.jcc('e','parse.signedzero');f.get('r15',8);f.get('rdx',5);a.sub('r15','rdx');a.jcc('o','parse.signedzero');f.get('rdx',11);a.add('r15','rdx');a.jcc('o','parse.inf');a.add('rax','r15');a.jcc('o','parse.inf');a.cmp('rax',310);a.jcc('g','parse.inf');a.cmp('rax',-325);a.jcc('l','parse.signedzero');a.test('rdx','rdx');a.jcc('e','parse.power');a.mov('rcx','r12');a.mov('rdx',10);a.call('num.mul');a.mov('rcx','r12');f.get('rdx',12);a.call('num.add');a.sub('r15',1);
  a.label('parse.power');a.test('r15','r15');a.jcc('e','parse.convert');a.cmp('r15',0);a.jcc('l','parse.denpower');a.mov('r14','r12');a.jmp('parse.powloop');a.label('parse.denpower');a.mov('r14','r13');a.neg('r15');a.label('parse.powloop');a.mov('rcx','r14');a.mov('rdx',10);a.call('num.mul');a.sub('r15',1);a.jcc('ne','parse.powloop');a.jmp('parse.convert');
  a.label('parse.hexstart');f.imm(15,16);f.imm(16,300);a.jmp('parse.radixstart');
  a.label('parse.binarystart');f.imm(15,2);f.imm(16,1100);a.jmp('parse.radixstart');
  a.label('parse.octalstart');f.imm(15,8);f.imm(16,370);
  a.label('parse.radixstart');a.add('rsi',4);a.xor('r15','r15');a.label('parse.radixloop');a.load('r14',{base:'rsi'},16);a.sub('r14',48);a.cmp('r14',9);a.jcc('be','parse.radixvalue');a.add('r14',48);a.or('r14',32);a.sub('r14',97);a.cmp('r14',5);a.jcc('a','parse.nan');a.add('r14',10);a.label('parse.radixvalue');f.get('rax',15);a.cmp('r14','rax');a.jcc('ae','parse.nan');f.get('rax',16);a.cmp('r15','rax');a.jcc('ae','parse.radixnext');a.mov('rcx','r12');f.get('rdx',15);a.call('num.mul');a.mov('rcx','r12');a.mov('rdx','r14');a.call('num.add');a.mov('rcx','r12');a.call('num.bits');a.test('rax','rax');a.jcc('e','parse.radixnext');a.add('r15',1);a.label('parse.radixnext');a.add('rsi',2);a.cmp('rsi','rdi');a.jcc('b','parse.radixloop');f.get('rax',16);a.cmp('r15','rax');a.jcc('ae','parse.inf');
  a.label('parse.convert');a.mov('rcx','r12');a.mov('rdx','r13');a.call('num.ratio');a.movqFromXmm('rax','xmm0');a.jmp('parse.sign');
  a.label('parse.infinity');a.mov('rax','rdi');a.sub('rax','rsi');a.cmp('rax',16);a.jcc('ne','parse.nan');for(let i=0;i<8;i++){a.load('rax',{base:'rsi',disp:i*2},16);a.cmp('rax','Infinity'.charCodeAt(i));a.jcc('ne','parse.nan');}
  a.label('parse.inf');a.mov('rax',0x7ff0000000000000n);a.jmp('parse.sign');a.label('parse.signedzero');a.xor('rax','rax');a.label('parse.sign');f.get('rdx',4);a.or('rax','rdx');a.movqToXmm('xmm0','rax');a.jmp('parse.done');a.label('parse.zero');a.xor('rax','rax');a.movqToXmm('xmm0','rax');a.jmp('parse.done');a.label('parse.nan');a.mov('rax',0x7ff8000000000000n);a.movqToXmm('xmm0','rax');a.label('parse.done');f.end(b);

  // RCX is a UTF-16 string descriptor, RDX is ToInt32(radix). Return binary64.
  // Keep all significant radix digits until overflow is certain, then the
  // shared biguint ratio converter supplies correctly rounded finite results.
  {
    const f=new Native('rt.parseIntString'),a=f.a;
    a.mov('rbx','rdx');a.load('rdi',{base:'rcx'});a.lea('rsi',{base:'rcx',disp:8});a.shl('rdi',1);a.add('rdi','rsi');f.imm(4,0);a.xor('r14','r14');
    a.label('parseInt.trim');a.cmp('rsi','rdi');a.jcc('ae','parseInt.nan');a.load('rcx',{base:'rsi'},16);a.call('num.space');a.test('rax','rax');a.jcc('e','parseInt.sign');a.add('rsi',2);a.jmp('parseInt.trim');
    a.label('parseInt.sign');a.load('rax',{base:'rsi'},16);a.cmp('rax',45);a.jcc('ne','parseInt.plus');a.mov('r14',0x8000000000000000n);a.jmp('parseInt.skipSign');a.label('parseInt.plus');a.cmp('rax',43);a.jcc('ne','parseInt.radix');a.label('parseInt.skipSign');a.add('rsi',2);a.cmp('rsi','rdi');a.jcc('ae','parseInt.nan');
    a.label('parseInt.radix');a.test('rbx','rbx');a.jcc('ne','parseInt.explicitRadix');a.mov('rbx',10);f.imm(4,1);a.jmp('parseInt.prefix');
    a.label('parseInt.explicitRadix');a.cmp('rbx',2);a.jcc('l','parseInt.nan');a.cmp('rbx',36);a.jcc('g','parseInt.nan');a.cmp('rbx',16);a.jcc('ne','parseInt.prefix');f.imm(4,1);
    a.label('parseInt.prefix');f.get('rax',4);a.test('rax','rax');a.jcc('e','parseInt.allocate');a.mov('rax','rdi');a.sub('rax','rsi');a.cmp('rax',4);a.jcc('b','parseInt.allocate');a.load('rax',{base:'rsi'},16);a.cmp('rax',48);a.jcc('ne','parseInt.allocate');a.load('rax',{base:'rsi',disp:2},16);a.or('rax',32);a.cmp('rax',120);a.jcc('ne','parseInt.allocate');a.mov('rbx',16);a.add('rsi',4);
    a.label('parseInt.allocate');a.mov('rcx',BIG_BYTES*2);a.call('rt.alloc');a.mov('r12','rax');a.lea('r13',{base:'rax',disp:BIG_BYTES});a.mov('rcx','r12');a.mov('rdx',0);a.call('num.init');a.mov('rcx','r13');a.mov('rdx',1);a.call('num.init');f.imm(5,0);a.xor('r15','r15');
    a.label('parseInt.digit');a.cmp('rsi','rdi');a.jcc('ae','parseInt.finish');a.load('r10',{base:'rsi'},16);a.sub('r10',48);a.cmp('r10',9);a.jcc('be','parseInt.value');a.add('r10',48);a.or('r10',32);a.sub('r10',97);a.cmp('r10',25);a.jcc('a','parseInt.finish');a.add('r10',10);
    a.label('parseInt.value');a.cmp('r10','rbx');a.jcc('ae','parseInt.finish');f.imm(5,1);a.cmp('r15',1100);a.jcc('ae','parseInt.inf');f.set(6,'r10');a.mov('rcx','r12');a.mov('rdx','rbx');a.call('num.mul');a.mov('rcx','r12');f.get('rdx',6);a.call('num.add');a.mov('rcx','r12');a.call('num.bits');a.test('rax','rax');a.jcc('e','parseInt.next');a.add('r15',1);a.label('parseInt.next');a.add('rsi',2);a.jmp('parseInt.digit');
    a.label('parseInt.finish');f.get('rax',5);a.test('rax','rax');a.jcc('e','parseInt.nan');a.mov('rcx','r12');a.mov('rdx','r13');a.call('num.ratio');a.movqFromXmm('rax','xmm0');a.jmp('parseInt.signResult');
    a.label('parseInt.inf');a.mov('rax',0x7ff0000000000000n);a.label('parseInt.signResult');a.or('rax','r14');a.jmp('parseInt.done');
    a.label('parseInt.nan');a.mov('rax',0x7ff8000000000000n);a.label('parseInt.done');a.movqToXmm('xmm0','rax');f.end(b);
  }
  // Find the longest StrDecimalLiteral prefix, then reuse the exact decimal
  // parser so parseFloat and ToNumber agree on rounding at every boundary.
  {
    const f=new Native('rt.parseFloatString'),a=f.a;
    a.load('rdi',{base:'rcx'});a.lea('rsi',{base:'rcx',disp:8});a.shl('rdi',1);a.add('rdi','rsi');
    a.label('parseFloat.trim');a.cmp('rsi','rdi');a.jcc('ae','parseFloat.nan');a.load('rcx',{base:'rsi'},16);a.call('num.space');a.test('rax','rax');a.jcc('e','parseFloat.sign');a.add('rsi',2);a.jmp('parseFloat.trim');
    a.label('parseFloat.sign');a.mov('r12','rsi');a.load('rax',{base:'rsi'},16);a.cmp('rax',43);a.jcc('e','parseFloat.skipSign');a.cmp('rax',45);a.jcc('ne','parseFloat.infinity');a.label('parseFloat.skipSign');a.add('rsi',2);a.cmp('rsi','rdi');a.jcc('ae','parseFloat.nan');
    a.label('parseFloat.infinity');a.mov('rax','rdi');a.sub('rax','rsi');a.cmp('rax',16);a.jcc('b','parseFloat.decimal');a.load('rax',{base:'rsi'},16);a.cmp('rax',73);a.jcc('ne','parseFloat.decimal');
    for(let i=0;i<8;i++){a.load('rax',{base:'rsi',disp:i*2},16);a.cmp('rax','Infinity'.charCodeAt(i));a.jcc('ne','parseFloat.decimal');}
    a.lea('r14',{base:'rsi',disp:16});a.jmp('parseFloat.copy');
    a.label('parseFloat.decimal');a.xor('r14','r14');a.xor('r15','r15');
    a.label('parseFloat.digits');a.cmp('rsi','rdi');a.jcc('ae','parseFloat.dot');a.load('rax',{base:'rsi'},16);a.sub('rax',48);a.cmp('rax',9);a.jcc('a','parseFloat.dot');a.add('rsi',2);a.mov('r14','rsi');a.mov('r15',1);a.jmp('parseFloat.digits');
    a.label('parseFloat.dot');a.cmp('rsi','rdi');a.jcc('ae','parseFloat.exponent');a.load('rax',{base:'rsi'},16);a.cmp('rax',46);a.jcc('ne','parseFloat.exponent');a.add('rsi',2);a.test('r15','r15');a.jcc('e','parseFloat.fraction');a.mov('r14','rsi');
    a.label('parseFloat.fraction');a.cmp('rsi','rdi');a.jcc('ae','parseFloat.exponent');a.load('rax',{base:'rsi'},16);a.sub('rax',48);a.cmp('rax',9);a.jcc('a','parseFloat.exponent');a.add('rsi',2);a.mov('r14','rsi');a.mov('r15',1);a.jmp('parseFloat.fraction');
    a.label('parseFloat.exponent');a.test('r15','r15');a.jcc('e','parseFloat.nan');a.cmp('rsi','rdi');a.jcc('ae','parseFloat.copy');a.load('rax',{base:'rsi'},16);a.or('rax',32);a.cmp('rax',101);a.jcc('ne','parseFloat.copy');a.add('rsi',2);a.cmp('rsi','rdi');a.jcc('ae','parseFloat.copy');a.load('rax',{base:'rsi'},16);a.cmp('rax',43);a.jcc('e','parseFloat.expSign');a.cmp('rax',45);a.jcc('ne','parseFloat.expDigits');a.label('parseFloat.expSign');a.add('rsi',2);
    a.label('parseFloat.expDigits');a.cmp('rsi','rdi');a.jcc('ae','parseFloat.copy');a.load('rax',{base:'rsi'},16);a.sub('rax',48);a.cmp('rax',9);a.jcc('a','parseFloat.copy');a.add('rsi',2);a.mov('r14','rsi');a.jmp('parseFloat.expDigits');
    a.label('parseFloat.copy');a.mov('rcx','r14');a.sub('rcx','r12');a.mov('rbx','rcx');a.add('rcx',8);a.call('rt.alloc');a.mov('r13','rax');a.mov('rcx','rbx');a.shr('rcx',1);a.store({base:'r13'},'rcx');a.mov('rsi','r12');a.lea('rdi',{base:'r13',disp:8});
    a.label('parseFloat.copyLoop');a.cmp('rsi','r14');a.jcc('ae','parseFloat.convert');a.load('rax',{base:'rsi'},16);a.store({base:'rdi'},'rax',16);a.add('rsi',2);a.add('rdi',2);a.jmp('parseFloat.copyLoop');
    a.label('parseFloat.convert');a.mov('rcx','r13');a.call('rt.parseNumber');a.jmp('parseFloat.done');
    a.label('parseFloat.nan');a.mov('rax',0x7ff8000000000000n);a.movqToXmm('xmm0','rax');a.label('parseFloat.done');f.end(b);
  }
}
