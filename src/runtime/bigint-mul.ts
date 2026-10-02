import {RuntimeBuilder,slot,failIf} from './abi.js';

/**
 * BigInt multiplication on base-10^9 limbs.
 *
 * BigInts are decimal strings (see bigint.ts), and the first rt.bigintMul
 * worked on that representation directly: for every digit of one factor it
 * scaled the product by ten and added the other factor that many times, so a
 * product cost O(n * m * 10) string additions, each allocating. The decimal
 * form is kept, but the multiplication converts both magnitudes to little-
 * endian base-10^9 limbs (nine digits each, so a limb product fits in 64
 * bits with room for the carry), runs the schoolbook O(n * m / 81) product
 * in raw scratch memory, and formats the limbs back into one exactly sized
 * decimal string: the top limb without leading zeros, every other limb
 * padded to nine digits. The scratch comes from the raw heap and is freed
 * before returning; the only managed allocation is the result.
 */
export function emitBigIntMul(b:RuntimeBuilder):void {
 const BASE=1000000000;
 // Frame: 40 out, 48 a record, 56 b record, 64 a digits start, 72 a digit count,
 // 80 b digits start, 88 b digit count, 96 sign, 104 a limbs, 112 b limbs,
 // 120 product limbs, 128 scratch block, 136 a limb count, 144 b limb count,
 // 152 product limb count, 160 result record, 168 write cursor, 176 loop i.
 b.fn('rt.bigintMul',200,a=>{
  a.store(slot(40),'rcx');a.load('rax',{base:'rdx',disp:8});a.store(slot(48),'rax');a.load('rax',{base:'r8',disp:8});a.store(slot(56),'rax');
  a.mov('rax',0);a.store(slot(96),'rax');
  const zero=a.unique('zero'),done=a.unique('done');
  // Magnitudes: a leading '-' flips the sign; a single "0" makes the product zero.
  for(const [record,start,count] of [[48,64,72],[56,80,88]] as const){
   const positive=a.unique('positive'),ready=a.unique('ready');
   a.load('r10',slot(record));a.load('r11',{base:'r10'});a.lea('r9',{base:'r10',disp:8});a.load('rax',{base:'r10',disp:8},16);a.cmp('rax',45);a.jcc('ne',positive);
   a.load('rax',slot(96));a.xor('rax',1);a.store(slot(96),'rax');a.add('r9',2);a.sub('r11',1);a.jmp(ready);
   a.label(positive);a.cmp('r11',1);a.jcc('ne',ready);a.cmp('rax',48);a.jcc('e',zero);
   a.label(ready);a.store(slot(start),'r9');a.store(slot(count),'r11');
  }
  // Limb counts: ceil(digits / 9); one scratch block holds both inputs (4 bytes
  // per limb) and the product (8 bytes per limb, zeroed).
  for(const [count,limbs] of [[72,136],[88,144]] as const){a.load('rax',slot(count));a.add('rax',8);a.mov('rdx',0);a.mov('r10',9);a.div('r10');a.store(slot(limbs),'rax');}
  a.load('rax',slot(136));a.load('r10',slot(144));a.add('rax','r10');a.store(slot(152),'rax');
  a.mov('r8','rax');a.shl('r8',3);a.load('rax',slot(136));a.load('r10',slot(144));a.add('rax','r10');a.shl('rax',2);a.add('r8','rax');
  a.load('rcx',{rip:'rt.heap'});a.mov('rdx',8);a.callImport('HeapAlloc');a.test('rax','rax');failIf(a,'e');a.store(slot(128),'rax');
  a.store(slot(104),'rax');a.load('r10',slot(136));a.shl('r10',2);a.add('rax','r10');a.store(slot(112),'rax');a.load('r10',slot(144));a.shl('r10',2);a.add('rax','r10');a.store(slot(120),'rax');
  // Decimal digits (most significant first) to limbs (least significant first).
  for(const [start,count,limbs] of [[64,72,104],[80,88,112]] as const){
   const outer=a.unique('limb'),inner=a.unique('digit'),innerDone=a.unique('digitsDone'),outerDone=a.unique('limbsDone');
   // RCX digits left, R10 end of digits, R11 limb cursor.
   a.load('rcx',slot(count));a.load('r10',slot(start));a.mov('rax','rcx');a.add('rax','rax');a.add('r10','rax');a.load('r11',slot(limbs));
   a.label(outer);a.test('rcx','rcx');a.jcc('e',outerDone);
   a.mov('r8',9);a.cmp('rcx','r8');a.jcc('ae','rt.bigintMul.fullLimb'+limbs);a.mov('r8','rcx');a.label('rt.bigintMul.fullLimb'+limbs);
   a.sub('rcx','r8');a.mov('rax','r8');a.add('rax','rax');a.sub('r10','rax');a.mov('r9','r10');a.mov('rax',0);
   a.label(inner);a.test('r8','r8');a.jcc('e',innerDone);a.mov('rdx','rax');a.shl('rax',3);a.add('rax','rdx');a.add('rax','rdx');a.load('rdx',{base:'r9'},16);a.sub('rdx',48);a.add('rax','rdx');a.add('r9',2);a.sub('r8',1);a.jmp(inner);
   a.label(innerDone);a.store({base:'r11'},'rax',32);a.add('r11',4);a.jmp(outer);
   a.label(outerDone);
  }
  // Schoolbook product with a running carry: P[i+j] += A[i] * B[j].
  {const outer=a.unique('row'),inner=a.unique('column'),innerDone=a.unique('columnDone'),outerDone=a.unique('rowsDone');
   a.mov('rax',0);a.store(slot(176),'rax');
   a.label(outer);a.load('rax',slot(176));a.load('r10',slot(136));a.cmp('rax','r10');a.jcc('ae',outerDone);
   // R9 = A[i], R11 = &P[i], RCX = j, R8 = carry.
   a.mov('r10','rax');a.shl('r10',2);a.load('r11',slot(104));a.add('r11','r10');a.load('r9',{base:'r11'},32);
   a.shl('rax',3);a.load('r11',slot(120));a.add('r11','rax');a.mov('rcx',0);a.mov('r8',0);
   a.label(inner);a.load('rax',slot(144));a.cmp('rcx','rax');a.jcc('ae',innerDone);
   a.load('r10',slot(112));a.mov('rax','rcx');a.shl('rax',2);a.add('r10','rax');a.load('rax',{base:'r10'},32);a.imul('rax','r9');a.add('rax','r8');a.load('r10',{base:'r11'});a.add('rax','r10');
   a.mov('r10',BASE);a.mov('rdx',0);a.div('r10');a.store({base:'r11'},'rdx');a.mov('r8','rax');
   a.add('r11',8);a.add('rcx',1);a.jmp(inner);
   a.label(innerDone);a.store({base:'r11'},'r8');
   a.load('rax',slot(176));a.add('rax',1);a.store(slot(176),'rax');a.jmp(outer);
   a.label(outerDone);}
  // Drop zero top limbs, size the result: top limb digits + 9 per other limb + sign.
  {const trim=a.unique('trim'),trimmed=a.unique('trimmed'),topDigits=a.unique('topDigits'),counted=a.unique('counted');
   a.load('rcx',slot(152));a.load('r11',slot(120));
   a.label(trim);a.cmp('rcx',1);a.jcc('be',trimmed);a.mov('rax','rcx');a.sub('rax',1);a.shl('rax',3);a.add('rax','r11');a.load('rax',{base:'rax'});a.test('rax','rax');a.jcc('ne',trimmed);a.sub('rcx',1);a.jmp(trim);
   a.label(trimmed);a.store(slot(152),'rcx');
   a.mov('rax','rcx');a.sub('rax',1);a.shl('rax',3);a.add('rax','r11');a.load('rax',{base:'rax'});a.mov('r8',0);a.mov('r10',10);
   a.label(topDigits);a.add('r8',1);a.mov('rdx',0);a.div('r10');a.test('rax','rax');a.jcc('ne',topDigits);
   a.mov('rax','rcx');a.sub('rax',1);a.mov('r10','rax');a.shl('rax',3);a.add('rax','r10');a.add('r8','rax');a.load('rax',slot(96));a.add('r8','rax');
   a.label(counted);a.store(slot(168),'r8');
   a.mov('rcx','r8');a.add('rcx','rcx');a.add('rcx',8);a.call('rt.allocRaw');a.store(slot(160),'rax');a.load('r8',slot(168));a.store({base:'rax'},'r8');}
  // Write: sign, then limbs from the top; every limb but the top is nine digits.
  {const sign=a.unique('unsigned'),limbs=a.unique('limbs'),limbsDone=a.unique('limbsDone'),digits=a.unique('digits'),digitsDone=a.unique('digitsDone');
   a.load('r9',slot(160));a.add('r9',8);a.load('rax',slot(96));a.test('rax','rax');a.jcc('e',sign);a.mov('rax',45);a.store({base:'r9'},'rax',16);a.add('r9',2);
   a.label(sign);a.load('rcx',slot(152));a.load('r11',slot(120));
   a.label(limbs);a.test('rcx','rcx');a.jcc('e',limbsDone);a.sub('rcx',1);
   a.mov('rax','rcx');a.shl('rax',3);a.add('rax','r11');a.load('rax',{base:'rax'});
   // Digits of the limb into the frame scratch (reversed), padded to nine unless it is the top one.
   a.lea('r8',slot(184));a.mov('r10',10);
   a.label(digits);a.mov('rdx',0);a.div('r10');a.add('rdx',48);a.store({base:'r8'},'rdx',8);a.add('r8',1);a.test('rax','rax');a.jcc('ne',digits);
   {const pad=a.unique('pad'),padded=a.unique('padded'),top=a.unique('top');a.load('rax',slot(152));a.sub('rax',1);a.cmp('rcx','rax');a.jcc('e',top);
    a.label(pad);a.lea('rax',slot(184));a.add('rax',9);a.cmp('r8','rax');a.jcc('ae',padded);a.mov('rax',48);a.store({base:'r8'},'rax',8);a.add('r8',1);a.jmp(pad);a.label(padded);a.label(top);}
   a.label(digitsDone);a.lea('rax',slot(184));a.cmp('r8','rax');a.jcc('be',limbs);a.sub('r8',1);a.load('rax',{base:'r8'},8);a.store({base:'r9'},'rax',16);a.add('r9',2);a.jmp(digitsDone);
   a.label(limbsDone);}
  a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.load('r8',slot(128));a.callImport('HeapFree');
  a.load('rcx',slot(40));a.mov('rax',7);a.store({base:'rcx'},'rax');a.load('rax',slot(160));a.store({base:'rcx',disp:8},'rax');a.jmp(done);
  a.label(zero);a.load('rcx',slot(40));a.mov('rax',7);a.store({base:'rcx'},'rax');a.lea('rax',{rip:'rt.bigint.zero'});a.store({base:'rcx',disp:8},'rax');
  a.label(done);
 });
}
