import {RuntimeBuilder,slot} from './abi.js';
import {ObjectLayout as O} from './object-layout.js';
import {TypedArrayKind,TypedArrayLayout as T} from './typed-array.js';
import {ArrayBufferLayout as AB} from './array-buffer.js';
import type {Assembler} from '../backend/x64/assembler.js';

/**
 * Native UTF-8 transcoding behind TextEncoder and TextDecoder.
 *
 * The encoding prelude implemented both directions in JavaScript, one code
 * unit per iteration through the generic property and call paths: about a
 * quarter of a microsecond per character, which made reading or writing a
 * file as text a thousand times slower than the system call under it. The
 * two host functions here do the same work in a tight loop with the same
 * results (lone surrogates encode as U+FFFD; invalid sequences decode to
 * U+FFFD or, in fatal mode, make decode return undefined so that the
 * prelude throws its TypeError). Both are leaf functions with the builtin
 * ABI (RCX out Value*, RDX argc, R8 argv): they never call JavaScript and
 * the decoder's only allocation is the result string, published before any
 * safepoint can run.
 *
 * __nonaUtf8Encode(string, dest): with dest undefined, the number of UTF-8
 * bytes the string needs; with a one-byte-element typed array of at least
 * that length, writes the bytes and returns their count. Anything else
 * returns undefined and the prelude falls back to its own loop.
 *
 * __nonaUtf8Decode(bytes, fatal, ignoreBOM): the decoded string for a
 * one-byte-element typed array, or undefined for an invalid sequence in
 * fatal mode (and for arguments the native code does not handle).
 */
