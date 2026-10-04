import {RuntimeBuilder} from '../../runtime/abi.js';
import type {Assembler,Xmm} from '../x64/assembler.js';
import {Arm64Assembler} from './assembler.js';
import {withNativeTarget} from '../machine/context.js';
import {linkElf} from '../elf/writer.js';

/* Range reduction constants follow Sun fdlibm/openlibm e_log.c and e_exp.c.
 * Copyright (C) 1993, 2004 by Sun Microsystems, Inc. All rights reserved.
 * Permission to use, copy, modify, and distribute this software is freely
 * granted, provided that this notice is preserved.
 * The approximations below use ordinary convergent power series.
 */
const INF=0x7ff0000000000000n,SIGN=0x8000000000000000n,ABS=0x7fffffffffffffffn,QNAN=0x7ff8000000000000n;
const bits=(value:number)=>{const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,value,true);return b.getBigUint64(0,true);};
function constant(a:Assembler,register:Xmm,value:number):void {a.mov('rax',bits(value));a.movqToXmm(register,'rax');}
function answer(a:Assembler,value:bigint,done:string):void {a.mov('rax',value);a.movqToXmm('xmm0','rax');a.jmp(done);}
const ln2High=6.93147180369123816490e-1,ln2Low=1.90821492927058770002e-10;
export const arm64MathCases=[
  ...[-1,-0,0,Number.MIN_VALUE,1e-300,.5,1,1+Number.EPSILON,2,10,1000,1e300,Infinity,NaN].map(input=>({name:'log',input,expected:Math.log(input)})),
  ...[-Infinity,-1000,-746,-745,-710,-10,-1,-0,0,.5,1,10,100,709,709.7827,710,NaN,Infinity].map(input=>({name:'exp',input,expected:Math.exp(input)})),
];

/** Native execution gate, including signed zeros, subnormals and non-finites. */
export function arm64MathProbe():Uint8Array {
  return withNativeTarget('linux-arm64',()=>{
    const b=new RuntimeBuilder();emitArm64Math(b);
    const a=new Arm64Assembler('math.start');a.initializeStack();
    const failures:{label:string;stage:number}[]=[];
    for(const [index,c] of arm64MathCases.entries()){
      const failed=a.unique('mathFailure');failures.push({label:failed,stage:index+1});
      constant(a,'xmm0',c.input);a.call('rt.armMath.'+c.name);
      if(Number.isNaN(c.expected)){a.ucomisd('xmm0','xmm0');a.jcc('np',failed);}
      else if(!Number.isFinite(c.expected)||c.expected===0){a.movqFromXmm('r10','xmm0');a.mov('rax',bits(c.expected));a.cmp('rax','r10');a.jcc('ne',failed);}
      else {
        constant(a,'xmm1',c.expected);a.subsd('xmm0','xmm1');a.movqFromXmm('rax','xmm0');a.mov('r10',ABS);a.and('rax','r10');a.movqToXmm('xmm0','rax');
        constant(a,'xmm1',Math.max(Number.MIN_VALUE*2,Math.abs(c.expected)*4e-14));a.ucomisd('xmm0','xmm1');a.jcc('p',failed);a.jcc('a',failed);
      }
    }
    a.mov('rdi',1);a.lea('rsi',{rip:'math.message'});a.mov('rdx',6);a.syscall(64);a.mov('rdi',0);a.syscall(93);
    for(const failure of failures){a.label(failure.label);a.mov('rdi',failure.stage);a.syscall(93);}
    return linkElf({entry:'math.start',imports:[],functions:[],fragments:[
      {...a.finish(),name:'math.start',section:'.text'},...b.bundle.fragments,
      {name:'math.message',section:'.rdata',bytes:new TextEncoder().encode('hello\n'),symbols:{},fixups:[]},
    ]},{machine:'arm64'});
  });
}

