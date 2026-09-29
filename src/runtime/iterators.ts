import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {FunctionKind} from './functions.js';
import {emitNativeFunction} from './function-builtin.js';
import {stringLiteral} from './value.js';

export const IteratorKind=8;
const Source=O.size,Index=O.size+16,IteratorSize=O.size+32;
export const iteratorRoots=['rt.arrayIterator.fn','rt.arrayKeys.fn','rt.arrayEntries.fn','rt.stringIterator.fn','rt.iteratorNext.fn','rt.iteratorSelf.fn','rt.iteratorPrototype'];
export const iteratorPropertyRoots=['rt.arrayPrototype.@@iterator','rt.arrayPrototype.values','rt.arrayPrototype.keys','rt.arrayPrototype.entries','rt.stringPrototype.@@iterator','rt.iteratorPrototype.next','rt.iteratorPrototype.@@iterator',
 ...['rt.arrayIterator.fn','rt.arrayKeys.fn','rt.arrayEntries.fn','rt.stringIterator.fn','rt.iteratorNext.fn','rt.iteratorSelf.fn'].flatMap(name=>[name+'.name',name+'.length'])];

function symbolMethod(b:RuntimeBuilder,owner:string,node:string,method:string,symbol:string):void {
 const header=b.bundle.fragments.find(f=>f.name===owner)!;
 const head=header.fixups.find(f=>f.offset===O.properties)!;
 const bytes=new Uint8Array(P.size);bytes[P.value]=5;bytes[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push({name:node,section:'.data',alignment:8,bytes,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:head.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.iterator.value',addend:0},
  {offset:P.value+8,kind:'va64',target:symbol,addend:0},
 ]});head.target=node;
}
function ordinaryMethod(b:RuntimeBuilder,owner:string,node:string,key:string,symbol:string):void {
 const header=b.bundle.fragments.find(f=>f.name===owner)!;
 const head=header.fixups.find(f=>f.offset===O.properties);
 const bytes=new Uint8Array(P.size);bytes[P.value]=5;bytes[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push({name:node,section:'.data',alignment:8,bytes,symbols:{},fixups:[
  ...(head?[{offset:P.next,kind:'va64' as const,target:head.target,addend:0}]:[]),
  {offset:P.key,kind:'va64',target:key,addend:0},
  {offset:P.value+8,kind:'va64',target:symbol,addend:0},
 ]});if(head)head.target=node;else header.fixups.push({offset:O.properties,kind:'va64',target:node,addend:0});
}

export function emitIterators(b:RuntimeBuilder):void {
 for(const name of ['next','value','done','return'])b.bundle.fragments.push(stringLiteral('rt.iter.'+name,name));
 const iteratorPrototype=new Uint8Array(O.size);
 b.bundle.fragments.push({name:'rt.iteratorPrototype',section:'.data',alignment:8,bytes:iteratorPrototype,symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
 ]});
 for(const [symbol,method] of [['rt.arrayIterator.fn','values'],['rt.arrayKeys.fn','keys'],['rt.arrayEntries.fn','entries'],['rt.stringIterator.fn','[Symbol.iterator]'],['rt.iteratorNext.fn','next'],['rt.iteratorSelf.fn','[Symbol.iterator]']] as const)
  emitNativeFunction(b,symbol,method,0);
 symbolMethod(b,'rt.arrayPrototype','rt.arrayPrototype.@@iterator','iterator','rt.arrayIterator.fn');
 b.bundle.fragments.push(stringLiteral('rt.iter.values','values'));
 ordinaryMethod(b,'rt.arrayPrototype','rt.arrayPrototype.values','rt.iter.values','rt.arrayIterator.fn');
 for(const method of ['keys','entries'] as const){b.bundle.fragments.push(stringLiteral('rt.iter.'+method,method));ordinaryMethod(b,'rt.arrayPrototype','rt.arrayPrototype.'+method,'rt.iter.'+method,'rt.array'+(method==='keys'?'Keys':'Entries')+'.fn');}
 symbolMethod(b,'rt.stringPrototype','rt.stringPrototype.@@iterator','iterator','rt.stringIterator.fn');
 ordinaryMethod(b,'rt.iteratorPrototype','rt.iteratorPrototype.next','rt.iter.next','rt.iteratorNext.fn');
 symbolMethod(b,'rt.iteratorPrototype','rt.iteratorPrototype.@@iterator','iterator','rt.iteratorSelf.fn');
 b.fn('rt.iteratorSelf.fn.code',56,a=>{a.load('rdx',slot(96));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store({base:'rcx',disp:n},'rax');}});
 // Internal allocation of a stateful iterator; receiver Value is rooted.
 rootedFn(b,'rt.newIterator',104,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.mov('rcx',IteratorSize);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');a.mov('r10',IteratorKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying])a.store({base:'rax',disp:offset},'r10');a.load('r10',slot(56));a.store({base:'rax',disp:O.flags},'r10');
  a.lea('r10',{rip:'rt.iteratorPrototype'});a.store({base:'rax',disp:O.prototype},'r10');
  a.load('rdx',slot(48));for(const n of [0,8]){a.load('r10',{base:'rdx',disp:n});a.store({base:'rax',disp:Source+n},'r10');}
  a.mov('r10',3);a.store({base:'rax',disp:Index},'r10');a.mov('r10',0);a.store({base:'rax',disp:Index+8},'r10');
  a.load('rcx',slot(40));a.mov('r10',5);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 for(const [symbol,kind,mode] of [['rt.arrayIterator.fn.code','array',0],['rt.arrayKeys.fn.code','array',1],['rt.arrayEntries.fn.code','array',2],['rt.stringIterator.fn.code','string',0]] as const)rootedFn(b,symbol,88,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(frame+40));a.lea('rcx',slot(64));
  if(kind==='string'){a.load('rax',{base:'rdx'});a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');a.call('rt.toString');}else a.call('rt.toObject');
  a.load('rcx',slot(40));a.lea('rdx',slot(64));a.mov('r8',mode);a.call('rt.newIterator');
 });
 // The next method is intentionally generic over Array and String iterator
 // state, but validates that its receiver is one of our iterator records.
 rootedFn(b,'rt.iteratorNext.fn.code',200,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:7}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
  a.load('rax',slot(64));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',IteratorKind);failIf(a,'ne','rt.throwTypeError');
  const finished=a.unique('finished'),construct=a.unique('construct');
  a.load('rax',{base:'r10',disp:Source});a.test('rax','rax');a.jcc('e',finished);
  a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.str.length'});a.store(slot(88),'rax');
  a.lea('rcx',slot(96));a.lea('rdx',{base:'r10',disp:Source});a.lea('r8',slot(80));a.call('rt.getProperty');
  a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.call('rt.toNumber');
  a.load('r10',slot(72));a.movsd('xmm0',{base:'r10',disp:Index+8});a.ucomisd('xmm0',slot(120));
  a.jcc('ae',finished);
  a.load('rax',{base:'r10',disp:O.flags});const values=a.unique('values'),keys=a.unique('keys'),valueReady=a.unique('valueReady');a.cmp('rax',1);a.jcc('e',keys);
  a.mov('rax',3);a.store(slot(112),'rax');a.movsd('xmm0',{base:'r10',disp:Index+8});a.storesd(slot(120),'xmm0');
  a.lea('rcx',slot(128));a.lea('rdx',{base:'r10',disp:Source});a.lea('r8',{base:'r10',disp:Index});a.call('rt.forOfValue');
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.flags});a.cmp('rax',2);a.jcc('ne',valueReady);
  a.lea('rcx',slot(96));a.mov('rdx',1);a.mov('r8',0);a.call('rt.newObject');
  a.lea('rcx',slot(96));a.lea('rdx',slot(112));a.call('rt.appendArrayValue');
  a.lea('rcx',slot(96));a.lea('rdx',slot(128));a.call('rt.appendArrayValue');
  for(const n of [0,8]){a.load('rax',slot(96+n));a.store(slot(128+n),'rax');}a.jmp(valueReady);
  a.label(keys);a.mov('rax',3);a.store(slot(128),'rax');a.movsd('xmm0',{base:'r10',disp:Index+8});a.storesd(slot(136),'xmm0');a.mov('rax',1);a.cvtsi2sd('xmm1','rax');a.addsd('xmm0','xmm1');a.storesd({base:'r10',disp:Index+8},'xmm0');
  a.label(valueReady);
  a.mov('rax',2);a.store(slot(144),'rax');a.mov('rax',0);a.store(slot(152),'rax');a.jmp(construct);
  a.label(finished);a.load('r10',slot(72));a.mov('rax',0);a.store({base:'r10',disp:Source},'rax');a.store({base:'r10',disp:Source+8},'rax');a.store(slot(128),'rax');a.store(slot(136),'rax');a.mov('rax',1);a.store(slot(152),'rax');a.mov('rax',2);a.store(slot(144),'rax');
  a.label(construct);a.lea('rcx',slot(160));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
  a.mov('rax',4);a.store(slot(176),'rax');a.lea('rax',{rip:'rt.iter.value'});a.store(slot(184),'rax');
  a.lea('rcx',slot(160));a.lea('rdx',slot(176));a.lea('r8',slot(128));a.mov('r9',1);a.call('rt.setProperty');
  a.lea('rax',{rip:'rt.iter.done'});a.store(slot(184),'rax');
  a.lea('rcx',slot(160));a.lea('rdx',slot(176));a.lea('r8',slot(144));a.mov('r9',1);a.call('rt.setProperty');
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(160+n));a.store({base:'rcx',disp:n},'rax');}
 });
 // Iterator acquisition caches the next method once, as required by the
 // iterator record. Callbacks may allocate, so each temporary is rooted.
 rootedFn(b,'rt.getIterator',168,[{kind:'output',register:'rcx'},{kind:'output',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:64,count:4}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.mov('rax',6);a.store(slot(64),'rax');a.lea('rax',{rip:'rt.Symbol.iterator.value'});a.store(slot(72),'rax');
  a.lea('rcx',slot(80));a.load('rdx',slot(56));a.lea('r8',slot(64));a.call('rt.getProperty');
  a.load('rax',slot(80));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',slot(88));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',slot(56));a.store(slot(32),'rax');a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.mov('r8',0);a.lea('r9',{rip:'rt.undefinedValue'});a.call('rt.invoke');
  a.load('rax',slot(96));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',4);a.store(slot(64),'rax');a.lea('rax',{rip:'rt.iter.next'});a.store(slot(72),'rax');
  // GetIterator only reads next (ES2020 7.4.1); calling it later reports a non-callable value.
  a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.lea('r8',slot(64));a.call('rt.getProperty');
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(96+n));a.store({base:'rcx',disp:n},'rax');}
  a.load('rcx',slot(48));for(const n of [0,8]){a.load('rax',slot(112+n));a.store({base:'rcx',disp:n},'rax');}
 });
 rootedFn(b,'rt.iteratorStep',152,[{kind:'output',register:'rcx'},{kind:'output',register:'rdx'},{kind:'value',register:'r8'},{kind:'value',register:'r9'},{kind:'locals',offset:64,count:4}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(72),'r9');
  a.store(slot(32),'r8');a.lea('rcx',slot(80));a.load('rdx',slot(72));a.mov('r8',0);a.lea('r9',{rip:'rt.undefinedValue'});a.call('rt.invoke');
  a.load('rax',slot(80));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.iter.done'});a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.lea('rcx',slot(112));a.call('rt.toBoolean');a.load('rdx',slot(48));a.mov('r10',2);a.store({base:'rdx'},'r10');a.store({base:'rdx',disp:8},'rax');
  const done=a.unique('done');a.test('rax','rax');a.jcc('ne',done);
  a.lea('rax',{rip:'rt.iter.value'});a.store(slot(104),'rax');a.load('rcx',slot(40));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.getProperty');a.jmp(done+'.end');
  a.label(done);a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');a.label(done+'.end');
 });
 rootedFn(b,'rt.iteratorClose',152,[{kind:'value',register:'rcx'},{kind:'locals',offset:64,count:4}],a=>{
  for(const n of [0,8]){a.load('rax',{base:'rcx',disp:n});a.store(slot(64+n),'rax');}
  a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.iter.return'});a.store(slot(88),'rax');
  a.lea('rcx',slot(96));a.lea('rdx',slot(64));a.lea('r8',slot(80));a.call('rt.getProperty');
  const done=a.unique('done');a.load('rax',slot(96));a.cmp('rax',1);a.jcc('be',done);a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',slot(104));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.lea('rax',slot(64));a.store(slot(32),'rax');a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.mov('r8',0);a.lea('r9',{rip:'rt.undefinedValue'});a.call('rt.invoke');
  a.load('rax',slot(112));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.label(done);
 });
}
