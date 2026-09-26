import {RuntimeBuilder,slot} from '../abi.js';

// floor((2/pi) * 2^1152), little-endian for limb multiplication.
// Extra zero limbs allow the 53-bit significand to carry above the table.
const reciprocalHex='a2f9836e4e441529fc2757d1f534ddc0db6295993c439041fe5163abdebbc561b7246e3a424dd2e006492eea09d1921cfe1deb1cb129a73ee88235f52ebb4484e99c7026b45f7e413991d639835339f49c845f8bbdf9283b1ff897ffde05980fef2f118b5a0a6d1f6d367ecf27cb09b74f463f669e5fea2d7527bac7ebe5f17b3d0739f78a5292ea6bfb5fb11f8d5d08';

export function emitTrigReduce(b:RuntimeBuilder):void {
 const table=new Uint8Array(20*8),view=new DataView(table.buffer);
 for(let i=0;i<18;i++)view.setBigUint64(i*8,BigInt('0x'+reciprocalHex.slice(-(i+1)*16,i===0?undefined:-i*16)),true);
 b.data('rt.trig.twoOverPi',table,'.rdata');
 // Input: |x| >= 2^63 in XMM0, finite. Output: reduced angle in
 // [-pi/4, pi/4] in XMM0 and nearest quadrant modulo four in RAX.
 b.fn('rt.trigReduce',344,a=>{
  a.movqFromXmm('rax','xmm0');a.mov('r10','rax');a.shr('r10',52);a.and('r10',0x7ff);a.sub('r10',1075);a.store(slot(48),'r10'); // binary exponent after 53-bit significand
  a.mov('r10',0x000fffffffffffffn);a.and('rax','r10');a.mov('r10',0x0010000000000000n);a.or('rax','r10');a.store(slot(56),'rax');
  a.mov('rax',1152);a.load('r10',slot(48));a.sub('rax','r10');a.store(slot(64),'rax');
  a.mov('rax',0);a.store(slot(72),'rax');a.store(slot(40),'rax');
  const multiply=a.unique('multiply'),carry=a.unique('carry'),next=a.unique('next'),multiplyDone=a.unique('multiplyDone');
  a.label(multiply);a.load('r10',slot(40));a.cmp('r10',20);a.jcc('ae',multiplyDone);
  a.shl('r10',3);a.lea('r11',{rip:'rt.trig.twoOverPi'});a.add('r11','r10');a.load('r11',{base:'r11'});a.load('rax',slot(56));a.mul('r11');
  a.load('r10',slot(72));a.add('rax','r10');a.jcc('b',carry);a.jmp(next);a.label(carry);a.add('rdx',1);a.label(next);
  a.load('r10',slot(40));a.shl('r10',3);a.lea('r11',slot(128));a.add('r11','r10');a.store({base:'r11'},'rax');a.store(slot(72),'rdx');
  a.load('rax',slot(40));a.add('rax',1);a.store(slot(40),'rax');a.jmp(multiply);a.label(multiplyDone);
  // R8 = bit index in the 1280-bit product; RAX = that bit.
  const bit=()=>{a.mov('r10','r8');a.shr('r10',6);a.shl('r10',3);a.lea('r11',slot(128));a.add('r11','r10');a.load('rax',{base:'r11'});a.mov('rcx','r8');a.and('rcx',63);a.shr('rax','cl');a.and('rax',1);};
  a.load('r8',slot(64));bit();a.store(slot(80),'rax');a.load('r8',slot(64));a.add('r8',1);bit();a.shl('rax',1);a.load('r10',slot(80));a.or('rax','r10');a.store(slot(80),'rax');
  a.mov('rax',0);a.store(slot(88),'rax');a.store(slot(96),'rax');
  const fraction=a.unique('fraction'),fractionDone=a.unique('fractionDone');a.label(fraction);a.load('r10',slot(96));a.cmp('r10',64);a.jcc('ae',fractionDone);
  a.load('r8',slot(64));a.sub('r8',1);a.sub('r8','r10');bit();a.load('r10',slot(88));a.shl('r10',1);a.or('rax','r10');a.store(slot(88),'rax');
  a.load('rax',slot(96));a.add('rax',1);a.store(slot(96),'rax');a.jmp(fraction);a.label(fractionDone);
  a.load('rax',slot(88));const noRound=a.unique('noRound');a.test('rax','rax');a.jcc('ns',noRound);a.load('r10',slot(80));a.add('r10',1);a.and('r10',3);a.store(slot(80),'r10');a.label(noRound);
  // Signed conversion yields the centered fractional remainder directly.
  a.cvtsi2sd('xmm0','rax');a.mov('r10',0x3bf0000000000000n);a.movqToXmm('xmm1','r10');a.mulsd('xmm0','xmm1');
  a.mov('r10',0x3ff921fb54442d18n);a.movqToXmm('xmm1','r10');a.mulsd('xmm0','xmm1');a.load('rax',slot(80));
 });
}
