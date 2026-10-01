import {RuntimeBuilder,slot,failIf} from './abi.js';
import {selectNativeConstructPrototype} from './constructor-prototype.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {prependFunctionBuiltin,emitNativeFunction,builtinPropertyRoots} from './function-builtin.js';
import {MapLayout,MapEntryLayout} from './map.js';
import {stringLiteral} from './value.js';
import {HandlerLayout as EH,preservedGp,preservedXmm} from './exception-layout.js';
import {FunctionKind} from './functions.js';

export const SetKind=17;
export const setRoots=['rt.Set.species.fn','rt.setSize.fn','rt.set.forEach.fn',...['add','clear','delete','has'].map(name=>'rt.set.'+name+'.fn')];
export const setPropertyRoots=['rt.Set.@@species','rt.Set.species.fn.name','rt.Set.species.fn.length','rt.setCollectionPrototype.size','rt.setCollectionPrototype.@@toStringTag',...setRoots.slice(1).flatMap(name=>name==='rt.setSize.fn'?[name+'.name',name+'.length']:builtinPropertyRoots(name,name.slice(7,-3),'rt.setCollectionPrototype'))];

export function emitSetPrototype(b:RuntimeBuilder):void {
 b.bundle.fragments.push({name:'rt.setCollectionPrototype',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[{offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0}]});
}

