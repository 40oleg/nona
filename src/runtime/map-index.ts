import {RuntimeBuilder,slot,failIf} from './abi.js';
import {MapLayout,MapEntryLayout} from './map.js';

/**
 * Hash index for Map, Set, WeakMap and WeakSet entry lists.
 *
 * Entries live in a singly linked list that defines iteration order and that
 * the GC traces. rt.mapFind walked that list comparing every key with
 * SameValueZero, so a lookup was linear in the collection size and filling a
 * collection quadratic. A collection with at least mapIndexThreshold entries
 * gets an open-addressing table (raw heap, outside the GC) from key hash to
 * entry; the list stays the source of truth, the table only answers "which
 * entry holds this key". Insertion (rt.mapIndexAdd) and deletion
 * (rt.mapIndexDrop) keep an existing table in sync; clear and the weak-entry
 * pruning in the GC drop the table, which is rebuilt lazily by the next
 * lookup; the sweep frees it with its collection.
 *
 * Table: capacity (power of two), live entries, used slots (live + tombstones),
 * then capacity slots holding an entry pointer: 0 is empty, -1 a tombstone.
 * Every entry stores its key hash (MapEntryLayout.hash), so neither resizing
 * nor deletion rehashes keys. Used slots stay at most half the capacity, so
 * probing terminates.
 */
export const MapIndexLayout={capacity:0,live:8,used:16,entries:24} as const;
const T=MapIndexLayout;
/** Lists at least this long get a table on their first lookup. */
export const mapIndexThreshold=8;

