import {RuntimeBuilder,slot,failIf} from './abi.js';
import {selectNativeConstructPrototype} from './constructor-prototype.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {prependFunctionBuiltin,emitNativeFunction,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';
import {HandlerLayout as EH,preservedGp,preservedXmm} from './exception-layout.js';
import {FunctionKind} from './functions.js';

export const MapKind=15;
export const MapLayout={head:O.size,tail:O.size+8,count:O.size+16,size:O.size+24} as const;
export const MapEntryLayout={next:0,key:8,value:24,active:40,size:48} as const;
const methods=['clear','delete','get','has','set'] as const;
export const mapRoots=['rt.Map.species.fn','rt.mapSize.fn','rt.map.forEach.fn',...methods.map(name=>'rt.map.'+name+'.fn')];
export const mapPropertyRoots=['rt.Map.@@species','rt.Map.species.fn.name','rt.Map.species.fn.length','rt.mapPrototype.size','rt.mapPrototype.@@toStringTag',...mapRoots.slice(1).flatMap(name=>name==='rt.mapSize.fn'?[name+'.name',name+'.length']:builtinPropertyRoots(name,name.slice(7,-3),'rt.mapPrototype'))];

export function emitMapPrototype(b:RuntimeBuilder):void {
 b.bundle.fragments.push({name:'rt.mapPrototype',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[{offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0}]});
}

