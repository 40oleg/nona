import type {RuntimeBundle} from '../abi.js';
import {Native} from './native.js';
import {currentNativeTarget} from '../../backend/machine/context.js';
import {getTarget} from '../../target.js';

const SIGN=0x8000000000000000n;
const ABS=0x7fffffffffffffffn;
const INF=0x7ff0000000000000n;
const QNAN=0x7ff8000000000000n;
const ONE=0x3ff0000000000000n;
const TWO=0x4000000000000000n;
const HALF=0x3fe0000000000000n;

/** Standalone binary64 power using ES special cases and the x87 log2/exp2 core. */
export function emitPower(bundle:RuntimeBundle):void {
 const f=new Native('rt.numberPow'),a=f.a;
 const done='pow.done';
 const answer=(bits:bigint)=>{a.mov('rax',bits);a.movqToXmm('xmm0','rax');a.jmp(done);};
 const from=(reg:'r12'|'r13'|'r14'|'r15')=>{a.movqToXmm('xmm0',reg);a.jmp(done);};

 // Preserve exact operand bits in nonvolatile registers.
 a.movqFromXmm('r12','xmm0');a.movqFromXmm('r13','xmm1');
 a.mov('r14','r12');a.mov('rax',ABS);a.and('r14','rax');
 a.mov('r15','r13');a.and('r15','rax');

 // y == +/-0, before all NaN handling.
 a.test('r15','r15');a.jcc('ne','pow.nan');answer(ONE);
 a.label('pow.nan');
 // Any remaining NaN operand produces the canonical quiet NaN.
 a.mov('rax',INF);a.cmp('r14','rax');a.jcc('a','pow.qnan');a.cmp('r15','rax');a.jcc('a','pow.qnan');

 // Classify a finite exponent: 0 noninteger, 1 odd integer, 2 even integer.
 a.mov('rbx',0);a.cmp('r15','rax');a.jcc('ae','pow.yClassDone');
 a.mov('rax',ONE);a.cmp('r15','rax');a.jcc('b','pow.yClassDone');
 a.mov('rax',0x4340000000000000n);a.cmp('r15','rax');a.jcc('ae','pow.yEven');
 a.mov('r10','r15');a.shr('r10',52);a.and('r10',0x7ff);a.sub('r10',0x3ff); // unbiased exponent
 a.mov('r11',52);a.sub('r11','r10'); // fractional bit count
 a.mov('rcx','r11');
 a.mov('rax',1);a.shl('rax','cl');a.sub('rax',1);
 a.mov('rdx','r15');a.and('rdx','rax');a.test('rdx','rdx');a.jcc('ne','pow.yClassDone');
 a.mov('rdx','r15');a.shr('rdx','cl');a.and('rdx',1);a.mov('rbx',2);a.sub('rbx','rdx');a.jmp('pow.yClassDone');
 a.label('pow.yEven');a.mov('rbx',2);
 a.label('pow.yClassDone');

 // Infinite exponent is determined only by |x| relative to one.
 a.mov('rax',INF);a.cmp('r15','rax');a.jcc('ne','pow.baseSpecial');
 a.mov('rax',ONE);a.cmp('r14','rax');a.jcc('e','pow.qnan');
 a.test('r13','r13');a.jcc('s','pow.yInfNegative');
 a.cmp('r14','rax');a.jcc('a','pow.inf');a.jmp('pow.zero');
 a.label('pow.yInfNegative');a.cmp('r14','rax');a.jcc('a','pow.zero');a.jmp('pow.inf');

 a.label('pow.baseSpecial');
 // +/-0 and +/-Infinity use the exponent sign and odd parity.
 a.test('r14','r14');a.jcc('e','pow.zeroOrInf');
 a.mov('rax',INF);a.cmp('r14','rax');a.jcc('e','pow.zeroOrInf');
 a.jmp('pow.baseOne');
 a.label('pow.zeroOrInf');
 a.mov('rax','r14');a.movqToXmm('xmm0','rax');
 a.test('r13','r13');a.jcc('ns','pow.zeroInfSign');
 a.mov('rax',ONE);a.movqToXmm('xmm1','rax');a.divsd('xmm1','xmm0');a.movsd('xmm0','xmm1');
 a.label('pow.zeroInfSign');
 a.test('r12','r12');a.jcc('ns',done);a.cmp('rbx',1);a.jcc('ne',done);
 a.movqFromXmm('rax','xmm0');a.mov('rdx',SIGN);a.xor('rax','rdx');a.movqToXmm('xmm0','rax');a.jmp(done);

 a.label('pow.baseOne');
 a.mov('rax',ONE);a.cmp('r14','rax');a.jcc('ne','pow.simpleExponent');
 a.test('r12','r12');a.jcc('ns','pow.one');a.test('rbx','rbx');a.jcc('e','pow.qnan');
 a.cmp('rbx',1);a.jcc('e','pow.minusOne');a.jmp('pow.one');

 a.label('pow.simpleExponent');
 // y == +/-1, 2, and positive-base 0.5 fast paths.
 a.mov('rax',ONE);a.cmp('r15','rax');a.jcc('ne','pow.yTwo');
 a.test('r13','r13');a.jcc('ns','pow.original');
 a.mov('rax',ONE);a.movqToXmm('xmm0','rax');a.movqToXmm('xmm1','r12');a.divsd('xmm0','xmm1');a.jmp(done);
 a.label('pow.yTwo');a.mov('rax',TWO);a.cmp('r13','rax');a.jcc('ne','pow.yHalf');
 a.movqToXmm('xmm0','r12');a.mulsd('xmm0','xmm0');a.jmp(done);
 a.label('pow.yHalf');a.mov('rax',HALF);a.cmp('r13','rax');a.jcc('ne','pow.negativeBase');
 a.test('r12','r12');a.jcc('s','pow.negativeBase');a.movqToXmm('xmm0','r12');a.sqrtsd('xmm0','xmm0');a.jmp(done);

 a.label('pow.negativeBase');
 a.mov('rsi',0);a.test('r12','r12');a.jcc('ns','pow.core');
 a.test('rbx','rbx');a.jcc('e','pow.qnan');a.cmp('rbx',1);a.jcc('ne','pow.core');a.mov('rsi',SIGN);

 a.label('pow.core');
 // Store |x| and y in the low scratch slots used by the x87 sequence.
 a.store({base:'rsp',disp:96},'r14');a.store({base:'rsp',disp:104},'r13');
 if(getTarget(currentNativeTarget()??'')?.arch==='arm64'){
   a.movsd('xmm0',{base:'rsp',disp:96});a.call('rt.armMath.log');a.mulsd('xmm0',{base:'rsp',disp:104});a.call('rt.armMath.exp');a.movqFromXmm('rax','xmm0');
 }else {
 // fld y; fld |x|; fyl2x => y*log2(|x|)
 a.emit([0xdd,0x44,0x24,104,0xdd,0x44,0x24,96,0xd9,0xf1]);
 // Split at the nearest integer, calculate 2^fraction, then scale by 2^integer.
 a.emit([0xd9,0xc0,0xd9,0xfc,0xd9,0xc9,0xd8,0xe1,0xd9,0xf0,0xd9,0xe8,0xde,0xc1,0xd9,0xfd,0xdd,0xd9]);
 // fstp qword [rsp+112]
 a.emit([0xdd,0x5c,0x24,112]);a.load('rax',{base:'rsp',disp:112});
 }
 a.xor('rax','rsi');a.movqToXmm('xmm0','rax');a.jmp(done);

 a.label('pow.original');from('r12');
 a.label('pow.one');answer(ONE);
 a.label('pow.minusOne');answer(0xbff0000000000000n);
 a.label('pow.zero');answer(0n);
 a.label('pow.inf');answer(INF);
 a.label('pow.qnan');answer(QNAN);
 a.label(done);f.end(bundle);
}
