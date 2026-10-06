import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {prependFunctionBuiltin,emitNativeFunction,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';

const wellKnown=['asyncIterator','hasInstance','isConcatSpreadable','iterator','match','matchAll','replace','search','species','split','toPrimitive','toStringTag','unscopables','dispose','asyncDispose'] as const;
export const symbolRoots=['rt.Symbol.for.fn','rt.Symbol.keyFor.fn','rt.symbolToPrimitive.fn','rt.symbolDescription.fn','rt.functionHasInstance.fn'];
export const symbolPropertyRoots=[...['for','keyFor'].flatMap(name=>builtinPropertyRoots('rt.Symbol.'+name+'.fn',name,'rt.Symbol')),
 'rt.symbolPrototype.@@toPrimitive','rt.symbolToPrimitive.fn.name','rt.symbolToPrimitive.fn.length',
 'rt.symbolPrototype.description','rt.symbolDescription.fn.name','rt.symbolDescription.fn.length','rt.symbolPrototype.@@toStringTag',
 'rt.functionPrototype.@@hasInstance','rt.functionHasInstance.fn.name','rt.functionHasInstance.fn.length'];

export function emitSymbols(b:RuntimeBuilder):void {
 b.data('rt.symbolRegistry',new Uint8Array(8),'.data');
 for(const name of wellKnown){
  const label='rt.Symbol.'+name;
  b.bundle.fragments.push(stringLiteral(label+'.key',name),stringLiteral(label+'.description','Symbol.'+name));
  const symbol=new Uint8Array(16);new DataView(symbol.buffer).setBigUint64(0,0xffffffffffffffffn,true);
  b.bundle.fragments.push({name:label+'.value',section:'.data',alignment:8,bytes:symbol,symbols:{},fixups:[{offset:8,kind:'va64',target:label+'.description',addend:0}]});
  const property=new Uint8Array(P.size);property[P.value]=6;
  b.bundle.fragments.push({name:label+'.property',section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
   {offset:P.key,kind:'va64',target:label+'.key',addend:0},
   {offset:P.value+8,kind:'va64',target:label+'.value',addend:0},
  ]});
  const header=b.bundle.fragments.find(f=>f.name==='rt.Symbol')!;
  const head=header.fixups.find(f=>f.offset===O.properties)!;
  b.bundle.fragments.find(f=>f.name===label+'.property')!.fixups.push({offset:P.next,kind:'va64',target:head.target,addend:0});
  head.target=label+'.property';
 }
 for(const [name,length] of [['for',1],['keyFor',1]] as const)prependFunctionBuiltin(b,'rt.Symbol.'+name+'.fn',name,length,'rt.Symbol');
 emitNativeFunction(b,'rt.symbolToPrimitive.fn','[Symbol.toPrimitive]',1);
 const primitiveProperty=new Uint8Array(P.size);primitiveProperty[P.value]=5;primitiveProperty[P.attributes]=A.configurable;
 const symbolPrototype=b.bundle.fragments.find(f=>f.name==='rt.symbolPrototype')!;
 const primitiveHead=symbolPrototype.fixups.find(f=>f.offset===O.properties)!;
 b.bundle.fragments.push({name:'rt.symbolPrototype.@@toPrimitive',section:'.data',alignment:8,bytes:primitiveProperty,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:primitiveHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.toPrimitive.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.symbolToPrimitive.fn',addend:0},
 ]});
 primitiveHead.target='rt.symbolPrototype.@@toPrimitive';
 b.fn('rt.symbolToPrimitive.fn.code',40,a=>{a.load('rdx',slot(80));a.call('rt.thissymbolValue');});
 emitNativeFunction(b,'rt.symbolDescription.fn','get description',0);
 const descriptionProperty=new Uint8Array(P.size);descriptionProperty[P.attributes]=A.accessor|A.configurable;descriptionProperty[P.getter]=5;
 b.bundle.fragments.push(stringLiteral('rt.symbolPrototype.description.key','description'));
 b.bundle.fragments.push({name:'rt.symbolPrototype.description',section:'.data',alignment:8,bytes:descriptionProperty,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:primitiveHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.symbolPrototype.description.key',addend:0},
  {offset:P.getter+8,kind:'va64',target:'rt.symbolDescription.fn',addend:0},
 ]});
 primitiveHead.target='rt.symbolPrototype.description';
 b.bundle.fragments.push(stringLiteral('rt.symbolPrototype.tagText','Symbol'));
 const tagProperty=new Uint8Array(P.size);tagProperty[P.value]=4;tagProperty[P.attributes]=A.configurable;
 b.bundle.fragments.push({name:'rt.symbolPrototype.@@toStringTag',section:'.data',alignment:8,bytes:tagProperty,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:primitiveHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.symbolPrototype.tagText',addend:0},
 ]});primitiveHead.target='rt.symbolPrototype.@@toStringTag';
 b.fn('rt.symbolDescription.fn.code',72,a=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(112));a.lea('rcx',slot(48));a.call('rt.thissymbolValue');
  a.load('rax',slot(56));a.load('rax',{base:'rax',disp:8});a.load('rcx',slot(40));
  const absent=a.unique('absent'),done=a.unique('done');a.test('rax','rax');a.jcc('e',absent);a.mov('r10',4);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');a.jmp(done);
  a.label(absent);a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
 emitNativeFunction(b,'rt.functionHasInstance.fn','[Symbol.hasInstance]',1);
 const functionPrototype=b.bundle.fragments.find(f=>f.name==='rt.functionPrototype')!;
 const functionHead=functionPrototype.fixups.find(f=>f.offset===O.properties)!;
 const hasInstanceProperty=new Uint8Array(P.size);hasInstanceProperty[P.value]=5;
 b.bundle.fragments.push({name:'rt.functionPrototype.@@hasInstance',section:'.data',alignment:8,bytes:hasInstanceProperty,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:functionHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.hasInstance.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.functionHasInstance.fn',addend:0},
 ]});functionHead.target='rt.functionPrototype.@@hasInstance';
 rootedFn(b,'rt.functionHasInstance.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:2}],(a,frame)=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');
  const argumentReady=a.unique('argumentReady');a.test('rdx','rdx');a.jcc('e',argumentReady);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}
  a.label(argumentReady);a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(80+n),'rax');}
  const no=a.unique('no'),done=a.unique('done');a.load('rax',slot(80));a.cmp('rax',5);a.jcc('ne',no);a.load('r10',slot(88));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',2);a.jcc('ne',no);
  a.load('rcx',slot(40));a.lea('rdx',slot(64));a.lea('r8',slot(80));a.call('rt.ordinaryHasInstance');a.jmp(done);
  a.label(no);a.load('rcx',slot(40));a.mov('rax',2);a.store({base:'rcx'},'rax');a.mov('rax',0);a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
 // Registry records contain [next, UTF-16 key descriptor, unique symbol].
 rootedFn(b,'rt.Symbol.for.fn.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.lea('rcx',slot(64));const provided=a.unique('provided'),converted=a.unique('converted');a.test('rdx','rdx');a.jcc('ne',provided);
  a.lea('rdx',{rip:'rt.undefinedValue'});a.jmp(converted);a.label(provided);a.mov('rdx','r8');a.label(converted);a.call('rt.toString');
  const scan=a.unique('scan'),create=a.unique('create'),next=a.unique('next'),found=a.unique('found');
  a.load('rax',{rip:'rt.symbolRegistry'});a.store(slot(56),'rax');a.label(scan);a.load('rax',slot(56));a.test('rax','rax');a.jcc('e',create);
  a.load('rcx',{base:'rax',disp:8});a.load('rdx',slot(72));a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',found);
  a.load('rax',slot(56));a.load('rax',{base:'rax'});a.store(slot(56),'rax');a.jmp(scan);
  a.label(found);a.load('rax',slot(56));a.load('rax',{base:'rax',disp:16});a.jmp(next);
  a.label(create);a.mov('rcx',16);a.call('rt.alloc');a.mov('r10',HeapKind.symbol);a.store({base:'rax',disp:H.kind-H.size},'r10');a.mov('r10',-1);a.store({base:'rax'},'r10');a.load('r10',slot(72));a.store({base:'rax',disp:8},'r10');a.store(slot(88),'rax');a.mov('r10',6);a.store(slot(80),'r10');
  a.mov('rcx',24);a.call('rt.alloc');a.load('r10',{rip:'rt.symbolRegistry'});a.store({base:'rax'},'r10');a.load('r10',slot(72));a.store({base:'rax',disp:8},'r10');a.load('r10',slot(88));a.store({base:'rax',disp:16},'r10');a.store({rip:'rt.symbolRegistry'},'rax');a.load('rax',slot(88));
  a.label(next);a.load('rcx',slot(40));a.mov('r10',6);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.Symbol.keyFor.fn.code',88,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'}],a=>{
  a.store(slot(40),'rcx');a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');a.load('rax',{base:'r8'});a.cmp('rax',6);failIf(a,'ne','rt.throwTypeError');a.load('rax',{base:'r8',disp:8});a.store(slot(48),'rax');
  a.load('rax',{rip:'rt.symbolRegistry'});const scan=a.unique('scan'),missing=a.unique('missing'),done=a.unique('done');
  a.label(scan);a.test('rax','rax');a.jcc('e',missing);a.load('r10',{base:'rax',disp:16});a.load('r11',slot(48));a.cmp('r10','r11');a.jcc('e',done);a.load('rax',{base:'rax'});a.jmp(scan);
  a.label(done);a.load('rax',{base:'rax',disp:8});a.load('rcx',slot(40));a.mov('r10',4);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');a.jmp(missing+'.end');
  a.label(missing);a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');a.label(missing+'.end');
 });
}
