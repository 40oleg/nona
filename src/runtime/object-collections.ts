import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyAttributes as A,PropertyLayout as P} from './object-layout.js';
import {ElementsLayout as E} from './array-elements.js';
import {DescriptorLayout as D} from './descriptor-layout.js';
import {ValueListLayout as L} from './heap-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {emitOwnKeys} from './own-keys.js';
import {HandlerLayout as H,preservedGp,preservedXmm} from './exception-layout.js';

const methods=[['keys',1],['values',1],['entries',1],['getOwnPropertyNames',1],['getOwnPropertySymbols',1],['getOwnPropertyDescriptors',1],['create',2],['defineProperties',2],['fromEntries',1],['assign',2]] as const;
export const collectionRoots=methods.map(([name])=>'rt.Object.'+name+'.fn');
export const collectionPropertyRoots=methods.flatMap(([name])=>builtinPropertyRoots('rt.Object.'+name+'.fn',name,'rt.Object'));
export function emitObjectCollections(b:RuntimeBuilder):void {
 emitOwnKeys(b);
 for(const [name,length] of methods)prependFunctionBuiltin(b,'rt.Object.'+name+'.fn',name,length,'rt.Object');
 rootedFn(b,'rt.Object.assign.fn.code',216,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:5}],a=>{
  a.store(slot(40),'rcx');a.store(slot(56),'r8');a.store(slot(72),'rdx');
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  a.lea('rcx',slot(80));a.mov('rdx','r8');a.call('rt.toObject');
  a.mov('rax',1);a.store(slot(48),'rax');
  const sourceLoop=a.unique('sourceLoop'),sourceNext=a.unique('sourceNext'),keyLoop=a.unique('keyLoop'),keyNext=a.unique('keyNext'),done=a.unique('done');
  a.label(sourceLoop);a.load('rax',slot(48));a.load('r10',slot(72));a.cmp('rax','r10');a.jcc('ae',done);
  a.shl('rax',4);a.load('r10',slot(56));a.add('r10','rax');
  for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(96+n),'rax');}
  a.load('rax',slot(96));a.cmp('rax',1);a.jcc('be',sourceNext);
  a.lea('rcx',slot(96));a.lea('rdx',slot(96));a.call('rt.toObject');
  a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.call('rt.ownKeys');
  a.mov('rax',0);a.store(slot(64),'rax');a.label(keyLoop);
  a.load('rax',slot(64));a.load('r10',slot(120));a.load('r11',{base:'r10',disp:L.count});a.cmp('rax','r11');a.jcc('ae',sourceNext);
  a.shl('rax',4);a.add('r10',L.values);a.add('r10','rax');
  for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(128+n),'rax');}
  a.lea('rcx',slot(96));a.load('rdx',slot(136));a.call('rt.ownAttributes');a.cmp('rax',-1);a.jcc('e',keyNext);a.and('rax',A.enumerable);a.test('rax','rax');a.jcc('e',keyNext);
  a.lea('rcx',slot(144));a.lea('rdx',slot(96));a.lea('r8',slot(128));a.call('rt.getProperty');
  a.lea('rcx',slot(80));a.lea('rdx',slot(128));a.lea('r8',slot(144));a.mov('r9',2);a.call('rt.setProperty');
  a.label(keyNext);a.load('rax',slot(64));a.add('rax',1);a.store(slot(64),'rax');a.jmp(keyLoop);
  a.label(sourceNext);a.load('rax',slot(48));a.add('rax',1);a.store(slot(48),'rax');a.jmp(sourceLoop);
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
 });
 // AddEntriesFromIterable closes the iterator if reading or defining an entry fails.
 rootedFn(b,'rt.Object.fromEntries.fn.code',952,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:16}],a=>{
  a.store(slot(40),'rcx');a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}
  a.lea('rcx',slot(80));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
  a.lea('rcx',slot(96));a.lea('rdx',slot(112));a.lea('r8',slot(64));a.call('rt.getIterator');
  const loop=a.unique('loop'),done=a.unique('done'),caught=a.unique('caught'),closeFailed=a.unique('closeFailed');
  a.label(loop);a.lea('rcx',slot(128));a.lea('rdx',slot(144));a.lea('r8',slot(96));a.lea('r9',slot(112));a.call('rt.iteratorStep');
  a.load('rax',slot(152));a.test('rax','rax');a.jcc('ne',done);
  const h=slot(368);
  a.load('rax',{rip:'rt.exceptionHandler'});a.store(slot(368+H.next),'rax');
  a.mov('rax','rsp');a.store(slot(368+H.stack),'rax');
  a.lea('rax',{rip:caught});a.store(slot(368+H.target),'rax');
  a.load('rax',{rip:'rt.gcRoots'});a.store(slot(368+H.roots),'rax');
  a.lea('rax',slot(192));a.store(slot(368+H.value),'rax');
  a.load('rax',{rip:'rt.cleanupHead'});a.store(slot(368+H.cleanup),'rax');
  preservedGp.forEach((reg,i)=>a.store(slot(368+H.gp+8*i),reg));
  preservedXmm.forEach((reg,i)=>a.storeXmm128(slot(368+H.xmm+16*i),reg));
  a.mov('rax',0);a.store(slot(368+H.kind),'rax');a.lea('rax',h);a.store({rip:'rt.exceptionHandler'},'rax');
  a.load('rax',slot(128));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.lea('rcx',slot(160));a.mov('rdx',0);a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(176));a.lea('rdx',slot(128));a.lea('r8',slot(160));a.call('rt.getProperty');
  a.lea('rcx',slot(160));a.mov('rdx',1);a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(160));a.lea('rdx',slot(128));a.lea('r8',slot(160));a.call('rt.getProperty');
  a.lea('rcx',slot(176));a.lea('rdx',slot(176));a.call('rt.toPropertyKey');
  a.mov('rax',2);for(const offset of [D.enumerable,D.configurable,D.writable])a.store(slot(224+offset),'rax');
  a.mov('rax',1);for(const offset of [D.enumerable,D.configurable,D.writable])a.store(slot(224+offset+8),'rax');
  for(const offset of [0,8]){a.load('rax',slot(160+offset));a.store(slot(224+D.value+offset),'rax');}
  a.mov('rax',15);a.store(slot(224+D.present),'rax');
  a.lea('rcx',slot(80));a.lea('rdx',slot(176));a.lea('r8',slot(224));a.call('rt.defineOwnProperty');a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
  a.load('rax',slot(368+H.next));a.store({rip:'rt.exceptionHandler'},'rax');a.jmp(loop);
  a.label(caught);
  // IteratorClose on a throw preserves the original exception.
  a.load('rax',{rip:'rt.exceptionHandler'});a.store(slot(624+H.next),'rax');
  a.mov('rax','rsp');a.store(slot(624+H.stack),'rax');
  a.lea('rax',{rip:closeFailed});a.store(slot(624+H.target),'rax');
  a.load('rax',{rip:'rt.gcRoots'});a.store(slot(624+H.roots),'rax');
  a.lea('rax',slot(208));a.store(slot(624+H.value),'rax');
  a.load('rax',{rip:'rt.cleanupHead'});a.store(slot(624+H.cleanup),'rax');
  preservedGp.forEach((reg,i)=>a.store(slot(624+H.gp+8*i),reg));
  preservedXmm.forEach((reg,i)=>a.storeXmm128(slot(624+H.xmm+16*i),reg));
  a.mov('rax',0);a.store(slot(624+H.kind),'rax');a.lea('rax',slot(624));a.store({rip:'rt.exceptionHandler'},'rax');
  a.lea('rcx',slot(96));a.call('rt.iteratorClose');
  a.load('rax',slot(624+H.next));a.store({rip:'rt.exceptionHandler'},'rax');
  a.lea('rcx',slot(192));a.call('rt.throw');
  a.label(closeFailed);a.lea('rcx',slot(192));a.call('rt.throw');
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
 });
 for(const mode of ['keys','values','entries','getOwnPropertyNames','getOwnPropertySymbols','getOwnPropertyDescriptors'] as const)rootedFn(b,'rt.Object.'+mode+'.fn.code',296,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:13}],a=>{
  a.store(slot(40),'rcx');const absent=a.unique('absent');a.test('rdx','rdx');a.jcc('e',absent);for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(absent);
  const finished=a.unique('finished');
  if(mode==='keys'){
   // Ordinary object with only string-named properties (no index keys, no
   // elements, not the global object): the keys are the enumerable list
   // nodes in creation order, so the result array is filled directly
   // instead of snapshotting rt.ownKeys and re-reading each key's attributes.
   const generic=a.unique('generic'),count=a.unique('count'),skip=a.unique('skip'),counted=a.unique('counted'),fill=a.unique('fill'),fillSkip=a.unique('fillSkip'),filled=a.unique('filled');
   a.load('rax',slot(64));a.cmp('rax',5);a.jcc('ne',generic);a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.test('rax','rax');a.jcc('ne',generic);
   a.load('rax',{base:'r10',disp:O.elements});a.test('rax','rax');a.jcc('ne',generic);a.lea('rax',{rip:'rt.globalObject'});a.cmp('r10','rax');a.jcc('e',generic);
   a.mov('rdx',0);a.load('r10',{base:'r10',disp:O.properties});
   a.label(count);a.test('r10','r10');a.jcc('e',counted);a.load('r11',{base:'r10',disp:P.key});a.load('rax',{base:'r11'});a.cmp('rax',-1);a.jcc('e',skip);
   a.test('rax','rax');const nonEmpty=a.unique('nonEmpty');a.jcc('e',nonEmpty);a.load('rax',{base:'r11',disp:8},16);a.sub('rax',48);a.cmp('rax',9);a.jcc('be',generic);a.label(nonEmpty);
   a.load('rax',{base:'r10',disp:P.attributes});a.and('rax',A.enumerable);a.jcc('e',skip);a.add('rdx',1);
   a.label(skip);a.load('r10',{base:'r10',disp:P.next});a.jmp(count);
   a.label(counted);a.store(slot(280),'rdx');a.lea('rcx',slot(112));a.mov('rdx',1);a.mov('r8',0);a.call('rt.newObject');
   a.load('rcx',slot(280));a.test('rcx','rcx');a.jcc('e',finished);a.call('rt.elementsAlloc');
   a.load('r10',slot(120));a.store({base:'r10',disp:O.elements},'rax');a.load('rcx',slot(280));a.store({base:'r10',disp:O.length},'rcx');a.store({base:'rax',disp:E.count},'rcx');
   a.shl('rcx',4);a.lea('r9',{base:'rax',disp:E.values});a.add('r9','rcx');
   a.load('r10',slot(72));a.load('r10',{base:'r10',disp:O.properties});
   a.label(fill);a.test('r10','r10');a.jcc('e',finished);a.load('r11',{base:'r10',disp:P.key});a.load('rax',{base:'r11'});a.cmp('rax',-1);a.jcc('e',fillSkip);
   a.load('rax',{base:'r10',disp:P.attributes});a.and('rax',A.enumerable);a.jcc('e',fillSkip);a.sub('r9',16);a.mov('rax',4);a.store({base:'r9'},'rax');a.store({base:'r9',disp:8},'r11');
   a.label(fillSkip);a.load('r10',{base:'r10',disp:P.next});a.jmp(fill);
   a.label(generic);
  }
  a.lea('rcx',slot(80));a.lea('rdx',slot(64));a.call('rt.toObject');a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.call('rt.ownKeys');
  a.lea('rcx',slot(112));a.mov('rdx',mode==='getOwnPropertyDescriptors'?0:1);a.mov('r8',0);a.call('rt.newObject');a.mov('rax',0);a.store(slot(280),'rax');
  const loop=a.unique('loop'),next=a.unique('next'),done=a.unique('done');a.label(loop);a.load('rax',slot(280));a.load('r10',slot(104));a.load('r11',{base:'r10',disp:L.count});a.cmp('rax','r11');a.jcc('ae',done);a.shl('rax',4);a.add('r10',L.values);a.add('r10','rax');
  for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(128+n),'rax');}
  if(mode!=='getOwnPropertyDescriptors'){a.load('rax',slot(128));a.cmp('rax',6);a.jcc(mode==='getOwnPropertySymbols'?'ne':'e',next);}
  if(mode==='getOwnPropertyDescriptors'){
   a.lea('rcx',slot(176));a.lea('rdx',slot(80));a.lea('r8',slot(128));a.call('rt.getOwnDescriptor');a.load('rax',slot(176+D.present));a.cmp('rax',-1);a.jcc('e',next);
   a.lea('rcx',slot(160));a.lea('rdx',slot(176));a.call('rt.fromPropertyDescriptor');a.lea('rcx',slot(112));a.lea('rdx',slot(128));a.lea('r8',slot(160));a.mov('r9',1);a.call('rt.setProperty');
  }else{
   if(mode!=='getOwnPropertyNames'&&mode!=='getOwnPropertySymbols'){
    a.lea('rcx',slot(80));a.load('rdx',slot(136));a.call('rt.ownAttributes');a.cmp('rax',-1);a.jcc('e',next);a.and('rax',A.enumerable);a.test('rax','rax');a.jcc('e',next);
   }
   if(mode==='values'||mode==='entries'){
    a.lea('rcx',slot(144));a.lea('rdx',slot(80));a.lea('r8',slot(128));a.call('rt.getProperty');
   }
   if(mode==='entries'){
    a.lea('rcx',slot(160));a.mov('rdx',1);a.mov('r8',0);a.call('rt.newObject');a.lea('rcx',slot(160));a.lea('rdx',slot(128));a.call('rt.appendArrayValue');a.lea('rcx',slot(160));a.lea('rdx',slot(144));a.call('rt.appendArrayValue');
   }
   a.lea('rcx',slot(112));a.lea('rdx',slot(mode==='entries'?160:mode==='values'?144:128));a.call('rt.appendArrayValue');
  }
  a.label(next);a.load('rax',slot(280));a.add('rax',1);a.store(slot(280),'rax');a.jmp(loop);a.label(done);a.label(finished);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(112+n));a.store({base:'rcx',disp:n},'rax');}
 });
 for(const mode of ['create','defineProperties'] as const)rootedFn(b,'rt.Object.'+mode+'.fn.code',136,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:4}],a=>{
  a.store(slot(40),'rcx');for(const i of [0,1]){const absent=a.unique('absent');a.cmp('rdx',i);a.jcc('be',absent);for(const n of [0,8]){a.load('rax',{base:'r8',disp:16*i+n});a.store(slot(64+16*i+n),'rax');}a.label(absent);}
  if(mode==='create'){
   const valid=a.unique('valid'),done=a.unique('done');a.load('rax',slot(64));a.cmp('rax',1);a.jcc('e',valid);a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.label(valid);
   a.lea('rcx',slot(96));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');a.lea('rcx',slot(96));a.lea('rdx',slot(64));a.call('rt.setPrototype');
   a.load('rax',slot(80));a.test('rax','rax');a.jcc('e',done);a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.call('rt.defineProperties');a.label(done);
  }else{
   a.load('rax',slot(64));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.lea('rcx',slot(64));a.lea('rdx',slot(80));a.call('rt.defineProperties');
  }
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot((mode==='create'?96:64)+n));a.store({base:'rcx',disp:n},'rax');}
 });
 // Internal CopyDataProperties for object spread. Own keys are snapshotted;
 // enumerability and values are observed when each key is visited.
 rootedFn(b,'rt.copyDataProperties',184,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:6}],a=>{
  a.store(slot(40),'rcx');a.store(slot(56),'r8');
  a.load('r10',slot(56));for(const n of [0,8,16,24]){a.load('rax',{base:'r10',disp:n});a.store(slot(64+n),'rax');}
  const done=a.unique('done'),loop=a.unique('loop'),next=a.unique('next');
  a.load('rax',slot(80));a.cmp('rax',1);a.jcc('be',done);
  a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.call('rt.toObject');
  a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.call('rt.ownKeys');
  a.mov('rax',0);a.store(slot(48),'rax');
  a.label(loop);a.load('rax',slot(48));a.load('r10',slot(120));a.load('r11',{base:'r10',disp:L.count});a.cmp('rax','r11');a.jcc('ae',done);
  a.shl('rax',4);a.add('r10',L.values);a.add('r10','rax');for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(128+n),'rax');}
  a.lea('rcx',slot(96));a.load('rdx',slot(136));a.call('rt.ownAttributes');a.cmp('rax',-1);a.jcc('e',next);a.and('rax',A.enumerable);a.test('rax','rax');a.jcc('e',next);
  a.lea('rcx',slot(144));a.lea('rdx',slot(96));a.lea('r8',slot(128));a.call('rt.getProperty');
  a.lea('rcx',slot(64));a.lea('rdx',slot(128));a.lea('r8',slot(144));a.mov('r9',1);a.call('rt.setProperty');
  a.label(next);a.load('rax',slot(48));a.add('rax',1);a.store(slot(48),'rax');a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(64+n));a.store({base:'rcx',disp:n},'rax');}
 });
 // Object rest excludes already bound keys before checking enumerability or
 // invoking a getter. Extra call arguments are the property keys to skip.
 rootedFn(b,'rt.copyDataPropertiesExcept',216,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:8}],a=>{
  a.store(slot(40),'rcx');a.store(slot(56),'r8');a.store(slot(192),'rdx');
  a.load('r10',slot(56));for(const n of [0,8,16,24]){a.load('rax',{base:'r10',disp:n});a.store(slot(64+n),'rax');}
  a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.call('rt.toObject');
  a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.call('rt.ownKeys');
  a.mov('rax',0);a.store(slot(48),'rax');
  const loop=a.unique('loop'),next=a.unique('next'),check=a.unique('check'),include=a.unique('include'),done=a.unique('done');
  a.label(loop);a.load('rax',slot(48));a.load('r10',slot(120));a.load('r11',{base:'r10',disp:L.count});a.cmp('rax','r11');a.jcc('ae',done);
  a.shl('rax',4);a.add('r10',L.values);a.add('r10','rax');for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(128+n),'rax');}
  a.mov('rax',2);a.store(slot(160),'rax');a.label(check);
  a.load('rax',slot(160));a.load('r11',slot(192));a.cmp('rax','r11');a.jcc('ae',include);
  a.shl('rax',4);a.load('rdx',slot(56));a.add('rdx','rax');a.lea('rcx',slot(128));a.call('rt.sameValue');a.test('rax','rax');a.jcc('ne',next);
  a.load('rax',slot(160));a.add('rax',1);a.store(slot(160),'rax');a.jmp(check);
  a.label(include);a.lea('rcx',slot(96));a.load('rdx',slot(136));a.call('rt.ownAttributes');a.cmp('rax',-1);a.jcc('e',next);a.and('rax',A.enumerable);a.test('rax','rax');a.jcc('e',next);
  a.lea('rcx',slot(144));a.lea('rdx',slot(96));a.lea('r8',slot(128));a.call('rt.getProperty');
  a.lea('rcx',slot(64));a.lea('rdx',slot(128));a.lea('r8',slot(144));a.mov('r9',1);a.call('rt.setProperty');
  a.label(next);a.load('rax',slot(48));a.add('rax',1);a.store(slot(48),'rax');a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(64+n));a.store({base:'rcx',disp:n},'rax');}
 });
 // Collect and validate every enumerable descriptor before the first commit.
 // Each private list entry is eight Values: key, six descriptor fields, numeric
 // presence mask. Reconstruct the native record only when applying it.
 rootedFn(b,'rt.defineProperties',280,[{kind:'value',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:11}],a=>{
  a.store(slot(40),'rcx');a.lea('rcx',slot(64));a.call('rt.toObject');a.lea('rcx',slot(80));a.lea('rdx',slot(64));a.call('rt.ownKeys');
  a.load('rax',slot(88));a.load('rdx',{base:'rax',disp:L.count});a.mov('rax',0x00ffffffffffffffn);a.cmp('rdx','rax');failIf(a,'a');a.shl('rdx',3);a.lea('rcx',slot(96));a.call('rt.newValueList');a.mov('rax',0);a.store(slot(248),'rax');a.store(slot(256),'rax');
  const collect=a.unique('collect'),next=a.unique('next'),apply=a.unique('apply'),loop=a.unique('loop'),done=a.unique('done');
  a.label(collect);a.load('rax',slot(248));a.load('r10',slot(88));a.load('r11',{base:'r10',disp:L.count});a.cmp('rax','r11');a.jcc('ae',apply);a.shl('rax',4);a.add('r10',L.values);a.add('r10','rax');for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(112+n),'rax');}
  a.lea('rcx',slot(64));a.load('rdx',slot(120));a.call('rt.ownAttributes');a.cmp('rax',-1);a.jcc('e',next);a.and('rax',A.enumerable);a.test('rax','rax');a.jcc('e',next);
  a.lea('rcx',slot(128));a.lea('rdx',slot(64));a.lea('r8',slot(112));a.call('rt.getProperty');a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.call('rt.toPropertyDescriptor');
  a.load('rax',slot(256));a.shl('rax',7);a.load('r11',slot(104));a.add('r11',L.values);a.add('r11','rax');for(const n of [0,8]){a.load('rax',slot(112+n));a.store({base:'r11',disp:n},'rax');}
  for(let n=0;n<96;n+=8){a.load('rax',slot(144+n));a.store({base:'r11',disp:16+n},'rax');}a.load('rax',slot(144+D.present));a.cvtsi2sd('xmm0','rax');a.storesd({base:'r11',disp:120},'xmm0');a.mov('rax',3);a.store({base:'r11',disp:112},'rax');
  a.load('rax',slot(256));a.add('rax',1);a.store(slot(256),'rax');a.label(next);a.load('rax',slot(248));a.add('rax',1);a.store(slot(248),'rax');a.jmp(collect);
  a.label(apply);a.mov('rax',0);a.store(slot(248),'rax');a.label(loop);a.load('rax',slot(248));a.load('r10',slot(256));a.cmp('rax','r10');a.jcc('ae',done);a.shl('rax',7);a.load('r11',slot(104));a.add('r11',L.values);a.add('r11','rax');
  for(const n of [0,8]){a.load('rax',{base:'r11',disp:n});a.store(slot(112+n),'rax');}for(let n=0;n<96;n+=8){a.load('rax',{base:'r11',disp:16+n});a.store(slot(144+n),'rax');}a.movsd('xmm0',{base:'r11',disp:120});a.cvttsd2si('rax','xmm0');a.store(slot(144+D.present),'rax');
  a.load('rcx',slot(40));a.lea('rdx',slot(112));a.lea('r8',slot(144));a.call('rt.defineOwnProperty');a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.load('rax',slot(248));a.add('rax',1);a.store(slot(248),'rax');a.jmp(loop);a.label(done);
 });
}
