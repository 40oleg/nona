import {RuntimeBuilder,slot} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A,ObjectFlags} from './object-layout.js';
import {BoxKind} from './boxing.js';
import {bumpEpochIfPrototype,emitNamedKindCheck,namedTypedArrayKind} from './property-cache.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';
import {CellTag} from './environment-layout.js';
import type {Assembler} from '../backend/x64/assembler.js';

/**
 * Fast paths for named properties of ordinary objects.
 *
 * `o.x` went through the generic [[Get]]: a rooted frame, ToPropertyKey, the
 * proxy and string-wrapper checks, a scan of the receiver's prototype chain
 * for proxies that did its own lookup on every object, then rt.lookupProperty
 * which looked everything up again, per object comparing the key with
 * "length", with "__proto__", parsing it as an array index and consulting the
 * global binding table. Over a microsecond for a plain data property.
 *
 * rt.namedGetFast and rt.namedSetFast handle the case where none of those
 * special rules can apply and leave everything else to the generic code: the
 * receiver and every object on the way are ordinary objects or arrays (kind
 * 0 or 1, so no proxies, typed arrays, string wrappers or functions), none is
 * the global object (whose script bindings alias properties), and the key is
 * a string that is not "__proto__", not an array index (it does not start with
 * a digit, so dense elements are never involved) and not "length" on an
 * array. Own lookups use the object's hash index when it has one and
 * otherwise scan its property list, comparing key records by identity first
 * (literal keys share one record per program) and by content second.
 *
 * A read answers a data property that is not an accessor and not an argument
 * cell, or `undefined` when the key is on no object of the chain. A write
 * overwrites an own writable data property; a new own property is created by
 * a definition (object literals) when the object is extensible, and by a
 * plain assignment when no object on the chain has the key as an accessor or
 * as a readonly property, which is exactly when OrdinarySet creates one.
 */
/** Named reads that pass this many other own properties index the object. */
export const ownIndexThreshold=16;

