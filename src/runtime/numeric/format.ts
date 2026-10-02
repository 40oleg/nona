import type { RuntimeBundle } from '../abi.js';
import { BIG_BYTES, Native } from './native.js';

/** Build the exact terminating decimal, then inspect increasing significand
 * lengths. At each length the adjacent floor/ceiling decimals are the only
 * possible nearest representations. Try the nearest (ties even) first and its
 * neighbor second, validating against exact binary64 parsing. This also handles
 * the asymmetric rounding interval at powers of two without approximate logs.
 */
export function emitFormat(b:RuntimeBundle):void {
  // Candidate descriptor: q e decimalExponent. q is at most 10^17.
  {
    const f=new Native('num.candidate'),a=f.a;
    a.mov('rsi','rcx');a.lea('rdi',{base:'rcx',disp:8});a.mov('r12','r8');a.mov('rax','rdx');a.mov('r10',10);a.lea('r11',{base:'rsp',disp:200});a.mov('r9','r11');
    a.label('cand.digits');a.xor('rdx','rdx');a.div('r10');a.add('rdx',48);a.store({base:'r11'},'rdx',8);a.add('r11',1);a.test('rax','rax');a.jcc('ne','cand.digits');
    a.label('cand.reverse');a.sub('r11',1);a.load('rax',{base:'r11'},8);a.store({base:'rdi'},'rax',16);a.add('rdi',2);a.cmp('r11','r9');a.jcc('a','cand.reverse');a.mov('rax',101);a.store({base:'rdi'},'rax',16);a.add('rdi',2);a.cmp('r12',0);a.jcc('ge','cand.exp');a.neg('r12');a.mov('rax',45);a.store({base:'rdi'},'rax',16);a.add('rdi',2);
    a.label('cand.exp');a.mov('rax','r12');a.mov('r11','r9');a.label('cand.expDigits');a.xor('rdx','rdx');a.div('r10');a.add('rdx',48);a.store({base:'r11'},'rdx',8);a.add('r11',1);a.test('rax','rax');a.jcc('ne','cand.expDigits');a.label('cand.expReverse');a.sub('r11',1);a.load('rax',{base:'r11'},8);a.store({base:'rdi'},'rax',16);a.add('rdi',2);a.cmp('r11','r9');a.jcc('a','cand.expReverse');a.sub('rdi','rsi');a.sub('rdi',8);a.shr('rdi',1);a.store({base:'rsi'},'rdi');a.mov('rax','rsi');f.end(b);
  }
  // The general path keeps its big integers, digit buffer and text in the
  // frame (SCRATCH bytes above the register area) rather than in a managed
  // allocation: a program that formats many numbers would otherwise leave
  // 4 KiB of garbage per number and spend most of its time collecting it.
  const SCRATCH=4096,f=new Native('rt.formatNumber',360+SCRATCH),a=f.a;
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p','fmt.fast');a.jcc('b','fmt.fast');
  a.mov('rax',4294967295);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('a','fmt.fast');
  a.cvttsd2si('r12','xmm0');a.cvtsi2sd('xmm1','r12');a.ucomisd('xmm0','xmm1');a.jcc('ne','fmt.fast');
  a.lea('rsi',{base:'rsp',disp:200});a.mov('rdi','rsi');a.mov('rax','r12');a.mov('r10',10);
  a.label('fmt.uintDigits');a.xor('rdx','rdx');a.div('r10');a.add('rdx',48);a.store({base:'rdi'},'rdx',8);a.add('rdi',1);a.test('rax','rax');a.jcc('ne','fmt.uintDigits');
  a.mov('r13','rdi');a.sub('r13','rsi');a.mov('rcx','r13');a.shl('rcx',1);a.add('rcx',8);a.call('rt.allocRaw');a.mov('r14','rax');a.store({base:'r14'},'r13');a.lea('rdi',{base:'r14',disp:8});
  a.label('fmt.uintCopy');a.sub('r13',1);a.lea('r11',{base:'rsi'});a.add('r11','r13');a.load('rax',{base:'r11'},8);a.store({base:'rdi'},'rax',16);a.add('rdi',2);a.test('r13','r13');a.jcc('ne','fmt.uintCopy');a.mov('rax','r14');a.jmp('fmt.return');
  // Short decimals: a value below 2^53 for which some n = round(value * 10^k)
  // with k <= 6 and n below 2^52 gives the value back as n / 10^k. The
  // quotient is correctly rounded, so the decimal n * 10^-k parses to the
  // value, and n is unique at that scale because 10^-k exceeds the value's
  // ulp; with the smallest such k it is the shortest round-tripping digit
  // string, which is what Number::toString asks for, and the layout is the
  // plain fixed one (no exponent below 1e21, none down to 1e-6). Covers
  // prices, coordinates and the like without the exact big-integer search.
  a.label('fmt.fast');
  a.movqFromXmm('r12','xmm0');a.mov('rax',0x7fffffffffffffffn);a.and('r12','rax');a.test('r12','r12');a.jcc('e','fmt.general');
  a.movqToXmm('xmm1','r12');a.mov('rax',0x4340000000000000n);a.movqToXmm('xmm4','rax');a.ucomisd('xmm1','xmm4');a.jcc('p','fmt.general');a.jcc('ae','fmt.general');
  a.mov('rax',0x3ff0000000000000n);a.movqToXmm('xmm2','rax');a.mov('rax',0x4024000000000000n);a.movqToXmm('xmm5','rax');a.mov('r13',0);
  a.label('fmt.fastLoop');a.movsd('xmm3','xmm1');a.mulsd('xmm3','xmm2');a.cvtsd2si('rax','xmm3');a.mov('r10',1n<<52n);a.cmp('rax','r10');a.jcc('ae','fmt.general');
  a.cvtsi2sd('xmm4','rax');a.divsd('xmm4','xmm2');a.ucomisd('xmm4','xmm1');a.jcc('p','fmt.fastNext');a.jcc('ne','fmt.fastNext');a.jmp('fmt.fastFound');
  a.label('fmt.fastNext');a.add('r13',1);a.cmp('r13',6);a.jcc('a','fmt.general');a.mulsd('xmm2','xmm5');a.jmp('fmt.fastLoop');
  // n in RAX, k in R13: the digits of n (at least k + 1 of them) reversed in the frame.
  a.label('fmt.fastFound');a.mov('r10',10);
  a.label('fmt.fastStrip');a.test('r13','r13');a.jcc('e','fmt.fastStripped');a.mov('r11','rax');a.xor('rdx','rdx');a.div('r10');a.test('rdx','rdx');a.jcc('ne','fmt.fastStripRestore');a.sub('r13',1);a.jmp('fmt.fastStrip');
  a.label('fmt.fastStripRestore');a.mov('rax','r11');
  a.label('fmt.fastStripped');a.lea('rsi',{base:'rsp',disp:200});a.mov('rdi','rsi');
  a.label('fmt.fastDigits');a.xor('rdx','rdx');a.div('r10');a.add('rdx',48);a.store({base:'rdi'},'rdx',8);a.add('rdi',1);a.test('rax','rax');a.jcc('ne','fmt.fastDigits');
  a.label('fmt.fastPad');a.mov('rax','rdi');a.sub('rax','rsi');a.cmp('rax','r13');a.jcc('a','fmt.fastPadded');a.mov('rax',48);a.store({base:'rdi'},'rax',8);a.add('rdi',1);a.jmp('fmt.fastPad');
  a.label('fmt.fastPadded');a.mov('r14','rdi');a.sub('r14','rsi');a.movqFromXmm('rbx','xmm0');a.shr('rbx',63);
  a.mov('r15','r14');a.add('r15','rbx');a.test('r13','r13');a.jcc('e','fmt.fastNoPoint');a.add('r15',1);a.label('fmt.fastNoPoint');
  a.mov('rcx','r15');a.shl('rcx',1);a.add('rcx',8);a.call('rt.allocRaw');f.set(0,'rax');a.store({base:'rax'},'r15');a.lea('r9',{base:'rax',disp:8});
  a.test('rbx','rbx');a.jcc('e','fmt.fastUnsigned');a.mov('rax',45);a.store({base:'r9'},'rax',16);a.add('r9',2);a.label('fmt.fastUnsigned');
  // Integer digits, the point once they are out, then the fraction digits.
  a.mov('rcx','r14');a.sub('rcx','r13');
  a.label('fmt.fastWrite');a.test('r14','r14');a.jcc('e','fmt.fastDone');a.sub('rdi',1);a.load('rax',{base:'rdi'},8);a.store({base:'r9'},'rax',16);a.add('r9',2);a.sub('r14',1);
  a.sub('rcx',1);a.jcc('ne','fmt.fastWrite');a.test('r13','r13');a.jcc('e','fmt.fastWrite');a.mov('rax',46);a.store({base:'r9'},'rax',16);a.add('r9',2);a.jmp('fmt.fastWrite');
  a.label('fmt.fastDone');f.get('rax',0);a.jmp('fmt.return');
  a.label('fmt.general');
  a.movqFromXmm('r12','xmm0');f.set(0,'r12');a.mov('rax',0x7fffffffffffffffn);a.and('r12','rax');f.set(1,'r12');a.lea('rsi',{base:'rsp',disp:360});a.lea('rdi',{base:'rsi',disp:BIG_BYTES});f.set(2,'rdi');a.lea('rax',{base:'rsi',disp:2200});f.set(3,'rax');a.lea('rax',{base:'rsi',disp:2400});f.set(4,'rax');a.lea('r15',{base:'rax',disp:8});f.imm(5,0);
  a.mov('rax',0x7ff0000000000000n);a.cmp('r12','rax');a.jcc('a','fmt.nan');a.jcc('e','fmt.infinity');a.test('r12','r12');a.jcc('e','fmt.zero');
  // Exact decimal integer S and decimal scale: x = S * 10^scale.
  a.mov('r13','r12');a.shr('r13',52);a.mov('rdx',0xfffffffffffffn);a.and('rdx','r12');a.test('r13','r13');a.jcc('e','fmt.subnormal');a.mov('rax',0x10000000000000n);a.or('rdx','rax');a.sub('r13',1075);a.jmp('fmt.init');a.label('fmt.subnormal');a.mov('r13',-1074);a.label('fmt.init');a.mov('rcx','rsi');a.call('num.init');a.cmp('r13',0);a.jcc('l','fmt.power5');a.mov('rcx','rsi');a.mov('rdx','r13');a.call('num.shl');a.xor('r13','r13');a.jmp('fmt.decimal');a.label('fmt.power5');a.mov('r14','r13');a.neg('r14');a.label('fmt.powerLoop');a.mov('rcx','rsi');a.mov('rdx',5);a.call('num.mul');a.sub('r14',1);a.jcc('ne','fmt.powerLoop');
  a.label('fmt.decimal');a.mov('rcx','rsi');a.mov('rdx',10);a.call('num.divSmall');a.store({base:'rdi'},'rax',8);a.add('rdi',1);a.mov('rcx','rsi');a.call('num.bits');a.test('rax','rax');a.jcc('ne','fmt.decimal');f.get('rax',2);a.mov('r14','rdi');a.sub('r14','rax');f.set(6,'r14');a.add('r13','r14');f.set(7,'r13'); // k = decimal point position
  a.xor('r12','r12');a.mov('r13',1); // prefix q, precision n
  a.label('fmt.precision');f.get('rax',6);a.sub('rax','r13');f.get('rdx',2);a.add('rdx','rax');a.load('rax',{base:'rdx'},8);a.mov('rdx',10);a.imul('r12','rdx');a.add('r12','rax');f.set(8,'r12');f.set(9,'r13');
  // Select closest candidate, ties to even, using exact discarded digits.
  a.xor('r14','r14');f.get('rax',6);a.sub('rax','r13');a.cmp('rax',0);a.jcc('le','fmt.try');a.sub('rax',1);f.get('rdx',2);a.add('rdx','rax');a.load('rcx',{base:'rdx'},8);a.cmp('rcx',5);a.jcc('b','fmt.try');a.jcc('a','fmt.roundUp');a.test('rax','rax');a.jcc('e','fmt.tie');a.label('fmt.sticky');a.sub('rdx',1);a.load('rcx',{base:'rdx'},8);a.test('rcx','rcx');a.jcc('ne','fmt.roundUp');a.sub('rax',1);a.jcc('ne','fmt.sticky');a.label('fmt.tie');a.mov('rax','r12');a.and('rax',1);a.jcc('e','fmt.try');a.label('fmt.roundUp');a.mov('r14',1);
  a.label('fmt.try');f.set(10,'r14');a.mov('rdx','r12');a.add('rdx','r14');f.set(11,'rdx');f.get('r8',7);a.sub('r8','r13');f.set(12,'r8');f.get('rcx',3);a.call('num.candidate');a.mov('rcx','rax');a.call('rt.parseNumber');a.movqFromXmm('rax','xmm0');f.get('rdx',1);a.cmp('rax','rdx');a.jcc('e','fmt.selected');
  f.get('r14',10);a.xor('r14',1);f.get('rdx',8);a.add('rdx','r14');f.set(11,'rdx');f.get('r8',12);f.get('rcx',3);a.call('num.candidate');a.mov('rcx','rax');a.call('rt.parseNumber');a.movqFromXmm('rax','xmm0');f.get('rdx',1);a.cmp('rax','rdx');a.jcc('e','fmt.selected');f.get('r12',8);f.get('r13',9);a.add('r13',1);a.jmp('fmt.precision');
  a.label('fmt.selected');f.get('r12',11);f.get('r13',12);a.mov('r10',10);
  a.label('fmt.strip');a.mov('rax','r12');a.xor('rdx','rdx');a.div('r10');a.test('rdx','rdx');a.jcc('ne','fmt.qdigits');a.mov('r12','rax');a.add('r13',1);a.jmp('fmt.strip');
  a.label('fmt.qdigits');f.get('rdi',2);a.mov('rax','r12');a.label('fmt.qloop');a.xor('rdx','rdx');a.div('r10');a.add('rdx',48);a.store({base:'rdi'},'rdx',8);a.add('rdi',1);a.test('rax','rax');a.jcc('ne','fmt.qloop');f.get('rax',2);a.mov('r14','rdi');a.sub('r14','rax');a.add('r13','r14'); // K = digits + scale
  f.get('rax',0);a.shr('rax',63);a.test('rax','rax');a.jcc('e','fmt.layout');a.mov('rax',45);a.store({base:'r15'},'rax',16);a.add('r15',2);
  a.label('fmt.layout');a.cmp('r13',0);a.jcc('le','fmt.small');a.cmp('r13',21);a.jcc('g','fmt.scientific');a.mov('r12','r13');
  a.label('fmt.fixedloop');a.cmp('r14',0);a.jcc('le','fmt.pad');a.sub('rdi',1);a.load('rax',{base:'rdi'},8);a.sub('r14',1);a.jmp('fmt.fixedwrite');a.label('fmt.pad');a.mov('rax',48);a.label('fmt.fixedwrite');a.store({base:'r15'},'rax',16);a.add('r15',2);a.sub('r12',1);a.jcc('ne','fmt.fixedloop');a.test('r14','r14');a.jcc('e','fmt.finish');a.mov('rax',46);a.store({base:'r15'},'rax',16);a.add('r15',2);a.jmp('fmt.tail');
  a.label('fmt.small');a.cmp('r13',-6);a.jcc('le','fmt.scientific');a.mov('rax',48);a.store({base:'r15'},'rax',16);a.mov('rax',46);a.store({base:'r15',disp:2},'rax',16);a.add('r15',4);a.neg('r13');a.test('r13','r13');a.jcc('e','fmt.tail');a.label('fmt.leading');a.mov('rax',48);a.store({base:'r15'},'rax',16);a.add('r15',2);a.sub('r13',1);a.jcc('ne','fmt.leading');
  a.label('fmt.tail');a.sub('rdi',1);a.load('rax',{base:'rdi'},8);a.store({base:'r15'},'rax',16);a.add('r15',2);a.sub('r14',1);a.jcc('ne','fmt.tail');a.jmp('fmt.finish');
  a.label('fmt.scientific');a.sub('rdi',1);a.load('rax',{base:'rdi'},8);a.store({base:'r15'},'rax',16);a.add('r15',2);a.sub('r14',1);a.jcc('e','fmt.exponent');a.mov('rax',46);a.store({base:'r15'},'rax',16);a.add('r15',2);a.label('fmt.scitail');a.sub('rdi',1);a.load('rax',{base:'rdi'},8);a.store({base:'r15'},'rax',16);a.add('r15',2);a.sub('r14',1);a.jcc('ne','fmt.scitail');
  a.label('fmt.exponent');a.mov('rax',101);a.store({base:'r15'},'rax',16);a.add('r15',2);a.sub('r13',1);a.mov('rax',43);a.cmp('r13',0);a.jcc('ge','fmt.expsign');a.mov('rax',45);a.neg('r13');a.label('fmt.expsign');a.store({base:'r15'},'rax',16);a.add('r15',2);f.get('rdi',2);a.mov('rax','r13');a.mov('r10',10);a.xor('r14','r14');a.label('fmt.expdivide');a.xor('rdx','rdx');a.div('r10');a.add('rdx',48);a.store({base:'rdi'},'rdx',8);a.add('rdi',1);a.add('r14',1);a.test('rax','rax');a.jcc('ne','fmt.expdivide');a.jmp('fmt.tail');
  a.label('fmt.infinity');f.get('rax',0);a.shr('rax',63);a.test('rax','rax');a.jcc('e','fmt.inftext');a.mov('rax',45);a.store({base:'r15'},'rax',16);a.add('r15',2);a.label('fmt.inftext');writeText('Infinity');a.jmp('fmt.finish');a.label('fmt.nan');writeText('NaN');a.jmp('fmt.finish');a.label('fmt.zero');writeText('0');
  // The text was built in the frame: allocate the string of exactly that length and copy it.
  a.label('fmt.finish');f.get('rax',4);a.sub('r15','rax');a.sub('r15',8);a.shr('r15',1);a.mov('r13','r15');a.mov('rcx','r13');a.shl('rcx',1);a.add('rcx',8);a.call('rt.allocRaw');a.mov('r14','rax');a.store({base:'rax'},'r13');
  f.get('rsi',4);a.add('rsi',8);a.lea('rdi',{base:'rax',disp:8});a.label('fmt.copy');a.test('r13','r13');a.jcc('e','fmt.copied');a.load('rax',{base:'rsi'},16);a.store({base:'rdi'},'rax',16);a.add('rsi',2);a.add('rdi',2);a.sub('r13',1);a.jmp('fmt.copy');
  a.label('fmt.copied');a.mov('rax','r14');a.label('fmt.return');f.end(b);
  function writeText(s:string){for(const c of s){a.mov('rax',c.charCodeAt(0));a.store({base:'r15'},'rax',16);a.add('r15',2);}}
}