export function emitMap(b:RuntimeBuilder):void {
 emitNativeFunction(b,'rt.Map.species.fn','get [Symbol.species]',0);
 const species=new Uint8Array(P.size);species[P.attributes]=A.accessor|A.configurable;species[P.getter]=5;
 const constructor=b.bundle.fragments.find(f=>f.name==='rt.Map')!,speciesHead=constructor.fixups.find(f=>f.offset===O.properties)!;
 b.bundle.fragments.push({name:'rt.Map.@@species',section:'.data',alignment:8,bytes:species,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:speciesHead.target,addend:0},{offset:P.key,kind:'va64',target:'rt.Symbol.species.value',addend:0},{offset:P.getter+8,kind:'va64',target:'rt.Map.species.fn',addend:0},
 ]});speciesHead.target='rt.Map.@@species';
 b.fn('rt.Map.species.fn.code',40,a=>{a.load('rdx',slot(80));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store({base:'rcx',disp:offset},'rax');}});
 b.bundle.fragments.push(stringLiteral('rt.mapTag','Map'));
 const prototype=b.bundle.fragments.find(f=>f.name==='rt.mapPrototype')!;
 const prototypeHead=prototype.fixups.find(f=>f.offset===O.properties)!;
 const tag=new Uint8Array(P.size);tag[P.value]=4;tag[P.attributes]=A.configurable;
 b.bundle.fragments.push({name:'rt.mapPrototype.@@toStringTag',section:'.data',alignment:8,bytes:tag,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:prototypeHead.target,addend:0},{offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},{offset:P.value+8,kind:'va64',target:'rt.mapTag',addend:0},
 ]});prototypeHead.target='rt.mapPrototype.@@toStringTag';
 emitNativeFunction(b,'rt.mapSize.fn','get size',0);
 const size=new Uint8Array(P.size);size[P.attributes]=A.accessor|A.configurable;size[P.getter]=5;
 b.bundle.fragments.push({name:'rt.mapPrototype.size',section:'.data',alignment:8,bytes:size,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:'rt.mapPrototype.@@toStringTag',addend:0},{offset:P.key,kind:'va64',target:'rt.str.size',addend:0},{offset:P.getter+8,kind:'va64',target:'rt.mapSize.fn',addend:0},
 ]});prototype.fixups.find(f=>f.offset===O.properties)!.target='rt.mapPrototype.size';b.bundle.fragments.push(stringLiteral('rt.str.size','size'));
 for(const name of methods)prependFunctionBuiltin(b,'rt.map.'+name+'.fn',name,name==='set'?2:name==='clear'?0:1,'rt.mapPrototype');
 prependFunctionBuiltin(b,'rt.map.forEach.fn','forEach',1,'rt.mapPrototype');
 b.fn('rt.Map.code',40,a=>a.call('rt.throwTypeError'));
 rootedFn(b,'rt.Map.construct',952,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:14}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.mov('rcx',MapLayout.size);a.call('rt.alloc');a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');a.mov('r10',MapKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying,O.flags,MapLayout.head,MapLayout.tail,MapLayout.count])a.store({base:'rax',disp:offset},'r10');
  selectNativeConstructPrototype(a,frame,'rt.mapPrototype');a.store({base:'rax',disp:O.prototype},'r10');
  a.mov('r10',5);a.store(slot(80),'r10');a.store(slot(88),'rax');
  const done=a.unique('done');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',done);a.load('r10',slot(56));a.load('rax',{base:'r10'});a.cmp('rax',1);a.jcc('e',done);a.test('rax','rax');a.jcc('e',done);
  for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(96+n),'rax');}
  a.mov('rax',4);a.store(slot(112),'rax');a.lea('rax',{rip:'rt.map.set.fn.key'});a.store(slot(120),'rax');a.lea('rcx',slot(128));a.lea('rdx',slot(80));a.lea('r8',slot(112));a.call('rt.getProperty');
  a.load('rax',slot(128));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',slot(136));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.lea('rcx',slot(144));a.lea('rdx',slot(160));a.lea('r8',slot(96));a.call('rt.getIterator');
  const loop=a.unique('loop'),caught=a.unique('caught'),closeFailed=a.unique('closeFailed');a.label(loop);
  a.lea('rcx',slot(176));a.lea('rdx',slot(192));a.lea('r8',slot(144));a.lea('r9',slot(160));a.call('rt.iteratorStep');a.load('rax',slot(200));a.test('rax','rax');a.jcc('ne',done);
  const installHandler=(offset:number,target:string,error:number)=>{
   a.load('rax',{rip:'rt.exceptionHandler'});a.store(slot(offset+EH.next),'rax');a.mov('rax','rsp');a.store(slot(offset+EH.stack),'rax');a.lea('rax',{rip:target});a.store(slot(offset+EH.target),'rax');a.load('rax',{rip:'rt.gcRoots'});a.store(slot(offset+EH.roots),'rax');a.lea('rax',slot(error));a.store(slot(offset+EH.value),'rax');a.load('rax',{rip:'rt.cleanupHead'});a.store(slot(offset+EH.cleanup),'rax');preservedGp.forEach((reg,i)=>a.store(slot(offset+EH.gp+8*i),reg));preservedXmm.forEach((reg,i)=>a.storeXmm128(slot(offset+EH.xmm+16*i),reg));a.mov('rax',0);a.store(slot(offset+EH.kind),'rax');a.lea('rax',slot(offset));a.store({rip:'rt.exceptionHandler'},'rax');
  };
  installHandler(368,caught,272);
  a.load('rax',slot(176));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.lea('rcx',slot(208));a.mov('rdx',0);a.call('rt.arrayIndexKey');a.lea('rcx',slot(224));a.lea('rdx',slot(176));a.lea('r8',slot(208));a.call('rt.getProperty');
  a.lea('rcx',slot(208));a.mov('rdx',1);a.call('rt.arrayIndexKey');a.lea('rcx',slot(240));a.lea('rdx',slot(176));a.lea('r8',slot(208));a.call('rt.getProperty');
  a.lea('rax',slot(80));a.store(slot(32),'rax');a.lea('rcx',slot(256));a.lea('rdx',slot(128));a.mov('r8',2);a.lea('r9',slot(224));a.call('rt.invoke');
  a.load('rax',slot(368+EH.next));a.store({rip:'rt.exceptionHandler'},'rax');a.jmp(loop);
  a.label(caught);installHandler(624,closeFailed,288);a.lea('rcx',slot(144));a.call('rt.iteratorClose');a.load('rax',slot(624+EH.next));a.store({rip:'rt.exceptionHandler'},'rax');a.lea('rcx',slot(272));a.call('rt.throw');a.label(closeFailed);a.lea('rcx',slot(272));a.call('rt.throw');
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
 });
 // SameValueZero: Strict Equality already equates signed zeros, so only NaN needs special handling.
 b.fn('rt.mapSameValueZero',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');const ordinary=a.unique('ordinary'),yes=a.unique('yes'),done=a.unique('done');
  a.load('rax',{base:'rcx'});a.cmp('rax',3);a.jcc('ne',ordinary);a.load('rax',{base:'rdx'});a.cmp('rax',3);a.jcc('ne',ordinary);
  a.movsd('xmm0',{base:'rcx',disp:8});a.ucomisd('xmm0','xmm0');a.jcc('np',ordinary);a.movsd('xmm0',{base:'rdx',disp:8});a.ucomisd('xmm0','xmm0');a.jcc('p',yes);a.mov('rax',0);a.jmp(done);
  a.label(ordinary);a.mov('r8','rdx');a.mov('rdx','rcx');a.lea('rcx',slot(56));a.call('rt.strictEq');a.load('rax',slot(64));a.jmp(done);a.label(yes);a.mov('rax',1);a.label(done);
 });
 // RCX Map*, RDX key Value* -> RAX live entry or zero.
 b.fn('rt.mapFind',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.load('rax',{base:'rcx',disp:MapLayout.head});a.store(slot(56),'rax');
  const loop=a.unique('loop'),next=a.unique('next'),done=a.unique('done');a.label(loop);a.load('rax',slot(56));a.test('rax','rax');a.jcc('e',done);a.load('r10',{base:'rax',disp:MapEntryLayout.active});a.test('r10','r10');a.jcc('e',next);
  a.lea('rcx',{base:'rax',disp:MapEntryLayout.key});a.load('rdx',slot(48));a.call('rt.mapSameValueZero');a.test('rax','rax');const found=a.unique('found');a.jcc('ne',found);
  a.label(next);a.load('rax',slot(56));a.load('rax',{base:'rax',disp:MapEntryLayout.next});a.store(slot(56),'rax');a.jmp(loop);a.label(found);a.load('rax',slot(56));a.label(done);
 });
 const receiver=(a:import('../backend/x64/assembler.js').Assembler,frame:number)=>{
  a.load('r10',slot(frame+40));a.load('rax',{base:'r10'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',{base:'r10',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',MapKind);failIf(a,'ne','rt.throwTypeError');return 'r10' as const;
 };
 b.fn('rt.mapSize.fn.code',56,a=>{
  receiver(a,56);a.load('rax',{base:'r10',disp:MapLayout.count});a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 rootedFn(b,'rt.map.forEach.fn.code',232,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:7}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');receiver(a,frame);a.store(slot(72),'r10');a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(80+n),'rax');}
  a.load('rax',slot(48));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}a.load('rax',slot(96));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',slot(104));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',slot(48));a.cmp('rax',2);const noThis=a.unique('noThis');a.jcc('b',noThis);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:16+n});a.store(slot(112+n),'rax');}a.label(noThis);
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:MapLayout.head});a.store(slot(64),'rax');const loop=a.unique('loop'),next=a.unique('next'),done=a.unique('done');a.label(loop);a.load('r10',slot(64));a.test('r10','r10');a.jcc('e',done);a.load('rax',{base:'r10',disp:MapEntryLayout.active});a.test('rax','rax');a.jcc('e',next);
  for(const [from,to] of [[MapEntryLayout.value,128],[MapEntryLayout.key,144]] as const)for(const n of [0,8]){a.load('rax',{base:'r10',disp:from+n});a.store(slot(to+n),'rax');}
  for(const n of [0,8]){a.load('rax',slot(80+n));a.store(slot(160+n),'rax');}
  a.lea('rax',slot(112));a.store(slot(32),'rax');a.lea('rcx',slot(176));a.lea('rdx',slot(96));a.mov('r8',3);a.lea('r9',slot(128));a.call('rt.invoke');
  a.label(next);a.load('r10',slot(64));a.load('r10',{base:'r10',disp:MapEntryLayout.next});a.store(slot(64),'r10');a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
 for(const name of methods)rootedFn(b,'rt.map.'+name+'.fn.code',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:3}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');receiver(a,frame);a.store(slot(72),'r10');
  a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(80+n),'rax');}
  if(name!=='clear'){
   a.load('rax',slot(48));const absent=a.unique('absent');a.test('rax','rax');a.jcc('e',absent);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}a.label(absent);
   if(name==='set'){
    a.load('rax',slot(48));a.cmp('rax',2);const noValue=a.unique('noValue');a.jcc('b',noValue);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:16+n});a.store(slot(112+n),'rax');}a.label(noValue);
   }
   a.load('rcx',slot(72));a.lea('rdx',slot(96));a.call('rt.mapFind');a.store(slot(64),'rax');
  }
  if(name==='set'){
   const insert=a.unique('insert'),finish=a.unique('finish');a.test('rax','rax');a.jcc('e',insert);
   for(const n of [0,8]){a.load('r10',slot(112+n));a.store({base:'rax',disp:MapEntryLayout.value+n},'r10');}a.jmp(finish);
   a.label(insert);a.load('rax',slot(96));a.cmp('rax',3);const keyReady=a.unique('keyReady');a.jcc('ne',keyReady);a.movsd('xmm0',slot(104));a.mov('rax',0);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',keyReady);a.jcc('ne',keyReady);a.store(slot(104),'rax');a.label(keyReady);
   a.mov('rcx',MapEntryLayout.size);a.call('rt.alloc');a.mov('r10',HeapKind.mapEntry);a.store({base:'rax',disp:H.kind-H.size},'r10');a.mov('r10',0);a.store({base:'rax',disp:MapEntryLayout.next},'r10');
   for(const [from,to] of [[96,MapEntryLayout.key],[112,MapEntryLayout.value]] as const)for(const n of [0,8]){a.load('r10',slot(from+n));a.store({base:'rax',disp:to+n},'r10');}
   a.mov('r10',1);a.store({base:'rax',disp:MapEntryLayout.active},'r10');a.load('r11',slot(72));a.load('r10',{base:'r11',disp:MapLayout.tail});const first=a.unique('first'),linked=a.unique('linked');a.test('r10','r10');a.jcc('e',first);a.store({base:'r10',disp:MapEntryLayout.next},'rax');a.jmp(linked);a.label(first);a.store({base:'r11',disp:MapLayout.head},'rax');a.label(linked);a.store({base:'r11',disp:MapLayout.tail},'rax');a.load('r10',{base:'r11',disp:MapLayout.count});a.add('r10',1);a.store({base:'r11',disp:MapLayout.count},'r10');a.label(finish);
   a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
  }else if(name==='get'){
   const missing=a.unique('missing'),done=a.unique('done');a.test('rax','rax');a.jcc('e',missing);a.load('rcx',slot(40));for(const n of [0,8]){a.load('r10',{base:'rax',disp:MapEntryLayout.value+n});a.store({base:'rcx',disp:n},'r10');}a.jmp(done);a.label(missing);a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');a.label(done);
  }else if(name==='clear'){
   a.load('r11',slot(72));a.load('rax',{base:'r11',disp:MapLayout.head});const loop=a.unique('loop'),done=a.unique('done');a.label(loop);a.test('rax','rax');a.jcc('e',done);a.mov('r10',0);a.store({base:'rax',disp:MapEntryLayout.active},'r10');a.load('rax',{base:'rax',disp:MapEntryLayout.next});a.jmp(loop);a.label(done);a.mov('rax',0);a.store({base:'r11',disp:MapLayout.count},'rax');a.load('rcx',slot(40));a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
  }else{
   a.load('rax',slot(64));a.mov('r10',0);a.test('rax','rax');const missing=a.unique('missing');a.jcc('e',missing);a.mov('r10',1);
   if(name==='delete'){a.mov('rdx',0);a.store({base:'rax',disp:MapEntryLayout.active},'rdx');a.load('r11',slot(72));a.load('rdx',{base:'r11',disp:MapLayout.count});a.sub('rdx',1);a.store({base:'r11',disp:MapLayout.count},'rdx');}
   a.label(missing);a.load('rcx',slot(40));a.mov('rax',2);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'r10');
  }
 });
}
