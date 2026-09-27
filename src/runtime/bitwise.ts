import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';

/** Number bitwise operations. Decode binary64 before narrowing: CVTTSD2SI alone
 * produces the wrong low bits outside the signed 64-bit range. */
export function emitBitwise(b:RuntimeBuilder):void {
  rootedFn(b,'rt.toInt32',72,[{kind:'value',register:'rcx'},{kind:'locals',offset:40,count:1}],a=>{
    a.mov('rdx','rcx');a.lea('rcx',slot(40));a.call('rt.toNumber');
    a.load('rax',slot(48));a.mov('r8','rax');a.shr('r8',63);
    a.mov('r10','rax');a.shr('r10',52);a.and('r10',0x7ff);
    const zero=a.unique('zero'),right=a.unique('right'),sign=a.unique('sign'),done=a.unique('done');
    a.cmp('r10',1023);a.jcc('b',zero);
    // Integers at exponent >=84 have at least 32 trailing zero bits.
    // This branch also handles infinities and NaNs.
    a.cmp('r10',1107);a.jcc('ae',zero);
    a.mov('r9',0x000fffffffffffffn);a.and('rax','r9');
    a.mov('r9',0x0010000000000000n);a.or('rax','r9');
    a.cmp('r10',1075);a.jcc('b',right);
    a.mov('rcx','r10');a.sub('rcx',1075);a.shl('rax','cl');a.jmp(sign);
    a.label(right);a.mov('rcx',1075);a.sub('rcx','r10');a.shr('rax','cl');
    a.label(sign);a.test('r8','r8');const positive=a.unique('positive');a.jcc('e',positive);a.neg('rax');
    a.label(positive);a.shl('rax',32);a.sar('rax',32);a.jmp(done);
    a.label(zero);a.mov('rax',0);a.label(done);
  });
  rootedFn(b,'rt.bitNot',104,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:2}],a=>{
    a.store(slot(40),'rcx');a.load('rax',{base:'rdx'});const numeric=a.unique('numeric'),done=a.unique('done');a.cmp('rax',7);a.jcc('ne',numeric);a.lea('rcx',slot(64));a.call('rt.bigintNeg');a.mov('rax',7);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.bigint.minusone'});a.store(slot(88),'rax');a.load('rcx',slot(40));a.lea('rdx',slot(64));a.lea('r8',slot(80));a.call('rt.bigintAdd');a.jmp(done);a.label(numeric);a.mov('rcx','rdx');a.call('rt.toInt32');a.not('rax');
    a.cvtsi2sd('xmm0','rax');a.load('rcx',slot(40));a.storesd({base:'rcx',disp:8},'xmm0');
    a.mov('rax',3);a.store({base:'rcx'},'rax');a.label(done);
  });
  for(const op of ['bitAnd','bitOr','bitXor','shiftLeft','shiftRight','shiftUnsigned']) {
    rootedFn(b,'rt.'+op,72,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'}],a=>{
      a.store(slot(40),'rcx');a.store(slot(48),'r8');
      const bigDone=a.unique('bigDone');
      if(op!=='shiftUnsigned'){
        const numeric=a.unique('numeric');a.load('rax',{base:'rdx'});a.cmp('rax',7);a.jcc('ne',numeric);a.load('rax',{base:'r8'});a.cmp('rax',7);a.jcc('ne',numeric);a.mov('r9',op==='shiftRight'||op==='bitOr'?1:op==='bitXor'?2:0);a.call(op==='shiftLeft'||op==='shiftRight'?'rt.bigintShift':'rt.bigintBitwise');a.jmp(bigDone);a.label(numeric);
      }
      a.mov('rcx','rdx');a.call('rt.toInt32');a.store(slot(56),'rax');
      a.load('rcx',slot(48));a.call('rt.toInt32');a.mov('rcx','rax');a.load('rax',slot(56));
      if(op==='bitAnd')a.and('rax','rcx');
      else if(op==='bitOr')a.or('rax','rcx');
      else if(op==='bitXor')a.xor('rax','rcx');
      else {
        a.and('rcx',31);
        if(op==='shiftLeft') {a.shl('rax','cl');a.shl('rax',32);a.sar('rax',32);}
        else if(op==='shiftRight')a.sar('rax','cl');
        else {a.shl('rax',32);a.shr('rax',32);a.shr('rax','cl');}
      }
      a.cvtsi2sd('xmm0','rax');a.load('rcx',slot(40));a.storesd({base:'rcx',disp:8},'xmm0');
      a.mov('rax',3);a.store({base:'rcx'},'rax');
      a.label(bigDone);
    });
  }
}
