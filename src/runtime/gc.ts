import {strictRoots,strictPropertyRoots} from './strict.js';
import {errorRoots,errorPropertyRoots} from './errors.js';
import {integrityRoots,integrityPropertyRoots} from './object-integrity.js';
import {collectionRoots,collectionPropertyRoots} from './object-collections.js';
import {dateRoots,datePropertyRoots} from './date.js';
import {RegExpKind,RegExpLayout,regexpRoots,regexpPropertyRoots} from './regexp.js';
import {ArrayBufferKind,ArrayBufferLayout,arrayBufferRoots,arrayBufferPropertyRoots} from './array-buffer.js';
import {SharedArrayBufferKind,sharedArrayBufferRoots,sharedArrayBufferPropertyRoots} from './shared-array-buffer.js';
import {atomicsRoots,atomicsPropertyRoots} from './atomics.js';
import {MapKind,MapLayout,MapEntryLayout,mapRoots,mapPropertyRoots} from './map.js';
import {SetKind,setRoots,setPropertyRoots} from './set.js';
import {SetIteratorKind,SetIteratorLayout,setIteratorRoots,setIteratorPropertyRoots} from './set-iterator.js';
import {WeakMapKind,WeakSetKind,weakCollectionRoots,weakCollectionPropertyRoots} from './weak-collections.js';
import {MapIteratorKind,MapIteratorLayout,mapIteratorRoots,mapIteratorPropertyRoots} from './map-iterator.js';
import {DataViewKind,DataViewLayout,dataViewRoots,dataViewPropertyRoots} from './data-view.js';
import {TypedArrayKind,TypedArrayLayout,typedArrayRoots,typedArrayPropertyRoots} from './typed-array.js';
import {descriptorRoots,descriptorPropertyRoots} from './property-descriptors.js';
import {inspectionRoots,inspectionPropertyRoots} from './object-introspection.js';
import {constructorRoots,constructorPropertyRoots} from './builtin-constructors.js';
import {RuntimeBuilder,slot,failIf} from './abi.js';
import {HeapLayout as H,HeapKind,RootLayout as R} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P} from './object-layout.js';
import {ChunkLayout as C,LargeLayout as L,FreeKind} from './memory.js';
import {FunctionLayout,FunctionKind} from './functions.js';
import {ContextLayout} from './context-switch.js';
import {GeneratorKind,GeneratorLayout as G,generatorRoots,generatorPropertyRoots} from './generator.js';
import {asyncRoots,asyncPropertyRoots} from './async.js';
import {CellTag,EnvironmentLayout as E} from './environment-layout.js';
import {BoxKind,BoxLayout} from './boxing.js';
import {callStaticProperties} from './function-call.js';
import {tailStagingCapacity} from './tail-calls.js';
import {applyStaticProperties} from './function-apply.js';
import {bindStaticProperties} from './function-bind.js';
import {BoundDataLayout as B} from './bound-layout.js';
import {sourceStaticProperties} from './function-source.js';
import {ProxyKind,ProxyLayout,proxyPropertyRoots} from './proxy.js';
import {objectMethodRoots,objectMethodPropertyRoots} from './object-methods.js';
import {wrapperMethodRoots,wrapperMethodPropertyRoots} from './wrapper-methods.js';
import {globalStaticProperties} from './globals.js';
import {consoleRoots,consolePropertyRoots} from './console.js';
import {symbolRoots,symbolPropertyRoots} from './symbols.js';
import {IteratorKind,iteratorRoots,iteratorPropertyRoots} from './iterators.js';
import {arrayBuiltinRoots,arrayBuiltinPropertyRoots} from './array-builtins.js';
import {arraySpliceRoots,arraySplicePropertyRoots} from './array-splice.js';
import {arrayOfRoots,arrayOfPropertyRoots} from './array-of.js';
import {arrayFromRoots,arrayFromPropertyRoots} from './array-from.js';
import {arrayConcatRoots,arrayConcatPropertyRoots} from './array-concat.js';
import {arrayFlatRoots,arrayFlatPropertyRoots} from './array-flat.js';
import {arrayLocaleRoots,arrayLocalePropertyRoots} from './array-locale.js';
import {arraySortRoots,arraySortPropertyRoots} from './array-sort.js';
import {arrayUnscopablesRoots,arrayUnscopablesPropertyRoots} from './array-unscopables.js';
import {stringBuiltinRoots,stringBuiltinPropertyRoots} from './string-builtins.js';
import {numberBuiltinRoots,numberBuiltinPropertyRoots} from './number-builtins.js';
import {mathRoots,mathPropertyRoots} from './math.js';
import {jsonRoots,jsonPropertyRoots} from './json.js';
import {bigintRoots,bigintPropertyRoots} from './bigint.js';
import {uriRoots,uriPropertyRoots} from './uri.js';
import {stringSplitRoots,stringSplitPropertyRoots} from './string-split.js';
import {stringNormalizeRoots,stringNormalizePropertyRoots} from './string-normalize.js';
import {stringLocaleCompareRoots,stringLocaleComparePropertyRoots} from './string-locale-compare.js';
import {stringReplaceRoots,stringReplacePropertyRoots} from './string-replace.js';

