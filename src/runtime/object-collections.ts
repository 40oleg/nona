import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyAttributes as A} from './object-layout.js';
import {DescriptorLayout as D} from './descriptor-layout.js';
import {ValueListLayout as L} from './heap-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {emitOwnKeys} from './own-keys.js';

const methods=[['keys',1],['values',1],['entries',1],['getOwnPropertyNames',1],['getOwnPropertySymbols',1],['getOwnPropertyDescriptors',1],['create',2],['defineProperties',2]] as const;
export const collectionRoots=methods.map(([name])=>'rt.Object.'+name+'.fn');
export const collectionPropertyRoots=methods.flatMap(([name])=>builtinPropertyRoots('rt.Object.'+name+'.fn',name,'rt.Object'));
export function emitObjectCollections(b:RuntimeBuilder):void {
 emitOwnKeys(b);
 for(const [name,length] of methods)prependFunctionBuiltin(b,'rt.Object.'+name+'.fn',name,length,'rt.Object');
 for(const mode of ['keys','values','entries','getOwnPropertyNames','getOwnPropertySymbols','getOwnPropertyDescriptors'] as const)rootedFn(b,'rt.Object.'+mode+'.fn.code',296,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:13}],a=>{
  a.store(slot(40),'rcx');const absent=a.unique('absent');a.test('rdx','rdx');a.jcc('e',absent);for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(absent);
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
  a.label(next);a.load('rax',slot(280));a.add('rax',1);a.store(slot(280),'rax');a.jmp(loop);a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(112+n));a.store({base:'rcx',disp:n},'rax');}
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
