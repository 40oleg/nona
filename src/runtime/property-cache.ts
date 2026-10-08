import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ShapeLayout} from './shapes.js';
import {ValueListLayout} from './heap-layout.js';
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
 * a flagged object's prototype changes, and at every collection (a freed prototype
 * could otherwise be mistaken for a new object at the same address). The
 * global object is never cached: script bindings alias its properties.
 * Objects that are not flagged are on no cached chain: a receiver's own
 * list and its prototype are read at every hit, so creating objects with a
 * prototype, changing an ordinary object's prototype or deleting its own
 * properties leaves every cache valid.
 */
/** Four entries of {prototype, node}, newest first, behind one epoch. */
/** Then the key's property-index hash (rt.propKeyHash, seeded per process), computed on first use (0 until then). */
/** Then the key's bit in object key filters (rt.keyFilterBit), also 0 until first use. */
/** Then two entries of {shape, slot, offset} for shaped receivers (shapes.ts): the key's slot, or -1 when it is not an own key, and the slot's byte offset in the object when it is an inline slot (else 0), newest first. Generated code reads the first entry's inline slot itself. */
export const PropertyCacheLayout={epoch:0,prototype:8,node:16,entry:16,entries:4,hash:8+16*4,bit:8+16*4+8,shape:8+16*4+16,slot:8+16*4+24,offset:8+16*4+32,shapeEntry:24,shapeEntries:2,size:8+16*4+16+24*2} as const;

/** Record of an `object.name = value` site (rt.setPropertyCached). */
/** {shape, slot, offset}: the slot of the key in receivers of that shape, and its byte offset in the object when it is inline (else 0; generated code writes there itself); {from, to, prototype, epoch}: the transition that adds the key; failed: the epoch at which the chain check failed. */
export const SetCacheLayout={shape:0,slot:8,offset:16,from:24,to:32,prototype:40,epoch:48,failed:56,size:64} as const;

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

/**
 * Object kinds whose named properties (keys that are not indices and not
 * "length" of an array or wrapper) follow the ordinary [[Get]] and [[Set]]:
 * plain objects, arrays, functions, arguments, wrappers, errors, dates,
 * iterators, generators, regular expressions, buffers, views, typed arrays
 * (see ordinaryObject for their numeric names), maps, sets and their
 * iterators and weak variants. Proxies and unknown kinds stay generic.
 */
