import { RuntimeBuilder,slot,failIf } from './abi.js';
import {stringLiteral} from './value.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';

/**
 * Ropes: a concatenation that is not copied yet.
 *
 * A string record is [length][UTF-16 units]. `a + b` copied both operands
 * into a new record, so building a string one piece at a time was quadratic:
 * 200 000 appends of a few characters copied 180 GB. A long concatenation now
 * allocates a rope instead: a record of heap kind HeapKind.rope holding the
 * length and the two operands (RopeLayout). Its length word is where a flat
 * string's is, with bit 62 (ropeTag) set: reading a rope's length
 * (`s.length`, truthiness) needs no copy, only the mask; reading its units
 * does. The tag is in the record itself because string literals live outside
 * the heap and have no header to ask.
 *
 * Ropes are confined: compiled code may keep one in a frame slot or a
 * script-level global and pass it to `+` (rt.add), `copy`, `typeof`, `!` and
 * `.length`; before any other use of a value (a call, a property or cell
 * write, a comparison, a return, a throw, ...) the code generator flattens
 * the slot in place with rt.flattenValue, so the runtime, the preludes, the
 * host and every other consumer only ever see flat records. A rope is
 * flattened once: the copy replaces its left child and its right child
 * becomes 0, and every Value that still points at the rope is redirected
 * when it is next flattened. Flattening walks the tree iteratively (a loop
 * of appends makes a left-deep tree as deep as the loop is long) and the
 * collector marks the children through its grey list.
 */
export const RopeLayout={length:0,left:8,right:16,size:24} as const;
/** Bit 62 of a string record's length word: the record is a rope. */
export const ropeTag=1n<<62n;
/** Mask that removes ropeTag from a length word. */
export const lengthMask=0x3fffffffffffffffn;
/** Shortest concatenation that becomes a rope; shorter ones are copied. */
export const ropeMinLength=64;