/** No allocation and no recursive graph walk. Called only at compiler safepoints. */
/** extraRealms: cloned realms (see codegen realm cloning) whose roots must be marked too. */
export function emitGc(b:RuntimeBuilder,extraRealms=0):void {
 for(const name of ['gcGlobals','gcGlobalCount','gcRoots','gcGrey','gcCount'])
  b.data('rt.'+name,new Uint8Array(8),'.data');
 // Nonzero once a cloned realm is initialized; the main realm is always live.
 b.data('rt.realmReady',new Uint8Array([1,0,0,0,0,0,0,0]),'.data');
 const threshold=new Uint8Array(8);new DataView(threshold.buffer).setBigUint64(0,1048576n,true);
 b.data('rt.gcThreshold',threshold,'.data');

 // Only typed pointers reach this function. A string descriptor can be interior
 // to a formatting buffer. Static literals are not in any mapping and are ignored.
 b.fn('rt.gcMarkPointer',56,a=>{
  const done=a.unique('done');
  a.test('rcx','rcx');a.jcc('e',done);a.call('rt.blockOf');a.test('rax','rax');a.jcc('e',done);
  a.load('r10',{base:'rax',disp:H.marked});a.test('r10','r10');a.jcc('ne',done);
  a.mov('r10',1);a.store({base:'rax',disp:H.marked},'r10');
  // A raw block (string, number scratch, byte storage) holds no references and
  // is never a weak key: marking it is all there is to do.
  a.load('r10',{base:'rax',disp:H.kind});a.cmp('r10',HeapKind.raw);a.jcc('e',done);
  a.load('r10',{rip:'rt.gcGrey'});
  a.store({base:'rax',disp:H.greyNext},'r10');a.store({rip:'rt.gcGrey'},'rax');
  a.lea('rcx',{base:'rax',disp:H.size});a.call('rt.gcPendingWake');a.label(done);
 });
 // A non-heap object (for example an intrinsic prototype) is permanently
 // reachable. Weak collection keys are always object payload pointers.
 b.fn('rt.gcIsMarkedPointer',56,a=>{
  const done=a.unique('done'),heap=a.unique('heap');
  a.test('rcx','rcx');const nonnull=a.unique('nonnull');a.jcc('ne',nonnull);a.mov('rax',0);a.jmp(done);a.label(nonnull);
  a.call('rt.blockOf');a.test('rax','rax');a.jcc('ne',heap);a.mov('rax',1);a.jmp(done);
  a.label(heap);a.load('rax',{base:'rax',disp:H.marked});a.label(done);
 });
 b.fn('rt.gcMarkValue',40,a=>{
  const mark=a.unique('mark'),done=a.unique('done');a.load('rax',{base:'rcx'});
  a.cmp('rax',4);a.jcc('e',mark);a.cmp('rax',5);a.jcc('e',mark);a.cmp('rax',6);a.jcc('e',mark);a.cmp('rax',7);a.jcc('e',mark);a.cmp('rax',CellTag);a.jcc('ne',done);
  a.label(mark);a.load('rcx',{base:'rcx',disp:8});a.call('rt.gcMarkPointer');a.label(done);
 });
 // RCX first Value*, RDX initialized count. A runtime range may itself be a
 // managed allocation (apply argv), so retain its container before its Values.
 b.fn('rt.gcMarkRange',56,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');const loop=a.unique('loop'),done=a.unique('done');
  a.call('rt.gcMarkPointer');
  a.label(loop);a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',done);
  a.load('rcx',slot(40));a.call('rt.gcMarkValue');a.load('rax',slot(40));a.add('rax',16);a.store(slot(40),'rax');
  a.load('rax',slot(48));a.sub('rax',1);a.store(slot(48),'rax');a.jmp(loop);a.label(done);
 });
 // May also be called on a suspended generator's saved root head once that
 // generator object is traced. Root records remain resident on its own stack.
 b.fn('rt.gcMarkRootChain',56,a=>{
  a.store(slot(40),'rcx');const loop=a.unique('loop'),done=a.unique('done');
  a.label(loop);a.load('rax',slot(40));a.test('rax','rax');a.jcc('e',done);
  a.load('rcx',{base:'rax',disp:R.values});a.load('rdx',{base:'rax',disp:R.count});a.call('rt.gcMarkRange');
  a.load('rax',slot(40));a.load('rax',{base:'rax',disp:R.next});a.store(slot(40),'rax');a.jmp(loop);
  a.label(done);
 });
 b.fn('rt.gcTraceObject',56,a=>{
  a.store(slot(40),'rcx');a.call('rt.elementsTrace');a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:O.properties});a.call('rt.gcMarkPointer');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:O.prototype});a.call('rt.gcMarkPointer');
  const done=a.unique('done'),box=a.unique('box'),iterator=a.unique('iterator'),generator=a.unique('generator');a.load('rcx',slot(40));a.load('rax',{base:'rcx',disp:O.kind});a.cmp('rax',FunctionKind);a.jcc('ne',box);
  a.load('rcx',{base:'rcx',disp:FunctionLayout.environment});a.call('rt.gcMarkPointer');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:FunctionLayout.bound});a.call('rt.gcMarkPointer');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:FunctionLayout.homeObject});a.call('rt.gcMarkPointer');
  a.load('rcx',slot(40));a.add('rcx',FunctionLayout.lexicalThis);a.call('rt.gcMarkValue');
  a.load('rcx',slot(40));a.add('rcx',FunctionLayout.lexicalNewTarget);a.call('rt.gcMarkValue');a.jmp(done);
  a.label(box);a.cmp('rax',BoxKind);a.jcc('ne',iterator);a.add('rcx',BoxLayout.value);a.call('rt.gcMarkValue');a.jmp(done);
  a.label(iterator);a.cmp('rax',IteratorKind);a.jcc('ne',generator);a.add('rcx',O.size);a.call('rt.gcMarkValue');a.jmp(done);
  a.label(generator);a.cmp('rax',RegExpKind);const notRegExp=a.unique('notRegExp');a.jcc('ne',notRegExp);
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:RegExpLayout.pattern});a.call('rt.gcMarkPointer');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:RegExpLayout.flags});a.call('rt.gcMarkPointer');a.jmp(done);
  a.label(notRegExp);const notBuffer=a.unique('notBuffer'),traceBuffer=a.unique('traceBuffer');a.cmp('rax',ArrayBufferKind);a.jcc('e',traceBuffer);a.cmp('rax',SharedArrayBufferKind);a.jcc('ne',notBuffer);a.label(traceBuffer);
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:ArrayBufferLayout.bytes});a.call('rt.gcMarkPointer');a.jmp(done);
  a.label(notBuffer);const notView=a.unique('notView');a.cmp('rax',DataViewKind);a.jcc('ne',notView);
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:DataViewLayout.buffer});a.call('rt.gcMarkPointer');a.jmp(done);
  a.label(notView);const notTyped=a.unique('notTyped');a.cmp('rax',TypedArrayKind);a.jcc('ne',notTyped);
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:TypedArrayLayout.buffer});a.call('rt.gcMarkPointer');a.jmp(done);
  a.label(notTyped);const notProxy=a.unique('notProxy');a.cmp('rax',ProxyKind);a.jcc('ne',notProxy);
  for(const offset of [ProxyLayout.target,ProxyLayout.handler]){a.load('rcx',slot(40));a.add('rcx',offset);a.call('rt.gcMarkValue');}a.jmp(done);
  a.label(notProxy);const notMap=a.unique('notMap'),notMapIterator=a.unique('notMapIterator');a.cmp('rax',MapKind);const traceMapLike=a.unique('traceMapLike');a.jcc('e',traceMapLike);a.cmp('rax',SetKind);a.jcc('e',traceMapLike);a.cmp('rax',WeakMapKind);a.jcc('e',traceMapLike);a.cmp('rax',WeakSetKind);a.jcc('ne',notMap);a.label(traceMapLike);a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:MapLayout.head});a.call('rt.gcMarkPointer');a.jmp(done);a.label(notMap);a.cmp('rax',MapIteratorKind);const traceMapIterator=a.unique('traceMapIterator');a.jcc('e',traceMapIterator);a.cmp('rax',SetIteratorKind);a.jcc('ne',notMapIterator);a.label(traceMapIterator);a.load('rcx',slot(40));a.add('rcx',MapIteratorLayout.map);a.call('rt.gcMarkValue');a.jmp(done);a.label(notMapIterator);a.cmp('rax',GeneratorKind);a.jcc('ne',done);
  for(const offset of [G.source,G.receiver,G.resumeValue,G.yieldValue,G.returnValue]){a.load('rcx',slot(40));a.add('rcx',offset);a.call('rt.gcMarkValue');}
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:G.arguments});a.call('rt.gcMarkPointer');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:G.context+ContextLayout.roots});a.call('rt.gcMarkRootChain');a.label(done);
 });
 b.fn('rt.gcTraceEnvironment',56,a=>{
  a.load('rax',{base:'rcx',disp:E.count});a.store(slot(48),'rax');a.add('rcx',E.cells);a.store(slot(40),'rcx');
  const loop=a.unique('loop'),done=a.unique('done');a.label(loop);a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',done);
  a.load('rcx',slot(40));a.call('rt.gcMarkValue');
  a.load('rax',slot(40));a.add('rax',E.entry);a.store(slot(40),'rax');a.load('rax',slot(48));a.sub('rax',1);a.store(slot(48),'rax');a.jmp(loop);a.label(done);
 });
 b.fn('rt.gcTraceProperty',56,a=>{
  a.store(slot(40),'rcx');a.load('rcx',{base:'rcx',disp:P.next});a.call('rt.gcMarkPointer');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:P.key});a.call('rt.gcMarkPointer');
  for(const offset of [P.value,P.getter,P.setter]){a.load('rcx',slot(40));a.add('rcx',offset);a.call('rt.gcMarkValue');}
 });
 b.fn('rt.gcTraceMapEntry',56,a=>{
  a.store(slot(40),'rcx');a.load('rcx',{base:'rcx',disp:MapEntryLayout.next});a.call('rt.gcMarkPointer');
  a.load('rax',slot(40));a.load('rax',{base:'rax',disp:MapEntryLayout.active});a.test('rax','rax');const done=a.unique('done');a.jcc('e',done);
  for(const offset of [MapEntryLayout.key,MapEntryLayout.value]){a.load('rcx',slot(40));a.add('rcx',offset);a.call('rt.gcMarkValue');}a.label(done);
 });
 // A weak entry is an ephemeron: its value is live only if its key is. An
 // entry reached while its key is unmarked waits in the pending table; marking
 // the key later (rt.gcMarkPointer) greys the entry again, and this second
 // visit marks the value. WeakSet entries hold their key as the value and
 // never mark it.
 b.fn('rt.gcTraceWeakEntry',56,a=>{
  a.store(slot(40),'rcx');a.load('rcx',{base:'rcx',disp:MapEntryLayout.next});a.call('rt.gcMarkPointer');
  const done=a.unique('done'),live=a.unique('live');
  a.load('rax',slot(40));a.load('r10',{base:'rax',disp:MapEntryLayout.active});a.test('r10','r10');a.jcc('e',done);
  a.load('r10',{base:'rax',disp:MapEntryLayout.weak});a.test('r10','r10');a.jcc('ne',done);
  a.load('rcx',{base:'rax',disp:MapEntryLayout.key+8});a.call('rt.gcIsMarkedPointer');a.test('rax','rax');a.jcc('ne',live);
  a.load('rdx',slot(40));a.load('rcx',{base:'rdx',disp:MapEntryLayout.key+8});a.call('rt.gcPendingAdd');a.jmp(done);
  a.label(live);a.load('rcx',slot(40));a.add('rcx',MapEntryLayout.value);a.call('rt.gcMarkValue');
  a.label(done);
 });
 // Pending ephemerons: an open-addressing table (raw heap, only during a
 // collection) from key payload pointer to weak entry. Slots are {key, entry};
 // key 0 is empty and -1 a consumed slot. A key may appear in several slots,
 // one per weak map holding it.
 for(const name of ['gcPending','gcPendingCapacity','gcPendingUsed'])b.data('rt.'+name,new Uint8Array(8),'.data');
 // RCX key payload pointer, RDX entry payload pointer.
 b.fn('rt.gcPendingAdd',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  const room=a.unique('room'),loop=a.unique('loop'),next=a.unique('next');
  a.load('rax',{rip:'rt.gcPendingUsed'});a.add('rax',1);a.shl('rax',1);a.load('r10',{rip:'rt.gcPendingCapacity'});a.cmp('rax','r10');a.jcc('be',room);a.call('rt.gcPendingGrow');
  a.label(room);a.load('r9',{rip:'rt.gcPendingCapacity'});a.sub('r9',1);a.load('rax',slot(40));a.shr('rax',4);a.mov('r11',0x9E3779B97F4A7C15n);a.imul('rax','r11');a.shr('rax',20);a.and('rax','r9');
  a.load('r8',{rip:'rt.gcPending'});
  a.label(loop);a.mov('r10','rax');a.shl('r10',4);a.add('r10','r8');a.load('r11',{base:'r10'});a.test('r11','r11');a.jcc('e',next);a.add('rax',1);a.and('rax','r9');a.jmp(loop);
  a.label(next);a.load('r11',slot(40));a.store({base:'r10'},'r11');a.load('r11',slot(48));a.store({base:'r10',disp:8},'r11');
  a.load('rax',{rip:'rt.gcPendingUsed'});a.add('rax',1);a.store({rip:'rt.gcPendingUsed'},'rax');
 });
 // Doubles the table (or creates it with 64 slots) and reinserts the live slots.
 b.fn('rt.gcPendingGrow',72,a=>{
  a.load('rax',{rip:'rt.gcPending'});a.store(slot(40),'rax');a.load('rax',{rip:'rt.gcPendingCapacity'});a.store(slot(48),'rax');
  a.shl('rax',1);const sized=a.unique('sized');a.test('rax','rax');a.jcc('ne',sized);a.mov('rax',64);a.label(sized);a.store({rip:'rt.gcPendingCapacity'},'rax');
  a.mov('r8','rax');a.shl('r8',4);a.load('rcx',{rip:'rt.heap'});a.mov('rdx',8);a.callImport('HeapAlloc');a.test('rax','rax');failIf(a,'e');
  a.store({rip:'rt.gcPending'},'rax');a.mov('rax',0);a.store({rip:'rt.gcPendingUsed'},'rax');a.store(slot(56),'rax');
  const loop=a.unique('loop'),skip=a.unique('skip'),done=a.unique('done');
  a.label(loop);a.load('rax',slot(56));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('ae',done);
  a.shl('rax',4);a.load('r10',slot(40));a.add('r10','rax');a.load('rcx',{base:'r10'});a.test('rcx','rcx');a.jcc('e',skip);a.cmp('rcx',-1);a.jcc('e',skip);
  a.load('rdx',{base:'r10',disp:8});a.call('rt.gcPendingAdd');
  a.label(skip);a.load('rax',slot(56));a.add('rax',1);a.store(slot(56),'rax');a.jmp(loop);
  a.label(done);a.load('r8',slot(40));a.test('r8','r8');a.jcc('e',done+'.fresh');a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');a.label(done+'.fresh');
 });
 // RCX payload pointer of a block that just became marked: greys every pending
 // weak entry keyed by it, so the mark loop revisits them and marks their values.
 b.fn('rt.gcPendingWake',40,a=>{
  const done=a.unique('done'),loop=a.unique('loop'),next=a.unique('next');
  a.load('r8',{rip:'rt.gcPending'});a.test('r8','r8');a.jcc('e',done);a.load('rax',{rip:'rt.gcPendingUsed'});a.test('rax','rax');a.jcc('e',done);
  a.load('r9',{rip:'rt.gcPendingCapacity'});a.sub('r9',1);a.mov('rax','rcx');a.shr('rax',4);a.mov('r11',0x9E3779B97F4A7C15n);a.imul('rax','r11');a.shr('rax',20);a.and('rax','r9');
  a.label(loop);a.mov('r10','rax');a.shl('r10',4);a.add('r10','r8');a.load('r11',{base:'r10'});a.test('r11','r11');a.jcc('e',done);a.cmp('r11','rcx');a.jcc('ne',next);
  a.mov('r11',-1);a.store({base:'r10'},'r11');a.load('r11',{base:'r10',disp:8});a.sub('r11',H.size);
  a.load('rdx',{rip:'rt.gcGrey'});a.store({base:'r11',disp:H.greyNext},'rdx');a.store({rip:'rt.gcGrey'},'r11');
  a.label(next);a.add('rax',1);a.and('rax','r9');a.jmp(loop);
  a.label(done);
 });
 b.fn('rt.gcPendingFree',40,a=>{
  const done=a.unique('done');a.load('r8',{rip:'rt.gcPending'});a.test('r8','r8');a.jcc('e',done);
  a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');a.mov('rax',0);a.store({rip:'rt.gcPending'},'rax');a.store({rip:'rt.gcPendingCapacity'},'rax');a.store({rip:'rt.gcPendingUsed'},'rax');
  a.label(done);
 });
 // RCX payload of a marked WeakMap or WeakSet: unlinks the entries whose key died.
 b.fn('rt.gcPruneWeakCollection',120,a=>{
  const entries=a.unique('entries'),nextEntry=a.unique('nextEntry'),remove=a.unique('remove'),keep=a.unique('keep'),done=a.unique('done');
  a.store(slot(48),'rcx');a.load('rax',{base:'rcx',disp:MapLayout.head});a.store(slot(56),'rax');a.mov('rax',0);a.store(slot(64),'rax');
  a.label(entries);a.load('rax',slot(56));a.test('rax','rax');a.jcc('e',done);a.load('r10',{base:'rax',disp:MapEntryLayout.next});a.store(slot(72),'r10');a.load('r10',{base:'rax',disp:MapEntryLayout.active});a.test('r10','r10');a.jcc('e',remove);
  a.load('rcx',{base:'rax',disp:MapEntryLayout.key+8});a.call('rt.gcIsMarkedPointer');a.test('rax','rax');a.jcc('ne',keep);
  a.load('r10',slot(48));a.load('rax',{base:'r10',disp:MapLayout.count});a.sub('rax',1);a.store({base:'r10',disp:MapLayout.count},'rax');
  // The hash index would keep pointing at the removed entry; drop it and let
  // the next lookup rebuild it from the surviving entries.
  a.mov('rcx','r10');a.call('rt.mapIndexFree');
  a.label(remove);a.load('rax',slot(56));a.mov('r10',0);for(const offset of [MapEntryLayout.key,MapEntryLayout.key+8,MapEntryLayout.value,MapEntryLayout.value+8,MapEntryLayout.active])a.store({base:'rax',disp:offset},'r10');
  a.load('r10',slot(64));const first=a.unique('first'),linked=a.unique('linked');a.test('r10','r10');a.jcc('e',first);a.load('rax',slot(72));a.store({base:'r10',disp:MapEntryLayout.next},'rax');a.jmp(linked);a.label(first);a.load('r10',slot(48));a.load('rax',slot(72));a.store({base:'r10',disp:MapLayout.head},'rax');a.label(linked);
  a.load('r10',slot(48));a.load('rax',{base:'r10',disp:MapLayout.tail});a.load('r11',slot(56));a.cmp('rax','r11');const tailDone=a.unique('tailDone');a.jcc('ne',tailDone);a.load('rax',slot(64));a.store({base:'r10',disp:MapLayout.tail},'rax');a.label(tailDone);a.jmp(nextEntry);
  a.label(keep);a.load('rax',slot(56));a.store(slot(64),'rax');
  a.label(nextEntry);a.load('rax',slot(72));a.store(slot(56),'rax');a.jmp(entries);
  a.label(done);
 });
 // Visits every live weak collection on rt.weakList (linked through
 // MapLayout.weakNext at construction) and unlinks the dead ones.
 b.data('rt.weakList',new Uint8Array(8),'.data');
 b.fn('rt.gcPruneWeakEntries',56,a=>{
  const loop=a.unique('loop'),done=a.unique('done'),dead=a.unique('dead');
  a.lea('rax',{rip:'rt.weakList'});a.store(slot(40),'rax');
  a.label(loop);a.load('rax',slot(40));a.load('rcx',{base:'rax'});a.test('rcx','rcx');a.jcc('e',done);
  a.load('r10',{base:'rcx',disp:H.marked-H.size});a.test('r10','r10');a.jcc('e',dead);
  a.store(slot(48),'rcx');a.call('rt.gcPruneWeakCollection');a.load('rcx',slot(48));a.lea('rax',{base:'rcx',disp:MapLayout.weakNext});a.store(slot(40),'rax');a.jmp(loop);
  a.label(dead);a.load('r10',{base:'rcx',disp:MapLayout.weakNext});a.store({base:'rax'},'r10');a.jmp(loop);
  a.label(done);
 });
 // Roots owned by one realm: its global storage, intrinsics and static properties.
 b.fn('rt.gcMarkRealm',40,a=>{
  a.load('rcx',{rip:'rt.gcGlobals'});a.load('rdx',{rip:'rt.gcGlobalCount'});a.call('rt.gcMarkRange');
  a.lea('rcx',{rip:'rt.agentCallback'});a.mov('rdx',1);a.call('rt.gcMarkRange');
  a.lea('rcx',{rip:'rt.preludeGlobals'});a.mov('rdx',2);a.call('rt.gcMarkRange');
  for(const prototype of ['objectPrototype','arrayPrototype','functionPrototype','functionCall','functionApply','functionBind','functionToString','booleanPrototype','numberPrototype','stringPrototype','bigintPrototype','datePrototype','regexpPrototype','mapPrototype','mapIteratorPrototype','setCollectionPrototype','setIteratorPrototype','weakmapPrototype','weaksetPrototype','arraybufferPrototype','sharedarraybufferPrototype','dataviewPrototype','typedArrayPrototype','int8arrayPrototype','uint8arrayPrototype','uint8clampedarrayPrototype','int16arrayPrototype','uint16arrayPrototype','uint32arrayPrototype','int32arrayPrototype','uint32arrayPrototype','float32arrayPrototype','float64arrayPrototype','bigint64arrayPrototype','biguint64arrayPrototype','symbolPrototype','generatorPrototype','generatorFunctionPrototype','globalObject']){a.lea('rcx',{rip:'rt.'+prototype});a.call('rt.gcTraceObject');}
  for(const symbol of [...consoleRoots,...strictRoots,...errorRoots,...dateRoots,...regexpRoots,...mapRoots,...mapIteratorRoots,...setRoots,...setIteratorRoots,...weakCollectionRoots,...arrayBufferRoots,...sharedArrayBufferRoots,...atomicsRoots,...dataViewRoots,...typedArrayRoots,...objectMethodRoots,...wrapperMethodRoots,...constructorRoots,...numberBuiltinRoots,...uriRoots,...symbolRoots,...iteratorRoots,...generatorRoots,...asyncRoots,...arrayBuiltinRoots,...arraySpliceRoots,...arrayOfRoots,...arrayFromRoots,...arrayConcatRoots,...arrayFlatRoots,...arrayLocaleRoots,...arraySortRoots,...arrayUnscopablesRoots,...stringBuiltinRoots,...stringSplitRoots,...stringReplaceRoots,...stringNormalizeRoots,...stringLocaleCompareRoots,...mathRoots,...jsonRoots,...bigintRoots,...inspectionRoots,...descriptorRoots,...collectionRoots,...integrityRoots]){a.lea('rcx',{rip:symbol});a.call('rt.gcTraceObject');}
  // Static property nodes are outside the managed heap index. Trace them explicitly.
  for(const name of ['name','length']){a.lea('rcx',{rip:'rt.functionPrototype.'+name});a.call('rt.gcTraceProperty');}
  for(const name of [...consolePropertyRoots,...strictPropertyRoots,...errorPropertyRoots,...datePropertyRoots,...regexpPropertyRoots,...mapPropertyRoots,...mapIteratorPropertyRoots,...setPropertyRoots,...setIteratorPropertyRoots,...weakCollectionPropertyRoots,...arrayBufferPropertyRoots,...sharedArrayBufferPropertyRoots,...atomicsPropertyRoots,...dataViewPropertyRoots,...typedArrayPropertyRoots,...callStaticProperties,...applyStaticProperties,...bindStaticProperties,...sourceStaticProperties,...proxyPropertyRoots,...objectMethodPropertyRoots,...wrapperMethodPropertyRoots,...globalStaticProperties,...constructorPropertyRoots,...numberBuiltinPropertyRoots,...uriPropertyRoots,...symbolPropertyRoots,...iteratorPropertyRoots,...generatorPropertyRoots,...asyncPropertyRoots,...arrayBuiltinPropertyRoots,...arraySplicePropertyRoots,...arrayOfPropertyRoots,...arrayFromPropertyRoots,...arrayConcatPropertyRoots,...arrayFlatPropertyRoots,...arrayLocalePropertyRoots,...arraySortPropertyRoots,...arrayUnscopablesPropertyRoots,...stringBuiltinPropertyRoots,...stringSplitPropertyRoots,...stringReplacePropertyRoots,...stringNormalizePropertyRoots,...stringLocaleComparePropertyRoots,...mathPropertyRoots,...jsonPropertyRoots,...bigintPropertyRoots,...inspectionPropertyRoots,...descriptorPropertyRoots,...collectionPropertyRoots,...integrityPropertyRoots]){a.lea('rcx',{rip:name});a.call('rt.gcTraceProperty');}
 });
 // RCX header of a dead block: releases what it owns outside the managed heap.
 b.fn('rt.gcFreeBlock',56,a=>{
  const done=a.unique('done'),noIndex=a.unique('noIndex'),noMapIndex=a.unique('noMapIndex'),mapLike=a.unique('mapLike'),noStack=a.unique('noStack');
  a.store(slot(40),'rcx');a.load('r11',{base:'rcx',disp:H.kind});a.cmp('r11',HeapKind.object);a.jcc('ne',done);
  a.load('r8',{base:'rcx',disp:H.size+O.index});a.test('r8','r8');a.jcc('e',noIndex);a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');a.label(noIndex);
  a.load('rcx',slot(40));a.lea('rcx',{base:'rcx',disp:H.size});a.call('rt.elementsFree');
  a.load('rax',slot(40));a.load('r11',{base:'rax',disp:H.size+O.kind});a.cmp('r11',MapKind);a.jcc('e',mapLike);a.cmp('r11',SetKind);a.jcc('e',mapLike);a.cmp('r11',WeakMapKind);a.jcc('e',mapLike);a.cmp('r11',WeakSetKind);a.jcc('ne',noMapIndex);
  a.label(mapLike);a.lea('rcx',{base:'rax',disp:H.size});a.call('rt.mapIndexFree');a.load('rax',slot(40));a.load('r11',{base:'rax',disp:H.size+O.kind});a.label(noMapIndex);
  a.cmp('r11',GeneratorKind);a.jcc('ne',done);a.load('rcx',{base:'rax',disp:H.size+G.stack});a.test('rcx','rcx');a.jcc('e',done);a.call('rt.freeGeneratorStack');
  a.label(done);
 });
 // Frees every unmarked block and clears the marks of the live ones: chunk
 // cells in address order, then the large mappings.
 b.fn('rt.gcSweep',72,a=>{
  const chunks=a.unique('chunks'),cells=a.unique('cells'),nextCell=a.unique('nextCell'),nextChunk=a.unique('nextChunk'),live=a.unique('live'),larges=a.unique('larges'),largeNext=a.unique('largeNext'),largeLive=a.unique('largeLive'),done=a.unique('done');
  a.load('rax',{rip:'rt.chunks'});a.store(slot(40),'rax');
  a.label(chunks);a.load('rax',slot(40));a.test('rax','rax');a.jcc('e',larges);a.load('r10',{base:'rax',disp:C.cells});a.store(slot(48),'r10');
  a.label(cells);a.load('rax',slot(40));a.load('r10',slot(48));a.load('r11',{base:'rax',disp:C.carved});a.cmp('r10','r11');a.jcc('ae',nextChunk);
  a.load('r11',{base:'r10',disp:H.kind});a.cmp('r11',FreeKind);a.jcc('e',nextCell);
  a.load('r11',{base:'r10',disp:H.marked});a.test('r11','r11');a.jcc('ne',live);
  a.mov('rcx','r10');a.call('rt.gcFreeBlock');a.load('rax',slot(40));a.load('rcx',slot(48));a.load('rdx',{base:'rax',disp:C.cellSize});a.call('rt.freeCell');a.jmp(nextCell);
  a.label(live);a.mov('r11',0);a.store({base:'r10',disp:H.marked},'r11');a.store({base:'r10',disp:H.greyNext},'r11');
  a.label(nextCell);a.load('rax',slot(40));a.load('r10',slot(48));a.load('r11',{base:'rax',disp:C.cellSize});a.add('r10','r11');a.store(slot(48),'r10');a.jmp(cells);
  a.label(nextChunk);a.load('rax',slot(40));a.load('rax',{base:'rax',disp:C.next});a.store(slot(40),'rax');a.jmp(chunks);
  // Large mappings: slot(56) is the link to patch, slot(48) the mapping.
  a.label(larges);a.lea('rax',{rip:'rt.largeList'});a.store(slot(56),'rax');
  a.label(largeNext);a.load('rax',slot(56));a.load('r10',{base:'rax'});a.test('r10','r10');a.jcc('e',done);a.store(slot(48),'r10');
  a.load('r11',{base:'r10',disp:L.size+H.marked});a.test('r11','r11');a.jcc('ne',largeLive);
  a.lea('rcx',{base:'r10',disp:L.size});a.call('rt.gcFreeBlock');
  a.load('r10',slot(48));a.load('rax',{base:'r10',disp:L.next});a.load('r11',slot(56));a.store({base:'r11'},'rax');
  a.load('rdx',{base:'r10',disp:L.bytes});a.load('r11',{rip:'rt.liveBytes'});a.sub('r11','rdx');a.store({rip:'rt.liveBytes'},'r11');a.load('r11',{rip:'rt.blocks'});a.sub('r11',1);a.store({rip:'rt.blocks'},'r11');
  a.mov('rcx','r10');a.load('rdx',{base:'r10',disp:L.bytes});a.call('rt.largeUnmapPages');a.load('rcx',slot(48));a.call('rt.releaseLarge');a.jmp(largeNext);
  a.label(largeLive);a.mov('r11',0);a.store({base:'r10',disp:L.size+H.marked},'r11');a.store({base:'r10',disp:L.size+H.greyNext},'r11');a.lea('rax',{base:'r10',disp:L.next});a.store(slot(56),'rax');a.jmp(largeNext);
  a.label(done);
 });
 b.fn('rt.collect',72,a=>{
  const mark=a.unique('mark'),sweep=a.unique('sweep'),sweepLoop=a.unique('sweepLoop'),keep=a.unique('keep'),finish=a.unique('finish');
  a.load('rax',{rip:'rt.gcCount'});a.add('rax',1);a.store({rip:'rt.gcCount'},'rax');
  a.lea('rcx',{rip:'rt.tailPending'});a.mov('rdx',3);a.call('rt.gcMarkRange');
  a.lea('rcx',{rip:'rt.tailStaging'});a.mov('rdx',tailStagingCapacity);a.call('rt.gcMarkRange');
  a.lea('rcx',{rip:'rt.sharedJobQueue'});a.mov('rdx',1);a.call('rt.gcMarkRange');
  a.call('rt.gcMarkRealm');
  for(let realm=1;realm<=extraRealms;realm++){
   const skip=a.unique('realmSkip');a.load('rax',{rip:`R${realm}$rt.realmReady`});a.test('rax','rax');a.jcc('e',skip);
   a.call(`R${realm}$rt.gcMarkRealm`);a.label(skip);
  }
  a.load('rax',{rip:'rt.symbolRegistry'});a.store(slot(48),'rax');const symbolRecord=a.unique('symbolRecord'),symbolRecordsDone=a.unique('symbolRecordsDone');
  a.label(symbolRecord);a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',symbolRecordsDone);
  a.mov('rcx','rax');a.call('rt.gcMarkPointer');a.load('rax',slot(48));a.load('rcx',{base:'rax',disp:8});a.call('rt.gcMarkPointer');
  a.load('rax',slot(48));a.load('rcx',{base:'rax',disp:16});a.call('rt.gcMarkPointer');a.load('rax',slot(48));a.load('rax',{base:'rax'});a.store(slot(48),'rax');a.jmp(symbolRecord);a.label(symbolRecordsDone);
  a.load('rcx',{rip:'rt.gcRoots'});a.call('rt.gcMarkRootChain');
  a.load('rcx',{rip:'rt.currentGenerator'});a.call('rt.gcMarkPointer');
  // Nested generator calls suspend their callers. Those stack roots must be
  // marked even when no object in the running frame points back to a caller.
  const contexts=a.unique('contexts'),contextsDone=a.unique('contextsDone');
  a.load('rax',{rip:'rt.contextChain'});a.store(slot(56),'rax');
  a.label(contexts);a.load('rax',slot(56));a.test('rax','rax');a.jcc('e',contextsDone);
  a.load('rcx',{base:'rax',disp:ContextLayout.roots});a.call('rt.gcMarkRootChain');
  a.load('rax',slot(56));a.load('rax',{base:'rax',disp:ContextLayout.parent});a.store(slot(56),'rax');a.jmp(contexts);
  a.label(contextsDone);
  const ephemerons=a.unique('ephemerons');a.label(mark);a.load('rax',{rip:'rt.gcGrey'});a.test('rax','rax');a.jcc('e',ephemerons);
  a.load('r10',{base:'rax',disp:H.greyNext});a.store({rip:'rt.gcGrey'},'r10');
  a.load('r10',{base:'rax',disp:H.kind});a.lea('rcx',{base:'rax',disp:H.size});
  const property=a.unique('property');a.cmp('r10',HeapKind.object);a.jcc('ne',property);a.call('rt.gcTraceObject');a.jmp(mark);
  a.label(property);const cell=a.unique('cell'),environment=a.unique('environment');
  a.cmp('r10',HeapKind.property);a.jcc('ne',cell);a.call('rt.gcTraceProperty');a.jmp(mark);
  a.label(cell);a.cmp('r10',HeapKind.cell);a.jcc('ne',environment);a.call('rt.gcMarkValue');a.jmp(mark);
  a.label(environment);const bound=a.unique('bound');a.cmp('r10',HeapKind.environment);a.jcc('ne',bound);a.call('rt.gcTraceEnvironment');a.jmp(mark);
  a.label(bound);const values=a.unique('values'),symbol=a.unique('symbol'),mapEntry=a.unique('mapEntry'),weakEntry=a.unique('weakEntry');a.cmp('r10',HeapKind.mapEntry);a.jcc('e',mapEntry);a.cmp('r10',HeapKind.weakEntry);a.jcc('e',weakEntry);a.cmp('r10',HeapKind.symbol);a.jcc('e',symbol);a.cmp('r10',HeapKind.valueList);a.jcc('e',values);a.cmp('r10',HeapKind.boundData);a.jcc('ne',mark);a.load('rdx',{base:'rcx',disp:B.count});a.add('rdx',2);a.add('rcx',B.target);a.call('rt.gcMarkRange');a.jmp(mark);
  a.label(mapEntry);a.call('rt.gcTraceMapEntry');a.jmp(mark);
  a.label(weakEntry);a.call('rt.gcTraceWeakEntry');a.jmp(mark);
  a.label(symbol);a.load('rcx',{base:'rcx',disp:8});a.call('rt.gcMarkPointer');a.jmp(mark);
  a.label(values);a.load('rdx',{base:'rcx'});a.add('rcx',8);a.call('rt.gcMarkRange');a.jmp(mark);
  a.label(ephemerons);a.call('rt.gcPendingFree');a.call('rt.gcPruneWeakEntries');
  a.label(sweep);a.call('rt.gcSweep');a.call('rt.keyHashCacheClear');a.load('rax',{rip:'rt.shapeEpoch'});a.add('rax',1);a.store({rip:'rt.shapeEpoch'},'rax');
  a.label(finish);a.load('rax',{rip:'rt.liveBytes'});a.load('r10',{rip:'rt.generatorStackBytes'});a.add('rax','r10');a.add('rax','rax');
  const thresholdReady=a.unique('thresholdReady');a.cmp('rax',1048576);a.jcc('ae',thresholdReady);a.mov('rax',1048576);
  a.label(thresholdReady);a.store({rip:'rt.gcThreshold'},'rax');
 });
 b.fn('rt.safepoint',40,a=>{
  const done=a.unique('done');a.load('rax',{rip:'rt.liveBytes'});a.load('r10',{rip:'rt.generatorStackBytes'});a.add('rax','r10');a.load('r10',{rip:'rt.gcThreshold'});a.cmp('rax','r10');a.jcc('b',done);
  a.call('rt.collect');a.label(done);
 });
}
