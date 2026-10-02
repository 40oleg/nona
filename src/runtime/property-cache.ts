import {RuntimeBuilder,slot} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A,ObjectFlags} from './object-layout.js';
import {CellTag} from './environment-layout.js';
import type {Assembler} from '../backend/x64/assembler.js';

/**
 * Inline caches for `object.name` reads.
 *
 * Without hidden classes, a named read is a walk: the key is checked, then
 * every object on the prototype chain has its property list scanned until
 * the key is found. For a method on a base class that is three lists and
 * about 140 instructions. The code generator gives every `object.name` read
 * whose name can only be a named property (cacheableName) a 32-byte record
 * in the data section, and rt.getPropertyCached remembers there which
 * property node answered the last read for which receiver.
 *
 * The receiver's own list is always scanned first: an own data property is
 * the answer by itself and needs no cache. What the cache remembers is the
 * node that an inherited read ended at, keyed by the receiver's prototype:
 * every instance of a class shares one, so a method call site stays hot
 * across instances, and four entries cover a site that sees a few classes. A
 * hit needs no own property for the key, the cached prototype and the
 * current shape epoch. The node's value and attributes are read at hit
 * time, so writes to the property need no invalidation.
 *
 * The shape epoch (rt.shapeEpoch) protects the chain above the receiver.
 * Every object that a cache fill walks through on the way to the holder is
 * flagged ObjectFlags.cachedPrototype, and the epoch advances when a
 * property is added to, removed from or redefined on a flagged object, when
 * any object's prototype changes, and at every collection (a freed prototype
 * could otherwise be mistaken for a new object at the same address). The
 * global object is never cached: script bindings alias its properties.
 */
/** Four entries of {prototype, node}, newest first, behind one epoch. */
export const PropertyCacheLayout={epoch:0,prototype:8,node:16,entry:16,entries:4,size:8+16*4} as const;

/** Names the cache may serve: plain names that are not indices, "length" or "__proto__". */
export function cacheableName(name:string):boolean {
 return name.length>0&&!(name.charCodeAt(0)>=48&&name.charCodeAt(0)<=57)&&name!=='length'&&name!=='__proto__';
}

/** Advances the shape epoch when the object header at REG is a flagged prototype. Clobbers RAX. */
export function bumpEpochIfPrototype(a:Assembler,reg:'rcx'|'rdx'|'r8'|'r9'|'r10'|'r11'):void {
 const skip=a.unique('noEpoch');
 a.load('rax',{base:reg,disp:O.flags});a.and('rax',ObjectFlags.cachedPrototype);a.test('rax','rax');a.jcc('e',skip);
 a.load('rax',{rip:'rt.shapeEpoch'});a.add('rax',1);a.store({rip:'rt.shapeEpoch'},'rax');a.label(skip);
}
/** Advances the shape epoch unconditionally. Clobbers RAX. */
export function bumpEpoch(a:Assembler):void {
 a.load('rax',{rip:'rt.shapeEpoch'});a.add('rax',1);a.store({rip:'rt.shapeEpoch'},'rax');
}

