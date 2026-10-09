import {RuntimeBuilder,slot} from './abi.js';
import {ObjectLayout as O,ObjectFlags} from './object-layout.js';
import type {Assembler} from '../backend/x64/assembler.js';

/**
 * Inline caches for `'name' in object` and `object.hasOwnProperty(key)`.
 *
 * On a shaped object (shapes.ts) both answers depend only on the receiver's
 * shape, the key and, for `in`, the prototype chain. Without a cache, `in`
 * went through rt.hasProperty (a rooted frame, ToPropertyKey, a proxy scan of
 * the chain and rt.lookupProperty, which walks every shape's key list) and
 * `hasOwnProperty` through rt.invoke, the builtin's rooted frame, ToObject and
 * rt.ownAttributes.
 *
 * Every site gets a record (HasCacheLayout): two entries {shape, key,
 * prototype, result}, newest first, valid for one shape epoch.
 *
 * - `'name' in object` with a literal plain name (cacheableName): a hit needs
 *   the receiver's shape and prototype of an entry and the current epoch. A
 *   miss asks rt.hasProperty and then checks that the answer may be cached:
 *   the key is an own key of the shape, or every object on the chain up to
 *   the one that has the key (or all of them) is an ordinary object, array or
 *   function other than the global object. Those objects are flagged
 *   ObjectFlags.cachedPrototype, so adding or removing the key on one of them
 *   or changing its prototype advances the epoch, exactly as for the read
 *   caches (property-cache.ts). The key is not an index, "length" or
 *   "__proto__", so no element, virtual array length or the __proto__
 *   accessor can answer.
 * - `object.hasOwnProperty(key)` and `hasOwnProperty.call(object, key)` when
 *   the callee is %Object.prototype.hasOwnProperty% (checked at every call):
 *   a string key on a shaped receiver is answered from the shape alone. The
 *   entry is keyed by the key record's address; the epoch (which advances at
 *   every collection) keeps a freed record from being taken for a new one.
 *   Keys that may be array indices are left to the builtin (a shaped object
 *   keeps its elements apart from its shape).
 */
export const HasCacheLayout={epoch:0,shape:8,key:16,prototype:24,result:32,entry:32,entries:2,size:8+32*2} as const;

const L=HasCacheLayout;

/** R9 = the record, R11 = the current epoch: entry 0 moves to entry 1 (or is dropped when the record is stale) and the record takes the epoch. Clobbers RCX. */
function shiftEntries(a:Assembler):void {
 const same=a.unique('sameEpoch'),shifted=a.unique('shifted');
 a.load('rcx',{base:'r9',disp:L.epoch});a.cmp('rcx','r11');a.jcc('e',same);
 a.mov('rcx',0);for(const field of [L.shape,L.key,L.prototype,L.result])a.store({base:'r9',disp:field+L.entry},'rcx');a.jmp(shifted);
 a.label(same);for(const field of [L.shape,L.key,L.prototype,L.result]){a.load('rcx',{base:'r9',disp:field});a.store({base:'r9',disp:field+L.entry},'rcx');}
 a.label(shifted);a.store({base:'r9',disp:L.epoch},'r11');
}

