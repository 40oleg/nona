import {RuntimeBuilder,slot} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P} from './object-layout.js';

/**
 * Hash index for property lists.
 *
 * Own properties live in a singly linked list, so a lookup walked the whole
 * list: finding an element of a large array, or any named key of an object
 * with many elements, was linear, and building such objects quadratic. An
 * object whose lookups walk a long list gets an open-addressing hash table
 * (raw heap, outside the GC) from key to property node. The list stays the
 * source of truth for key order and for the GC; the table only speeds up
 * rt.findOwnProperty. Node creation (rt.propIndexAdd) and unlinking
 * (rt.propIndexDrop) keep an existing table in sync; the GC frees the table
 * with its object.
 *
 * Table: capacity (power of two), live entries, used slots (live +
 * tombstones), then capacity entries of {hash, node}. Hash 0 marks an empty
 * slot and -1 a removed one; key hashes are odd and non-negative. Used slots
 * stay at most half the capacity, so probing terminates.
 */
export const PropertyIndexLayout={capacity:0,live:8,used:16,entries:24} as const;
const T=PropertyIndexLayout;
/** Linear scans at least this long build a table for the object. */
export const propertyIndexThreshold=32;

export function emitPropertyIndex(b:RuntimeBuilder):void {
 // RCX key (string or symbol record) -> RAX hash. Pure, no calls.
 b.fn('rt.propKeyHash',40,a=>{
  const symbol=a.unique('symbol'),loop=a.unique('loop'),done=a.unique('done');
  a.load('r8',{base:'rcx'});a.cmp('r8',-1);a.jcc('e',symbol);
  a.mov('rax',0xcbf29ce484222325n);a.xor('rax','r8');a.mov('r9',0x100000001b3n);a.lea('r10',{base:'rcx',disp:8});
  a.label(loop);a.test('r8','r8');a.jcc('e',done);a.load('r11',{base:'r10'},16);a.xor('rax','r11');a.imul('rax','r9');
  a.add('r10',2);a.sub('r8',1);a.jmp(loop);
  a.label(symbol);a.mov('rax','rcx');a.mov('r9',0x9E3779B97F4A7C15n);a.imul('rax','r9');
  a.label(done);a.shl('rax',1);a.shr('rax',1);a.or('rax',1);
 });
 // RCX table, RDX hash, R8 key or 0. RAX entry address of the key (R10 = 1)
 // or of the first empty slot (R10 = 0). With R8 = 0 it only finds a slot.
 b.fn('rt.propIndexProbe',88,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  const loop=a.unique('loop'),found=a.unique('found'),empty=a.unique('empty'),next=a.unique('next'),done=a.unique('done');
  a.load('r9',{base:'rcx',disp:T.capacity});a.sub('r9',1);a.mov('rax','rdx');a.shr('rax',7);a.and('rax','r9');a.store(slot(64),'rax');
  a.label(loop);a.load('rax',slot(64));a.shl('rax',4);a.load('rcx',slot(40));a.add('rax','rcx');a.store(slot(72),'rax');
  a.load('r10',{base:'rax',disp:T.entries});a.test('r10','r10');a.jcc('e',empty);
  a.load('r11',slot(56));a.test('r11','r11');a.jcc('e',next);
  a.load('rdx',slot(48));a.cmp('r10','rdx');a.jcc('ne',next);
  a.load('rcx',{base:'rax',disp:T.entries+8});a.load('rcx',{base:'rcx',disp:P.key});a.mov('rdx','r11');a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',found);
  a.label(next);a.load('rcx',slot(40));a.load('r9',{base:'rcx',disp:T.capacity});a.sub('r9',1);
  a.load('rax',slot(64));a.add('rax',1);a.and('rax','r9');a.store(slot(64),'rax');a.jmp(loop);
  a.label(found);a.load('rax',slot(72));a.add('rax',T.entries);a.mov('r10',1);a.jmp(done);
  a.label(empty);a.load('rax',slot(72));a.add('rax',T.entries);a.mov('r10',0);a.label(done);
 });
 // RCX object, RDX key. RAX property node or 0.
 b.fn('rt.propIndexFind',56,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');const missing=a.unique('missing'),done=a.unique('done');
  a.mov('rcx','rdx');a.call('rt.propKeyHash');a.mov('rdx','rax');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:O.index});a.load('r8',slot(48));a.call('rt.propIndexProbe');a.test('r10','r10');a.jcc('e',missing);
  a.load('rax',{base:'rax',disp:8});a.jmp(done);a.label(missing);a.mov('rax',0);a.label(done);
 });
 // RCX table, RDX hash, R8 node whose key is absent from the table.
 b.fn('rt.propIndexPlace',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.mov('r8',0);a.call('rt.propIndexProbe');
  a.load('rdx',slot(48));a.store({base:'rax'},'rdx');a.load('r8',slot(56));a.store({base:'rax',disp:8},'r8');
  a.load('rcx',slot(40));a.load('r11',{base:'rcx',disp:T.live});a.add('r11',1);a.store({base:'rcx',disp:T.live},'r11');
  a.load('r11',{base:'rcx',disp:T.used});a.add('r11',1);a.store({base:'rcx',disp:T.used},'r11');
 });
 // RCX object, RDX live entries to hold. Allocates a fresh table sized for
 // them, moves the live entries of the old table and frees it.
 b.fn('rt.propIndexResize',104,a=>{
  a.store(slot(40),'rcx');a.add('rdx',1);a.shl('rdx',2);a.mov('rax',16);
  const grow=a.unique('grow'),sized=a.unique('sized');a.label(grow);a.cmp('rax','rdx');a.jcc('ae',sized);a.shl('rax',1);a.jmp(grow);a.label(sized);
  a.store(slot(48),'rax');a.mov('r8','rax');a.shl('r8',4);a.add('r8',T.entries);
  a.load('rcx',{rip:'rt.heap'});a.mov('rdx',8);a.callImport('HeapAlloc');a.test('rax','rax');const ok=a.unique('ok');a.jcc('ne',ok);a.call('rt.fail');a.label(ok);
  a.load('r10',slot(48));a.store({base:'rax',disp:T.capacity},'r10');a.mov('r10',0);a.store({base:'rax',disp:T.live},'r10');a.store({base:'rax',disp:T.used},'r10');
  a.store(slot(56),'rax');
  const noOld=a.unique('noOld'),loop=a.unique('loop'),skip=a.unique('skip'),moved=a.unique('moved');
  a.load('rcx',slot(40));a.load('r10',{base:'rcx',disp:O.index});a.store(slot(64),'r10');a.test('r10','r10');a.jcc('e',noOld);
  a.mov('rax',0);a.store(slot(72),'rax');
  a.label(loop);a.load('r10',slot(64));a.load('rax',slot(72));a.load('r11',{base:'r10',disp:T.capacity});a.cmp('rax','r11');a.jcc('ae',moved);
  a.shl('rax',4);a.add('rax','r10');a.load('rdx',{base:'rax',disp:T.entries});
  a.test('rdx','rdx');a.jcc('e',skip);a.cmp('rdx',-1);a.jcc('e',skip);
  a.load('r8',{base:'rax',disp:T.entries+8});a.load('rcx',slot(56));a.call('rt.propIndexPlace');
  a.label(skip);a.load('rax',slot(72));a.add('rax',1);a.store(slot(72),'rax');a.jmp(loop);
  a.label(moved);a.load('r8',slot(64));a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');
  a.label(noOld);a.load('rcx',slot(40));a.load('rax',slot(56));a.store({base:'rcx',disp:O.index},'rax');
 });
 // RCX object, RDX property node just linked into its list (its key was not
 // an own key before). Keeps an existing table in sync; returns the node.
 b.fn('rt.propIndexAdd',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');const done=a.unique('done'),room=a.unique('room');
  a.load('r10',{base:'rcx',disp:O.index});a.test('r10','r10');a.jcc('e',done);
  a.load('rdx',{base:'r10',disp:T.used});a.add('rdx',1);a.shl('rdx',1);a.load('r11',{base:'r10',disp:T.capacity});a.cmp('rdx','r11');a.jcc('be',room);
  a.load('rdx',{base:'r10',disp:T.live});a.call('rt.propIndexResize');
  a.label(room);a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:P.key});a.call('rt.propKeyHash');
  a.mov('rdx','rax');a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:O.index});a.load('r8',slot(48));a.call('rt.propIndexPlace');
  a.label(done);a.load('rax',slot(48));
 });
 // RCX object, RDX key of a node being unlinked.
 b.fn('rt.propIndexDrop',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');const done=a.unique('done');
  a.load('r10',{base:'rcx',disp:O.index});a.test('r10','r10');a.jcc('e',done);
  a.mov('rcx','rdx');a.call('rt.propKeyHash');a.mov('rdx','rax');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:O.index});a.load('r8',slot(48));a.call('rt.propIndexProbe');
  a.test('r10','r10');a.jcc('e',done);
  a.mov('r10',-1);a.store({base:'rax'},'r10');a.mov('r10',0);a.store({base:'rax',disp:8},'r10');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:O.index});a.load('r10',{base:'rcx',disp:T.live});a.sub('r10',1);a.store({base:'rcx',disp:T.live},'r10');
  a.label(done);
 });
 // RCX object: build a table from the whole property list.
 b.fn('rt.propIndexBuild',72,a=>{
  a.store(slot(40),'rcx');
  const count=a.unique('count'),counted=a.unique('counted'),fill=a.unique('fill'),filled=a.unique('filled');
  a.load('rax',{base:'rcx',disp:O.properties});a.mov('rdx',0);
  a.label(count);a.test('rax','rax');a.jcc('e',counted);a.add('rdx',1);a.load('rax',{base:'rax',disp:P.next});a.jmp(count);
  a.label(counted);a.load('rcx',slot(40));a.call('rt.propIndexResize');
  a.load('rcx',slot(40));a.load('rax',{base:'rcx',disp:O.properties});a.store(slot(48),'rax');
  a.label(fill);a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',filled);
  a.load('rcx',{base:'rax',disp:P.key});a.call('rt.propKeyHash');
  a.mov('rdx','rax');a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:O.index});a.load('r8',slot(48));a.call('rt.propIndexPlace');
  a.load('rax',slot(48));a.load('rax',{base:'rax',disp:P.next});a.store(slot(48),'rax');a.jmp(fill);
  a.label(filled);
 });
}
