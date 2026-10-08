import {RuntimeBuilder,slot} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {HeapLayout as H,HeapKind,ValueListLayout as V} from './heap-layout.js';
import type {Assembler} from '../backend/x64/assembler.js';

/**
 * Shapes (hidden classes) for plain objects.
 *
 * A shaped object keeps its named properties in 16-byte value slots instead
 * of a list of 72-byte property nodes: the first `capacity` slots inline after
 * the object header (ObjectLayout.size), the rest in an out-of-line value
 * list (ObjectLayout.keys, which a shaped object does not use as a key
 * filter). The shape says which key lives in which slot.
 *
 * Shapes form transition trees. A root has no key; every other shape is its
 * parent plus one key, whose slot is `count - 1`. Adding the same keys in the
 * same order to objects that start from the same root gives them the same
 * shape, which is what lets an inline cache remember (shape -> slot).
 * Shapes are immutable and never freed. They live outside the collected heap
 * (rawAlloc); every shape is on rt.shapeList, whose keys the collector marks
 * at every collection.
 *
 * Every property of a shaped object is an ordinary, writable, enumerable and
 * configurable data property with a string key that is not an array index
 * and not "__proto__". Anything else - a symbol key, an accessor, other
 * attributes, delete, freezing, a lookup that needs a property node - first
 * turns the object into the ordinary list representation (dictionary mode)
 * with rt.shapeMaterialize, which nothing undoes. Code that does not know
 * about shapes therefore only has to call it before it touches the property
 * list, the property index or the key filter of an object.
 *
 * Root shapes fix the inline capacity of every shape below them. Object
 * literals share one root per capacity (rt.shapeLiteralRoot); every
 * constructor has its own roots (rt.shapeConstructorRoot): when one of its
 * instances outgrows the inline slots, the root gets a successor with more
 * of them, which later instances start from.
 */
export const ShapeLayout={parent:0,key:8,count:16,capacity:24,root:32,child:40,sibling:48,children:56,successor:64,next:72,table:80,size:88} as const;
/** A hash table of a shape's transitions once it has more than tableThreshold: capacity, then {key, child} entries (rt.propKeyHash of the key). */
export const ShapeTableLayout={capacity:0,entries:8,entry:16} as const;
const tableThreshold=8;
/** Most properties a shaped object has; one more makes it a dictionary. */
export const maxShapeProperties=128;
/** Most inline slots an object gets. */
export const maxInlineCapacity=64;
/** Most transitions out of one shape; more keys make the object a dictionary. Empty
 * literals all start from one root, so its transitions are every first key a
 * program assigns to a `{}`: shapes with many get a hash table (ShapeTableLayout). */
export const maxShapeTransitions=1<<16;
/** Most shapes a process creates (programs that use objects as maps make many). */
export const maxShapes=1<<20;
/** Inline slots of an empty object literal (`{}` is usually filled by assignments). */
export const emptyLiteralCapacity=4;
/** Inline slots of the first instances of a constructor. */
export const defaultConstructorCapacity=4;

/** Turns the object header in REG into a dictionary when it is shaped (rt.shapeMaterialize). Clobbers RAX only. */
export const shapeGuardSites:string[]=[];
export function emitShapeGuard(a:Assembler,reg:'rcx'|'rdx'|'r8'|'r9'|'r10'|'r11'):void {
 const skip=a.unique('unshaped');
 a.load('rax',{base:reg,disp:O.shape});a.test('rax','rax');a.jcc('e',skip);
 if(process.env.NONA_SHAPE_STATS){const counter='dbg.guard.'+shapeGuardSites.length+'.'+String((a as unknown as {name?:string}).name??'');shapeGuardSites.push(counter);a.incrementMemory({rip:counter});}
 a.mov('rax',reg);a.call('rt.shapeMaterializeRax');a.label(skip);
}

/** RAX <- the address of slot RDX (an index register) of the shaped object in RCX. Clobbers R10, R11. */
export function emitSlotAddress(a:Assembler,object:'rcx'|'r10'|'r11',index:'rdx'|'r9'|'rax',result:'rax'|'r8'):void {
 const inline=a.unique('inlineSlot'),done=a.unique('slotReady');
 a.load('r11',{base:object,disp:O.shape});a.load('r11',{base:'r11',disp:ShapeLayout.capacity});
 a.cmp(index,'r11');a.jcc('b',inline);
 // Out of line: value list (count, values...) in ObjectLayout.keys.
 a.mov(result,index);a.sub(result,'r11');a.shl(result,4);a.load('r11',{base:object,disp:O.keys});a.add(result,'r11');a.add(result,V.values);a.jmp(done);
 a.label(inline);a.mov(result,index);a.shl(result,4);a.add(result,object);a.add(result,O.size);
 a.label(done);
}