export function emitHasCaches(b:RuntimeBuilder):void {
 // `'name' in object`: RCX result Value*, RDX object Value*, R8 key Value* (a
 // string literal with a cacheable name), R9 the site's record.
 b.fn('rt.icHas',40,a=>{
  const miss=a.unique('miss'),generic=a.unique('generic'),hit=a.unique('hit'),done=a.unique('done');
  a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('ne',generic);
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:O.shape});a.test('rax','rax');a.jcc('e',generic);
  a.store(slot(32),'rcx');
  a.load('r11',{base:'r9',disp:L.epoch});a.load('rcx',{rip:'rt.shapeEpoch'});a.cmp('r11','rcx');a.jcc('ne',miss);
  for(let i=0;i<L.entries;i++){
   const next=a.unique('entry'),e=L.entry*i;
   a.load('r11',{base:'r9',disp:L.shape+e});a.cmp('r11','rax');a.jcc('ne',next);
   a.load('r11',{base:'r9',disp:L.prototype+e});a.load('rcx',{base:'r10',disp:O.prototype});a.cmp('r11','rcx');a.jcc('ne',next);
   a.load('rax',{base:'r9',disp:L.result+e});a.jmp(hit);
   a.label(next);
  }
  a.label(miss);a.load('rcx',slot(32));a.call('rt.hasPropertyCached');a.jmp(done);
  a.label(hit);a.load('rcx',slot(32));a.store({base:'rcx',disp:8},'rax');a.mov('rax',2);a.store({base:'rcx'},'rax');a.jmp(done);
  a.label(generic);a.call('rt.hasProperty');
  a.label(done);
 });
 // The miss path of rt.icHas (same arguments; the object is a shaped object).
 b.fn('rt.hasPropertyCached',104,a=>{
  const done=a.unique('done'),loop=a.unique('loop'),dictionary=a.unique('dictionary'),next=a.unique('next'),present=a.unique('present'),absent=a.unique('absent'),fill=a.unique('fill');
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.call('rt.hasProperty');
  a.load('rdx',slot(48));a.load('r10',{base:'rdx',disp:8});a.store(slot(72),'r10');
  a.load('rcx',{base:'r10',disp:O.shape});a.test('rcx','rcx');a.jcc('e',done);
  // An own key of the shape: present whatever the chain holds.
  a.load('rdx',slot(56));a.load('rdx',{base:'rdx',disp:8});a.call('rt.shapeLookup');a.test('rax','rax');a.jcc('ns',present);
  a.load('r10',slot(72));a.load('r11',{base:'r10',disp:O.prototype});a.store(slot(80),'r11');
  // R11 = the next object on the chain (slot 80).
  a.label(loop);a.test('r11','r11');a.jcc('e',absent);
  a.load('rax',{base:'r11',disp:O.kind});a.cmp('rax',2);a.jcc('a',done);
  a.lea('rax',{rip:'rt.globalObject'});a.cmp('rax','r11');a.jcc('e',done);
  a.load('rax',{base:'r11',disp:O.flags});a.or('rax',ObjectFlags.cachedPrototype);a.store({base:'r11',disp:O.flags},'rax');
  a.load('rcx',{base:'r11',disp:O.shape});a.test('rcx','rcx');a.jcc('e',dictionary);
  a.load('rdx',slot(56));a.load('rdx',{base:'rdx',disp:8});a.call('rt.shapeLookup');a.test('rax','rax');a.jcc('ns',present);a.jmp(next);
  a.label(dictionary);a.mov('rcx','r11');a.load('rdx',slot(56));a.load('rdx',{base:'rdx',disp:8});a.call('rt.ownNamedNode');a.test('rax','rax');a.jcc('ne',present);
  a.label(next);a.load('r11',slot(80));a.load('r11',{base:'r11',disp:O.prototype});a.store(slot(80),'r11');a.jmp(loop);
  a.label(present);a.mov('r8',1);a.jmp(fill);
  a.label(absent);a.mov('r8',0);
  // The walk must agree with rt.hasProperty's answer (it always should).
  a.label(fill);a.load('rcx',slot(40));a.load('rax',{base:'rcx',disp:8});a.cmp('rax','r8');a.jcc('ne',done);
  a.load('r9',slot(64));a.load('r11',{rip:'rt.shapeEpoch'});shiftEntries(a);
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.shape});a.store({base:'r9',disp:L.shape},'rax');
  a.load('rax',{base:'r10',disp:O.prototype});a.store({base:'r9',disp:L.prototype},'rax');
  a.load('rax',slot(56));a.load('rax',{base:'rax',disp:8});a.store({base:'r9',disp:L.key},'rax');
  a.store({base:'r9',disp:L.result},'r8');
  a.label(done);
 });
 // `object.hasOwnProperty(key)` once the callee is known to be the builtin:
 // RCX result Value*, RDX this Value*, R8 key Value*, R9 the site's record ->
 // RAX 1 with the result stored, or 0 (nothing written) when the call must
 // be made as usual.
 b.fn('rt.icHasOwn',88,a=>{
  const fail=a.unique('fail'),miss=a.unique('miss'),hit=a.unique('hit'),done=a.unique('done');
  a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('ne',fail);
  a.load('rax',{base:'r8'});a.cmp('rax',4);a.jcc('ne',fail);
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:O.shape});a.test('rax','rax');a.jcc('e',fail);
  a.load('r11',{base:'r8',disp:8});a.store(slot(40),'rcx');
  a.load('rcx',{base:'r9',disp:L.epoch});a.load('rdx',{rip:'rt.shapeEpoch'});a.cmp('rcx','rdx');a.jcc('ne',miss);
  for(let i=0;i<L.entries;i++){
   const next=a.unique('entry'),e=L.entry*i;
   a.load('rcx',{base:'r9',disp:L.shape+e});a.cmp('rcx','rax');a.jcc('ne',next);
   a.load('rcx',{base:'r9',disp:L.key+e});a.cmp('rcx','r11');a.jcc('ne',next);
   a.load('rax',{base:'r9',disp:L.result+e});a.jmp(hit);
   a.label(next);
  }
  // A key that may be an array index (it starts with a digit) may be an element.
  a.label(miss);
  {const named=a.unique('named');a.load('rcx',{base:'r11'});a.test('rcx','rcx');a.jcc('e',named);
   a.load('rcx',{base:'r11',disp:8},16);a.sub('rcx',48);a.cmp('rcx',9);a.jcc('be',fail);a.label(named);}
  a.store(slot(48),'r9');a.store(slot(56),'r11');a.store(slot(64),'rax');
  a.mov('rcx','rax');a.mov('rdx','r11');a.call('rt.shapeLookup');
  a.mov('r8',0);{const own=a.unique('own');a.test('rax','rax');a.jcc('s',own);a.mov('r8',1);a.label(own);}
  a.load('r9',slot(48));a.load('r11',{rip:'rt.shapeEpoch'});shiftEntries(a);
  a.load('rax',slot(64));a.store({base:'r9',disp:L.shape},'rax');a.load('rax',slot(56));a.store({base:'r9',disp:L.key},'rax');
  a.mov('rax',0);a.store({base:'r9',disp:L.prototype},'rax');a.store({base:'r9',disp:L.result},'r8');a.mov('rax','r8');
  a.label(hit);a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',2);a.store({base:'rcx'},'rax');a.mov('rax',1);a.jmp(done);
  a.label(fail);a.mov('rax',0);
  a.label(done);
 });
}
