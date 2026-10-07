import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A,ObjectFlags} from './object-layout.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';

/**
 * Dense element storage for arrays and plain objects.
 *
 * Every property, an array element included, was a 72-byte property node in
 * the object's linked list, keyed by the decimal string of its index: `a[i]`
 * formatted the index, hashed it, checked the prototype chain for exotic
 * owners and looked the string up, several microseconds and three
 * allocations per element. That made matrix code, sorting, JSON and every
 * array builtin hundreds of times slower than the surrounding code and gave
 * a million-element array a footprint of two hundred bytes per element.
 *
 * An object may now own an element table (raw heap, outside the GC): a
 * capacity, the number of dense values, the number of index-keyed property
 * nodes still in the list, then `capacity` Value slots. A slot either holds
 * the element — a data property with ordinary attributes {writable,
 * enumerable, configurable} — or the hole tag. An index is never both dense
 * and a node.
 *
 * The property list stays the source of truth for everything the dense form
 * cannot express. Any generic operation that needs a node — rt.findOwnProperty,
 * and so defineProperty, getOwnPropertyDescriptor, accessors and attribute
 * changes — first *materializes* the element: the value moves into a freshly
 * linked node and the slot becomes a hole (rt.elementsMaterialize). Walkers of
 * the whole list (rt.ownKeys) materialize every element first. Fast reads and
 * writes (rt.arrayGetFast, rt.arraySetFast, used by rt.getProperty and
 * rt.setProperty before any generic work) touch only dense slots, and create a
 * new element only when nothing observable could differ: the object is
 * extensible, no index-keyed node exists on it, an array's length is writable
 * when it grows, and for a plain assignment the prototype chain is the
 * untouched Array.prototype → Object.prototype (or none) with no indexed
 * property on it (rt.indexedPrototypes records if one ever appears).
 *
 * A table grows by doubling while the array stays dense (an index below
 * 4 × count + 64); sparser indices become ordinary nodes, after which the
 * object keeps its dense elements but creates no more of them.
 */
export const ElementsLayout={capacity:0,count:8,nodes:16,values:24} as const;
const E=ElementsLayout;
/** Value tag of an empty slot; never a JavaScript-observable value. */
export const HoleTag=255;