export function emitUtf8(b:RuntimeBuilder):void {
 // Loads R9 = first byte, R10 = element count of the typed array in the Value
 // at RDX, or jumps to `bad` when it is not an attached one-byte-element
 // typed array. Clobbers RAX, R11.
 const bytesOf=(a:Assembler,bad:string)=>{
  a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('ne',bad);a.load('r11',{base:'rdx',disp:8});
  a.load('rax',{base:'r11',disp:O.kind});a.cmp('rax',TypedArrayKind);a.jcc('ne',bad);
  a.load('rax',{base:'r11',disp:T.elementType});a.cmp('rax',4);a.jcc('ae',bad);
  a.load('r9',{base:'r11',disp:T.buffer});a.load('rax',{base:'r9',disp:AB.detached});a.test('rax','rax');a.jcc('ne',bad);
  a.load('r9',{base:'r9',disp:AB.bytes});a.load('rax',{base:'r11',disp:T.byteOffset});a.add('r9','rax');a.load('r10',{base:'r11',disp:T.length});
 };
 const undefinedResult=(a:Assembler)=>{a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');};

 b.fn('rt.utf8Encode.code',120,a=>{
  // slot 48 units pointer, 56 unit count, 64 destination or 0, 72 byte count.
  a.store(slot(40),'rcx');const bad=a.unique('bad'),done=a.unique('done'),count=a.unique('countOnly');
  a.cmp('rdx',1);a.jcc('b',bad);a.load('rax',{base:'r8'});a.cmp('rax',4);a.jcc('ne',bad);
  a.load('rax',{base:'r8',disp:8});a.load('r10',{base:'rax'});a.store(slot(56),'r10');a.add('rax',8);a.store(slot(48),'rax');
  a.mov('rax',0);a.store(slot(64),'rax');a.cmp('rdx',2);a.jcc('b',count);a.lea('rdx',{base:'r8',disp:16});a.load('rax',{base:'rdx'});a.test('rax','rax');a.jcc('e',count);
  bytesOf(a,bad);a.store(slot(64),'r9');a.store(slot(80),'r10');
  a.label(count);
  // Pass over the units: RCX unit index, R8 byte count, R9 destination (0: count only).
  a.mov('rcx',0);a.mov('r8',0);a.load('r9',slot(64));a.load('r10',slot(48));a.load('r11',slot(56));
  const loop=a.unique('loop'),end=a.unique('end'),ascii=a.unique('ascii'),two=a.unique('two'),three=a.unique('three'),pair=a.unique('pair'),next=a.unique('next');
  const put=(reg:'rax'|'rdx')=>{const skip=a.unique('skip');a.test('r9','r9');a.jcc('e',skip);a.store({base:'r9'},reg,8);a.add('r9',1);a.label(skip);a.add('r8',1);};
  a.label(loop);a.cmp('rcx','r11');a.jcc('ae',end);
  a.mov('rax','rcx');a.add('rax','rax');a.add('rax','r10');a.load('rax',{base:'rax'},16);a.add('rcx',1);
  a.cmp('rax',0x80);a.jcc('b',ascii);a.cmp('rax',0x800);a.jcc('b',two);
  a.cmp('rax',0xd800);a.jcc('b',three);a.cmp('rax',0xdc00);a.jcc('ae','rt.utf8Encode.lowOrOther');
  // High surrogate: paired with a following low surrogate it is one 4-byte sequence.
  a.cmp('rcx','r11');a.jcc('ae','rt.utf8Encode.lone');
  a.mov('rdx','rcx');a.add('rdx','rdx');a.add('rdx','r10');a.load('rdx',{base:'rdx'},16);a.cmp('rdx',0xdc00);a.jcc('b','rt.utf8Encode.lone');a.cmp('rdx',0xe000);a.jcc('ae','rt.utf8Encode.lone');
  a.add('rcx',1);a.sub('rax',0xd800);a.shl('rax',10);a.sub('rdx',0xdc00);a.add('rax','rdx');a.add('rax',0x10000);a.jmp(pair);
  a.label('rt.utf8Encode.lowOrOther');a.cmp('rax',0xe000);a.jcc('ae',three);
  a.label('rt.utf8Encode.lone');a.mov('rax',0xfffd);a.jmp(three);
  a.label(ascii);put('rax');a.jmp(next);
  a.label(two);a.mov('rdx','rax');a.shr('rdx',6);a.or('rdx',0xc0);put('rdx');a.and('rax',63);a.or('rax',0x80);put('rax');a.jmp(next);
  a.label(three);a.mov('rdx','rax');a.shr('rdx',12);a.or('rdx',0xe0);put('rdx');a.mov('rdx','rax');a.shr('rdx',6);a.and('rdx',63);a.or('rdx',0x80);put('rdx');a.and('rax',63);a.or('rax',0x80);put('rax');a.jmp(next);
  a.label(pair);a.mov('rdx','rax');a.shr('rdx',18);a.or('rdx',0xf0);put('rdx');a.mov('rdx','rax');a.shr('rdx',12);a.and('rdx',63);a.or('rdx',0x80);put('rdx');a.mov('rdx','rax');a.shr('rdx',6);a.and('rdx',63);a.or('rdx',0x80);put('rdx');a.and('rax',63);a.or('rax',0x80);put('rax');
  a.label(next);a.jmp(loop);
  a.label(end);
  // With a destination, its length must have covered the bytes written.
  {const fits=a.unique('fits');a.load('rax',slot(64));a.test('rax','rax');a.jcc('e',fits);a.load('rax',slot(80));a.cmp('r8','rax');a.jcc('a',bad);a.label(fits);}
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.cvtsi2sd('xmm0','r8');a.storesd({base:'rcx',disp:8},'xmm0');a.jmp(done);
  a.label(bad);undefinedResult(a);a.label(done);
 });

 b.fn('rt.utf8Decode.code',168,a=>{
  // Frame: 48 bytes, 56 count, 64 fatal, 72 ignoreBOM, 88 record, 96 pass
  // (0 count, 1 write), 104 argc, 112 argv / j, 120 minimum, 128 lead byte,
  // 136 code point, 144 continuation bytes needed.
  a.store(slot(40),'rcx');const bad=a.unique('bad'),done=a.unique('done');
  a.cmp('rdx',1);a.jcc('b',bad);a.store(slot(104),'rdx');a.store(slot(112),'r8');
  a.mov('rdx','r8');bytesOf(a,bad);a.store(slot(48),'r9');a.store(slot(56),'r10');
  const flag=(index:number,target:number)=>{
   const absent=a.unique('absent'),set=a.unique('set');a.load('rdx',slot(104));a.cmp('rdx',index);a.jcc('be',absent);
   a.load('rdx',slot(112));a.load('r9',{base:'rdx',disp:16*index});a.cmp('r9',2);a.jcc('ne',absent);a.load('rax',{base:'rdx',disp:16*index+8});a.jmp(set);
   a.label(absent);a.mov('rax',0);a.label(set);a.store(slot(target),'rax');
  };
  flag(1,64);flag(2,72);
  a.mov('rax',0);a.store(slot(96),'rax');a.store(slot(88),'rax');
  // Both passes run the same scan: the first counts code units, the second,
  // once the string of exactly that length exists, writes them. Registers
  // during the scan: RCX byte index, R10 bytes, R11 count, R8 code units,
  // R9 write cursor (0 while counting); the loop makes no calls.
  const pass=a.unique('pass');a.label(pass);
  a.mov('rcx',0);a.load('r10',slot(48));a.load('r11',slot(56));a.mov('r8',0);
  {const noBom=a.unique('noBom');a.load('rax',slot(72));a.test('rax','rax');a.jcc('ne',noBom);a.cmp('r11',3);a.jcc('b',noBom);
   a.load('rax',{base:'r10'},16);a.cmp('rax',0xbbef);a.jcc('ne',noBom);a.load('rax',{base:'r10',disp:2},8);a.cmp('rax',0xbf);a.jcc('ne',noBom);a.mov('rcx',3);a.label(noBom);}
  a.mov('r9',0);{const counting=a.unique('counting');a.load('rax',slot(96));a.test('rax','rax');a.jcc('e',counting);a.load('r9',slot(88));a.add('r9',8);a.label(counting);}
  const emit=(reg:'rax'|'rdx')=>{const skip=a.unique('skip');a.test('r9','r9');a.jcc('e',skip);a.store({base:'r9'},reg,16);a.add('r9',2);a.label(skip);a.add('r8',1);};
  const loop=a.unique('loop'),end=a.unique('end'),ascii=a.unique('ascii'),replace=a.unique('replace'),cont=a.unique('cont'),complete=a.unique('complete'),fail=a.unique('fail'),invalid=a.unique('invalid'),secondOk=a.unique('secondOk'),lead3=a.unique('lead3'),lead4=a.unique('lead4'),leadReady=a.unique('leadReady'),single=a.unique('single');
  a.label(loop);a.cmp('rcx','r11');a.jcc('ae',end);
  a.mov('rax','rcx');a.add('rax','r10');a.load('rax',{base:'rax'},8);
  a.cmp('rax',0x80);a.jcc('b',ascii);
  a.store(slot(128),'rax');
  a.cmp('rax',0xc2);a.jcc('b',invalid);a.cmp('rax',0xe0);a.jcc('ae',lead3);a.mov('rdx',1);a.and('rax',31);a.store(slot(136),'rax');a.mov('rax',0x80);a.jmp(leadReady);
  a.label(lead3);a.cmp('rax',0xf0);a.jcc('ae',lead4);a.mov('rdx',2);a.and('rax',15);a.store(slot(136),'rax');a.mov('rax',0x800);a.jmp(leadReady);
  a.label(lead4);a.cmp('rax',0xf5);a.jcc('ae',invalid);a.mov('rdx',3);a.and('rax',7);a.store(slot(136),'rax');a.mov('rax',0x10000);
  a.label(leadReady);a.store(slot(120),'rax');a.store(slot(144),'rdx');a.mov('rax',1);a.store(slot(112),'rax');
  // Continuation bytes: slot 112 = j.
  a.label(cont);a.load('rax',slot(112));a.load('rdx',slot(144));a.cmp('rax','rdx');a.jcc('a',complete);
  a.mov('rdx','rcx');a.add('rdx','rax');a.cmp('rdx','r11');a.jcc('ae',fail);
  a.add('rdx','r10');a.load('rdx',{base:'rdx'},8);
  a.cmp('rax',1);a.jcc('ne',secondOk);
  {const e0=a.unique('e0'),ed=a.unique('ed'),f0=a.unique('f0'),f4=a.unique('f4');a.load('rax',slot(128));
   a.cmp('rax',0xe0);a.jcc('ne',e0);a.cmp('rdx',0xa0);a.jcc('b',fail);a.label(e0);
   a.cmp('rax',0xed);a.jcc('ne',ed);a.cmp('rdx',0x9f);a.jcc('a',fail);a.label(ed);
   a.cmp('rax',0xf0);a.jcc('ne',f0);a.cmp('rdx',0x90);a.jcc('b',fail);a.label(f0);
   a.cmp('rax',0xf4);a.jcc('ne',f4);a.cmp('rdx',0x8f);a.jcc('a',fail);a.label(f4);}
  a.label(secondOk);a.mov('rax','rdx');a.and('rax',0xc0);a.cmp('rax',0x80);a.jcc('ne',fail);
  a.and('rdx',63);a.load('rax',slot(136));a.shl('rax',6);a.or('rax','rdx');a.store(slot(136),'rax');
  a.load('rax',slot(112));a.add('rax',1);a.store(slot(112),'rax');a.jmp(cont);
  a.label(complete);a.load('rax',slot(136));a.load('rdx',slot(120));a.cmp('rax','rdx');a.jcc('b',fail);
  a.load('rdx',slot(144));a.add('rcx','rdx');a.add('rcx',1);
  a.cmp('rax',0x10000);a.jcc('b',single);a.sub('rax',0x10000);a.mov('rdx','rax');a.shr('rdx',10);a.add('rdx',0xd800);emit('rdx');a.and('rax',1023);a.add('rax',0xdc00);emit('rax');a.jmp(loop);
  a.label(single);emit('rax');a.jmp(loop);
  // Invalid sequence: skip the bytes examined (j of them, or the lone lead byte).
  a.label(fail);a.load('rax',slot(112));a.add('rcx','rax');a.jmp(replace);
  a.label(invalid);a.add('rcx',1);
  a.label(replace);a.load('rax',slot(64));a.test('rax','rax');a.jcc('ne',bad);a.mov('rax',0xfffd);emit('rax');a.jmp(loop);
  a.label(ascii);emit('rax');a.add('rcx',1);a.jmp(loop);
  a.label(end);
  // After the counting pass allocate the string; after the writing pass return it.
  {const written=a.unique('written');a.load('rax',slot(96));a.test('rax','rax');a.jcc('ne',written);
   a.store(slot(104),'r8');a.mov('rcx','r8');a.shl('rcx',1);a.add('rcx',8);a.call('rt.allocRaw');a.store(slot(88),'rax');a.load('r8',slot(104));a.store({base:'rax'},'r8');
   a.mov('rax',1);a.store(slot(96),'rax');a.mov('rax',0);a.store(slot(104),'rax');a.jmp(pass);
   a.label(written);}
  a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(88));a.store({base:'rcx',disp:8},'rax');a.jmp(done);
  a.label(bad);undefinedResult(a);a.label(done);
 });
}