// RCX bytes -> RAX zeroed memory outside the collected heap. Shapes and their
// transition tables live there: they are never freed (a replaced table is),
// and keeping them out of the heap keeps them out of rt.liveBytes and out of
// every collection's mark work.
function rawAlloc(a:Assembler):void {
 const ok=a.unique('rawOk');
 a.mov('r8','rcx');a.load('rcx',{rip:'rt.heap'});a.mov('rdx',8);a.callImport('HeapAlloc');a.test('rax','rax');a.jcc('ne',ok);a.call('rt.fail');a.label(ok);
}

export function emitShapes(b:RuntimeBuilder):void {
 const S=ShapeLayout,T=ShapeTableLayout;
 b.data('rt.shapeList',new Uint8Array(8),'.data');
 b.data('rt.shapeCount',new Uint8Array(8),'.data');
 b.data('rt.shapeLiteralRoots',new Uint8Array(8*(maxInlineCapacity+1)),'.data');

 // RCX parent (0 for a root), RDX key record (0 for a root), R8 capacity
 // (roots only; children inherit their parent's) -> RAX a new shape.
 b.fn('rt.shapeAllocate',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.mov('rcx',S.size);rawAlloc(a);
  a.load('rcx',slot(40));a.load('rdx',slot(48));
  a.store({base:'rax',disp:S.parent},'rcx');a.store({base:'rax',disp:S.key},'rdx');
  const root=a.unique('root'),linked=a.unique('linked');
  a.test('rcx','rcx');a.jcc('e',root);
  a.load('r10',{base:'rcx',disp:S.count});a.add('r10',1);a.store({base:'rax',disp:S.count},'r10');
  a.load('r10',{base:'rcx',disp:S.capacity});a.store({base:'rax',disp:S.capacity},'r10');
  a.load('r10',{base:'rcx',disp:S.root});a.store({base:'rax',disp:S.root},'r10');
  // The newest child comes first among its siblings.
  a.load('r10',{base:'rcx',disp:S.child});a.store({base:'rax',disp:S.sibling},'r10');a.store({base:'rcx',disp:S.child},'rax');
  a.load('r10',{base:'rcx',disp:S.children});a.add('r10',1);a.store({base:'rcx',disp:S.children},'r10');a.jmp(linked);
  a.label(root);a.load('r10',slot(56));a.store({base:'rax',disp:S.capacity},'r10');a.store({base:'rax',disp:S.root},'rax');
  a.label(linked);
  a.load('r10',{rip:'rt.shapeList'});a.store({base:'rax',disp:S.next},'r10');a.store({rip:'rt.shapeList'},'rax');
  a.load('r10',{rip:'rt.shapeCount'});a.add('r10',1);a.store({rip:'rt.shapeCount'},'r10');
 });

 // RCX inline capacity -> RAX the shared root of object literals with it.
 b.fn('rt.shapeLiteralRoot',56,a=>{
  const done=a.unique('done'),clamped=a.unique('clamped');
  a.cmp('rcx',maxInlineCapacity);a.jcc('be',clamped);a.mov('rcx',maxInlineCapacity);a.label(clamped);
  a.mov('r10','rcx');a.shl('r10',3);a.lea('r11',{rip:'rt.shapeLiteralRoots'});a.add('r10','r11');a.store(slot(40),'r10');
  a.load('rax',{base:'r10'});a.test('rax','rax');a.jcc('ne',done);
  a.mov('r8','rcx');a.mov('rcx',0);a.mov('rdx',0);a.call('rt.shapeAllocate');a.load('r10',slot(40));a.store({base:'r10'},'rax');
  a.label(done);
 });

 // RCX root shape of a constructor (or 0 for its first instance) -> RAX the
 // root its next instance starts from: the newest successor.
 b.fn('rt.shapeConstructorRoot',40,a=>{
  const loop=a.unique('loop'),fresh=a.unique('fresh'),done=a.unique('done');
  a.mov('rax','rcx');a.test('rax','rax');a.jcc('e',fresh);
  a.label(loop);a.load('r10',{base:'rax',disp:S.successor});a.test('r10','r10');a.jcc('e',done);a.mov('rax','r10');a.jmp(loop);
  a.label(fresh);a.mov('rcx',0);a.mov('rdx',0);a.mov('r8',defaultConstructorCapacity);a.call('rt.shapeAllocate');
  a.label(done);
 });

 // Jumps to EQUAL when the key records at [slot(KEY)] and in R10 are the same
 // string, else falls through. Clobbers RAX, RCX, RDX, R8-R11.
 const sameKey=(a:Assembler,key:number,equal:string)=>{
  const differ=a.unique('differ');
  a.load('rdx',slot(key));a.cmp('r10','rdx');a.jcc('e',equal);
  a.load('r8',{base:'r10'});a.load('r9',{base:'rdx'});a.cmp('r8','r9');a.jcc('ne',differ);a.cmp('r8',-1);a.jcc('e',differ);
  a.mov('rcx','r10');a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',equal);
  a.label(differ);
 };

 // RCX shape, RDX key record -> RAX the slot of the key, or -1.
 b.fn('rt.shapeLookup',72,a=>{
  const loop=a.unique('loop'),hit=a.unique('hit'),missing=a.unique('missing'),done=a.unique('done');
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  a.label(loop);a.load('r11',slot(40));a.load('r10',{base:'r11',disp:S.parent});a.test('r10','r10');a.jcc('e',missing);
  a.load('r10',{base:'r11',disp:S.key});sameKey(a,48,hit);
  a.load('r11',slot(40));a.load('r11',{base:'r11',disp:S.parent});a.store(slot(40),'r11');a.jmp(loop);
  a.label(hit);a.load('r11',slot(40));a.load('rax',{base:'r11',disp:S.count});a.sub('rax',1);a.jmp(done);
  a.label(missing);a.mov('rax',-1);
  a.label(done);
 });

 // RCX shape, RDX key record (a string that is not an own key of the shape)
 // -> RAX the shape with the key added, or 0 when the object should become
 // a dictionary instead (a symbol, too many properties, transitions or shapes).
 b.fn('rt.shapeTransition',72,a=>{
  const loop=a.unique('loop'),hit=a.unique('hit'),create=a.unique('create'),fail=a.unique('fail'),done=a.unique('done');
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  const count=(name:string)=>{if(process.env.NONA_SHAPE_STATS){const c='dbg.guard.fail.'+name;if(!shapeGuardSites.includes(c))shapeGuardSites.push(c);a.incrementMemory({rip:c});}};
  {const ok=a.unique('ok');a.load('rax',{base:'rdx'});a.cmp('rax',-1);a.jcc('ne',ok);count('symbol');a.jmp(fail);a.label(ok);}
  {const ok=a.unique('ok');a.load('rax',{base:'rcx',disp:S.count});a.cmp('rax',maxShapeProperties);a.jcc('b',ok);count('properties');a.jmp(fail);a.label(ok);}
  {const list=a.unique('list'),probe=a.unique('probe'),empty=a.unique('empty');
   a.load('r11',{base:'rcx',disp:S.table});a.test('r11','r11');a.jcc('e',list);
   a.mov('rcx','rdx');a.call('rt.propKeyHash');a.store(slot(64),'rax');
   a.label(probe);a.load('r11',slot(40));a.load('r11',{base:'r11',disp:S.table});a.load('r9',{base:'r11',disp:T.capacity});a.sub('r9',1);
   a.load('rax',slot(64));a.and('rax','r9');a.store(slot(64),'rax');a.shl('rax',4);a.add('rax','r11');
   a.load('r10',{base:'rax',disp:T.entries});a.test('r10','r10');a.jcc('e',create);
   a.load('r11',{base:'rax',disp:T.entries+8});a.store(slot(56),'r11');sameKey(a,48,hit);
   a.load('rax',slot(64));a.add('rax',1);a.store(slot(64),'rax');a.jmp(probe);
   a.label(list);}
  a.load('rcx',slot(40));a.load('r11',{base:'rcx',disp:S.child});a.store(slot(56),'r11');
  a.label(loop);a.load('r11',slot(56));a.test('r11','r11');a.jcc('e',create);
  a.load('r10',{base:'r11',disp:S.key});sameKey(a,48,hit);
  a.load('r11',slot(56));a.load('r11',{base:'r11',disp:S.sibling});a.store(slot(56),'r11');a.jmp(loop);
  a.label(hit);a.load('rax',slot(56));a.jmp(done);
  a.label(create);a.load('rcx',slot(40));
  {const ok=a.unique('ok');a.load('rax',{base:'rcx',disp:S.children});a.cmp('rax',maxShapeTransitions);a.jcc('b',ok);count('transitions');a.jmp(fail);a.label(ok);}
  {const ok=a.unique('ok');a.load('rax',{rip:'rt.shapeCount'});a.cmp('rax',maxShapes);a.jcc('b',ok);count('shapes');a.jmp(fail);a.label(ok);}
  a.load('rdx',slot(48));a.mov('r8',0);a.call('rt.shapeAllocate');
  // Past tableThreshold transitions the parent's are hashed; the table is
  // rebuilt (twice as large) when it is half full.
  {const listed=a.unique('listed'),insert=a.unique('insert');a.store(slot(56),'rax');
   a.load('rcx',slot(40));a.load('r10',{base:'rcx',disp:S.children});a.cmp('r10',tableThreshold);a.jcc('be',listed);
   a.load('r11',{base:'rcx',disp:S.table});a.test('r11','r11');{const build=a.unique('build');a.jcc('e',build);
    a.load('r9',{base:'r11',disp:T.capacity});a.shr('r9',1);a.cmp('r10','r9');a.jcc('b',insert);a.label(build);}
   a.call('rt.shapeTableBuild');a.jmp(listed);
   a.label(insert);a.load('rcx',{base:'rcx',disp:S.table});a.load('rdx',slot(48));a.load('r8',slot(56));a.call('rt.shapeTableInsert');
   a.label(listed);a.load('rax',slot(56));}
  a.jmp(done);
  a.label(fail);a.mov('rax',0);
  a.label(done);
 });
 // RCX table, RDX key record, R8 child: an entry for a key the table lacks.
 b.fn('rt.shapeTableInsert',72,a=>{
  const probe=a.unique('probe'),found=a.unique('found');
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.mov('rcx','rdx');a.call('rt.propKeyHash');
  a.load('r11',slot(40));a.load('r9',{base:'r11',disp:T.capacity});a.sub('r9',1);
  a.label(probe);a.and('rax','r9');a.mov('r10','rax');a.shl('r10',4);a.add('r10','r11');a.load('r8',{base:'r10',disp:T.entries});a.test('r8','r8');a.jcc('e',found);
  a.add('rax',1);a.jmp(probe);
  a.label(found);a.load('r8',slot(48));a.store({base:'r10',disp:T.entries},'r8');a.load('r8',slot(56));a.store({base:'r10',disp:T.entries+8},'r8');
 });
 // RCX shape: a new transition table, four times its transition count (at
 // least 32 entries), filled from the list of children.
 b.fn('rt.shapeTableBuild',72,a=>{
  const sized=a.unique('sized'),grow=a.unique('grow'),loop=a.unique('loop'),done=a.unique('done');
  a.store(slot(40),'rcx');a.load('r10',{base:'rcx',disp:S.children});a.shl('r10',2);a.mov('rax',32);
  a.label(grow);a.cmp('rax','r10');a.jcc('ae',sized);a.shl('rax',1);a.jmp(grow);a.label(sized);
  a.store(slot(48),'rax');a.mov('rcx','rax');a.shl('rcx',4);a.add('rcx',T.entries);rawAlloc(a);
  a.load('r10',slot(48));a.store({base:'rax',disp:T.capacity},'r10');a.store(slot(64),'rax');
  {const fresh=a.unique('fresh');a.load('rcx',slot(40));a.load('r8',{base:'rcx',disp:S.table});a.test('r8','r8');a.jcc('e',fresh);
   a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');a.label(fresh);}
  a.load('rax',slot(64));a.load('rcx',slot(40));a.store({base:'rcx',disp:S.table},'rax');
  a.load('r11',{base:'rcx',disp:S.child});a.store(slot(56),'r11');
  a.label(loop);a.load('r8',slot(56));a.test('r8','r8');a.jcc('e',done);
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:S.table});a.load('rdx',{base:'r8',disp:S.key});a.call('rt.shapeTableInsert');
  a.load('r8',slot(56));a.load('r8',{base:'r8',disp:S.sibling});a.store(slot(56),'r8');a.jmp(loop);
  a.label(done);
 });

 // RCX shaped object header, RDX key record, R8 source Value* -> RAX 1 when
 // the key (not yet an own property) was added with that value, 0 when the
 // object is unchanged and should become a dictionary instead.
 b.fn('rt.shapeAddProperty',88,a=>{
  const fail=a.unique('fail'),done=a.unique('done'),inline=a.unique('inline'),store=a.unique('store'),grown=a.unique('grown');
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rcx',{base:'rcx',disp:O.shape});a.call('rt.shapeTransition');a.test('rax','rax');a.jcc('e',fail);a.store(slot(64),'rax');
  // RDX = the new key's slot. Out-of-line slots grow by doubling.
  a.load('rdx',{base:'rax',disp:S.count});a.sub('rdx',1);a.load('r10',{base:'rax',disp:S.capacity});a.cmp('rdx','r10');a.jcc('b',inline);
  a.sub('rdx','r10');a.store(slot(72),'rdx');a.load('rcx',slot(40));a.load('r11',{base:'rcx',disp:O.keys});
  {const allocate=a.unique('allocate');a.test('r11','r11');a.jcc('e',allocate);a.load('r10',{base:'r11',disp:V.count});a.cmp('rdx','r10');a.jcc('b',grown);
   a.label(allocate);
   // New count: twice the old one (at least 4), copied over.
   a.mov('r10',4);{const small=a.unique('small');a.test('r11','r11');a.jcc('e',small);a.load('r10',{base:'r11',disp:V.count});a.add('r10','r10');a.label(small);}
   a.store(slot(80),'r10');a.mov('rcx','r10');a.shl('rcx',4);a.add('rcx',V.values);a.call('rt.alloc');
   a.mov('r10',HeapKind.valueList);a.store({base:'rax',disp:H.kind-H.size},'r10');a.load('r10',slot(80));a.store({base:'rax',disp:V.count},'r10');
   a.load('rcx',slot(40));a.load('r11',{base:'rcx',disp:O.keys});
   {const copied=a.unique('copied'),copy=a.unique('copy');a.test('r11','r11');a.jcc('e',copied);
    a.load('r9',{base:'r11',disp:V.count});a.shl('r9',1);a.mov('r8',0);
    a.label(copy);a.cmp('r8','r9');a.jcc('ae',copied);a.mov('r10','r8');a.shl('r10',3);a.add('r10','r11');a.load('r10',{base:'r10',disp:V.values});
    a.mov('rdx','r8');a.shl('rdx',3);a.add('rdx','rax');a.store({base:'rdx',disp:V.values},'r10');a.add('r8',1);a.jmp(copy);
    a.label(copied);}
   a.store({base:'rcx',disp:O.keys},'rax');
   // The constructor's later instances start with as many inline slots as
   // this one now has properties.
   a.load('r10',slot(64));a.load('rdx',{base:'r10',disp:S.count});a.load('r10',{base:'r10',disp:S.root});a.call('rt.shapeGrowRoot');
  }
  a.label(grown);a.load('rcx',slot(40));a.load('rax',{base:'rcx',disp:O.keys});a.load('rdx',slot(72));a.shl('rdx',4);a.add('rax','rdx');a.add('rax',V.values);a.jmp(store);
  a.label(inline);a.shl('rdx',4);a.load('rax',slot(40));a.add('rax','rdx');a.add('rax',O.size);
  a.label(store);a.load('r8',slot(56));a.load('r10',{base:'r8'});a.store({base:'rax'},'r10');a.load('r10',{base:'r8',disp:8});a.store({base:'rax',disp:8},'r10');
  a.load('rcx',slot(40));a.load('r10',slot(64));a.store({base:'rcx',disp:O.shape},'r10');a.mov('rax',1);a.jmp(done);
  a.label(fail);a.mov('rax',0);
  a.label(done);
 });

 // R10 a root shape one of whose objects now has RDX properties, more than
 // its inline slots: a constructor root (not shared by literals) gets a
 // successor with that many slots. Objects that keep outgrowing their
 // constructor's root move it on one successor at a time, so the slots
 // converge on what its instances end up with. Preserves RCX.
 b.fn('rt.shapeGrowRoot',56,a=>{
  const done=a.unique('done');
  a.store(slot(40),'rcx');a.store(slot(48),'r10');
  a.load('rax',{base:'r10',disp:S.successor});a.test('rax','rax');a.jcc('ne',done);
  // Literal roots are shared: they are in rt.shapeLiteralRoots.
  a.load('rax',{base:'r10',disp:S.capacity});a.cmp('rax',maxInlineCapacity);a.jcc('a',done);
  a.mov('r11','rax');a.shl('r11',3);a.lea('r9',{rip:'rt.shapeLiteralRoots'});a.add('r11','r9');a.load('r11',{base:'r11'});a.cmp('r11','r10');a.jcc('e',done);
  a.cmp('rax',maxInlineCapacity);a.jcc('ae',done);
  a.mov('rax','rdx');{const small=a.unique('small');a.cmp('rax',maxInlineCapacity);a.jcc('be',small);a.mov('rax',maxInlineCapacity);a.label(small);}
  a.mov('rcx',0);a.mov('rdx',0);a.mov('r8','rax');a.call('rt.shapeAllocate');a.load('r10',slot(48));a.store({base:'r10',disp:S.successor},'rax');
  a.label(done);a.load('rcx',slot(40));
 });

 // RCX object header: a shaped object becomes a dictionary (property nodes,
 // newest first, as ordinary additions would have made them). Nothing else
 // changes. Preserves every argument register and R10, R11.
 b.fn('rt.shapeMaterialize',104,a=>{
  const done=a.unique('done'),loop=a.unique('loop'),linked=a.unique('linked'),first=a.unique('first');
  for(const [offset,reg] of [[40,'rcx'],[48,'rdx'],[56,'r8'],[64,'r9'],[72,'r10'],[80,'r11']] as const)a.store(slot(offset),reg);
  a.load('rax',{base:'rcx',disp:O.shape});a.test('rax','rax');a.jcc('e',done);
  a.store(slot(88),'rax');a.mov('rax',0);a.store(slot(96),'rax');
  // slot 88: the shape whose key comes next (newest first); slot 96: the last node linked.
  a.label(loop);a.load('rax',slot(88));a.load('r10',{base:'rax',disp:S.parent});a.test('r10','r10');a.jcc('e',linked);
  a.load('rcx',slot(40));a.call('rt.allocPropertyNode');
  a.load('r11',slot(88));a.load('r10',{base:'r11',disp:S.key});a.store({base:'rax',disp:P.key},'r10');a.mov('r10',A.ordinary);a.store({base:'rax',disp:P.attributes},'r10');
  a.load('rdx',{base:'r11',disp:S.count});a.sub('rdx',1);a.load('rcx',slot(40));a.store(slot(32),'rax');
  {const value=a.unique('value');emitSlotAddress(a,'rcx','rdx','r8');a.load('rax',slot(32));
   a.load('r10',{base:'r8'});a.store({base:'rax',disp:P.value},'r10');a.load('r10',{base:'r8',disp:8});a.store({base:'rax',disp:P.value+8},'r10');a.label(value);}
  a.load('r10',slot(96));a.test('r10','r10');a.jcc('e',first);a.store({base:'r10',disp:P.next},'rax');a.jmp(first+'.set');
  a.label(first);a.load('rcx',slot(40));a.store({base:'rcx',disp:O.properties},'rax');
  a.label(first+'.set');a.store(slot(96),'rax');
  a.load('r11',slot(88));a.load('r11',{base:'r11',disp:S.parent});a.store(slot(88),'r11');a.jmp(loop);
  a.label(linked);a.load('rcx',slot(40));a.mov('rax',0);
  for(const offset of [O.shape,O.keys,O.index])a.store({base:'rcx',disp:offset},'rax');
  a.label(done);
  for(const [offset,reg] of [[40,'rcx'],[48,'rdx'],[56,'r8'],[64,'r9'],[72,'r10'],[80,'r11']] as const)a.load(reg,slot(offset));
 });
 // The same with the object header in RAX (emitShapeGuard).
 b.fn('rt.shapeMaterializeRax',56,a=>{a.store(slot(40),'rcx');a.mov('rcx','rax');a.call('rt.shapeMaterialize');a.load('rcx',slot(40));});

 // RCX object header: marks the shapes' keys (and shapes) during a
 // collection's root phase is rt.gcMarkShapes; tracing a shaped object's
 // values is part of rt.gcTraceObject (gc.ts).
 b.fn('rt.gcMarkShapes',56,a=>{
  const loop=a.unique('loop'),done=a.unique('done');
  a.load('rax',{rip:'rt.shapeList'});a.store(slot(40),'rax');
  a.label(loop);a.load('rcx',slot(40));a.test('rcx','rcx');a.jcc('e',done);
  a.load('rcx',{base:'rcx',disp:S.key});a.call('rt.gcMarkPointer');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:S.next});a.store(slot(40),'rcx');a.jmp(loop);
  a.label(done);
 });
}