export function emitArrayElements(b:RuntimeBuilder):void {
 // Nonzero once Array.prototype or Object.prototype has an array-index key.
 b.data('rt.indexedPrototypes',new Uint8Array(8),'.data');

 // RCX capacity -> RAX zeroed table with every slot a hole.
 b.fn('rt.elementsAlloc',56,a=>{
  a.store(slot(40),'rcx');a.mov('r8','rcx');a.shl('r8',4);a.add('r8',E.values);
  a.load('rcx',{rip:'rt.heap'});a.mov('rdx',8);a.callImport('HeapAlloc');a.test('rax','rax');failIf(a,'e');
  a.load('r10',slot(40));a.store({base:'rax',disp:E.capacity},'r10');
  const loop=a.unique('loop'),done=a.unique('done');a.lea('r11',{base:'rax',disp:E.values});a.shl('r10',4);a.add('r10','r11');a.mov('r9',HoleTag);
  a.label(loop);a.cmp('r11','r10');a.jcc('ae',done);a.store({base:'r11'},'r9');a.add('r11',16);a.jmp(loop);a.label(done);
 });
 // RCX object without a table, RDX minimum capacity. Counts the index-keyed
 // nodes already in the list so that creation knows whether any exist.
 b.fn('rt.elementsBuild',72,a=>{
  a.store(slot(40),'rcx');a.mov('rax',4);const grow=a.unique('grow'),sized=a.unique('sized');
  a.label(grow);a.cmp('rax','rdx');a.jcc('ae',sized);a.shl('rax',1);a.jmp(grow);a.label(sized);
  a.mov('rcx','rax');a.call('rt.elementsAlloc');a.store(slot(48),'rax');
  const count=a.unique('count'),skip=a.unique('skip'),counted=a.unique('counted');
  a.load('rcx',slot(40));a.load('rax',{base:'rcx',disp:O.properties});a.store(slot(56),'rax');
  a.label(count);a.load('rax',slot(56));a.test('rax','rax');a.jcc('e',counted);
  a.load('rcx',{base:'rax',disp:P.key});a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',skip);
  a.load('r10',slot(48));a.load('rax',{base:'r10',disp:E.nodes});a.add('rax',1);a.store({base:'r10',disp:E.nodes},'rax');
  a.label(skip);a.load('rax',slot(56));a.load('rax',{base:'rax',disp:P.next});a.store(slot(56),'rax');a.jmp(count);
  a.label(counted);a.load('rcx',slot(40));a.load('rax',slot(48));a.store({base:'rcx',disp:O.elements},'rax');
 });
 // RCX object with a table, RDX minimum capacity: doubles the table until it
 // fits, keeping every slot.
 b.fn('rt.elementsGrow',72,a=>{
  a.store(slot(40),'rcx');a.load('r10',{base:'rcx',disp:O.elements});a.store(slot(48),'r10');a.load('rax',{base:'r10',disp:E.capacity});
  const grow=a.unique('grow'),sized=a.unique('sized'),copy=a.unique('copy'),copied=a.unique('copied');
  a.label(grow);a.cmp('rax','rdx');a.jcc('ae',sized);a.shl('rax',1);a.jmp(grow);a.label(sized);
  a.mov('rcx','rax');a.call('rt.elementsAlloc');a.store(slot(56),'rax');
  a.load('r10',slot(48));for(const offset of [E.count,E.nodes]){a.load('r11',{base:'r10',disp:offset});a.store({base:'rax',disp:offset},'r11');}
  a.load('r9',{base:'r10',disp:E.capacity});a.shl('r9',4);a.lea('r10',{base:'r10',disp:E.values});a.add('r9','r10');a.lea('r11',{base:'rax',disp:E.values});
  a.label(copy);a.cmp('r10','r9');a.jcc('ae',copied);a.load('rax',{base:'r10'});a.store({base:'r11'},'rax');a.load('rax',{base:'r10',disp:8});a.store({base:'r11',disp:8},'rax');a.add('r10',16);a.add('r11',16);a.jmp(copy);
  a.label(copied);a.load('r8',slot(48));a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');
  a.load('rcx',slot(40));a.load('rax',slot(56));a.store({base:'rcx',disp:O.elements},'rax');
 });
 // RCX object Value*, RDX start, R8 delete count, R9 item count, with
 // start + delete count <= length: the element moves and tail deletions of
 // Array.prototype.splice (and shift: 0, 1, 0) done as one move of the slots.
 // Only for an array whose elements 0..length-1 are all dense slots, with a
 // writable length and no index-keyed node: every source index is then an
 // own plain data property, so each spec step (HasProperty, Get, Set or
 // DeletePropertyOrThrow) is a slot copy or a hole. Growing also needs an
 // extensible array whose Set of a new index cannot meet a setter (the
 // untouched Array.prototype -> Object.prototype chain, as rt.arraySetFast).
 // Afterwards elements 0..new length-1 are dense; a grown array's length is
 // the new length (Set past the end extends it), a shrunk one keeps the old
 // length for the caller's final Set of "length". RAX 1 when done; 0 leaves
 // the array untouched for the generic path.
 b.fn('rt.elementsSpliceDense',104,a=>{
  const no=a.unique('no'),done=a.unique('done'),fits=a.unique('fits'),moved=a.unique('moved'),backward=a.unique('backward'),shrunk=a.unique('shrunk');
  a.load('rax',{base:'rcx'});a.cmp('rax',5);a.jcc('ne',no);a.load('r10',{base:'rcx',disp:8});a.store(slot(40),'r10');
  a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('ne',no);
  a.load('rax',{base:'r10',disp:O.flags});a.and('rax',ObjectFlags.lengthReadonly);a.jcc('ne',no);
  a.load('r11',{base:'r10',disp:O.elements});a.test('r11','r11');a.jcc('e',no);
  a.load('rax',{base:'r11',disp:E.nodes});a.test('rax','rax');a.jcc('ne',no);
  a.load('rax',{base:'r10',disp:O.length});a.store(slot(72),'rax');a.load('r9',{base:'r11',disp:E.count});a.cmp('rax','r9');a.jcc('ne',no);
  a.load('r9',{base:'r11',disp:E.capacity});a.cmp('rax','r9');a.jcc('a',no);
  // New length = length - delete count + item count.
  a.sub('rax','r8');a.load('r9',slot(64));a.add('rax','r9');a.store(slot(80),'rax');
  a.load('r9',slot(64));a.cmp('r9','r8');a.jcc('be',fits);
  a.load('rax',{base:'r10',disp:O.flags});a.and('rax',ObjectFlags.nonExtensible);a.jcc('ne',no);
  a.load('rax',{base:'r10',disp:O.prototype});a.lea('r9',{rip:'rt.arrayPrototype'});a.cmp('rax','r9');a.jcc('ne',no);
  a.load('rax',{base:'r9',disp:O.prototype});a.lea('r9',{rip:'rt.objectPrototype'});a.cmp('rax','r9');a.jcc('ne',no);
  a.load('rax',{base:'r9',disp:O.prototype});a.test('rax','rax');a.jcc('ne',no);
  a.load('rax',{rip:'rt.indexedPrototypes'});a.test('rax','rax');a.jcc('ne',no);
  a.load('rax',slot(80));a.load('r9',{base:'r11',disp:E.capacity});a.cmp('rax','r9');a.jcc('be',fits);
  a.mov('rcx','r10');a.mov('rdx','rax');a.call('rt.elementsGrow');a.load('r10',slot(40));a.load('r11',{base:'r10',disp:O.elements});
  a.label(fits);
  // Move length - start - delete count slots from start + delete count to
  // start + item count; R8 source, R9 destination, RAX bytes.
  a.load('rax',slot(72));a.load('rdx',slot(48));a.sub('rax','rdx');a.load('r8',slot(56));a.sub('rax','r8');a.shl('rax',4);
  a.add('r8','rdx');a.shl('r8',4);a.lea('r8',{base:'r8',disp:E.values});a.add('r8','r11');
  a.load('r9',slot(64));a.add('r9','rdx');a.shl('r9',4);a.lea('r9',{base:'r9',disp:E.values});a.add('r9','r11');
  a.cmp('r9','r8');a.jcc('a',backward);
  // Downward (or in place): a forward byte copy never reads a byte it wrote.
  a.mov('rcx','r9');a.mov('rdx','r8');a.mov('r8','rax');a.call('rt.copyBytes');a.load('r10',slot(40));a.load('r11',{base:'r10',disp:O.elements});a.jmp(moved);
  a.label(backward);
  {const loop=a.unique('backwardLoop');a.add('r8','rax');a.add('r9','rax');a.label(loop);a.test('rax','rax');a.jcc('e',moved);
   a.sub('r8',16);a.sub('r9',16);a.sub('rax',16);
   a.load('rcx',{base:'r8'});a.store({base:'r9'},'rcx');a.load('rcx',{base:'r8',disp:8});a.store({base:'r9',disp:8},'rcx');a.jmp(loop);}
  a.label(moved);
  // Shrinking: the slots from the new length to the old one become holes.
  a.load('rax',slot(80));a.load('r9',slot(72));a.cmp('rax','r9');a.jcc('b',shrunk);
  a.store({base:'r10',disp:O.length},'rax');a.jmp(done);
  a.label(shrunk);
  {const loop=a.unique('holes');a.mov('rdx','rax');a.shl('rdx',4);a.add('rdx','r11');a.add('rdx',E.values);a.shl('r9',4);a.add('r9','r11');a.add('r9',E.values);a.mov('rcx',HoleTag);
   a.label(loop);a.cmp('rdx','r9');a.jcc('ae',done);a.store({base:'rdx'},'rcx');a.add('rdx',16);a.jmp(loop);}
  a.label(done);a.load('rax',slot(80));a.store({base:'r11',disp:E.count},'rax');a.mov('rax',1);const end=a.unique('end');a.jmp(end);
  a.label(no);a.mov('rax',0);a.label(end);
 });
 // RCX object, RDX index of a dense element -> RAX its new property node,
 // linked at the head of the list; the slot is a hole afterwards.
 b.fn('rt.elementsMaterialize',104,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  a.load('r10',{base:'rcx',disp:O.elements});a.mov('rax','rdx');a.shl('rax',4);a.add('rax','r10');a.add('rax',E.values);
  a.load('r11',{base:'rax'});a.store(slot(56),'r11');a.load('r11',{base:'rax',disp:8});a.store(slot(64),'r11');
  a.mov('r11',HoleTag);a.store({base:'rax'},'r11');a.load('r11',{base:'r10',disp:E.count});a.sub('r11',1);a.store({base:'r10',disp:E.count},'r11');
  a.mov('rax',3);a.store(slot(72),'rax');a.cvtsi2sd('xmm0','rdx');a.storesd(slot(80),'xmm0');a.lea('rcx',slot(88));a.lea('rdx',slot(72));a.call('rt.toPropertyKey');
  a.load('rcx',slot(40));a.call('rt.allocPropertyNode');
  a.load('r10',slot(96));a.store({base:'rax',disp:P.key},'r10');a.mov('r10',A.ordinary);a.store({base:'rax',disp:P.attributes},'r10');
  a.load('r10',slot(56));a.store({base:'rax',disp:P.value},'r10');a.load('r10',slot(64));a.store({base:'rax',disp:P.value+8},'r10');
  a.mov('r10',0);for(const offset of [P.getter,P.getter+8,P.setter,P.setter+8])a.store({base:'rax',disp:offset},'r10');
  a.load('rcx',slot(40));a.load('r11',{base:'rcx',disp:O.properties});a.store({base:'rax',disp:P.next},'r11');a.store({base:'rcx',disp:O.properties},'rax');
  a.store(slot(56),'rax');a.mov('rdx','rax');a.call('rt.propIndexAdd');a.load('rax',slot(56));
 });
 // RCX object payload: every dense element becomes a node, lowest index first.
 b.fn('rt.elementsMaterializeAll',56,a=>{
  a.store(slot(40),'rcx');const done=a.unique('done'),loop=a.unique('loop'),next=a.unique('next');
  a.load('r10',{base:'rcx',disp:O.elements});a.test('r10','r10');a.jcc('e',done);a.load('rax',{base:'r10',disp:E.count});a.test('rax','rax');a.jcc('e',done);
  a.mov('rax',0);a.store(slot(48),'rax');
  a.label(loop);a.load('rcx',slot(40));a.load('r10',{base:'rcx',disp:O.elements});a.load('rdx',slot(48));a.load('r11',{base:'r10',disp:E.capacity});a.cmp('rdx','r11');a.jcc('ae',done);
  a.mov('rax','rdx');a.shl('rax',4);a.add('rax','r10');a.load('r11',{base:'rax',disp:E.values});a.cmp('r11',HoleTag);a.jcc('e',next);
  a.call('rt.elementsMaterialize');
  a.label(next);a.load('rax',slot(48));a.add('rax',1);a.store(slot(48),'rax');a.jmp(loop);
  a.label(done);
 });
 // RCX object, RDX property node just linked (rt.propIndexAdd hook). Counts an
 // index-keyed node and notes an indexed key on an intrinsic prototype.
 b.fn('rt.elementsNoteNode',56,a=>{
  a.store(slot(40),'rcx');const done=a.unique('done'),notProto=a.unique('notProto'),isProto=a.unique('isProto');
  a.load('rcx',{base:'rdx',disp:P.key});a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',done);
  a.load('rcx',slot(40));a.lea('r10',{rip:'rt.arrayPrototype'});a.cmp('rcx','r10');a.jcc('e',isProto);a.lea('r10',{rip:'rt.objectPrototype'});a.cmp('rcx','r10');a.jcc('ne',notProto);
  a.label(isProto);a.mov('r10',1);a.store({rip:'rt.indexedPrototypes'},'r10');
  a.label(notProto);a.load('r10',{base:'rcx',disp:O.elements});a.test('r10','r10');a.jcc('e',done);
  a.load('r11',{base:'r10',disp:E.nodes});a.add('r11',1);a.store({base:'r10',disp:E.nodes},'r11');
  a.label(done);
 });
 // RCX object, RDX key of a node being unlinked (rt.propIndexDrop hook).
 b.fn('rt.elementsDropNode',56,a=>{
  const done=a.unique('done');a.load('r10',{base:'rcx',disp:O.elements});a.test('r10','r10');a.jcc('e',done);
  a.store(slot(40),'r10');a.mov('rcx','rdx');a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',done);
  a.load('r10',slot(40));a.load('r11',{base:'r10',disp:E.nodes});a.sub('r11',1);a.store({base:'r10',disp:E.nodes},'r11');
  a.label(done);
 });
 // RCX object payload, RDX new array length: clears the dense slots at and
 // above it. Pure, no calls.
 b.fn('rt.elementsTruncate',40,a=>{
  const done=a.unique('done'),loop=a.unique('loop'),next=a.unique('next');
  a.load('r10',{base:'rcx',disp:O.elements});a.test('r10','r10');a.jcc('e',done);
  a.load('r9',{base:'r10',disp:E.capacity});a.cmp('rdx','r9');a.jcc('ae',done);
  a.shl('r9',4);a.lea('r9',{base:'r9',disp:E.values});a.add('r9','r10');a.mov('rax','rdx');a.shl('rax',4);a.lea('rax',{base:'rax',disp:E.values});a.add('rax','r10');
  a.label(loop);a.cmp('rax','r9');a.jcc('ae',done);a.load('r11',{base:'rax'});a.cmp('r11',HoleTag);a.jcc('e',next);
  a.mov('r11',HoleTag);a.store({base:'rax'},'r11');a.load('r11',{base:'r10',disp:E.count});a.sub('r11',1);a.store({base:'r10',disp:E.count},'r11');
  a.label(next);a.add('rax',16);a.jmp(loop);a.label(done);
 });
 // RCX object payload: releases its table. Safe inside the GC sweep.
 b.fn('rt.elementsFree',56,a=>{
  const done=a.unique('done');a.load('r8',{base:'rcx',disp:O.elements});a.test('r8','r8');a.jcc('e',done);
  a.mov('r10',0);a.store({base:'rcx',disp:O.elements},'r10');a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');
  a.label(done);
 });
 // RCX object payload: marks every dense element (GC).
 b.fn('rt.elementsTrace',56,a=>{
  const done=a.unique('done'),loop=a.unique('loop'),next=a.unique('next');
  a.load('r10',{base:'rcx',disp:O.elements});a.test('r10','r10');a.jcc('e',done);a.load('rax',{base:'r10',disp:E.count});a.test('rax','rax');a.jcc('e',done);
  a.load('r9',{base:'r10',disp:E.capacity});a.shl('r9',4);a.lea('rax',{base:'r10',disp:E.values});a.add('r9','rax');a.store(slot(40),'rax');a.store(slot(48),'r9');
  a.label(loop);a.load('rcx',slot(40));a.load('r9',slot(48));a.cmp('rcx','r9');a.jcc('ae',done);
  a.load('rax',{base:'rcx'});a.cmp('rax',4);a.jcc('b',next);a.cmp('rax',7);a.jcc('a',next);a.call('rt.gcMarkValue');
  a.label(next);a.load('rax',slot(40));a.add('rax',16);a.store(slot(40),'rax');a.jmp(loop);a.label(done);
 });
 // RCX object payload, RDX key record -> RAX Value* of the dense element with
 // that key, or 0; RDX its index when found.
 b.fn('rt.denseFind',56,a=>{
  const miss=a.unique('miss'),done=a.unique('done');
  a.load('r10',{base:'rcx',disp:O.elements});a.test('r10','r10');a.jcc('e',miss);a.load('rax',{base:'r10',disp:E.count});a.test('rax','rax');a.jcc('e',miss);
  a.store(slot(40),'r10');a.mov('rcx','rdx');a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',miss);
  a.load('r10',slot(40));a.load('r11',{base:'r10',disp:E.capacity});a.cmp('rax','r11');a.jcc('ae',miss);
  a.mov('rdx','rax');a.shl('rax',4);a.add('rax','r10');a.add('rax',E.values);a.load('r11',{base:'rax'});a.cmp('r11',HoleTag);a.jcc('e',miss);a.jmp(done);
  a.label(miss);a.mov('rax',0);a.label(done);
 });

 // RAX = integer index of the Number key, or jump to miss. Leaves RCX, RDX,
 // R8 untouched.
 const integerKey=(a:import('../backend/x64/assembler.js').Assembler,key:'r8'|'rdx',miss:string)=>{
  a.movsd('xmm0',{base:key,disp:8});a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ne',miss);a.jcc('p',miss);a.test('rax','rax');a.jcc('s',miss);
 };
 // RCX result Value*, RDX base Value*, R8 key Value*. RAX 1 when the read was
 // answered, else 0 with every argument register preserved.
 b.fn('rt.arrayGetFast',40,a=>{
  const miss=a.unique('miss'),done=a.unique('done'),number=a.unique('number');
  a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('ne',miss);
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('a',miss);
  a.load('rax',{base:'r8'});a.cmp('rax',3);a.jcc('e',number);a.cmp('rax',4);a.jcc('ne',miss);
  // Array "length": six UTF-16 code units, compared as 8 + 4 bytes.
  a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('ne',miss);
  a.load('r9',{base:'r8',disp:8});a.load('rax',{base:'r9'});a.cmp('rax',6);a.jcc('ne',miss);
  a.load('rax',{base:'r9',disp:8});a.mov('r11',0x0067006E0065006Cn);a.cmp('rax','r11');a.jcc('ne',miss);
  a.load('rax',{base:'r9',disp:16},32);a.cmp('rax',0x00680074);a.jcc('ne',miss);
  a.load('rax',{base:'r10',disp:O.length});a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');a.jmp(done);
  a.label(number);integerKey(a,'r8',miss);
  a.load('r11',{base:'r10',disp:O.elements});a.test('r11','r11');a.jcc('e',miss);
  a.load('r9',{base:'r11',disp:E.capacity});a.cmp('rax','r9');a.jcc('ae',miss);
  a.shl('rax',4);a.add('rax','r11');a.load('r9',{base:'rax',disp:E.values});a.cmp('r9',HoleTag);a.jcc('e',miss);
  a.store({base:'rcx'},'r9');a.load('r9',{base:'rax',disp:E.values+8});a.store({base:'rcx',disp:8},'r9');
  a.label(done);a.mov('rax',1);const end=a.unique('end');a.jmp(end);a.label(miss);a.mov('rax',0);a.label(end);
 });
 // RCX base Value*, RDX key Value*, R8 source Value*, R9 flags (bit 0: define).
 // RAX 1 when the write was done, else 0 with every argument register preserved.
 b.fn('rt.arraySetFast',88,a=>{
  const miss=a.unique('miss'),done=a.unique('done'),have=a.unique('have'),create=a.unique('create'),lengthOk=a.unique('lengthOk'),fits=a.unique('fits'),store=a.unique('store'),value=a.unique('value');
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.load('rax',{base:'rcx'});a.cmp('rax',5);a.jcc('ne',miss);
  a.load('r10',{base:'rcx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('a',miss);
  a.load('rax',{base:'rdx'});a.cmp('rax',3);a.jcc('ne',miss);
  integerKey(a,'rdx',miss);a.store(slot(72),'rax');
  a.load('r11',{base:'r10',disp:O.elements});a.test('r11','r11');a.jcc('ne',have);
  // First indexed write: a table only when the index is small enough to be
  // dense, sized for the array's length (up to 64K slots) or the index.
  a.cmp('rax',64);a.jcc('ae',miss);a.lea('rdx',{base:'rax',disp:1});
  {const sized=a.unique('sized'),capped=a.unique('capped');a.load('r9',{base:'r10',disp:O.kind});a.test('r9','r9');a.jcc('e',sized);a.load('r9',{base:'r10',disp:O.length});a.cmp('r9',65536);a.jcc('be',capped);a.mov('r9',65536);a.label(capped);a.cmp('r9','rdx');a.jcc('be',sized);a.mov('rdx','r9');a.label(sized);}
  a.mov('rcx','r10');a.call('rt.elementsBuild');
  a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r10',{base:'rcx',disp:8});a.load('r11',{base:'r10',disp:O.elements});a.load('rax',slot(72));
  a.label(have);a.load('r9',{base:'r11',disp:E.capacity});a.cmp('rax','r9');a.jcc('b',fits);
  // Beyond the table: grow while dense, otherwise leave it to a sparse node.
  a.load('r9',{base:'r11',disp:E.count});a.shl('r9',2);a.add('r9',64);a.cmp('rax','r9');a.jcc('ae',miss);
  a.mov('rcx','r10');a.lea('rdx',{base:'rax',disp:1});a.call('rt.elementsGrow');
  a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r10',{base:'rcx',disp:8});a.load('r11',{base:'r10',disp:O.elements});a.load('rax',slot(72));
  a.label(fits);a.shl('rax',4);a.add('rax','r11');a.add('rax',E.values);a.load('r9',{base:'rax'});a.cmp('r9',HoleTag);a.jcc('ne',store);
  // No own element here: create one when nothing on the way could observe it.
  a.label(create);a.store(slot(80),'rax');a.load('rax',{base:'r11',disp:E.nodes});a.test('rax','rax');a.jcc('ne',miss);
  a.load('rax',{base:'r10',disp:O.flags});a.and('rax',ObjectFlags.nonExtensible);a.test('rax','rax');a.jcc('ne',miss);
  const plain=a.unique('plain'),chainOk=a.unique('chainOk'),objectChain=a.unique('objectChain');
  a.load('rax',{base:'r10',disp:O.kind});a.test('rax','rax');a.jcc('e',plain);
  a.load('rax',slot(72));a.load('r9',{base:'r10',disp:O.length});a.cmp('rax','r9');a.jcc('b',lengthOk);a.load('rax',{base:'r10',disp:O.flags});a.and('rax',ObjectFlags.lengthReadonly);a.test('rax','rax');a.jcc('ne',miss);
  // A definition ([[DefineOwnProperty]]) never consults the prototype chain;
  // a plain assignment ([[Set]]) must find no setter or readonly element there.
  a.label(lengthOk);a.load('rax',slot(64));a.and('rax',1);a.test('rax','rax');a.jcc('ne',chainOk);
  a.load('rax',{base:'r10',disp:O.prototype});a.lea('r9',{rip:'rt.arrayPrototype'});a.cmp('rax','r9');a.jcc('ne',miss);
  a.load('rax',{base:'r9',disp:O.prototype});a.jmp(objectChain);
  // A plain object: no prototype at all, or the untouched Object.prototype.
  a.label(plain);a.load('rax',slot(64));a.and('rax',1);a.test('rax','rax');a.jcc('ne',chainOk);a.load('rax',{base:'r10',disp:O.prototype});a.test('rax','rax');a.jcc('e',chainOk);
  a.label(objectChain);a.lea('r9',{rip:'rt.objectPrototype'});a.cmp('rax','r9');a.jcc('ne',miss);
  a.load('rax',{base:'r9',disp:O.prototype});a.test('rax','rax');a.jcc('ne',miss);
  a.load('rax',{rip:'rt.indexedPrototypes'});a.test('rax','rax');a.jcc('ne',miss);
  a.label(chainOk);a.load('rax',{base:'r11',disp:E.count});a.add('rax',1);a.store({base:'r11',disp:E.count},'rax');
  a.load('rax',{base:'r10',disp:O.kind});a.test('rax','rax');a.jcc('e',value);
  a.load('rax',slot(72));a.load('r9',{base:'r10',disp:O.length});a.cmp('rax','r9');a.jcc('b',value);a.add('rax',1);a.store({base:'r10',disp:O.length},'rax');
  a.label(value);a.load('rax',slot(80));
  a.label(store);a.load('r9',{base:'r8'});a.store({base:'rax'},'r9');a.load('r9',{base:'r8',disp:8});a.store({base:'rax',disp:8},'r9');
  a.label(done);a.mov('rax',1);const end=a.unique('end');a.jmp(end);
  a.label(miss);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r9',slot(64));a.mov('rax',0);a.label(end);
 });
}