export function emitMapIndex(b:RuntimeBuilder):void {
 // RCX key Value* -> RAX hash, odd and non-negative so that it is never 0 or -1.
 // Consistent with SameValueZero: +0 and -0 hash alike, every NaN hashes
 // alike, strings and BigInts hash by content, objects and symbols by identity.
 b.fn('rt.mapKeyHash',40,a=>{
  const number=a.unique('number'),content=a.unique('content'),pointer=a.unique('pointer'),mix=a.unique('mix'),done=a.unique('done'),nan=a.unique('nan'),bits=a.unique('bits');
  a.load('rax',{base:'rcx'});a.load('rdx',{base:'rcx',disp:8});
  a.cmp('rax',3);a.jcc('e',number);a.cmp('rax',4);a.jcc('e',content);a.cmp('rax',7);a.jcc('e',content);a.cmp('rax',6);a.jcc('e',content);a.cmp('rax',5);a.jcc('e',pointer);
  // undefined, null, boolean: the tag and the payload (0 or 1 for booleans).
  a.shl('rax',1);a.add('rax','rdx');a.add('rax',0x51);a.jmp(mix);
  a.label(number);a.movsd('xmm0',{base:'rcx',disp:8});a.ucomisd('xmm0','xmm0');a.jcc('p',nan);
  a.mov('r8',0);a.cvtsi2sd('xmm1','r8');a.ucomisd('xmm0','xmm1');a.jcc('ne',bits);a.mov('rdx',0);a.jmp(bits);
  a.label(nan);a.mov('rdx',0x7ff8000000000000n);
  a.label(bits);a.label(pointer);a.mov('rax','rdx');
  a.label(mix);a.mov('r9',0x9E3779B97F4A7C15n);a.imul('rax','r9');a.mov('r9','rax');a.shr('r9',31);a.xor('rax','r9');a.mov('r9',0xff51afd7ed558ccdn);a.imul('rax','r9');a.mov('r9','rax');a.shr('r9',29);a.xor('rax','r9');
  a.shl('rax',1);a.shr('rax',1);a.or('rax',1);a.jmp(done);
  // String, BigInt (a decimal string record) and Symbol records share the
  // property-key hash, which already hashes symbols by address.
  a.label(content);a.mov('rcx','rdx');a.call('rt.propKeyHash');
  a.label(done);
 });
 // RCX table, RDX hash, R8 key Value* or 0. RAX slot address: the slot holding
 // the key's entry (R10 = 1) or, when the key is absent, the slot an insert
 // should use — the first tombstone met, else the empty slot (R10 = 0). With
 // R8 = 0 it only finds that free slot.
 b.fn('rt.mapIndexProbe',88,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  const loop=a.unique('loop'),found=a.unique('found'),empty=a.unique('empty'),next=a.unique('next'),done=a.unique('done'),tombstone=a.unique('tombstone');
  a.load('r9',{base:'rcx',disp:T.capacity});a.sub('r9',1);a.mov('rax','rdx');a.shr('rax',7);a.and('rax','r9');a.store(slot(64),'rax');
  a.mov('rax',0);a.store(slot(72),'rax');
  a.label(loop);a.load('rax',slot(64));a.shl('rax',3);a.load('rcx',slot(40));a.add('rax','rcx');a.add('rax',T.entries);a.store(slot(80),'rax');
  a.load('r10',{base:'rax'});a.test('r10','r10');a.jcc('e',empty);a.cmp('r10',-1);a.jcc('e',tombstone);
  a.load('r11',slot(56));a.test('r11','r11');a.jcc('e',next);
  a.load('rdx',slot(48));a.load('r9',{base:'r10',disp:MapEntryLayout.hash});a.cmp('r9','rdx');a.jcc('ne',next);
  a.lea('rcx',{base:'r10',disp:MapEntryLayout.key});a.mov('rdx','r11');a.call('rt.mapSameValueZero');a.test('rax','rax');a.jcc('ne',found);a.jmp(next);
  a.label(tombstone);a.load('r11',slot(72));a.test('r11','r11');a.jcc('ne',next);a.store(slot(72),'rax');
  a.label(next);a.load('rcx',slot(40));a.load('r9',{base:'rcx',disp:T.capacity});a.sub('r9',1);
  a.load('rax',slot(64));a.add('rax',1);a.and('rax','r9');a.store(slot(64),'rax');a.jmp(loop);
  a.label(found);a.load('rax',slot(80));a.mov('r10',1);a.jmp(done);
  a.label(empty);a.load('rax',slot(80));a.load('r11',slot(72));a.test('r11','r11');a.jcc('e',done+'.fresh');a.mov('rax','r11');a.label(done+'.fresh');a.mov('r10',0);
  a.label(done);
 });
 // RCX table, R8 entry whose key is absent from the table (hash in the entry).
 b.fn('rt.mapIndexPlace',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(56),'r8');a.load('rdx',{base:'r8',disp:MapEntryLayout.hash});a.mov('r8',0);a.call('rt.mapIndexProbe');
  const reused=a.unique('reused');a.load('r10',{base:'rax'});a.test('r10','r10');a.jcc('ne',reused);
  a.load('rcx',slot(40));a.load('r11',{base:'rcx',disp:T.used});a.add('r11',1);a.store({base:'rcx',disp:T.used},'r11');
  a.label(reused);a.load('r8',slot(56));a.store({base:'rax'},'r8');
  a.load('rcx',slot(40));a.load('r11',{base:'rcx',disp:T.live});a.add('r11',1);a.store({base:'rcx',disp:T.live},'r11');
 });
 // RCX collection, RDX live entries to hold. Allocates a fresh table sized for
 // them, fills it from the active entries of the list and frees the old table.
 b.fn('rt.mapIndexResize',88,a=>{
  a.store(slot(40),'rcx');a.add('rdx',1);a.shl('rdx',2);a.mov('rax',16);
  const grow=a.unique('grow'),sized=a.unique('sized');a.label(grow);a.cmp('rax','rdx');a.jcc('ae',sized);a.shl('rax',1);a.jmp(grow);a.label(sized);
  a.store(slot(48),'rax');a.mov('r8','rax');a.shl('r8',3);a.add('r8',T.entries);
  a.load('rcx',{rip:'rt.heap'});a.mov('rdx',8);a.callImport('HeapAlloc');a.test('rax','rax');failIf(a,'e');
  a.load('r10',slot(48));a.store({base:'rax',disp:T.capacity},'r10');a.mov('r10',0);a.store({base:'rax',disp:T.live},'r10');a.store({base:'rax',disp:T.used},'r10');
  a.store(slot(56),'rax');
  const loop=a.unique('loop'),skip=a.unique('skip'),filled=a.unique('filled'),noOld=a.unique('noOld');
  a.load('rcx',slot(40));a.load('rax',{base:'rcx',disp:MapLayout.head});a.store(slot(64),'rax');
  a.label(loop);a.load('r8',slot(64));a.test('r8','r8');a.jcc('e',filled);
  a.load('r10',{base:'r8',disp:MapEntryLayout.active});a.test('r10','r10');a.jcc('e',skip);
  a.load('rcx',slot(56));a.call('rt.mapIndexPlace');
  a.label(skip);a.load('r8',slot(64));a.load('r8',{base:'r8',disp:MapEntryLayout.next});a.store(slot(64),'r8');a.jmp(loop);
  a.label(filled);a.load('rcx',slot(40));a.load('r8',{base:'rcx',disp:MapLayout.index});a.test('r8','r8');a.jcc('e',noOld);
  a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');
  a.label(noOld);a.load('rcx',slot(40));a.load('rax',slot(56));a.store({base:'rcx',disp:MapLayout.index},'rax');
 });
 // RCX collection, RDX entry just linked into its list, with its hash stored
 // and a key no other active entry has. Keeps an existing table in sync.
 b.fn('rt.mapIndexAdd',56,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');const done=a.unique('done'),room=a.unique('room');
  a.load('r10',{base:'rcx',disp:MapLayout.index});a.test('r10','r10');a.jcc('e',done);
  a.load('rdx',{base:'r10',disp:T.used});a.add('rdx',1);a.shl('rdx',1);a.load('r11',{base:'r10',disp:T.capacity});a.cmp('rdx','r11');a.jcc('be',room);
  a.load('rdx',{base:'r10',disp:T.live});a.call('rt.mapIndexResize');
  a.label(room);a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:MapLayout.index});a.load('r8',slot(48));a.call('rt.mapIndexPlace');
  a.label(done);
 });
 // RCX collection, RDX active entry about to be deactivated. Its slot becomes
 // a tombstone. Pure, no calls.
 b.fn('rt.mapIndexDrop',40,a=>{
  const done=a.unique('done'),loop=a.unique('loop'),next=a.unique('next');
  a.load('r10',{base:'rcx',disp:MapLayout.index});a.test('r10','r10');a.jcc('e',done);
  a.load('r9',{base:'r10',disp:T.capacity});a.sub('r9',1);a.load('rax',{base:'rdx',disp:MapEntryLayout.hash});a.shr('rax',7);a.and('rax','r9');
  a.label(loop);a.mov('r8','rax');a.shl('r8',3);a.add('r8','r10');a.add('r8',T.entries);a.load('r11',{base:'r8'});
  a.test('r11','r11');a.jcc('e',done);a.cmp('r11','rdx');a.jcc('ne',next);
  a.mov('r11',-1);a.store({base:'r8'},'r11');a.load('r11',{base:'r10',disp:T.live});a.sub('r11',1);a.store({base:'r10',disp:T.live},'r11');a.jmp(done);
  a.label(next);a.add('rax',1);a.and('rax','r9');a.jmp(loop);
  a.label(done);
 });
 // RCX collection: releases its table, if any. Safe inside the GC.
 b.fn('rt.mapIndexFree',56,a=>{
  const done=a.unique('done');a.load('r8',{base:'rcx',disp:MapLayout.index});a.test('r8','r8');a.jcc('e',done);
  a.store(slot(40),'rcx');a.mov('r10',0);a.store({base:'rcx',disp:MapLayout.index},'r10');
  a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');
  a.label(done);
 });
 // RCX collection, RDX key Value* -> RAX live entry or zero, through the table.
 // Builds the table from the list when the collection has none yet.
 b.fn('rt.mapIndexFind',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');const ready=a.unique('ready'),missing=a.unique('missing'),done=a.unique('done');
  a.load('r10',{base:'rcx',disp:MapLayout.index});a.test('r10','r10');a.jcc('ne',ready);
  a.load('rdx',{base:'rcx',disp:MapLayout.count});a.call('rt.mapIndexResize');
  a.label(ready);a.load('rcx',slot(48));a.call('rt.mapKeyHash');a.mov('rdx','rax');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:MapLayout.index});a.load('r8',slot(48));a.call('rt.mapIndexProbe');
  a.test('r10','r10');a.jcc('e',missing);a.load('rax',{base:'rax'});a.jmp(done);a.label(missing);a.mov('rax',0);a.label(done);
 });
}
