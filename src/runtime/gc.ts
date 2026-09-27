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
import {RuntimeBuilder,slot} from './abi.js';
import {HeapLayout as H,HeapKind,RootLayout as R} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P} from './object-layout.js';
import {emitGcIndex} from './gc-index.js';
import {FunctionLayout,FunctionKind} from './functions.js';
import {ContextLayout} from './context-switch.js';
import {GeneratorKind,GeneratorLayout as G,generatorRoots,generatorPropertyRoots} from './generator.js';
import {CellTag,EnvironmentLayout as E} from './environment-layout.js';
import {BoxKind,BoxLayout} from './boxing.js';
import {callStaticProperties} from './function-call.js';
import {applyStaticProperties} from './function-apply.js';
import {bindStaticProperties} from './function-bind.js';
import {BoundDataLayout as B} from './bound-layout.js';
import {sourceStaticProperties} from './function-source.js';
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
export function emitGc(b:RuntimeBuilder):void {
 emitGcIndex(b);
 for(const name of ['gcGlobals','gcGlobalCount','gcRoots','gcGrey','gcCount'])
  b.data('rt.'+name,new Uint8Array(8),'.data');
 const threshold=new Uint8Array(8);new DataView(threshold.buffer).setBigUint64(0,1048576n,true);
 b.data('rt.gcThreshold',threshold,'.data');

 // Only typed pointers reach this function. A string descriptor can be interior
 // to a formatting buffer. Static literals are safely ignored by range lookup.
 b.fn('rt.gcMarkPointer',56,a=>{
  const loop=a.unique('loop'),lower=a.unique('lower'),upper=a.unique('upper'),done=a.unique('done');
  a.store(slot(40),'rcx');a.test('rcx','rcx');a.jcc('e',done);
  a.mov('r8',0);a.load('r9',{rip:'rt.gcIndexCount'});a.load('rdx',{rip:'rt.gcIndex'});
  a.label(loop);a.cmp('r8','r9');a.jcc('ae',done);a.mov('r10','r8');a.add('r10','r9');a.shr('r10',1);
  a.mov('rax','r10');a.shl('rax',3);a.add('rax','rdx');a.load('rax',{base:'rax'});
  a.load('rcx',slot(40));a.lea('r11',{base:'rax',disp:H.size});a.cmp('rcx','r11');a.jcc('b',lower);
  a.sub('rcx','r11');a.load('r11',{base:'rax',disp:H.bytes});a.cmp('rcx','r11');a.jcc('ae',upper);
  a.load('r10',{base:'rax',disp:H.marked});a.test('r10','r10');a.jcc('ne',done);
  a.mov('r10',1);a.store({base:'rax',disp:H.marked},'r10');a.load('r10',{rip:'rt.gcGrey'});
  a.store({base:'rax',disp:H.greyNext},'r10');a.store({rip:'rt.gcGrey'},'rax');a.jmp(done);
  a.label(lower);a.mov('r9','r10');a.jmp(loop);a.label(upper);a.mov('r8','r10');a.add('r8',1);a.jmp(loop);a.label(done);
 });
 // A non-heap object (for example an intrinsic prototype) is permanently
 // reachable. Weak collection keys are always object payload pointers.
 b.fn('rt.gcIsMarkedPointer',56,a=>{
  const loop=a.unique('loop'),lower=a.unique('lower'),upper=a.unique('upper'),found=a.unique('found'),done=a.unique('done');
  a.store(slot(40),'rcx');a.test('rcx','rcx');const nonnull=a.unique('nonnull');a.jcc('ne',nonnull);a.mov('rax',0);a.jmp(done);a.label(nonnull);
  a.mov('r8',0);a.load('r9',{rip:'rt.gcIndexCount'});a.load('rdx',{rip:'rt.gcIndex'});
  a.label(loop);a.cmp('r8','r9');a.jcc('ae',found);a.mov('r10','r8');a.add('r10','r9');a.shr('r10',1);
  a.mov('rax','r10');a.shl('rax',3);a.add('rax','rdx');a.load('rax',{base:'rax'});
  a.load('rcx',slot(40));a.lea('r11',{base:'rax',disp:H.size});a.cmp('rcx','r11');a.jcc('b',lower);
  a.sub('rcx','r11');a.load('r11',{base:'rax',disp:H.bytes});a.cmp('rcx','r11');a.jcc('ae',upper);
  a.load('rax',{base:'rax',disp:H.marked});a.jmp(done);
  a.label(lower);a.mov('r9','r10');a.jmp(loop);a.label(upper);a.mov('r8','r10');a.add('r8',1);a.jmp(loop);
  a.label(found);a.mov('rax',1);a.label(done);
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
  a.store(slot(40),'rcx');a.load('rcx',{base:'rcx',disp:O.properties});a.call('rt.gcMarkPointer');
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
  a.label(notTyped);const notMap=a.unique('notMap'),notMapIterator=a.unique('notMapIterator');a.cmp('rax',MapKind);const traceMapLike=a.unique('traceMapLike');a.jcc('e',traceMapLike);a.cmp('rax',SetKind);a.jcc('e',traceMapLike);a.cmp('rax',WeakMapKind);a.jcc('e',traceMapLike);a.cmp('rax',WeakSetKind);a.jcc('ne',notMap);a.label(traceMapLike);a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:MapLayout.head});a.call('rt.gcMarkPointer');a.jmp(done);a.label(notMap);a.cmp('rax',MapIteratorKind);const traceMapIterator=a.unique('traceMapIterator');a.jcc('e',traceMapIterator);a.cmp('rax',SetIteratorKind);a.jcc('ne',notMapIterator);a.label(traceMapIterator);a.load('rcx',slot(40));a.add('rcx',MapIteratorLayout.map);a.call('rt.gcMarkValue');a.jmp(done);a.label(notMapIterator);a.cmp('rax',GeneratorKind);a.jcc('ne',done);
  for(const offset of [G.source,G.receiver,G.resumeValue,G.yieldValue,G.returnValue]){a.load('rcx',slot(40));a.add('rcx',offset);a.call('rt.gcMarkValue');}
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:G.arguments});a.call('rt.gcMarkPointer');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:G.context+ContextLayout.roots});a.call('rt.gcMarkRootChain');a.label(done);
 });
 b.fn('rt.gcTraceEnvironment',56,a=>{
  a.load('rax',{base:'rcx',disp:E.count});a.store(slot(48),'rax');a.add('rcx',E.cells);a.store(slot(40),'rcx');
  const loop=a.unique('loop'),done=a.unique('done');a.label(loop);a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',done);
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx'});a.call('rt.gcMarkPointer');
  a.load('rax',slot(40));a.add('rax',8);a.store(slot(40),'rax');a.load('rax',slot(48));a.sub('rax',1);a.store(slot(48),'rax');a.jmp(loop);a.label(done);
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
 b.fn('rt.gcTraceWeakEntry',40,a=>{
  a.load('rcx',{base:'rcx',disp:MapEntryLayout.next});a.call('rt.gcMarkPointer');
 });
 // Repeat this pass after ordinary grey objects have drained. Marking an
 // ephemeron value may reveal another ephemeron key in the next grey pass.
 b.fn('rt.gcTraceEphemerons',72,a=>{
  a.load('rax',{rip:'rt.blocks'});a.store(slot(40),'rax');const blocks=a.unique('blocks'),nextBlock=a.unique('nextBlock'),entries=a.unique('entries'),nextEntry=a.unique('nextEntry'),done=a.unique('done');
  a.label(blocks);a.load('rax',slot(40));a.test('rax','rax');a.jcc('e',done);a.load('r10',{base:'rax',disp:H.marked});a.test('r10','r10');a.jcc('e',nextBlock);a.load('r10',{base:'rax',disp:H.kind});a.cmp('r10',HeapKind.object);a.jcc('ne',nextBlock);a.load('r10',{base:'rax',disp:H.size+O.kind});a.cmp('r10',WeakMapKind);a.jcc('ne',nextBlock);
  a.load('rax',{base:'rax',disp:H.size+MapLayout.head});a.store(slot(48),'rax');a.label(entries);a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',nextBlock);a.load('r10',{base:'rax',disp:MapEntryLayout.active});a.test('r10','r10');a.jcc('e',nextEntry);
  a.load('rcx',{base:'rax',disp:MapEntryLayout.key+8});a.call('rt.gcIsMarkedPointer');a.test('rax','rax');a.jcc('e',nextEntry);a.load('rcx',slot(48));a.add('rcx',MapEntryLayout.value);a.call('rt.gcMarkValue');
  a.label(nextEntry);a.load('rax',slot(48));a.load('rax',{base:'rax',disp:MapEntryLayout.next});a.store(slot(48),'rax');a.jmp(entries);
  a.label(nextBlock);a.load('rax',slot(40));a.load('rax',{base:'rax',disp:H.next});a.store(slot(40),'rax');a.jmp(blocks);a.label(done);
 });
 b.fn('rt.gcPruneWeakEntries',120,a=>{
  a.load('rax',{rip:'rt.blocks'});a.store(slot(40),'rax');const blocks=a.unique('blocks'),nextBlock=a.unique('nextBlock'),entries=a.unique('entries'),nextEntry=a.unique('nextEntry'),remove=a.unique('remove'),keep=a.unique('keep'),done=a.unique('done');
  a.label(blocks);a.load('rax',slot(40));a.test('rax','rax');a.jcc('e',done);a.load('r10',{base:'rax',disp:H.marked});a.test('r10','r10');a.jcc('e',nextBlock);a.load('r10',{base:'rax',disp:H.kind});a.cmp('r10',HeapKind.object);a.jcc('ne',nextBlock);a.load('r10',{base:'rax',disp:H.size+O.kind});a.cmp('r10',WeakMapKind);const weak=a.unique('weak');a.jcc('e',weak);a.cmp('r10',WeakSetKind);a.jcc('ne',nextBlock);a.label(weak);
  a.lea('rax',{base:'rax',disp:H.size});a.store(slot(48),'rax');a.load('rax',{base:'rax',disp:MapLayout.head});a.store(slot(56),'rax');a.mov('rax',0);a.store(slot(64),'rax');
  a.label(entries);a.load('rax',slot(56));a.test('rax','rax');a.jcc('e',nextBlock);a.load('r10',{base:'rax',disp:MapEntryLayout.next});a.store(slot(72),'r10');a.load('r10',{base:'rax',disp:MapEntryLayout.active});a.test('r10','r10');a.jcc('e',remove);
  a.load('rcx',{base:'rax',disp:MapEntryLayout.key+8});a.call('rt.gcIsMarkedPointer');a.test('rax','rax');a.jcc('ne',keep);
  a.load('r10',slot(48));a.load('rax',{base:'r10',disp:MapLayout.count});a.sub('rax',1);a.store({base:'r10',disp:MapLayout.count},'rax');
  a.label(remove);a.load('rax',slot(56));a.mov('r10',0);for(const offset of [MapEntryLayout.key,MapEntryLayout.key+8,MapEntryLayout.value,MapEntryLayout.value+8,MapEntryLayout.active])a.store({base:'rax',disp:offset},'r10');
  a.load('r10',slot(64));const first=a.unique('first'),linked=a.unique('linked');a.test('r10','r10');a.jcc('e',first);a.load('rax',slot(72));a.store({base:'r10',disp:MapEntryLayout.next},'rax');a.jmp(linked);a.label(first);a.load('r10',slot(48));a.load('rax',slot(72));a.store({base:'r10',disp:MapLayout.head},'rax');a.label(linked);
  a.load('r10',slot(48));a.load('rax',{base:'r10',disp:MapLayout.tail});a.load('r11',slot(56));a.cmp('rax','r11');const tailDone=a.unique('tailDone');a.jcc('ne',tailDone);a.load('rax',slot(64));a.store({base:'r10',disp:MapLayout.tail},'rax');a.label(tailDone);a.jmp(nextEntry);
  a.label(keep);a.load('rax',slot(56));a.store(slot(64),'rax');
  a.label(nextEntry);a.load('rax',slot(72));a.store(slot(56),'rax');a.jmp(entries);
  a.label(nextBlock);a.load('rax',slot(40));a.load('rax',{base:'rax',disp:H.next});a.store(slot(40),'rax');a.jmp(blocks);a.label(done);
 });
 b.fn('rt.collect',72,a=>{
  const mark=a.unique('mark'),sweep=a.unique('sweep'),sweepLoop=a.unique('sweepLoop'),keep=a.unique('keep'),finish=a.unique('finish');
  a.load('rax',{rip:'rt.gcCount'});a.add('rax',1);a.store({rip:'rt.gcCount'},'rax');
  a.call('rt.gcBuildIndex');
  a.load('rcx',{rip:'rt.gcGlobals'});a.load('rdx',{rip:'rt.gcGlobalCount'});a.call('rt.gcMarkRange');
  for(const prototype of ['objectPrototype','arrayPrototype','functionPrototype','functionCall','functionApply','functionBind','functionToString','booleanPrototype','numberPrototype','stringPrototype','datePrototype','regexpPrototype','mapPrototype','mapIteratorPrototype','setCollectionPrototype','setIteratorPrototype','weakmapPrototype','weaksetPrototype','arraybufferPrototype','sharedarraybufferPrototype','dataviewPrototype','typedArrayPrototype','int8arrayPrototype','uint8arrayPrototype','uint8clampedarrayPrototype','int16arrayPrototype','uint16arrayPrototype','int32arrayPrototype','uint32arrayPrototype','float32arrayPrototype','float64arrayPrototype','bigint64arrayPrototype','biguint64arrayPrototype','symbolPrototype','generatorPrototype','generatorFunctionPrototype','globalObject']){a.lea('rcx',{rip:'rt.'+prototype});a.call('rt.gcTraceObject');}
  for(const symbol of [...consoleRoots,...strictRoots,...errorRoots,...dateRoots,...regexpRoots,...mapRoots,...mapIteratorRoots,...setRoots,...setIteratorRoots,...weakCollectionRoots,...arrayBufferRoots,...sharedArrayBufferRoots,...atomicsRoots,...dataViewRoots,...typedArrayRoots,...objectMethodRoots,...wrapperMethodRoots,...constructorRoots,...numberBuiltinRoots,...uriRoots,...symbolRoots,...iteratorRoots,...generatorRoots,...arrayBuiltinRoots,...arraySpliceRoots,...arrayOfRoots,...arrayFromRoots,...arrayConcatRoots,...arrayFlatRoots,...arrayLocaleRoots,...arraySortRoots,...arrayUnscopablesRoots,...stringBuiltinRoots,...stringSplitRoots,...stringReplaceRoots,...stringNormalizeRoots,...stringLocaleCompareRoots,...mathRoots,...jsonRoots,...bigintRoots,...inspectionRoots,...descriptorRoots,...collectionRoots,...integrityRoots]){a.lea('rcx',{rip:symbol});a.call('rt.gcTraceObject');}
  // Static property nodes are outside the managed heap index. Trace them explicitly.
  for(const name of ['name','length']){a.lea('rcx',{rip:'rt.functionPrototype.'+name});a.call('rt.gcTraceProperty');}
  for(const name of [...consolePropertyRoots,...strictPropertyRoots,...errorPropertyRoots,...datePropertyRoots,...regexpPropertyRoots,...mapPropertyRoots,...mapIteratorPropertyRoots,...setPropertyRoots,...setIteratorPropertyRoots,...weakCollectionPropertyRoots,...arrayBufferPropertyRoots,...sharedArrayBufferPropertyRoots,...atomicsPropertyRoots,...dataViewPropertyRoots,...typedArrayPropertyRoots,...callStaticProperties,...applyStaticProperties,...bindStaticProperties,...sourceStaticProperties,...objectMethodPropertyRoots,...wrapperMethodPropertyRoots,...globalStaticProperties,...constructorPropertyRoots,...numberBuiltinPropertyRoots,...uriPropertyRoots,...symbolPropertyRoots,...iteratorPropertyRoots,...generatorPropertyRoots,...arrayBuiltinPropertyRoots,...arraySplicePropertyRoots,...arrayOfPropertyRoots,...arrayFromPropertyRoots,...arrayConcatPropertyRoots,...arrayFlatPropertyRoots,...arrayLocalePropertyRoots,...arraySortPropertyRoots,...arrayUnscopablesPropertyRoots,...stringBuiltinPropertyRoots,...stringSplitPropertyRoots,...stringReplacePropertyRoots,...stringNormalizePropertyRoots,...stringLocaleComparePropertyRoots,...mathPropertyRoots,...jsonPropertyRoots,...bigintPropertyRoots,...inspectionPropertyRoots,...descriptorPropertyRoots,...collectionPropertyRoots,...integrityPropertyRoots]){a.lea('rcx',{rip:name});a.call('rt.gcTraceProperty');}
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
  a.label(ephemerons);a.call('rt.gcTraceEphemerons');a.load('rax',{rip:'rt.gcGrey'});a.test('rax','rax');a.jcc('ne',mark);a.call('rt.gcPruneWeakEntries');
  a.label(sweep);a.lea('rax',{rip:'rt.blocks'});a.store(slot(40),'rax');
  a.label(sweepLoop);a.load('r10',slot(40));a.load('rax',{base:'r10'});a.test('rax','rax');a.jcc('e',finish);
  a.load('r11',{base:'rax',disp:H.marked});a.test('r11','r11');a.jcc('ne',keep);
  a.load('r11',{base:'rax',disp:H.next});a.store({base:'r10'},'r11');
  const ordinaryFree=a.unique('ordinaryFree');a.load('r11',{base:'rax',disp:H.kind});a.cmp('r11',HeapKind.object);a.jcc('ne',ordinaryFree);
  a.load('r11',{base:'rax',disp:H.size+O.kind});a.cmp('r11',GeneratorKind);a.jcc('ne',ordinaryFree);
  a.load('rcx',{base:'rax',disp:H.size+G.stack});a.test('rcx','rcx');a.jcc('e',ordinaryFree);
  a.store(slot(64),'rax');a.call('rt.freeGeneratorStack');a.load('rax',slot(64));a.label(ordinaryFree);
  a.load('r11',{base:'rax',disp:H.bytes});a.add('r11',H.size);a.load('r10',{rip:'rt.liveBytes'});a.sub('r10','r11');a.store({rip:'rt.liveBytes'},'r10');
  a.mov('r8','rax');a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');a.jmp(sweepLoop);
  a.label(keep);a.mov('r10',0);a.store({base:'rax',disp:H.marked},'r10');a.store({base:'rax',disp:H.greyNext},'r10');
  a.add('rax',H.next);a.store(slot(40),'rax');a.jmp(sweepLoop);
  a.label(finish);a.load('rax',{rip:'rt.liveBytes'});a.add('rax','rax');
  const thresholdReady=a.unique('thresholdReady');a.cmp('rax',1048576);a.jcc('ae',thresholdReady);a.mov('rax',1048576);
  a.label(thresholdReady);a.store({rip:'rt.gcThreshold'},'rax');a.call('rt.gcFreeIndex');
 });
 b.fn('rt.safepoint',40,a=>{
  const done=a.unique('done');a.load('rax',{rip:'rt.liveBytes'});a.load('r10',{rip:'rt.gcThreshold'});a.cmp('rax','r10');a.jcc('b',done);
  a.call('rt.collect');a.label(done);
 });
}
