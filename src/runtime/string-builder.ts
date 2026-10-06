import {RuntimeBuilder,slot,failIf} from './abi.js';
import type {Assembler} from '../backend/x64/assembler.js';

/**
 * String builder for native code that assembles a result piece by piece.
 *
 * Builtins such as Array.prototype.join and JSON.stringify accumulated their
 * result with rt.concat, which allocates a fresh string for every piece: both
 * time and memory were quadratic in the output size, and because no
 * safepoint runs inside a builtin, the intermediate strings stayed alive
 * until it returned — joining twenty thousand parts needed gigabytes.
 *
 * A builder is a 24-byte record on the caller's stack {buffer, length,
 * capacity} over a raw-heap UTF-16 buffer that doubles when it fills; the
 * pieces are copied once, and rt.builderFinish allocates the managed string
 * of exactly the final length. The record holds no Values, so it needs no
 * roots, and `length` may simply be stored back to drop what was appended
 * after a mark (JSON.stringify does this for a property whose value is
 * omitted).
 */
export const BuilderLayout={buffer:0,length:8,capacity:16,size:24} as const;
const B=BuilderLayout;

/** Copies R9 UTF-16 units from R10 to R11; clobbers the volatile registers. */
const copyUnits=(a:Assembler)=>{a.mov('rcx','r11');a.mov('rdx','r10');a.mov('r8','r9');a.add('r8','r8');a.call('rt.copyBytes');};