// The numbers of ArgumentsKind ... WeakSetKind, spelled out to keep this
// module free of import cycles (tests/fast-paths.test.ts checks them).
export const namedPropertyKinds=[0,1,2,3,4,5,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
export const namedTypedArrayKind=13;
/** Jumps to MISS unless the object header in REG has a kind of namedPropertyKinds. Leaves the kind in RAX; clobbers R11. */
export function emitNamedKindCheck(a:Assembler,reg:'r10'|'r11'|'rcx',miss:string):void {
 a.load('rax',{base:reg,disp:O.kind});a.cmp('rax',32);a.jcc('ae',miss);
 a.lea('r11',{rip:'rt.namedKinds'});a.add('r11','rax');a.load('r11',{base:'r11'},8);a.test('r11','r11');a.jcc('e',miss);
}

export function emitPropertyCache(b:RuntimeBuilder):void {
 // `object.name = value`: RCX base Value*, RDX key Value* (a cacheable
 // string literal), R8 source Value*, R9 flags as for rt.setProperty, R10 the
 // site's record (SetCacheLayout). Only shaped receivers (shapes.ts) hit.
 //
 // Writing an existing property: the receiver has the shape the record saw,
 // so the key is in the remembered slot (every property of a shaped object
 // is a writable data property).
 //
 // Creating a property (constructors and per-request objects add the same
 // fields in the same order): the receiver has the shape the record saw
 // before the key was added, the same prototype, is extensible, and the
 // shape epoch is unchanged (no object on that chain has the key, and all of
 // them are flagged so that adding it to one advances the epoch): the value
 // goes into the new key's slot and the receiver takes the new shape.
 //
 // Anything else is rt.setProperty, after which the record learns from the
 // receiver's shape.
 b.fn('rt.setPropertyCached',104,a=>{
  const S=SetCacheLayout,slow=a.unique('slow'),done=a.unique('done'),transition=a.unique('transition'),write=a.unique('write'),chain=a.unique('chain'),chainDone=a.unique('chainDone'),failed=a.unique('failed');
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');a.store(slot(72),'r10');
  a.mov('rax',0);a.store(slot(80),'rax');
  a.load('rax',{base:'rcx'});a.cmp('rax',5);a.jcc('ne',slow);a.load('r11',{base:'rcx',disp:8});
  a.load('rax',{base:'r11',disp:O.shape});a.test('rax','rax');a.jcc('e',slow);a.store(slot(80),'rax');
  a.load('r9',{base:'r10',disp:S.shape});a.cmp('rax','r9');a.jcc('ne',transition);
  a.load('r9',{base:'r10',disp:S.slot});a.jmp(write);
  a.label(transition);a.load('r9',{base:'r10',disp:S.from});a.cmp('rax','r9');a.jcc('ne',slow);
  a.load('r9',{base:'r10',disp:S.epoch});a.load('rax',{rip:'rt.shapeEpoch'});a.cmp('r9','rax');a.jcc('ne',slow);
  a.load('r9',{base:'r10',disp:S.prototype});a.load('rax',{base:'r11',disp:O.prototype});a.cmp('r9','rax');a.jcc('ne',slow);
  a.load('rax',{base:'r11',disp:O.flags});a.and('rax',ObjectFlags.nonExtensible);a.test('rax','rax');a.jcc('ne',slow);
  // The new key's slot must exist: inline, or in an out-of-line list with room.
  a.load('rax',{base:'r10',disp:S.to});a.load('r9',{base:'rax',disp:ShapeLayout.count});a.sub('r9',1);a.load('rax',{base:'rax',disp:ShapeLayout.capacity});
  {const room=a.unique('room');a.cmp('r9','rax');a.jcc('b',room);a.load('rdx',{base:'r11',disp:O.keys});a.test('rdx','rdx');a.jcc('e',slow);
   a.mov('rcx','r9');a.sub('rcx','rax');a.load('rdx',{base:'rdx',disp:ValueListLayout.count});a.cmp('rcx','rdx');a.jcc('ae',slow);a.label(room);}
  bumpEpochIfPrototype(a,'r11');
  a.load('rax',{base:'r10',disp:S.to});a.store({base:'r11',disp:O.shape},'rax');
  // R9 = the slot, R11 = the receiver header.
  a.label(write);
  {const inline=a.unique('inline'),ready=a.unique('ready');
   a.load('rax',{base:'r11',disp:O.shape});a.load('rax',{base:'rax',disp:ShapeLayout.capacity});a.cmp('r9','rax');a.jcc('b',inline);
   a.sub('r9','rax');a.shl('r9',4);a.load('rax',{base:'r11',disp:O.keys});a.add('r9','rax');a.add('r9',ValueListLayout.values);a.jmp(ready);
   a.label(inline);a.shl('r9',4);a.add('r9','r11');a.add('r9',O.size);
   a.label(ready);a.load('r8',slot(56));a.load('rax',{base:'r8'});a.store({base:'r9'},'rax');a.load('rax',{base:'r8',disp:8});a.store({base:'r9',disp:8},'rax');a.jmp(done);}
  a.label(slow);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r9',slot(64));a.call('rt.setProperty');
  // Learn from the receiver's shape after the write (slot 80: its shape before).
  a.load('rcx',slot(40));a.load('rax',{base:'rcx'});a.cmp('rax',5);a.jcc('ne',done);a.load('r11',{base:'rcx',disp:8});a.store(slot(88),'r11');
  a.load('rcx',{base:'r11',disp:O.shape});a.test('rcx','rcx');a.jcc('e',done);
  a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.shapeLookup');a.test('rax','rax');a.jcc('s',done);
  a.load('r10',slot(72));a.load('r11',slot(88));a.load('rcx',{base:'r11',disp:O.shape});
  a.store({base:'r10',disp:S.shape},'rcx');a.store({base:'r10',disp:S.slot},'rax');
  {const noOffset=a.unique('noOffset');a.mov('r9',0);a.load('rdx',{base:'rcx',disp:ShapeLayout.capacity});a.cmp('rax','rdx');a.jcc('ae',noOffset);
   a.mov('r9','rax');a.shl('r9',4);a.add('r9',O.size);a.label(noOffset);a.store({base:'r10',disp:S.offset},'r9');}
  // A transition this write made: the new shape is the old one plus the key.
  a.load('rdx',slot(80));a.test('rdx','rdx');a.jcc('e',done);a.load('r9',{base:'rcx',disp:ShapeLayout.parent});a.cmp('r9','rdx');a.jcc('ne',done);
  a.load('r9',{base:'rcx',disp:ShapeLayout.count});a.sub('r9',1);a.cmp('r9','rax');a.jcc('ne',done);
  // A chain that failed the check at this epoch is not walked again.
  a.load('rax',{base:'r10',disp:S.failed});a.load('r9',{rip:'rt.shapeEpoch'});a.cmp('rax','r9');a.jcc('e',done);
  a.load('r11',{base:'r11',disp:O.prototype});a.store(slot(96),'r11');
  // Check the prototype chain for the create path (every object ordinary
  // and without the key), flagging each object. A writable data property
  // of the key on the chain still makes the write create an own property
  // (instance fields with defaults on the prototype); the walk stops there.
  // An accessor, a readonly property or an exotic object fails the check.
  a.label(chain);a.test('r11','r11');a.jcc('e',chainDone);
  a.load('rax',{base:'r11',disp:O.kind});a.cmp('rax',2);a.jcc('a',failed);a.lea('rax',{rip:'rt.globalObject'});a.cmp('rax','r11');a.jcc('e',failed);
  a.store(slot(88),'r11');a.mov('rcx','r11');a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.ownNamedNode');
  a.load('r11',slot(88));a.load('r10',{base:'r11',disp:O.flags});a.or('r10',ObjectFlags.cachedPrototype);a.store({base:'r11',disp:O.flags},'r10');
  a.test('rax','rax');{const absent=a.unique('absent');a.jcc('e',absent);
   a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.accessor|A.writable);a.cmp('r10',A.writable);a.jcc('ne',failed);
   a.load('r10',{base:'rax',disp:P.value});a.cmp('r10',CellTag);a.jcc('e',failed);a.jmp(chainDone);a.label(absent);}
  a.load('r11',{base:'r11',disp:O.prototype});a.jmp(chain);
  a.label(failed);a.load('r10',slot(72));a.load('rax',{rip:'rt.shapeEpoch'});a.store({base:'r10',disp:S.failed},'rax');a.jmp(done);
  a.label(chainDone);a.load('r10',slot(72));a.load('rax',slot(80));a.store({base:'r10',disp:S.from},'rax');
  a.load('rax',{base:'r10',disp:S.shape});a.store({base:'r10',disp:S.to},'rax');
  a.load('rax',slot(96));a.store({base:'r10',disp:S.prototype},'rax');a.load('rax',{rip:'rt.shapeEpoch'});a.store({base:'r10',disp:S.epoch},'rax');
  a.label(done);
 });
 // The hit paths of the two caches, called by every `object.name` site
 // (property access is everywhere, so the sites stay a call each): RCX..R9
 // as for rt.getPropertyCached. A shaped receiver whose shape is the first
 // entry's reads its inline slot; one without the key reads the data
 // property that the first prototype entry names at the current shape epoch
 // (a method of a class instance). Anything else is rt.getPropertyCached.
 b.fn('rt.icGet',40,a=>{
  const L=PropertyCacheLayout,miss=a.unique('miss'),inherited=a.unique('inherited'),copy=a.unique('copy'),done=a.unique('done');
  a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('ne',miss);a.load('r10',{base:'rdx',disp:8});
  a.load('rax',{base:'r10',disp:O.shape});a.test('rax','rax');a.jcc('e',miss);a.load('r11',{base:'r9',disp:L.shape});a.cmp('rax','r11');a.jcc('ne',miss);
  a.load('r11',{base:'r9',disp:L.offset});a.test('r11','r11');a.jcc('e',inherited);a.add('r11','r10');
  a.label(copy);a.load('rax',{base:'r11'});a.store({base:'rcx'},'rax');a.load('rax',{base:'r11',disp:8});a.store({base:'rcx',disp:8},'rax');a.jmp(done);
  a.label(inherited);a.load('r11',{base:'r9',disp:L.slot});a.test('r11','r11');a.jcc('ns',miss);
  a.load('rax',{base:'r10',disp:O.prototype});a.load('r11',{base:'r9',disp:L.prototype});a.cmp('rax','r11');a.jcc('ne',miss);
  a.load('rax',{base:'r9',disp:L.epoch});a.load('r11',{rip:'rt.shapeEpoch'});a.cmp('rax','r11');a.jcc('ne',miss);
  a.load('r11',{base:'r9',disp:L.node});a.load('rax',{base:'r11',disp:P.attributes});a.and('rax',A.accessor);a.test('rax','rax');a.jcc('ne',miss);
  a.load('rax',{base:'r11',disp:P.value});a.cmp('rax',CellTag);a.jcc('e',miss);a.add('r11',P.value);a.jmp(copy);
  a.label(miss);a.call('rt.getPropertyCached');
  a.label(done);
 });
 // `object.name = value`: RCX..R10 as for rt.setPropertyCached. A shaped
 // receiver whose shape is the record's takes the value in its inline slot.
 b.fn('rt.icSet',40,a=>{
  const S=SetCacheLayout,miss=a.unique('miss'),done=a.unique('done');
  a.load('rax',{base:'rcx'});a.cmp('rax',5);a.jcc('ne',miss);a.load('rax',{base:'rcx',disp:8});
  a.load('r11',{base:'rax',disp:O.shape});a.test('r11','r11');a.jcc('e',miss);
  a.store(slot(32),'r9');a.load('r9',{base:'r10',disp:S.shape});a.cmp('r11','r9');a.load('r9',slot(32));a.jcc('ne',miss);
  a.load('r11',{base:'r10',disp:S.offset});a.test('r11','r11');a.jcc('e',miss);a.add('r11','rax');
  a.load('rax',{base:'r8'});a.store({base:'r11'},'rax');a.load('rax',{base:'r8',disp:8});a.store({base:'r11',disp:8},'rax');a.jmp(done);
  a.label(miss);a.call('rt.setPropertyCached');
  a.label(done);
 });
 {const table=new Uint8Array(32);for(const kind of namedPropertyKinds)table[kind]=1;b.data('rt.namedKinds',table,'.data');}
 b.data('rt.shapeEpoch',new Uint8Array([1,0,0,0,0,0,0,0]),'.data');
 // Last hit of rt.namedGetFast: the node and the object holding it (0 on a miss).
 for(const name of ['rt.namedGetNode','rt.namedGetHolder'])b.data(name,new Uint8Array(8),'.data');
 // RCX result Value*, RDX base Value*, R8 key Value* (a cacheable string
 // literal), R9 cache record.
 // `object.length` sites: a string's or an array's length directly, the
 // inline cache for ordinary objects, functions and typed arrays (whose
 // length is the inherited accessor), and the generic read for anything else
 // (string wrappers and other exotic objects have no node for it).
 // RCX result Value*, RDX base Value*, R8 key Value* ("length"), R9 cache record.
 b.fn('rt.getLengthCached',40,a=>{
  const string=a.unique('string'),cached=a.unique('cached'),generic=a.unique('generic'),number=a.unique('number'),done=a.unique('done');
  a.load('rax',{base:'rdx'});a.load('r10',{base:'rdx',disp:8});a.cmp('rax',4);a.jcc('e',string);a.cmp('rax',5);a.jcc('ne',generic);
  a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('ne',cached+'.kind');a.load('rax',{base:'r10',disp:O.length});a.jmp(number);
  a.label(cached+'.kind');a.test('rax','rax');a.jcc('e',cached);a.cmp('rax',2);a.jcc('e',cached);a.cmp('rax',namedTypedArrayKind);a.jcc('e',cached);
  a.label(generic);a.call('rt.getProperty');a.jmp(done);
  a.label(cached);a.call('rt.getPropertyCached');a.jmp(done);
  a.label(string);a.load('rax',{base:'r10'});
  a.label(number);a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
  a.label(done);
 });
 // rt.superGetCached: the same for `super.name` (R9 cache, fifth argument
 // the receiver): the lookup starts at the home object's prototype (RDX,
 // which must be an object) and a getter is called with the receiver.
 for(const withReceiver of [false,true])b.fn(withReceiver?'rt.superGetCached':'rt.getPropertyCached',104,a=>{
  if(withReceiver){a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');}
  const L=PropertyCacheLayout,ownFound=a.unique('ownFound'),getter=a.unique('getter'),generic=a.unique('generic'),done=a.unique('done'),object=a.unique('object'),ready=a.unique('ready'),scan=a.unique('scan'),inherited=a.unique('inherited'),read=a.unique('read'),fill=a.unique('fill'),flag=a.unique('flag'),flagged=a.unique('flagged'),prototypeEntries=a.unique('prototypeEntries');
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  // The receiver: an ordinary object, array or function, or the prototype
  // of a string, number or boolean.
  a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('e',object);a.cmp('rax',4);a.jcc('e',ready);a.cmp('rax',3);a.jcc('e',ready);a.cmp('rax',2);a.jcc('ne',generic);
  a.label(ready);a.mov('rcx','rdx');a.call('rt.propertyBase');a.mov('r10','rax');a.jmp(scan);
  a.label(object);a.load('r10',{base:'rdx',disp:8});
  // A shaped receiver (shapes.ts): the entry for its shape says which slot
  // holds the key, or that the key is not an own property and the prototype
  // entries below answer. A miss looks the key up in the shape and takes the
  // first entry. Only plain objects are shaped, so this needs no kind checks.
  {const unshaped=a.unique('unshaped'),slotKnown=a.unique('slotKnown'),inline=a.unique('inlineSlot');
   a.load('rax',{base:'r10',disp:O.shape});a.test('rax','rax');a.jcc('e',unshaped);
   for(let i=0;i<L.shapeEntries;i++){const next=a.unique('shapeEntry');a.load('r11',{base:'r9',disp:L.shape+L.shapeEntry*i});a.cmp('rax','r11');a.jcc('ne',next);a.load('r11',{base:'r9',disp:L.slot+L.shapeEntry*i});a.jmp(slotKnown);a.label(next);}
   a.store(slot(72),'r10');a.mov('rcx','rax');a.load('rdx',{base:'r8',disp:8});a.call('rt.shapeLookup');
   a.load('r9',slot(64));a.load('r10',slot(72));a.load('r8',slot(56));
   for(const field of [L.shape,L.slot,L.offset]){a.load('r11',{base:'r9',disp:field});a.store({base:'r9',disp:field+L.shapeEntry},'r11');}
   a.load('r11',{base:'r10',disp:O.shape});a.store({base:'r9',disp:L.shape},'r11');a.store({base:'r9',disp:L.slot},'rax');
   {const noOffset=a.unique('noOffset');a.mov('rcx',0);a.test('rax','rax');a.jcc('s',noOffset);a.load('rdx',{base:'r11',disp:ShapeLayout.capacity});a.cmp('rax','rdx');a.jcc('ae',noOffset);
    a.mov('rcx','rax');a.shl('rcx',4);a.add('rcx',O.size);a.label(noOffset);a.store({base:'r9',disp:L.offset},'rcx');}
   a.mov('r11','rax');
   a.label(slotKnown);a.test('r11','r11');{const own=a.unique('ownSlot');a.jcc('ns',own);a.store(slot(72),'r10');a.jmp(prototypeEntries);a.label(own);}
   a.load('rax',{base:'r10',disp:O.shape});a.load('rax',{base:'rax',disp:ShapeLayout.capacity});a.cmp('r11','rax');a.jcc('b',inline);
   a.sub('r11','rax');a.shl('r11',4);a.load('rax',{base:'r10',disp:O.keys});a.add('r11','rax');a.add('r11',ValueListLayout.values);a.jmp(inline+'.ready');
   a.label(inline);a.shl('r11',4);a.add('r11','r10');a.add('r11',O.size);
   a.label(inline+'.ready');a.load('rcx',slot(40));a.load('rax',{base:'r11'});a.store({base:'rcx'},'rax');a.load('rax',{base:'r11',disp:8});a.store({base:'rcx',disp:8},'rax');a.jmp(done);
   a.label(unshaped);}
  emitNamedKindCheck(a,'r10',generic);
  {const plain=a.unique('plain');a.cmp('rax',namedTypedArrayKind);a.jcc('ne',plain);a.load('r11',{base:'r8',disp:8});a.load('r11',{base:'r11',disp:8},16);for(const c of '-IN'){a.cmp('r11',c.charCodeAt(0));a.jcc('e',generic);}a.label(plain);}
  a.lea('rax',{rip:'rt.globalObject'});a.cmp('rax','r10');a.jcc('e',generic);
  // An own property answers by itself. A receiver with a property index is
  // probed with the key's hash, kept in the record (no rehash per read).
  a.label(scan);a.store(slot(72),'r10');
  {const listScan=a.unique('listScan'),hashed=a.unique('hashed'),probed=a.unique('probed');
   // A complete key filter of the receiver without the key's bit (kept in
   // the record) rules out an own property without touching the key.
   {const unfiltered=a.unique('unfiltered'),haveBit=a.unique('haveBit');
    a.load('rax',{base:'r10',disp:O.keys});a.test('rax','rax');a.jcc('ns',unfiltered);
    a.load('r11',{base:'r9',disp:L.bit});a.test('r11','r11');a.jcc('ne',haveBit);
    a.load('rcx',{base:'r8',disp:8});a.call('rt.keyFilterBit');a.mov('r11','rax');a.load('r9',slot(64));a.store({base:'r9',disp:L.bit},'r11');
    a.load('r8',slot(56));a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.keys});
    a.label(haveBit);a.and('rax','r11');a.jcc('e',probed);
    a.label(unfiltered);}
   a.load('rax',{base:'r10',disp:O.index});a.test('rax','rax');a.jcc('e',listScan);
   a.load('rdx',{base:'r9',disp:L.hash});a.test('rdx','rdx');a.jcc('ne',hashed);
   a.load('rcx',{base:'r8',disp:8});a.call('rt.propKeyHash');a.load('r9',slot(64));a.store({base:'r9',disp:L.hash},'rax');a.mov('rdx','rax');a.load('r8',slot(56));a.load('r10',slot(72));
   a.label(hashed);a.load('rcx',{base:'r10',disp:O.index});a.load('r8',{base:'r8',disp:8});a.call('rt.propIndexProbe');a.test('r10','r10');a.jcc('e',probed);
   a.load('rax',{base:'rax',disp:8});a.jmp(ownFound);
   a.label(listScan);a.mov('rcx','r10');a.load('rdx',{base:'r8',disp:8});a.call('rt.ownNamedNodeScan');a.test('rax','rax');a.jcc('ne',ownFound);
   a.jmp(probed);
   // RAX = an own node of the receiver (slot 72).
   a.label(ownFound);a.jmp(read);
   a.label(probed);}
  a.label(prototypeEntries);
  // Otherwise the entry for the receiver's prototype, at the current epoch.
  a.load('r9',slot(64));a.load('r10',slot(72));a.load('r10',{base:'r10',disp:O.prototype});a.test('r10','r10');a.jcc('e',generic);
  a.load('rax',{base:'r9',disp:L.epoch});a.load('r11',{rip:'rt.shapeEpoch'});a.cmp('rax','r11');a.jcc('ne',fill);
  for(let i=0;i<L.entries;i++){
   const next=i+1<L.entries?a.unique('entry'):fill;
   a.load('rax',{base:'r9',disp:L.prototype+L.entry*i});a.cmp('rax','r10');a.jcc('ne',next);a.load('rax',{base:'r9',disp:L.node+L.entry*i});a.jmp(read);
   if(i+1<L.entries)a.label(next);
  }
  // RAX = the node: a data property that is not an argument cell, or an
  // accessor whose getter is called with the original receiver.
  a.label(read);a.load('r11',{base:'rax',disp:P.attributes});a.and('r11',A.accessor);a.test('r11','r11');a.jcc('ne',getter);
  a.load('r11',{base:'rax',disp:P.value});a.cmp('r11',CellTag);a.jcc('e',generic);
  a.load('rcx',slot(40));a.store({base:'rcx'},'r11');a.load('r11',{base:'rax',disp:P.value+8});a.store({base:'rcx',disp:8},'r11');a.jmp(done);
  // Miss: the named fast path answers and reports the node it found; the
  // entries shift and the new one takes the first place.
  // An accessor found by the fast path (answered 0, node reported) is
  // remembered like a data property and then read through its getter.
  a.label(fill);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.call('rt.namedGetFast');a.store(slot(80),'rax');
  {const node=a.unique('node');a.load('rax',{rip:'rt.namedGetNode'});a.test('rax','rax');a.jcc('ne',node);a.load('r10',slot(80));a.test('r10','r10');a.jcc('e',generic);a.jmp(done);a.label(node);}
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
  a.label(flagged);a.load('r10',slot(80));a.test('r10','r10');a.jcc('ne',done);a.load('rax',{rip:'rt.namedGetNode'});a.jmp(read);
  a.label(getter);a.load('r11',{base:'rax',disp:P.getter});a.store(slot(88),'r11');a.load('r11',{base:'rax',disp:P.getter+8});a.store(slot(96),'r11');
  {const call=a.unique('call');a.load('r11',slot(88));a.test('r11','r11');a.jcc('ne',call);
   a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');a.jmp(done);
   a.label(call);a.load('rax',withReceiver?slot(104+40):slot(48));a.store(slot(32),'rax');a.load('rcx',slot(40));a.lea('rdx',slot(88));a.mov('r8',0);a.mov('r9',0);a.call('rt.invoke');a.jmp(done);}
  a.label(generic);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));if(withReceiver){a.load('r9',slot(104+40));a.call('rt.getPropertyWithReceiver');}else a.call('rt.getProperty');
  a.label(done);
 });
}