export function emitPropertyCache(b:RuntimeBuilder):void {
 b.data('rt.shapeEpoch',new Uint8Array([1,0,0,0,0,0,0,0]),'.data');
 // Last hit of rt.namedGetFast: the node and the object holding it (0 on a miss).
 for(const name of ['rt.namedGetNode','rt.namedGetHolder'])b.data(name,new Uint8Array(8),'.data');
 // RCX result Value*, RDX base Value*, R8 key Value* (a cacheable string
 // literal), R9 cache record.
 b.fn('rt.getPropertyCached',88,a=>{
  const L=PropertyCacheLayout,generic=a.unique('generic'),done=a.unique('done'),object=a.unique('object'),ready=a.unique('ready'),scan=a.unique('scan'),inherited=a.unique('inherited'),read=a.unique('read'),fill=a.unique('fill'),flag=a.unique('flag'),flagged=a.unique('flagged');
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  // The receiver: an ordinary object, array or function, or the prototype
  // of a string, number or boolean.
  a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('e',object);a.cmp('rax',4);a.jcc('e',ready);a.cmp('rax',3);a.jcc('e',ready);a.cmp('rax',2);a.jcc('ne',generic);
  a.label(ready);a.mov('rcx','rdx');a.call('rt.propertyBase');a.mov('r10','rax');a.jmp(scan);
  a.label(object);a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',2);a.jcc('a',generic);a.lea('rax',{rip:'rt.globalObject'});a.cmp('rax','r10');a.jcc('e',generic);
  // An own property answers by itself.
  a.label(scan);a.store(slot(72),'r10');a.mov('rcx','r10');a.load('rdx',{base:'r8',disp:8});a.call('rt.ownNamedNode');a.test('rax','rax');a.jcc('ne',read);
  // Otherwise the entry for the receiver's prototype, at the current epoch.
  a.load('r9',slot(64));a.load('r10',slot(72));a.load('r10',{base:'r10',disp:O.prototype});a.test('r10','r10');a.jcc('e',generic);
  a.load('rax',{base:'r9',disp:L.epoch});a.load('r11',{rip:'rt.shapeEpoch'});a.cmp('rax','r11');a.jcc('ne',fill);
  for(let i=0;i<L.entries;i++){
   const next=i+1<L.entries?a.unique('entry'):fill;
   a.load('rax',{base:'r9',disp:L.prototype+L.entry*i});a.cmp('rax','r10');a.jcc('ne',next);a.load('rax',{base:'r9',disp:L.node+L.entry*i});a.jmp(read);
   if(i+1<L.entries)a.label(next);
  }
  // RAX = the node: a data property that is not an argument cell.
  a.label(read);a.load('r11',{base:'rax',disp:P.attributes});a.and('r11',A.accessor);a.test('r11','r11');a.jcc('ne',generic);
  a.load('r11',{base:'rax',disp:P.value});a.cmp('r11',CellTag);a.jcc('e',generic);
  a.load('rcx',slot(40));a.store({base:'rcx'},'r11');a.load('r11',{base:'rax',disp:P.value+8});a.store({base:'rcx',disp:8},'r11');a.jmp(done);
  // Miss: the named fast path answers and reports the node it found; the
  // entries shift and the new one takes the first place.
  a.label(fill);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.call('rt.namedGetFast');a.test('rax','rax');a.jcc('e',generic);
  a.load('rax',{rip:'rt.namedGetNode'});a.test('rax','rax');a.jcc('e',done);
  a.load('r9',slot(64));a.load('r10',slot(72));a.load('r10',{base:'r10',disp:O.prototype});
  a.load('r11',{rip:'rt.shapeEpoch'});
  {const sameEpoch=a.unique('sameEpoch'),shifted=a.unique('shifted');a.load('rcx',{base:'r9',disp:L.epoch});a.cmp('rcx','r11');a.jcc('e',sameEpoch);
   // A stale record is emptied before the new entry goes in.
   a.mov('rcx',0);for(let i=1;i<L.entries;i++){a.store({base:'r9',disp:L.prototype+L.entry*i},'rcx');a.store({base:'r9',disp:L.node+L.entry*i},'rcx');}a.jmp(shifted);
   a.label(sameEpoch);for(let i=L.entries-1;i>0;i--){a.load('rcx',{base:'r9',disp:L.prototype+L.entry*(i-1)});a.store({base:'r9',disp:L.prototype+L.entry*i},'rcx');a.load('rcx',{base:'r9',disp:L.node+L.entry*(i-1)});a.store({base:'r9',disp:L.node+L.entry*i},'rcx');}
   a.label(shifted);}
  a.store({base:'r9',disp:L.epoch},'r11');a.store({base:'r9',disp:L.prototype},'r10');a.store({base:'r9',disp:L.node},'rax');
  // Flag every prototype from the receiver's up to the holder.
  a.load('r11',{rip:'rt.namedGetHolder'});
  a.label(flag);a.test('r10','r10');a.jcc('e',flagged);a.load('rcx',{base:'r10',disp:O.flags});a.or('rcx',ObjectFlags.cachedPrototype);a.store({base:'r10',disp:O.flags},'rcx');
  a.cmp('r10','r11');a.jcc('e',flagged);a.load('r10',{base:'r10',disp:O.prototype});a.jmp(flag);
  a.label(flagged);a.jmp(done);
  a.label(generic);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.call('rt.getProperty');
  a.label(done);
 });
}