export function emitSet(b:RuntimeBuilder):void {
 emitNativeFunction(b,'rt.Set.species.fn','get [Symbol.species]',0);
 const species=new Uint8Array(P.size);species[P.attributes]=A.accessor|A.configurable;species[P.getter]=5;
 const constructor=b.bundle.fragments.find(f=>f.name==='rt.Set')!,speciesHead=constructor.fixups.find(f=>f.offset===O.properties)!;
 b.bundle.fragments.push({name:'rt.Set.@@species',section:'.data',alignment:8,bytes:species,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:speciesHead.target,addend:0},{offset:P.key,kind:'va64',target:'rt.Symbol.species.value',addend:0},{offset:P.getter+8,kind:'va64',target:'rt.Set.species.fn',addend:0},
 ]});speciesHead.target='rt.Set.@@species';
 b.fn('rt.Set.species.fn.code',40,a=>{a.load('rdx',slot(80));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store({base:'rcx',disp:offset},'rax');}});
 b.bundle.fragments.push(stringLiteral('rt.setTag','Set'));
 const prototype=b.bundle.fragments.find(f=>f.name==='rt.setCollectionPrototype')!;
 const prototypeHead=prototype.fixups.find(f=>f.offset===O.properties)!;
 const tag=new Uint8Array(P.size);tag[P.value]=4;tag[P.attributes]=A.configurable;
 b.bundle.fragments.push({name:'rt.setCollectionPrototype.@@toStringTag',section:'.data',alignment:8,bytes:tag,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:prototypeHead.target,addend:0},{offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},{offset:P.value+8,kind:'va64',target:'rt.setTag',addend:0},
 ]});prototypeHead.target='rt.setCollectionPrototype.@@toStringTag';
 emitNativeFunction(b,'rt.setSize.fn','get size',0);
 const size=new Uint8Array(P.size);size[P.attributes]=A.accessor|A.configurable;size[P.getter]=5;
 b.bundle.fragments.push({name:'rt.setCollectionPrototype.size',section:'.data',alignment:8,bytes:size,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:'rt.setCollectionPrototype.@@toStringTag',addend:0},{offset:P.key,kind:'va64',target:'rt.str.size',addend:0},{offset:P.getter+8,kind:'va64',target:'rt.setSize.fn',addend:0},
 ]});prototype.fixups.find(f=>f.offset===O.properties)!.target='rt.setCollectionPrototype.size';
 for(const name of ['add','clear','delete','has'] as const)prependFunctionBuiltin(b,'rt.set.'+name+'.fn',name,name==='clear'?0:1,'rt.setCollectionPrototype');
 prependFunctionBuiltin(b,'rt.set.forEach.fn','forEach',1,'rt.setCollectionPrototype');
 b.fn('rt.Set.code',40,a=>a.call('rt.throwTypeError'));
 rootedFn(b,'rt.Set.construct',952,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:14}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.mov('rcx',MapLayout.size);a.call('rt.alloc');a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');a.mov('r10',SetKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying,O.flags,MapLayout.head,MapLayout.tail,MapLayout.count,MapLayout.index,MapLayout.weakNext])a.store({base:'rax',disp:offset},'r10');
  selectNativeConstructPrototype(a,frame,'rt.setCollectionPrototype');a.store({base:'rax',disp:O.prototype},'r10');
  a.mov('r10',5);a.store(slot(80),'r10');a.store(slot(88),'rax');
  const done=a.unique('done');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',done);a.load('r10',slot(56));a.load('rax',{base:'r10'});a.cmp('rax',1);a.jcc('e',done);a.test('rax','rax');a.jcc('e',done);
  for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(96+n),'rax');}
  a.mov('rax',4);a.store(slot(112),'rax');a.lea('rax',{rip:'rt.set.add.fn.key'});a.store(slot(120),'rax');a.lea('rcx',slot(128));a.lea('rdx',slot(80));a.lea('r8',slot(112));a.call('rt.getProperty');
  a.load('rax',slot(128));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',slot(136));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.lea('rcx',slot(144));a.lea('rdx',slot(160));a.lea('r8',slot(96));a.call('rt.getIterator');
  const loop=a.unique('loop'),caught=a.unique('caught'),closeFailed=a.unique('closeFailed');a.label(loop);
  a.lea('rcx',slot(176));a.lea('rdx',slot(192));a.lea('r8',slot(144));a.lea('r9',slot(160));a.call('rt.iteratorStep');a.load('rax',slot(200));a.test('rax','rax');a.jcc('ne',done);
  const installHandler=(offset:number,target:string,error:number)=>{
   a.load('rax',{rip:'rt.exceptionHandler'});a.store(slot(offset+EH.next),'rax');a.mov('rax','rsp');a.store(slot(offset+EH.stack),'rax');a.lea('rax',{rip:target});a.store(slot(offset+EH.target),'rax');a.load('rax',{rip:'rt.gcRoots'});a.store(slot(offset+EH.roots),'rax');a.lea('rax',slot(error));a.store(slot(offset+EH.value),'rax');a.load('rax',{rip:'rt.cleanupHead'});a.store(slot(offset+EH.cleanup),'rax');preservedGp.forEach((reg,i)=>a.store(slot(offset+EH.gp+8*i),reg));preservedXmm.forEach((reg,i)=>a.storeXmm128(slot(offset+EH.xmm+16*i),reg));a.mov('rax',0);a.store(slot(offset+EH.kind),'rax');a.lea('rax',slot(offset));a.store({rip:'rt.exceptionHandler'},'rax');
  };
  installHandler(368,caught,272);
  a.lea('rax',slot(80));a.store(slot(32),'rax');a.lea('rcx',slot(208));a.lea('rdx',slot(128));a.mov('r8',1);a.lea('r9',slot(176));a.call('rt.invoke');
  a.load('rax',slot(368+EH.next));a.store({rip:'rt.exceptionHandler'},'rax');a.jmp(loop);
  a.label(caught);installHandler(624,closeFailed,288);a.lea('rcx',slot(144));a.call('rt.iteratorClose');a.load('rax',slot(624+EH.next));a.store({rip:'rt.exceptionHandler'},'rax');a.lea('rcx',slot(272));a.call('rt.throw');a.label(closeFailed);a.lea('rcx',slot(272));a.call('rt.throw');
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
 });
 const receiver=(a:import('../backend/x64/assembler.js').Assembler,frame:number)=>{
  a.load('r10',slot(frame+40));a.load('rax',{base:'r10'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',{base:'r10',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',SetKind);failIf(a,'ne','rt.throwTypeError');
 };
 b.fn('rt.setSize.fn.code',56,a=>{
  receiver(a,56);a.load('rax',{base:'r10',disp:MapLayout.count});a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 rootedFn(b,'rt.set.forEach.fn.code',232,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:7}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');receiver(a,frame);a.store(slot(72),'r10');a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(80+n),'rax');}
  a.load('rax',slot(48));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}a.load('rax',slot(96));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',slot(104));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',slot(48));a.cmp('rax',2);const noThis=a.unique('noThis');a.jcc('b',noThis);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:16+n});a.store(slot(112+n),'rax');}a.label(noThis);
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:MapLayout.head});a.store(slot(64),'rax');const loop=a.unique('loop'),next=a.unique('next'),done=a.unique('done');a.label(loop);a.load('r10',slot(64));a.test('r10','r10');a.jcc('e',done);a.load('rax',{base:'r10',disp:MapEntryLayout.active});a.test('rax','rax');a.jcc('e',next);
  for(const [from,to] of [[MapEntryLayout.key,128],[MapEntryLayout.key,144]] as const)for(const n of [0,8]){a.load('rax',{base:'r10',disp:from+n});a.store(slot(to+n),'rax');}
  for(const n of [0,8]){a.load('rax',slot(80+n));a.store(slot(160+n),'rax');}
  a.lea('rax',slot(112));a.store(slot(32),'rax');a.lea('rcx',slot(176));a.lea('rdx',slot(96));a.mov('r8',3);a.lea('r9',slot(128));a.call('rt.invoke');
  a.label(next);a.load('r10',slot(64));a.load('r10',{base:'r10',disp:MapEntryLayout.next});a.store(slot(64),'r10');a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
 for(const name of ['add','clear','delete','has'] as const)rootedFn(b,'rt.set.'+name+'.fn.code',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:2}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');receiver(a,frame);a.store(slot(72),'r10');
  a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(80+n),'rax');}
  if(name!=='clear'){
   const absent=a.unique('absent');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',absent);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}a.label(absent);
   a.load('rcx',slot(72));a.lea('rdx',slot(96));a.call('rt.mapFind');a.store(slot(64),'rax');
  }
  if(name==='add'){
   const finish=a.unique('finish');a.test('rax','rax');a.jcc('ne',finish);
   a.load('rax',slot(96));a.cmp('rax',3);const valueReady=a.unique('valueReady');a.jcc('ne',valueReady);a.movsd('xmm0',slot(104));a.mov('rax',0);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',valueReady);a.jcc('ne',valueReady);a.store(slot(104),'rax');a.label(valueReady);
   a.lea('rcx',slot(96));a.call('rt.mapKeyHash');a.store(slot(64),'rax');
   a.mov('rcx',MapEntryLayout.size);a.call('rt.alloc');a.mov('r10',HeapKind.mapEntry);a.store({base:'rax',disp:H.kind-H.size},'r10');a.mov('r10',0);a.store({base:'rax',disp:MapEntryLayout.next},'r10');a.load('r10',slot(64));a.store({base:'rax',disp:MapEntryLayout.hash},'r10');a.mov('r10',0);a.store({base:'rax',disp:MapEntryLayout.weak},'r10');
   for(const n of [0,8]){a.load('r10',slot(96+n));a.store({base:'rax',disp:MapEntryLayout.key+n},'r10');a.store({base:'rax',disp:MapEntryLayout.value+n},'r10');}
   a.mov('r10',1);a.store({base:'rax',disp:MapEntryLayout.active},'r10');a.load('r11',slot(72));a.load('r10',{base:'r11',disp:MapLayout.tail});const first=a.unique('first'),linked=a.unique('linked');a.test('r10','r10');a.jcc('e',first);a.store({base:'r10',disp:MapEntryLayout.next},'rax');a.jmp(linked);a.label(first);a.store({base:'r11',disp:MapLayout.head},'rax');a.label(linked);a.store({base:'r11',disp:MapLayout.tail},'rax');a.load('r10',{base:'r11',disp:MapLayout.count});a.add('r10',1);a.store({base:'r11',disp:MapLayout.count},'r10');
   a.mov('rcx','r11');a.mov('rdx','rax');a.call('rt.mapIndexAdd');a.label(finish);
   a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
  }else if(name==='clear'){
   a.load('rcx',slot(72));a.call('rt.mapIndexFree');a.load('r11',slot(72));a.load('rax',{base:'r11',disp:MapLayout.head});const loop=a.unique('loop'),done=a.unique('done');a.label(loop);a.test('rax','rax');a.jcc('e',done);a.mov('r10',0);a.store({base:'rax',disp:MapEntryLayout.active},'r10');a.load('rax',{base:'rax',disp:MapEntryLayout.next});a.jmp(loop);a.label(done);a.mov('rax',0);a.store({base:'r11',disp:MapLayout.count},'rax');a.load('rcx',slot(40));a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
  }else{
   a.load('rax',slot(64));a.mov('r10',0);a.test('rax','rax');const missing=a.unique('missing');a.jcc('e',missing);a.mov('r10',1);
   if(name==='delete'){a.mov('rdx','rax');a.load('rcx',slot(72));a.call('rt.mapIndexDrop');a.load('rax',slot(64));a.mov('r10',1);a.mov('rdx',0);a.store({base:'rax',disp:MapEntryLayout.active},'rdx');a.load('r11',slot(72));a.load('rdx',{base:'r11',disp:MapLayout.count});a.sub('rdx',1);a.store({base:'r11',disp:MapLayout.count},'rdx');}
   a.label(missing);a.load('rcx',slot(40));a.mov('rax',2);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'r10');
  }
 });
}
