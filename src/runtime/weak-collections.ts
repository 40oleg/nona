import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {MapLayout,MapEntryLayout} from './map.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';
import {HandlerLayout as EH,preservedGp,preservedXmm} from './exception-layout.js';
import {FunctionKind} from './functions.js';

export const WeakMapKind=19;
export const WeakSetKind=20;
const specs=[{name:'WeakMap',kind:WeakMapKind,methods:['delete','get','has','set'] as const},{name:'WeakSet',kind:WeakSetKind,methods:['add','delete','has'] as const}];
export const weakCollectionRoots=specs.flatMap(spec=>spec.methods.map(method=>`rt.${spec.name}.${method}.fn`));
export const weakCollectionPropertyRoots=specs.flatMap(spec=>[
 `rt.${spec.name.toLowerCase()}Prototype.@@toStringTag`,
 ...spec.methods.flatMap(method=>builtinPropertyRoots(`rt.${spec.name}.${method}.fn`,method,`rt.${spec.name.toLowerCase()}Prototype`)),
]);

export function emitWeakCollectionPrototypes(b:RuntimeBuilder):void {
 for(const spec of specs)b.bundle.fragments.push({name:`rt.${spec.name.toLowerCase()}Prototype`,section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[{offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0}]});
}

export function emitWeakCollections(b:RuntimeBuilder):void {
 for(const spec of specs){
  const prefix=`rt.${spec.name}`,prototypeName=`rt.${spec.name.toLowerCase()}Prototype`;
  b.bundle.fragments.push(stringLiteral(prefix+'.tag',spec.name));
  const prototype=b.bundle.fragments.find(f=>f.name===prototypeName)!,head=prototype.fixups.find(f=>f.offset===O.properties)!;
  const tag=new Uint8Array(P.size);tag[P.value]=4;tag[P.attributes]=A.configurable;
  b.bundle.fragments.push({name:prototypeName+'.@@toStringTag',section:'.data',alignment:8,bytes:tag,symbols:{},fixups:[
   {offset:P.next,kind:'va64',target:head.target,addend:0},{offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},{offset:P.value+8,kind:'va64',target:prefix+'.tag',addend:0},
  ]});head.target=prototypeName+'.@@toStringTag';
  for(const method of spec.methods)prependFunctionBuiltin(b,`${prefix}.${method}.fn`,method,method==='set'?2:1,prototypeName);
  b.fn(prefix+'.code',40,a=>a.call('rt.throwTypeError'));
  rootedFn(b,prefix+'.construct',952,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:14}],(a,frame)=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.mov('rcx',MapLayout.size);a.call('rt.alloc');a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');a.mov('r10',spec.kind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
   for(const offset of [O.properties,O.length,O.stringifying,O.flags,MapLayout.head,MapLayout.tail,MapLayout.count])a.store({base:'rax',disp:offset},'r10');
   a.load('r10',slot(frame+40));a.load('r10',{base:'r10',disp:8});a.load('r10',{base:'r10',disp:O.prototype});a.store({base:'rax',disp:O.prototype},'r10');
   a.mov('r10',5);a.store(slot(80),'r10');a.store(slot(88),'rax');
   const done=a.unique('done');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',done);a.load('r10',slot(56));a.load('rax',{base:'r10'});a.cmp('rax',1);a.jcc('e',done);a.test('rax','rax');a.jcc('e',done);
   for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(96+n),'rax');}
   a.mov('rax',4);a.store(slot(112),'rax');a.lea('rax',{rip:`${prefix}.${spec.name==='WeakMap'?'set':'add'}.fn.key`});a.store(slot(120),'rax');a.lea('rcx',slot(128));a.lea('rdx',slot(80));a.lea('r8',slot(112));a.call('rt.getProperty');
   a.load('rax',slot(128));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',slot(136));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
   a.lea('rcx',slot(144));a.lea('rdx',slot(160));a.lea('r8',slot(96));a.call('rt.getIterator');
   const loop=a.unique('loop'),caught=a.unique('caught'),closeFailed=a.unique('closeFailed');a.label(loop);
   a.lea('rcx',slot(176));a.lea('rdx',slot(192));a.lea('r8',slot(144));a.lea('r9',slot(160));a.call('rt.iteratorStep');a.load('rax',slot(200));a.test('rax','rax');a.jcc('ne',done);
   const installHandler=(offset:number,target:string,error:number)=>{
    a.load('rax',{rip:'rt.exceptionHandler'});a.store(slot(offset+EH.next),'rax');a.mov('rax','rsp');a.store(slot(offset+EH.stack),'rax');a.lea('rax',{rip:target});a.store(slot(offset+EH.target),'rax');a.load('rax',{rip:'rt.gcRoots'});a.store(slot(offset+EH.roots),'rax');a.lea('rax',slot(error));a.store(slot(offset+EH.value),'rax');a.load('rax',{rip:'rt.cleanupHead'});a.store(slot(offset+EH.cleanup),'rax');preservedGp.forEach((reg,i)=>a.store(slot(offset+EH.gp+8*i),reg));preservedXmm.forEach((reg,i)=>a.storeXmm128(slot(offset+EH.xmm+16*i),reg));a.mov('rax',0);a.store(slot(offset+EH.kind),'rax');a.lea('rax',slot(offset));a.store({rip:'rt.exceptionHandler'},'rax');
   };
   installHandler(368,caught,272);
   if(spec.name==='WeakMap'){
    a.load('rax',slot(176));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
    a.lea('rcx',slot(208));a.mov('rdx',0);a.call('rt.arrayIndexKey');a.lea('rcx',slot(224));a.lea('rdx',slot(176));a.lea('r8',slot(208));a.call('rt.getProperty');
    a.lea('rcx',slot(208));a.mov('rdx',1);a.call('rt.arrayIndexKey');a.lea('rcx',slot(240));a.lea('rdx',slot(176));a.lea('r8',slot(208));a.call('rt.getProperty');
   }
   a.lea('rax',slot(80));a.store(slot(32),'rax');a.lea('rcx',slot(256));a.lea('rdx',slot(128));a.mov('r8',spec.name==='WeakMap'?2:1);a.lea('r9',slot(spec.name==='WeakMap'?224:176));a.call('rt.invoke');
   a.load('rax',slot(368+EH.next));a.store({rip:'rt.exceptionHandler'},'rax');a.jmp(loop);
   a.label(caught);installHandler(624,closeFailed,288);a.lea('rcx',slot(144));a.call('rt.iteratorClose');a.load('rax',slot(624+EH.next));a.store({rip:'rt.exceptionHandler'},'rax');a.lea('rcx',slot(272));a.call('rt.throw');a.label(closeFailed);a.lea('rcx',slot(272));a.call('rt.throw');
   a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
  });
  const receiver=(a:import('../backend/x64/assembler.js').Assembler,frame:number)=>{
   a.load('r10',slot(frame+40));a.load('rax',{base:'r10'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',{base:'r10',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',spec.kind);failIf(a,'ne','rt.throwTypeError');
  };
  for(const method of spec.methods)rootedFn(b,`${prefix}.${method}.fn.code`,168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:3}],(a,frame)=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');receiver(a,frame);a.store(slot(72),'r10');
   a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(80+n),'rax');}
   const absent=a.unique('absent');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',absent);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}a.label(absent);
   if(method==='set'){
    a.load('rax',slot(48));a.cmp('rax',2);const noValue=a.unique('noValue');a.jcc('b',noValue);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:16+n});a.store(slot(112+n),'rax');}a.label(noValue);
   }
   a.load('rax',slot(96));a.cmp('rax',5);if(method==='set'||method==='add')failIf(a,'ne','rt.throwTypeError');
   else {const keyReady=a.unique('keyReady'),missing=a.unique('missing');a.jcc('e',keyReady);a.mov('rax',0);a.store(slot(64),'rax');a.jmp(missing);a.label(keyReady);a.load('rcx',slot(72));a.lea('rdx',slot(96));a.call('rt.mapFind');a.store(slot(64),'rax');a.label(missing);}
   if(method==='set'||method==='add'){
    a.load('rcx',slot(72));a.lea('rdx',slot(96));a.call('rt.mapFind');a.store(slot(64),'rax');const insert=a.unique('insert'),finish=a.unique('finish');a.test('rax','rax');a.jcc('e',insert);
    if(method==='set')for(const n of [0,8]){a.load('r10',slot(112+n));a.store({base:'rax',disp:MapEntryLayout.value+n},'r10');}
    a.jmp(finish);a.label(insert);a.mov('rcx',MapEntryLayout.size);a.call('rt.alloc');a.mov('r10',HeapKind.weakEntry);a.store({base:'rax',disp:H.kind-H.size},'r10');a.mov('r10',0);a.store({base:'rax',disp:MapEntryLayout.next},'r10');
    for(const n of [0,8]){a.load('r10',slot(96+n));a.store({base:'rax',disp:MapEntryLayout.key+n},'r10');if(method==='add')a.store({base:'rax',disp:MapEntryLayout.value+n},'r10');else{a.load('r10',slot(112+n));a.store({base:'rax',disp:MapEntryLayout.value+n},'r10');}}
    a.mov('r10',1);a.store({base:'rax',disp:MapEntryLayout.active},'r10');a.load('r11',slot(72));a.load('r10',{base:'r11',disp:MapLayout.tail});const first=a.unique('first'),linked=a.unique('linked');a.test('r10','r10');a.jcc('e',first);a.store({base:'r10',disp:MapEntryLayout.next},'rax');a.jmp(linked);a.label(first);a.store({base:'r11',disp:MapLayout.head},'rax');a.label(linked);a.store({base:'r11',disp:MapLayout.tail},'rax');a.load('r10',{base:'r11',disp:MapLayout.count});a.add('r10',1);a.store({base:'r11',disp:MapLayout.count},'r10');a.label(finish);
    a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
   }else if(method==='get'){
    const missing=a.unique('missing'),done=a.unique('done');a.load('rax',slot(64));a.test('rax','rax');a.jcc('e',missing);a.load('rcx',slot(40));for(const n of [0,8]){a.load('r10',{base:'rax',disp:MapEntryLayout.value+n});a.store({base:'rcx',disp:n},'r10');}a.jmp(done);a.label(missing);a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');a.label(done);
   }else{
    a.load('rax',slot(64));a.mov('r10',0);a.test('rax','rax');const missing=a.unique('missing');a.jcc('e',missing);a.mov('r10',1);
    if(method==='delete'){a.mov('rdx',0);a.store({base:'rax',disp:MapEntryLayout.active},'rdx');a.load('r11',slot(72));a.load('rdx',{base:'r11',disp:MapLayout.count});a.sub('rdx',1);a.store({base:'r11',disp:MapLayout.count},'rdx');}
    a.label(missing);a.load('rcx',slot(40));a.mov('rax',2);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'r10');
   }
  });
 }
}
