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
/** Then 1 + the inline node index (ObjectLayout.slots) where the key was last found as an own property, or 0. */
export const PropertyCacheLayout={epoch:0,prototype:8,node:16,entry:16,entries:4,hash:8+16*4,bit:8+16*4+8,slot:8+16*4+16,size:8+16*4+24} as const;

/** Record of an `object.name = value` site (rt.setPropertyCached). */
export const SetCacheLayout={slot:0,prototype:8,epoch:16,bit:24,failed:32,size:40} as const;

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
 // site's record (SetCacheLayout).
 //
 // Writing an existing property: a node at the remembered inline index that
 // still holds the key as a writable data property takes the value.
 //
 // Creating a property (constructors and per-request objects add the same
 // fields in the same order): when the remembered index is the receiver's
 // next free inline node, the receiver's key filter rules the key out, the
 // receiver is extensible and its prototype is the one the record checked
 // at the current shape epoch (no object on that chain has the key, and all
 // of them are flagged so that adding it to one advances the epoch), the
 // node is filled and linked without any lookup.
 //
 // Anything else is rt.setProperty, after which the inline node of the key
 // (the newest first) is remembered and, if it is the newest, the chain is
 // checked for the create path.
 b.fn('rt.setPropertyCached',104,a=>{
  const S=SetCacheLayout,slow=a.unique('slow'),done=a.unique('done'),scan=a.unique('scan'),found=a.unique('found'),create=a.unique('create'),chain=a.unique('chain'),chainDone=a.unique('chainDone');
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');a.store(slot(72),'r10');
  a.load('rax',{base:'rcx'});a.cmp('rax',5);a.jcc('ne',slow);a.load('r11',{base:'rcx',disp:8});
  a.load('rax',{base:'r10',disp:S.slot});a.test('rax','rax');a.jcc('e',slow);a.sub('rax',1);
  a.load('r9',{base:'r11',disp:O.slots});a.shr('r9',32);a.cmp('rax','r9');a.jcc('e',create);a.jcc('a',slow);
  a.mov('r9',P.size);a.imul('rax','r9');a.add('rax','r11');a.add('rax',O.size);
  a.load('r9',{base:'rax',disp:P.key});a.load('r10',{base:'rdx',disp:8});a.cmp('r9','r10');a.jcc('ne',slow);
  a.load('r9',{base:'rax',disp:P.attributes});a.and('r9',A.accessor|A.writable);a.cmp('r9',A.writable);a.jcc('ne',slow);
  a.load('r9',{base:'rax',disp:P.value});a.cmp('r9',CellTag);a.jcc('e',slow);
  a.load('r9',{base:'r8'});a.store({base:'rax',disp:P.value},'r9');a.load('r9',{base:'r8',disp:8});a.store({base:'rax',disp:P.value+8},'r9');a.jmp(done);
  // RAX = the receiver's next inline node index, R11 the receiver.
  a.label(create);
  a.load('r9',{base:'r11',disp:O.slots});a.mov('r8','r9');a.shl('r8',32);a.shr('r8',32);a.cmp('rax','r8');a.jcc('ae',slow);
  a.load('r9',{base:'r11',disp:O.kind});a.test('r9','r9');a.jcc('ne',slow);
  a.load('r9',{base:'r11',disp:O.flags});a.and('r9',ObjectFlags.nonExtensible);a.test('r9','r9');a.jcc('ne',slow);
  a.load('r9',{base:'r11',disp:O.keys});a.test('r9','r9');a.jcc('ns',slow);a.load('r8',{base:'r10',disp:S.bit});a.test('r8','r8');a.jcc('e',slow);a.and('r9','r8');a.jcc('ne',slow);
  a.load('r9',{base:'r10',disp:S.epoch});a.load('r8',{rip:'rt.shapeEpoch'});a.cmp('r9','r8');a.jcc('ne',slow);
  a.load('r9',{base:'r10',disp:S.prototype});a.load('r8',{base:'r11',disp:O.prototype});a.cmp('r9','r8');a.jcc('ne',slow);
  a.lea('r9',{rip:'rt.globalObject'});a.cmp('r9','r11');a.jcc('e',slow);
  a.store(slot(80),'rax');bumpEpochIfPrototype(a,'r11');a.load('rax',slot(80));
  a.load('r9',{base:'r11',disp:O.slots});a.mov('r8',1);a.shl('r8',32);a.add('r9','r8');a.store({base:'r11',disp:O.slots},'r9');
  a.mov('r9',P.size);a.imul('rax','r9');a.add('rax','r11');a.add('rax',O.size);
  a.load('r9',{base:'rdx',disp:8});a.store({base:'rax',disp:P.key},'r9');a.mov('r9',A.ordinary);a.store({base:'rax',disp:P.attributes},'r9');
  a.load('r8',slot(56));a.load('r9',{base:'r8'});a.store({base:'rax',disp:P.value},'r9');a.load('r9',{base:'r8',disp:8});a.store({base:'rax',disp:P.value+8},'r9');
  a.load('r9',{base:'r11',disp:O.properties});a.store({base:'rax',disp:P.next},'r9');a.store({base:'r11',disp:O.properties},'rax');
  a.mov('rcx','r11');a.mov('rdx','rax');a.call('rt.propIndexAdd');a.jmp(done);
  a.label(slow);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r9',slot(64));a.call('rt.setProperty');
  // Remember the inline node now holding the key, if the base has one.
  a.load('rcx',slot(40));a.load('rax',{base:'rcx'});a.cmp('rax',5);a.jcc('ne',done);a.load('r11',{base:'rcx',disp:8});a.store(slot(80),'r11');
  a.load('r9',{base:'r11',disp:O.slots});a.shr('r9',32);a.store(slot(88),'r9');a.load('r10',slot(48));a.load('r10',{base:'r10',disp:8});
  a.label(scan);a.test('r9','r9');a.jcc('e',done);a.sub('r9',1);
  a.mov('rax','r9');a.mov('r8',P.size);a.imul('rax','r8');a.add('rax','r11');a.load('rax',{base:'rax',disp:O.size+P.key});a.cmp('rax','r10');a.jcc('ne',scan);
  a.label(found);a.mov('rax','r9');a.add('rax',1);a.load('r10',slot(72));a.store({base:'r10',disp:S.slot},'rax');
  // The newest node: the write created it. Check the prototype chain for
  // the create path (every object ordinary and without the key), flagging
  // each object, then record the prototype, the epoch and the key's bit.
  a.load('r8',slot(88));a.cmp('rax','r8');a.jcc('ne',done);
  // A chain that failed the check at this epoch is not walked again.
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:S.failed});a.load('r8',{rip:'rt.shapeEpoch'});a.cmp('rax','r8');a.jcc('e',done);
  a.load('rax',{base:'r10',disp:S.bit});a.test('rax','rax');{const hasBit=a.unique('hasBit');a.jcc('ne',hasBit);
   a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:8});a.call('rt.keyFilterBit');a.load('r10',slot(72));a.store({base:'r10',disp:S.bit},'rax');a.label(hasBit);}
  a.load('r11',slot(80));a.load('r11',{base:'r11',disp:O.prototype});a.store(slot(88),'r11');
  // A writable data property of the key on the chain still makes the
  // write create an own property (instance fields with defaults on the
  // prototype); the walk stops there. An accessor, a readonly property or
  // an exotic object fails the check.
  const failed=a.unique('failed');
  a.label(chain);a.test('r11','r11');a.jcc('e',chainDone);
  a.load('rax',{base:'r11',disp:O.kind});a.cmp('rax',2);a.jcc('a',failed);a.lea('rax',{rip:'rt.globalObject'});a.cmp('rax','r11');a.jcc('e',failed);
  a.store(slot(96),'r11');a.mov('rcx','r11');a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.ownNamedNode');
  a.load('r11',slot(96));a.load('r10',{base:'r11',disp:O.flags});a.or('r10',ObjectFlags.cachedPrototype);a.store({base:'r11',disp:O.flags},'r10');
  a.test('rax','rax');{const absent=a.unique('absent');a.jcc('e',absent);
   a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.accessor|A.writable);a.cmp('r10',A.writable);a.jcc('ne',failed);
   a.load('r10',{base:'rax',disp:P.value});a.cmp('r10',CellTag);a.jcc('e',failed);a.jmp(chainDone);a.label(absent);}
  a.load('r11',{base:'r11',disp:O.prototype});a.jmp(chain);
  a.label(failed);a.load('r10',slot(72));a.load('rax',{rip:'rt.shapeEpoch'});a.store({base:'r10',disp:S.failed},'rax');a.jmp(done);
  a.label(chainDone);a.load('r10',slot(72));a.load('rax',slot(88));a.store({base:'r10',disp:S.prototype},'rax');a.load('rax',{rip:'rt.shapeEpoch'});a.store({base:'r10',disp:S.epoch},'rax');
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
 b.fn('rt.getPropertyCached',104,a=>{
  const L=PropertyCacheLayout,ownFound=a.unique('ownFound'),getter=a.unique('getter'),generic=a.unique('generic'),done=a.unique('done'),object=a.unique('object'),ready=a.unique('ready'),scan=a.unique('scan'),inherited=a.unique('inherited'),read=a.unique('read'),fill=a.unique('fill'),flag=a.unique('flag'),flagged=a.unique('flagged');
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  // The receiver: an ordinary object, array or function, or the prototype
  // of a string, number or boolean.
  a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('e',object);a.cmp('rax',4);a.jcc('e',ready);a.cmp('rax',3);a.jcc('e',ready);a.cmp('rax',2);a.jcc('ne',generic);
  a.label(ready);a.mov('rcx','rdx');a.call('rt.propertyBase');a.mov('r10','rax');a.jmp(scan);
  a.label(object);a.load('r10',{base:'rdx',disp:8});emitNamedKindCheck(a,'r10',generic);
  {const plain=a.unique('plain');a.cmp('rax',namedTypedArrayKind);a.jcc('ne',plain);a.load('r11',{base:'r8',disp:8});a.load('r11',{base:'r11',disp:8},16);for(const c of '-IN'){a.cmp('r11',c.charCodeAt(0));a.jcc('e',generic);}a.label(plain);}
  a.lea('rax',{rip:'rt.globalObject'});a.cmp('rax','r10');a.jcc('e',generic);
  // An own property answers by itself. A receiver with a property index is
  // probed with the key's hash, kept in the record (no rehash per read).
  a.label(scan);a.store(slot(72),'r10');
  // Objects built the same way keep a property in the same inline node: the
  // node this site found last time answers if it still holds the key.
  {const noSlot=a.unique('noSlot');
   a.load('rax',{base:'r9',disp:L.slot});a.test('rax','rax');a.jcc('e',noSlot);a.sub('rax',1);
   a.load('r11',{base:'r10',disp:O.slots});a.shr('r11',32);a.cmp('rax','r11');a.jcc('ae',noSlot);
   a.mov('r11',P.size);a.imul('rax','r11');a.add('rax','r10');a.add('rax',O.size);
   a.load('r11',{base:'rax',disp:P.key});a.load('rcx',{base:'r8',disp:8});a.cmp('r11','rcx');a.jcc('e',read);
   a.label(noSlot);}
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
   // RAX = an own node of the receiver (slot 72): an inline one is remembered.
   a.label(ownFound);{const remembered=a.unique('remembered');
    a.load('r10',slot(72));a.mov('r11','rax');a.sub('r11','r10');a.sub('r11',O.size);a.jcc('b',remembered);
    a.load('r10',{base:'r10',disp:O.slots});a.shr('r10',32);a.mov('rcx',P.size);a.imul('r10','rcx');a.cmp('r11','r10');a.jcc('ae',remembered);
    a.store(slot(80),'rax');a.mov('rax','r11');a.mov('rdx',0);a.div('rcx');a.add('rax',1);a.load('r9',slot(64));a.store({base:'r9',disp:L.slot},'rax');a.load('rax',slot(80));
    a.label(remembered);a.jmp(read);}
   a.label(probed);}
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
   a.label(call);a.load('rax',slot(48));a.store(slot(32),'rax');a.load('rcx',slot(40));a.lea('rdx',slot(88));a.mov('r8',0);a.mov('r9',0);a.call('rt.invoke');a.jmp(done);}
  a.label(generic);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.call('rt.getProperty');
  a.label(done);
 });
}