export function emitStringBuilder(b:RuntimeBuilder):void {
 // RCX builder (zeroed by its owner), RDX units to make room for.
 b.fn('rt.builderReserve',88,a=>{
  const done=a.unique('done'),grow=a.unique('grow'),fits=a.unique('fits'),noOld=a.unique('noOld');
  a.load('rax',{base:'rcx',disp:B.length});a.add('rax','rdx');a.load('r10',{base:'rcx',disp:B.capacity});a.cmp('rax','r10');a.jcc('be',done);
  a.store(slot(40),'rcx');a.store(slot(48),'rax');a.cmp('r10',128);a.jcc('ae',grow);a.mov('r10',128);
  a.label(grow);a.cmp('r10','rax');a.jcc('ae',fits);a.shl('r10',1);a.jmp(grow);
  a.label(fits);a.store(slot(56),'r10');a.mov('r8','r10');a.shl('r8',1);a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapAlloc');a.test('rax','rax');failIf(a,'e');a.store(slot(64),'rax');
  a.load('rcx',slot(40));a.load('r10',{base:'rcx',disp:B.buffer});a.store(slot(72),'r10');a.load('r9',{base:'rcx',disp:B.length});a.mov('r11','rax');copyUnits(a);
  a.load('r8',slot(72));a.test('r8','r8');a.jcc('e',noOld);a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');
  a.label(noOld);a.load('rcx',slot(40));a.load('rax',slot(64));a.store({base:'rcx',disp:B.buffer},'rax');a.load('rax',slot(56));a.store({base:'rcx',disp:B.capacity},'rax');
  a.label(done);
 });
 // RCX builder, RDX string record: appends its code units.
 // Short pieces that fit are copied here a unit at a time (no reserve call,
 // no copy call): separators, keys and small values are most pieces.
 b.fn('rt.builderAppend',56,a=>{
  const slow=a.unique('slow'),loop=a.unique('loop'),done=a.unique('done');
  a.load('r9',{base:'rdx'});a.cmp('r9',8);a.jcc('a',slow);
  a.load('r11',{base:'rcx',disp:B.length});a.lea('rax',{base:'r11'});a.add('rax','r9');a.load('r10',{base:'rcx',disp:B.capacity});a.cmp('rax','r10');a.jcc('a',slow);
  a.store({base:'rcx',disp:B.length},'rax');a.shl('r11',1);a.load('rax',{base:'rcx',disp:B.buffer});a.add('r11','rax');a.lea('r10',{base:'rdx',disp:8});
  a.label(loop);a.test('r9','r9');a.jcc('e',done);a.load('rax',{base:'r10'},16);a.store({base:'r11'},'rax',16);a.add('r10',2);a.add('r11',2);a.sub('r9',1);a.jmp(loop);
  a.label(slow);
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.load('rdx',{base:'rdx'});a.call('rt.builderReserve');
  a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r9',{base:'rdx'});a.lea('r10',{base:'rdx',disp:8});
  a.load('r11',{base:'rcx',disp:B.length});a.mov('rax','r11');a.add('rax','r9');a.store({base:'rcx',disp:B.length},'rax');
  a.shl('r11',1);a.load('rax',{base:'rcx',disp:B.buffer});a.add('r11','rax');copyUnits(a);
  a.label(done);
 });
 // RCX builder, RDX code unit: appends one unit.
 b.fn('rt.builderAppendUnit',56,a=>{
  {const slow=a.unique('slow'),done=a.unique('done');a.load('r11',{base:'rcx',disp:B.length});a.load('rax',{base:'rcx',disp:B.capacity});a.cmp('r11','rax');a.jcc('ae',slow);
   a.lea('rax',{base:'r11',disp:1});a.store({base:'rcx',disp:B.length},'rax');a.shl('r11',1);a.load('rax',{base:'rcx',disp:B.buffer});a.add('r11','rax');a.store({base:'r11'},'rdx',16);a.jmp('rt.builderAppendUnit.done.out');
   a.label(slow);}
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.mov('rdx',1);a.call('rt.builderReserve');
  a.load('rcx',slot(40));a.load('r11',{base:'rcx',disp:B.length});a.lea('rax',{base:'r11',disp:1});a.store({base:'rcx',disp:B.length},'rax');
  a.shl('r11',1);a.load('rax',{base:'rcx',disp:B.buffer});a.add('r11','rax');a.load('r8',slot(48));a.store({base:'r11'},'r8',16);
  a.label('rt.builderAppendUnit.done.out');
 });
 // RCX builder, RDX signed integer with |x| < 2^53: appends its decimal
 // digits (the same text Number::toString produces for it).
 b.fn('rt.builderAppendInteger',56,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.mov('rdx',17);a.call('rt.builderReserve');
  a.load('rcx',slot(40));a.load('r11',{base:'rcx',disp:B.length});a.shl('r11',1);a.load('rax',{base:'rcx',disp:B.buffer});a.add('r11','rax');
  a.load('rax',slot(48));const positive=a.unique('positive');a.test('rax','rax');a.jcc('ge',positive);
  a.mov('r10',45);a.store({base:'r11'},'r10',16);a.add('r11',2);a.neg('rax');a.label(positive);
  // R9 digits: the smallest count whose power of ten exceeds the value.
  const count=a.unique('count'),counted=a.unique('counted'),digit=a.unique('digit');
  a.mov('r9',1);a.mov('r10',10);a.mov('rdx',10);a.label(count);a.cmp('rax','r10');a.jcc('b',counted);a.imul('r10','rdx');a.add('r9',1);a.jmp(count);a.label(counted);
  a.mov('r8','r9');a.shl('r8',1);a.add('r8','r11');a.mov('r11','r8');a.mov('r10',10);
  a.label(digit);a.xor('rdx','rdx');a.div('r10');a.add('rdx',48);a.sub('r8',2);a.store({base:'r8'},'rdx',16);a.test('rax','rax');a.jcc('ne',digit);
  a.load('rcx',slot(40));a.load('rax',{base:'rcx',disp:B.buffer});a.sub('r11','rax');a.shr('r11',1);a.store({base:'rcx',disp:B.length},'r11');
 });
 // RCX builder, RDX result Value*: the accumulated string; the builder is
 // released and zeroed.
 b.fn('rt.builderFinish',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  a.load('rcx',{base:'rcx',disp:B.length});a.store(slot(56),'rcx');a.shl('rcx',1);a.add('rcx',8);a.call('rt.allocRaw');a.store(slot(64),'rax');
  a.load('r9',slot(56));a.store({base:'rax'},'r9');a.lea('r11',{base:'rax',disp:8});a.load('rcx',slot(40));a.load('r10',{base:'rcx',disp:B.buffer});copyUnits(a);
  const noBuffer=a.unique('noBuffer');a.load('rcx',slot(40));a.load('r8',{base:'rcx',disp:B.buffer});a.test('r8','r8');a.jcc('e',noBuffer);a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');
  a.label(noBuffer);a.load('rcx',slot(40));a.mov('rax',0);for(const offset of [B.buffer,B.length,B.capacity])a.store({base:'rcx',disp:offset},'rax');
  a.load('rdx',slot(48));a.mov('rax',4);a.store({base:'rdx'},'rax');a.load('rax',slot(64));a.store({base:'rdx',disp:8},'rax');
 });
}