export function emitNamedProperties(b:RuntimeBuilder):void {
 // RCX object payload, RDX key record -> RAX own property node or 0.
 b.fn('rt.ownNamedNode',72,a=>{
  const scan=a.unique('scan'),loop=a.unique('loop'),next=a.unique('next'),done=a.unique('done'),chars=a.unique('chars'),scanned=a.unique('scanned');
  // A complete key filter without the key's bit: the key is not an own key.
  {const unknown=a.unique('unfiltered');a.load('rax',{base:'rcx',disp:O.keys});a.test('rax','rax');a.jcc('ns',unknown);
   a.store(slot(48),'rcx');a.store(slot(56),'rdx');a.mov('rcx','rdx');a.call('rt.keyFilterBit');a.load('rcx',slot(48));a.load('rdx',slot(56));
   a.load('r10',{base:'rcx',disp:O.keys});a.and('rax','r10');a.jcc('e',done);
   a.label(unknown);}
  a.load('r10',{base:'rcx',disp:O.index});a.test('r10','r10');a.jcc('e',scan);a.call('rt.propIndexFind');a.jmp(done);
  a.label(scan);a.store(slot(48),'rcx');a.mov('r10',0);a.store(slot(56),'r10');a.load('rax',{base:'rcx',disp:O.properties});a.load('r9',{base:'rdx'});a.store(slot(40),'r9');
  a.label(loop);a.test('rax','rax');a.jcc('e',scanned);a.load('r10',{base:'rax',disp:P.key});a.cmp('r10','rdx');a.jcc('e',scanned);
  a.load('r11',{base:'r10'});a.cmp('r11','r9');a.jcc('ne',next);
  // Same length (a symbol record has length -1 and never matches a string).
  a.mov('r8','r9');a.lea('r10',{base:'r10',disp:8});a.lea('r11',{base:'rdx',disp:8});
  a.label(chars);a.test('r8','r8');a.jcc('e',scanned);a.load('rcx',{base:'r10'},16);a.load('r9',{base:'r11'},16);a.cmp('rcx','r9');a.jcc('ne',next);a.add('r10',2);a.add('r11',2);a.sub('r8',1);a.jmp(chars);
  a.label(next);a.load('r9',slot(56));a.add('r9',1);a.store(slot(56),'r9');a.load('r9',slot(40));a.load('rax',{base:'rax',disp:P.next});a.jmp(loop);
  // A long list gets a hash index (property-index.ts), as rt.findOwnProperty
  // does for longer ones: objects with many fields that are read by name over
  // and over (a socket, a server) stop paying a scan per read.
  a.label(scanned);a.load('r10',slot(56));a.cmp('r10',ownIndexThreshold);a.jcc('b',done);
  a.store(slot(40),'rax');a.load('rcx',slot(48));a.call('rt.propIndexBuild');a.load('rax',slot(40));
  a.label(done);
 });
 // Jumps to miss unless R10 (object payload) is an object whose named
 // properties are ordinary (namedPropertyKinds) other than the global object.
 // LOADKEY puts the key record in R11: a typed array treats canonical numeric
 // strings ("-1", "Infinity", "NaN") as indices, so names starting with '-',
 // 'I' or 'N' are left to the generic code there. Clobbers RAX and R11.
 const ordinaryObject=(a:Assembler,miss:string,loadKey:(a:Assembler)=>void,allowGlobal=false)=>{
  const ok=a.unique('ordinaryKind');
  emitNamedKindCheck(a,'r10',miss);a.cmp('rax',namedTypedArrayKind);a.jcc('ne',ok);
  loadKey(a);a.load('r11',{base:'r11',disp:8},16);for(const c of '-IN'){a.cmp('r11',c.charCodeAt(0));a.jcc('e',miss);}
  a.label(ok);if(!allowGlobal){a.lea('rax',{rip:'rt.globalObject'});a.cmp('rax','r10');a.jcc('e',miss);}
 };
 const getKey=(a:Assembler)=>{a.load('r11',slot(56));a.load('r11',{base:'r11',disp:8});};
 const setKey=(a:Assembler)=>{a.load('r11',slot(80));};
 // Jumps to miss when R10 is an array or wrapper and R8 says the key is "length".
 const notLengthOfExotic=(a:Assembler,miss:string)=>{
  const fine=a.unique('notLength');a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('e','rt.namedFast.lengthCheck'+fine);a.cmp('rax',BoxKind);a.jcc('ne',fine);
  a.label('rt.namedFast.lengthCheck'+fine);a.load('rax',slot(64));a.test('rax','rax');a.jcc('ne',miss);a.label(fine);
 };
 // Jumps to miss unless R9 (key record) is a plain name: not empty, not
 // starting with a digit, not "__proto__". Sets R8 = 1 when it is "length".
 const plainName=(a:Assembler,miss:string)=>{
  const notLength=a.unique('notLength'),named=a.unique('named'),notProto=a.unique('notProto');
  a.load('rax',{base:'r9'});a.test('rax','rax');a.jcc('e',miss);a.load('r11',{base:'r9',disp:8},16);a.sub('r11',48);a.cmp('r11',9);a.jcc('be',miss);
  a.mov('r8',0);a.cmp('rax',6);a.jcc('ne',notLength);a.load('r11',{base:'r9',disp:8});a.mov('rax',0x0067006E0065006Cn);a.cmp('r11','rax');a.jcc('ne',named);a.load('r11',{base:'r9',disp:16},32);a.cmp('r11',0x00680074);a.jcc('ne',named);a.mov('r8',1);a.jmp(named);
  a.label(notLength);a.cmp('rax',9);a.jcc('ne',named);a.load('r11',{base:'r9',disp:8});a.mov('rax',0x0070005F005F005Fn);a.cmp('r11','rax');a.jcc('ne',notProto);a.load('r11',{base:'r9',disp:16});a.mov('rax',0x005F006F00740072n);a.cmp('r11','rax');a.jcc('ne',notProto);a.load('r11',{base:'r9',disp:24},16);a.cmp('r11',0x5F);a.jcc('e',miss);
  a.label(notProto);a.label(named);
 };
 // RCX result Value*, RDX base Value*, R8 key Value*. RAX 1 when the read was
 // answered, else 0 with every argument register preserved.
 // rt.namedGetFastGlobal also accepts the global object: rt.readGlobalProperty
 // uses it for a name the compiler knows is not a script binding.
 for(const [name,allowGlobal] of [['rt.namedGetFast',false],['rt.namedGetFastGlobal',true]] as const)b.fn(name,88,a=>{
  const miss=a.unique('miss'),done=a.unique('done'),chain=a.unique('chain'),missing=a.unique('missing'),found=a.unique('found'),object=a.unique('object'),primitive=a.unique('primitive');
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rax',{base:'r8'});a.cmp('rax',4);a.jcc('ne',miss);
  a.load('r9',{base:'r8',disp:8});plainName(a,miss);a.store(slot(64),'r8');
  a.mov('rax',0);a.store({rip:'rt.namedGetNode'},'rax');
  // A string's "length" is its own, unchangeable data property.
  {const notLength=a.unique('notStringLength');a.load('rax',{base:'rdx'});a.cmp('rax',4);a.jcc('ne',notLength);a.test('r8','r8');a.jcc('e',notLength);
   a.load('rax',{base:'rdx',disp:8});a.load('rax',{base:'rax'});a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');a.jmp(done);
   a.label(notLength);}
  // A string, number or boolean receiver reads from its prototype (a
  // string's own "length" and indices are excluded by the key checks);
  // a data property found there is the answer, an accessor goes generic.
  a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('e',object);a.cmp('rax',4);a.jcc('e',primitive);a.cmp('rax',3);a.jcc('e',primitive);a.cmp('rax',2);a.jcc('ne',miss);
  a.label(primitive);a.mov('rcx','rdx');a.call('rt.propertyBase');a.mov('r10','rax');a.load('r8',slot(56));a.load('r9',{base:'r8',disp:8});a.jmp(chain);
  a.label(object);a.load('r10',{base:'rdx',disp:8});
  a.label(chain);ordinaryObject(a,miss,getKey,allowGlobal);notLengthOfExotic(a,miss);
  a.store(slot(72),'r10');a.mov('rcx','r10');a.mov('rdx','r9');a.call('rt.ownNamedNode');a.test('rax','rax');a.jcc('ne',found);
  a.load('r10',slot(72));a.load('r10',{base:'r10',disp:O.prototype});a.test('r10','r10');a.jcc('e',missing);a.load('r8',slot(56));a.load('r9',{base:'r8',disp:8});a.jmp(chain);
  // An accessor is not answered here, but its node and holder are reported
  // (rt.namedGetNode stays 0 on every other miss) so that an inline cache
  // can remember it and call the getter itself.
  a.label(found);a.load('r11',{base:'rax',disp:P.attributes});a.and('r11',A.accessor);a.test('r11','r11');
  {const data=a.unique('data');a.jcc('e',data);a.store({rip:'rt.namedGetNode'},'rax');a.load('r10',slot(72));a.store({rip:'rt.namedGetHolder'},'r10');a.jmp(miss);a.label(data);}
  a.load('r11',{base:'rax',disp:P.value});a.cmp('r11',CellTag);a.jcc('e',miss);
  // Report the node and its holder for the inline caches (property-cache.ts).
  a.store({rip:'rt.namedGetNode'},'rax');a.load('r10',slot(72));a.store({rip:'rt.namedGetHolder'},'r10');
  a.load('rcx',slot(40));a.store({base:'rcx'},'r11');a.load('r11',{base:'rax',disp:P.value+8});a.store({base:'rcx',disp:8},'r11');a.jmp(done);
  a.label(missing);a.mov('rax',0);a.store({rip:'rt.namedGetNode'},'rax');a.load('rcx',slot(40));a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
  a.label(done);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.mov('rax',1);const end=a.unique('end');a.jmp(end);
  a.label(miss);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.mov('rax',0);a.label(end);
 });
 // RCX base Value*, RDX key Value*, R8 source Value*, R9 flags (bit 0: define).
 // RAX 1 when the write was done, else 0 with every argument register preserved.
 b.fn('rt.namedSetFast',104,a=>{
  const miss=a.unique('miss'),done=a.unique('done'),own=a.unique('own'),create=a.unique('create'),chain=a.unique('chain'),inherited=a.unique('inherited'),notArray=a.unique('notArray'),write=a.unique('write');
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.load('rax',{base:'rcx'});a.cmp('rax',5);a.jcc('ne',miss);a.load('rax',{base:'rdx'});a.cmp('rax',4);a.jcc('ne',miss);
  a.load('r9',{base:'rdx',disp:8});plainName(a,miss);a.store(slot(72),'r8');a.store(slot(80),'r9');
  a.load('r10',{base:'rcx',disp:8});ordinaryObject(a,miss,setKey);
  a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('e',notArray);a.cmp('rax',BoxKind);a.jcc('ne','rt.namedSetFast.plainReceiver');
  a.label(notArray);a.load('rax',slot(72));a.test('rax','rax');a.jcc('ne',miss);
  a.label('rt.namedSetFast.plainReceiver');a.store(slot(88),'r10');a.mov('rcx','r10');a.mov('rdx','r9');a.call('rt.ownNamedNode');a.test('rax','rax');a.jcc('e',create);
  // Own property: a plain write of a writable data property.
  a.load('r11',slot(64));a.and('r11',1);a.test('r11','r11');a.jcc('ne',miss);
  a.load('r11',{base:'rax',disp:P.attributes});a.and('r11',A.accessor|A.writable);a.cmp('r11',A.writable);a.jcc('ne',miss);
  a.load('r11',{base:'rax',disp:P.value});a.cmp('r11',CellTag);a.jcc('e',miss);
  a.label(write);a.load('r8',slot(56));a.load('r11',{base:'r8'});a.store({base:'rax',disp:P.value},'r11');a.load('r11',{base:'r8',disp:8});a.store({base:'rax',disp:P.value+8},'r11');a.jmp(done);
  // No own property: extensible, and for an assignment no accessor or readonly
  // property with that key anywhere up the chain.
  a.label(create);a.load('r10',slot(88));a.load('rax',{base:'r10',disp:O.flags});a.and('rax',ObjectFlags.nonExtensible);a.test('rax','rax');a.jcc('ne',miss);
  a.load('rax',slot(64));a.and('rax',1);a.test('rax','rax');a.jcc('ne',own);
  a.load('r10',{base:'r10',disp:O.prototype});
  a.label(chain);a.test('r10','r10');a.jcc('e',own);ordinaryObject(a,miss,setKey);
  a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('e','rt.namedSetFast.exoticAncestor');a.cmp('rax',BoxKind);a.jcc('ne',inherited);
  a.label('rt.namedSetFast.exoticAncestor');a.load('rax',slot(72));a.test('rax','rax');a.jcc('ne',miss);
  a.label(inherited);a.store(slot(96),'r10');a.mov('rcx','r10');a.load('rdx',slot(80));a.call('rt.ownNamedNode');a.test('rax','rax');const nextProto=a.unique('nextProto');a.jcc('e',nextProto);
  a.load('r11',{base:'rax',disp:P.attributes});a.and('r11',A.accessor|A.writable);a.cmp('r11',A.writable);a.jcc('ne',miss);a.jmp(own);
  a.label(nextProto);a.load('r10',slot(96));a.load('r10',{base:'r10',disp:O.prototype});a.jmp(chain);
  a.label(own);a.load('r10',slot(88));bumpEpochIfPrototype(a,'r10');a.mov('rcx',P.size);a.call('rt.alloc');a.mov('r10',HeapKind.property);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.load('r10',slot(80));a.store({base:'rax',disp:P.key},'r10');a.mov('r10',A.ordinary);a.store({base:'rax',disp:P.attributes},'r10');
  a.mov('r10',0);for(const offset of [P.getter,P.getter+8,P.setter,P.setter+8])a.store({base:'rax',disp:offset},'r10');
  a.load('r8',slot(56));a.load('r11',{base:'r8'});a.store({base:'rax',disp:P.value},'r11');a.load('r11',{base:'r8',disp:8});a.store({base:'rax',disp:P.value+8},'r11');
  a.load('rcx',slot(88));a.load('r11',{base:'rcx',disp:O.properties});a.store({base:'rax',disp:P.next},'r11');a.store({base:'rcx',disp:O.properties},'rax');
  a.mov('rdx','rax');a.call('rt.propIndexAdd');
  a.label(done);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r9',slot(64));a.mov('rax',1);const end=a.unique('end');a.jmp(end);
  a.label(miss);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r9',slot(64));a.mov('rax',0);a.label(end);
 });
}