/** Self-contained binary64 helpers: input/result in XMM0, volatile scratch only. */
export function emitArm64Math(b:RuntimeBuilder):void {
  b.fn('rt.armMath.log',88,a=>{
    const zero=a.unique('logZero'),invalid=a.unique('logInvalid'),special=a.unique('logSpecial'),normal=a.unique('logNormal'),normalized=a.unique('logNormalized'),done=a.unique('logDone');
    a.movqFromXmm('rax','xmm0');a.mov('r10',ABS);a.and('r10','rax');a.test('r10','r10');a.jcc('e',zero);
    a.mov('r11',INF);a.cmp('r10','r11');a.jcc('ae',special);a.test('rax','rax');a.jcc('s',invalid);
    a.mov('r9','rax');a.shr('r9',52);a.test('r9','r9');a.jcc('ne',normal);
    // Scaling makes subnormal significands normal without losing any bits.
    constant(a,'xmm1',2**54);a.mulsd('xmm0','xmm1');a.movqFromXmm('rax','xmm0');a.mov('r9','rax');a.shr('r9',52);a.sub('r9',54);
    a.label(normal);a.sub('r9',1023);a.mov('r10',0x000fffffffffffffn);a.and('rax','r10');a.mov('r10',bits(1));a.or('rax','r10');a.movqToXmm('xmm0','rax');
    constant(a,'xmm1',Math.SQRT2);a.ucomisd('xmm0','xmm1');a.jcc('be',normalized);
    constant(a,'xmm1',.5);a.mulsd('xmm0','xmm1');a.add('r9',1);a.label(normalized);
    // log(m) = 2 * atanh((m-1)/(m+1)); |z| <= 0.1716.
    constant(a,'xmm1',1);a.subsd('xmm0','xmm1');constant(a,'xmm1',2);a.addsd('xmm1','xmm0');a.divsd('xmm0','xmm1');
    a.movsd('xmm2','xmm0');a.mulsd('xmm2','xmm2');constant(a,'xmm3',1/39);
    for(let denominator=37;denominator>=3;denominator-=2){a.mulsd('xmm3','xmm2');constant(a,'xmm1',1/denominator);a.addsd('xmm3','xmm1');}
    a.mulsd('xmm3','xmm2');constant(a,'xmm1',1);a.addsd('xmm3','xmm1');a.mulsd('xmm0','xmm3');constant(a,'xmm1',2);a.mulsd('xmm0','xmm1');
    a.cvtsi2sd('xmm2','r9');constant(a,'xmm1',ln2Low);a.mulsd('xmm1','xmm2');a.addsd('xmm0','xmm1');
    constant(a,'xmm1',ln2High);a.mulsd('xmm1','xmm2');a.addsd('xmm0','xmm1');a.jmp(done);
    a.label(special);a.cmp('r10','r11');a.jcc('a',done);a.test('rax','rax');a.jcc('ns',done);
    a.label(invalid);answer(a,QNAN,done);a.label(zero);answer(a,INF|SIGN,done);a.label(done);
  });
  b.fn('rt.armMath.exp',88,a=>{
    const special=a.unique('expSpecial'),zero=a.unique('expZero'),one=a.unique('expOne'),overflow=a.unique('expOverflow'),scale=a.unique('expScale'),small=a.unique('expSmall'),scaled=a.unique('expScaled'),done=a.unique('expDone');
    a.movqFromXmm('rax','xmm0');a.mov('r10',ABS);a.and('r10','rax');a.mov('r11',INF);a.cmp('r10','r11');a.jcc('ae',special);
    a.test('r10','r10');a.jcc('e',one);
    constant(a,'xmm1',709.782712893383973096);a.ucomisd('xmm0','xmm1');a.jcc('a',overflow);
    constant(a,'xmm1',-745.133219101941108420);a.ucomisd('xmm0','xmm1');a.jcc('b',zero);
    constant(a,'xmm1',Math.LOG2E);a.mulsd('xmm1','xmm0');a.cvtsd2si('r9','xmm1');a.cvtsi2sd('xmm2','r9');
    constant(a,'xmm1',ln2High);a.mulsd('xmm1','xmm2');a.subsd('xmm0','xmm1');
    constant(a,'xmm1',ln2Low);a.mulsd('xmm1','xmm2');a.subsd('xmm0','xmm1');
    // Taylor on |r| <= ln(2)/2, followed by exact powers of two.
    let factorial=1;const reciprocal:number[]=[1];for(let i=1;i<=18;i++){factorial*=i;reciprocal.push(1/factorial);}
    constant(a,'xmm3',reciprocal[18]!);
    for(let i=17;i>=0;i--){a.mulsd('xmm3','xmm0');constant(a,'xmm1',reciprocal[i]!);a.addsd('xmm3','xmm1');}
    a.movsd('xmm0','xmm3');a.mov('r8',0);a.cmp('r9',1023);a.jcc('le',scaled);
    a.sub('r9',1);constant(a,'xmm1',2);a.mulsd('xmm0','xmm1');a.label(scaled);
    a.cmp('r9',-1022);a.jcc('l',small);a.jmp(scale);a.label(small);a.add('r9',54);a.mov('r8',1);
    a.label(scale);a.add('r9',1023);a.shl('r9',52);a.movqToXmm('xmm1','r9');a.mulsd('xmm0','xmm1');
    a.test('r8','r8');a.jcc('e',done);constant(a,'xmm1',2**-54);a.mulsd('xmm0','xmm1');a.jmp(done);
    a.label(special);a.cmp('r10','r11');a.jcc('a',done);a.movqFromXmm('rax','xmm0');a.test('rax','rax');a.jcc('ns',done);
    a.label(zero);answer(a,0n,done);a.label(one);answer(a,bits(1),done);a.label(overflow);answer(a,INF,done);a.label(done);
  });
}
