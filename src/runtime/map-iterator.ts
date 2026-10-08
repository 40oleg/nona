import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {prependFunctionBuiltin,emitNativeFunction,builtinPropertyRoots} from './function-builtin.js';
import {MapKind,MapLayout,MapEntryLayout} from './map.js';
import {stringLiteral} from './value.js';

export const MapIteratorKind=16;
export const MapIteratorLayout={map:O.size,current:O.size+16,started:O.size+24,mode:O.size+32,size:O.size+40} as const;
export const mapIteratorRoots=['rt.mapIteratorNext.fn',...['entries','keys','values'].map(name=>'rt.map.'+name+'.fn')];
export const mapIteratorPropertyRoots=['rt.mapPrototype.@@iterator','rt.mapIteratorPrototype.next','rt.mapIteratorPrototype.@@toStringTag',
 ...['entries','keys','values'].flatMap(name=>builtinPropertyRoots('rt.map.'+name+'.fn',name,'rt.mapPrototype')),
 'rt.mapIteratorNext.fn.name','rt.mapIteratorNext.fn.length'];

export function emitMapIterators(b:RuntimeBuilder):void {
 b.bundle.fragments.push({name:'rt.mapIteratorPrototype',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[{offset:O.prototype,kind:'va64',target:'rt.iteratorPrototype',addend:0}]});
 b.bundle.fragments.push(stringLiteral('rt.mapIteratorTag','Map Iterator'));
 const tag=new Uint8Array(P.size);tag[P.value]=4;tag[P.attributes]=A.configurable;
 b.bundle.fragments.push({name:'rt.mapIteratorPrototype.@@toStringTag',section:'.data',alignment:8,bytes:tag,symbols:{},fixups:[
  {offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},{offset:P.value+8,kind:'va64',target:'rt.mapIteratorTag',addend:0},
 ]});b.bundle.fragments.find(f=>f.name==='rt.mapIteratorPrototype')!.fixups.push({offset:O.properties,kind:'va64',target:'rt.mapIteratorPrototype.@@toStringTag',addend:0});
 prependFunctionBuiltin(b,'rt.mapIteratorNext.fn','next',0,'rt.mapIteratorPrototype');
 for(const name of ['entries','keys','values'] as const)prependFunctionBuiltin(b,'rt.map.'+name+'.fn',name,0,'rt.mapPrototype');
 const map=b.bundle.fragments.find(f=>f.name==='rt.mapPrototype')!,head=map.fixups.find(f=>f.offset===O.properties)!;
 const property=new Uint8Array(P.size);property[P.value]=5;property[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push({name:'rt.mapPrototype.@@iterator',section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:head.target,addend:0},{offset:P.key,kind:'va64',target:'rt.Symbol.iterator.value',addend:0},{offset:P.value+8,kind:'va64',target:'rt.map.entries.fn',addend:0},
 ]});head.target='rt.mapPrototype.@@iterator';
 rootedFn(b,'rt.newMapIterator',104,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.mov('rcx',MapIteratorLayout.size);a.call('rt.alloc');a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');a.mov('r10',MapIteratorKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.shape,O.flags,MapIteratorLayout.current,MapIteratorLayout.started])a.store({base:'rax',disp:offset},'r10');a.lea('r10',{rip:'rt.mapIteratorPrototype'});a.store({base:'rax',disp:O.prototype},'r10');
  a.load('rdx',slot(48));for(const n of [0,8]){a.load('r10',{base:'rdx',disp:n});a.store({base:'rax',disp:MapIteratorLayout.map+n},'r10');}a.load('r10',slot(56));a.store({base:'rax',disp:MapIteratorLayout.mode},'r10');
  a.load('rcx',slot(40));a.mov('r10',5);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 for(const [name,mode] of [['entries',2],['keys',0],['values',1]] as const)rootedFn(b,'rt.map.'+name+'.fn.code',88,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');
  a.load('rdx',slot(frame+40));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('rax',{base:'rdx',disp:8});a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',MapKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rcx',slot(40));a.mov('r8',mode);a.call('rt.newMapIterator');
 });
 rootedFn(b,'rt.mapIteratorNext.fn.code',232,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:10}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}a.load('rax',slot(64));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',MapIteratorKind);failIf(a,'ne','rt.throwTypeError');
  const finished=a.unique('finished'),scan=a.unique('scan'),found=a.unique('found'),result=a.unique('result');a.load('rax',{base:'r10',disp:MapIteratorLayout.map});a.test('rax','rax');a.jcc('e',finished);a.load('r11',{base:'r10',disp:MapIteratorLayout.map+8});a.load('rax',{base:'r10',disp:MapIteratorLayout.started});a.test('rax','rax');const first=a.unique('first');a.jcc('e',first);a.load('rax',{base:'r10',disp:MapIteratorLayout.current});a.load('rax',{base:'rax',disp:MapEntryLayout.next});a.jmp(scan);a.label(first);a.load('rax',{base:'r11',disp:MapLayout.head});
  a.label(scan);a.test('rax','rax');a.jcc('e',finished);a.load('r11',{base:'rax',disp:MapEntryLayout.active});a.test('r11','r11');a.jcc('ne',found);a.load('rax',{base:'rax',disp:MapEntryLayout.next});a.jmp(scan);
  a.label(found);a.load('r10',slot(72));a.store({base:'r10',disp:MapIteratorLayout.current},'rax');a.mov('r11',1);a.store({base:'r10',disp:MapIteratorLayout.started},'r11');
  for(const [from,to] of [[MapEntryLayout.key,80],[MapEntryLayout.value,96]] as const)for(const n of [0,8]){a.load('r11',{base:'rax',disp:from+n});a.store(slot(to+n),'r11');}
  a.load('r10',{base:'r10',disp:MapIteratorLayout.mode});a.cmp('r10',0);const key=a.unique('key'),value=a.unique('value');a.jcc('e',key);a.cmp('r10',1);a.jcc('e',value);
  a.lea('rcx',slot(112));a.mov('rdx',1);a.mov('r8',0);a.call('rt.newObject');a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.call('rt.appendArrayValue');a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.call('rt.appendArrayValue');a.jmp(result);
  a.label(key);for(const n of [0,8]){a.load('rax',slot(80+n));a.store(slot(112+n),'rax');}a.jmp(result);
  a.label(value);for(const n of [0,8]){a.load('rax',slot(96+n));a.store(slot(112+n),'rax');}a.jmp(result);
  a.label(finished);a.load('r10',slot(72));a.mov('rax',0);for(const offset of [MapIteratorLayout.map,MapIteratorLayout.map+8,MapIteratorLayout.current])a.store({base:'r10',disp:offset},'rax');a.store(slot(112),'rax');a.store(slot(120),'rax');a.mov('rax',1);a.store(slot(136),'rax');a.jmp(result+'.done');
  a.label(result);a.mov('rax',0);a.store(slot(136),'rax');a.label(result+'.done');a.mov('rax',2);a.store(slot(128),'rax');
  a.lea('rcx',slot(144));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');a.mov('rax',4);a.store(slot(160),'rax');a.lea('rax',{rip:'rt.iter.value'});a.store(slot(168),'rax');a.lea('rcx',slot(144));a.lea('rdx',slot(160));a.lea('r8',slot(112));a.mov('r9',1);a.call('rt.setProperty');
  a.lea('rax',{rip:'rt.iter.done'});a.store(slot(168),'rax');a.lea('rcx',slot(144));a.lea('rdx',slot(160));a.lea('r8',slot(128));a.mov('r9',1);a.call('rt.setProperty');
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(144+n));a.store({base:'rcx',disp:n},'rax');}
 });
}