export function emitStrings(b:RuntimeBuilder):void {
 for(const [name,value] of Object.entries({undefined:'undefined',null:'null',true:'true',false:'false',boolean:'boolean',number:'number',string:'string',symbol:'symbol',bigint:'bigint',object:'object',space:' ',lf:'\n'}))b.bundle.fragments.push(stringLiteral('rt.str.'+name,value));
 // RCX destination, RDX source, R8 byte count: a block copy with `rep movsb`,
 // which the processor runs at cache bandwidth for any length worth a call.
 // RSI and RDI are preserved registers of the calling convention and are
 // saved around the copy; nothing here can throw or reach a safepoint.
 b.fn('rt.copyBytes',56,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');
  a.mov('rdi','rcx');a.mov('rsi','rdx');a.mov('rcx','r8');a.repMovsb();
  a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 b.fn('rt.concat',104,a=>{
 a.store(slot(40),'rcx');a.load('rdx',{base:'rdx',disp:8});a.load('r8',{base:'r8',disp:8});a.store(slot(48),'rdx');a.store(slot(56),'r8');a.load('rax',{base:'rdx'});a.load('r10',{base:'r8'});a.add('rax','r10');failIf(a,'b','rt.throwRangeError');a.store(slot(64),'rax');a.mov('r10',0x3ffffffffffffffbn);a.cmp('rax','r10');failIf(a,'a','rt.throwRangeError');a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.allocRaw');a.store(slot(72),'rax');a.load('r10',slot(64));a.store({base:'rax'},'r10');a.add('rax',8);a.store(slot(80),'rax');
 for(const offset of [48,56]){a.load('rdx',slot(offset));a.load('r8',{base:'rdx'});a.add('r8','r8');a.add('rdx',8);a.load('rcx',slot(80));a.add('rcx','r8');a.store(slot(80),'rcx');a.sub('rcx','r8');a.call('rt.copyBytes');}
 a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(72));a.store({base:'rcx',disp:8},'rax');
 });
 // RCX result Value*, RDX left Value*, R8 right Value* (both strings): the
 // concatenation, as a rope when it is at least ropeMinLength units long.
 // Only rt.add (compiled `+`) uses it; see the note on ropes above.
 b.fn('rt.concatLazy',72,a=>{
  const done=a.unique('done'),leftOnly=a.unique('leftOnly'),rightOnly=a.unique('rightOnly'),flat=a.unique('flat');
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('r10',{base:'rdx',disp:8});a.load('r11',{base:'r8',disp:8});a.load('rax',{base:'r10'});a.load('r9',{base:'r11'});
  a.mov('r10',lengthMask);a.and('rax','r10');a.and('r9','r10');
  a.test('rax','rax');a.jcc('e',rightOnly);a.test('r9','r9');a.jcc('e',leftOnly);
  a.add('rax','r9');failIf(a,'b','rt.throwRangeError');a.mov('r10',0x3ffffffffffffffbn);a.cmp('rax','r10');failIf(a,'a','rt.throwRangeError');
  a.cmp('rax',ropeMinLength);a.jcc('b',flat);a.store(slot(64),'rax');
  a.mov('rcx',RopeLayout.size);a.call('rt.alloc');a.mov('r10',HeapKind.rope);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.load('r10',slot(64));a.mov('r11',ropeTag);a.or('r10','r11');a.store({base:'rax',disp:RopeLayout.length},'r10');
  a.load('rdx',slot(48));a.load('r10',{base:'rdx',disp:8});a.store({base:'rax',disp:RopeLayout.left},'r10');
  a.load('r8',slot(56));a.load('r10',{base:'r8',disp:8});a.store({base:'rax',disp:RopeLayout.right},'r10');
  a.load('rcx',slot(40));a.mov('r10',4);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');a.jmp(done);
  a.label(flat);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.call('rt.concat');a.jmp(done);
  a.label(rightOnly);a.mov('rdx','r8');a.label(leftOnly);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store({base:'rcx',disp:n},'rax');}
  a.label(done);
 });
 // RCX Value*: when it holds a rope, the Value becomes the flat string with
 // the same units (allocated here; the Value must be rooted). Any other
 // Value is left alone. The rope itself keeps the flat string as its left
 // child with right 0, so other Values pointing at it find the copy.
 b.fn('rt.flattenValue',136,a=>{
  const done=a.unique('done'),flatten=a.unique('flatten'),descend=a.unique('descend'),push=a.unique('push'),fits=a.unique('fits'),leaf=a.unique('leaf'),finished=a.unique('finished');
  a.load('rax',{base:'rcx'});a.cmp('rax',4);a.jcc('ne',done);
  a.load('r10',{base:'rcx',disp:8});a.load('rax',{base:'r10'});a.mov('r11',ropeTag);a.test('rax','r11');a.jcc('e',done);
  a.load('r11',{base:'r10',disp:RopeLayout.right});a.test('r11','r11');a.jcc('ne',flatten);
  a.load('r10',{base:'r10',disp:RopeLayout.left});a.store({base:'rcx',disp:8},'r10');a.jmp(done);
  a.label(flatten);a.store(slot(40),'rcx');
  a.mov('r11',lengthMask);a.and('rax','r11');a.store(slot(48),'rax');a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.allocRaw');
  a.store(slot(56),'rax');a.load('r10',slot(48));a.store({base:'rax'},'r10');a.add('rax',8);a.store(slot(96),'rax');
  // The pending right children, on a raw-heap stack (slot 64: base, 72:
  // count, 80: capacity) that doubles when it fills.
  a.mov('r8',64*8);a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapAlloc');a.test('rax','rax');failIf(a,'e');
  a.store(slot(64),'rax');a.mov('rax',0);a.store(slot(72),'rax');a.mov('rax',64);a.store(slot(80),'rax');
  a.load('rcx',slot(40));a.load('r10',{base:'rcx',disp:8});a.store(slot(88),'r10');
  a.label(descend);a.load('rax',{base:'r10'});a.mov('r11',ropeTag);a.test('rax','r11');a.jcc('e',leaf);
  a.load('r11',{base:'r10',disp:RopeLayout.right});a.test('r11','r11');a.jcc('ne',push);
  a.load('r10',{base:'r10',disp:RopeLayout.left});a.jmp(descend);
  a.label(push);a.load('r9',slot(72));a.load('rax',slot(80));a.cmp('r9','rax');a.jcc('b',fits);
  // Grow: twice the capacity, the entries copied over, the old stack freed.
  {a.store(slot(104),'r10');a.store(slot(112),'r11');a.shl('rax',1);a.store(slot(80),'rax');a.mov('r8','rax');a.shl('r8',3);a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapAlloc');a.test('rax','rax');failIf(a,'e');
   a.store(slot(120),'rax');a.mov('rcx','rax');a.load('rdx',slot(64));a.load('r8',slot(72));a.shl('r8',3);a.call('rt.copyBytes');
   a.load('r8',slot(64));a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');a.load('rax',slot(120));a.store(slot(64),'rax');
   a.load('r10',slot(104));a.load('r11',slot(112));a.load('r9',slot(72));}
  a.label(fits);a.load('rax',slot(64));a.mov('rdx','r9');a.shl('rdx',3);a.add('rax','rdx');a.store({base:'rax'},'r11');a.add('r9',1);a.store(slot(72),'r9');
  a.load('r10',{base:'r10',disp:RopeLayout.left});a.jmp(descend);
  // A flat string: its units go to the output; then the next pending right child.
  a.label(leaf);a.load('r8',{base:'r10'});a.add('r8','r8');a.lea('rdx',{base:'r10',disp:8});a.load('rcx',slot(96));a.add('rcx','r8');a.store(slot(96),'rcx');a.sub('rcx','r8');a.call('rt.copyBytes');
  a.load('r9',slot(72));a.test('r9','r9');a.jcc('e',finished);a.sub('r9',1);a.store(slot(72),'r9');a.load('rax',slot(64));a.shl('r9',3);a.add('rax','r9');a.load('r10',{base:'rax'});a.jmp(descend);
  a.label(finished);a.load('r8',slot(64));a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');
  a.load('r10',slot(88));a.load('rax',slot(56));a.store({base:'r10',disp:RopeLayout.left},'rax');a.mov('r11',0);a.store({base:'r10',disp:RopeLayout.right},'r11');
  a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');
  a.label(done);
 });
 // Compare UTF16 code units; return signed -1,0,1. Inputs descriptor pointers.
 b.fn('rt.compareStrings',40,a=>{const symbol=a.unique('symbol'),ordinary=a.unique('ordinary');a.cmp('rcx','rdx');a.jcc('e','rt.compareStrings.equal');a.load('r8',{base:'rcx'});a.load('r9',{base:'rdx'});a.cmp('r8',-1);a.jcc('e',symbol);a.cmp('r9',-1);a.jcc('ne',ordinary);a.jmp('rt.compareStrings.less');a.label(symbol);a.cmp('r9',-1);a.jcc('ne','rt.compareStrings.greater');a.cmp('rcx','rdx');a.jcc('e','rt.compareStrings.equal');a.jmp('rt.compareStrings.greater');a.label(ordinary);a.add('rcx',8);a.add('rdx',8);a.label('rt.compareStrings.loop');a.test('r8','r8');a.jcc('e','rt.compareStrings.leftEnd');a.test('r9','r9');a.jcc('e','rt.compareStrings.greater');a.load('r10',{base:'rcx'},16);a.load('r11',{base:'rdx'},16);a.cmp('r10','r11');a.jcc('b','rt.compareStrings.less');a.jcc('a','rt.compareStrings.greater');a.add('rcx',2);a.add('rdx',2);a.sub('r8',1);a.sub('r9',1);a.jmp('rt.compareStrings.loop');a.label('rt.compareStrings.leftEnd');a.test('r9','r9');a.jcc('ne','rt.compareStrings.less');a.label('rt.compareStrings.equal');a.mov('rax',0);a.jmp('rt.compareStrings.done');a.label('rt.compareStrings.less');a.mov('rax',-1);a.jmp('rt.compareStrings.done');a.label('rt.compareStrings.greater');a.mov('rax',1);a.label('rt.compareStrings.done');});
}
