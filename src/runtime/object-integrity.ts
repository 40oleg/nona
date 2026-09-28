import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,ObjectFlags as OF,PropertyAttributes as A} from './object-layout.js';
import {DescriptorLayout as D,DescriptorFields as F} from './descriptor-layout.js';
import {ValueListLayout as L} from './heap-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {ProxyKind} from './proxy.js';

const methods=['preventExtensions','isExtensible','seal','freeze','isSealed','isFrozen'] as const;
export const integrityRoots=methods.map(name=>'rt.Object.'+name+'.fn');
export const integrityPropertyRoots=methods.flatMap(name=>builtinPropertyRoots('rt.Object.'+name+'.fn',name,'rt.Object'));
export function emitObjectIntegrity(b:RuntimeBuilder):void {
 for(const name of methods)prependFunctionBuiltin(b,'rt.Object.'+name+'.fn',name,1,'rt.Object');
 for(const name of methods)rootedFn(b,'rt.Object.'+name+'.fn.code',232,[
  {kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:9},
 ],a=>{
  // target64, snapshot80, key96, partial descriptor112..207, mask208, index216.
  const query=name==='isExtensible'||name==='isSealed'||name==='isFrozen';
  const frozen=name==='freeze'||name==='isFrozen';
  const yes=a.unique('yes'),no=a.unique('no'),done=a.unique('done'),save=a.unique('save');
  a.store(slot(40),'rcx');const absent=a.unique('absent');a.test('rdx','rdx');a.jcc('e',absent);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(absent);
  a.load('rax',slot(64));a.cmp('rax',5);a.jcc('ne',query?(name==='isExtensible'?no:yes):done);
  if(name==='isExtensible'){
   const ordinary=a.unique('ordinary');a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('ne',ordinary);
   a.lea('rcx',slot(64));a.call('rt.proxyIsExtensible');a.test('rax','rax');a.jcc('ne',yes);a.jmp(no);a.label(ordinary);
  }
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.flags});
  if(query){
   a.and('rax',OF.nonExtensible);a.test('rax','rax');
   if(name==='isExtensible'){a.jcc('e',yes);a.jmp(no);}else a.jcc('e',no);
  }else{
   a.or('rax',OF.nonExtensible);a.store({base:'r10',disp:O.flags},'rax');
   if(name==='preventExtensions')a.jmp(done);
  }
  if(name!=='preventExtensions'&&name!=='isExtensible'){
   a.lea('rcx',slot(80));a.lea('rdx',slot(64));a.call('rt.ownKeys');a.mov('rax',0);a.store(slot(216),'rax');
   const loop=a.unique('loop'),next=a.unique('next');a.label(loop);
   a.load('rax',slot(216));a.load('r10',slot(88));a.load('r11',{base:'r10',disp:L.count});a.cmp('rax','r11');a.jcc('ae',query?yes:done);
   a.shl('rax',4);a.add('r10',L.values);a.add('r10','rax');
   for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(96+n),'rax');}
   a.lea('rcx',slot(64));a.load('rdx',slot(104));a.call('rt.ownAttributes');a.cmp('rax',-1);a.jcc('e',next);
   if(query){
    a.mov('r10','rax');a.and('rax',A.configurable);a.test('rax','rax');a.jcc('ne',no);
    if(frozen){a.mov('rax','r10');a.and('rax',A.accessor);a.test('rax','rax');a.jcc('ne',next);a.and('r10',A.writable);a.test('r10','r10');a.jcc('ne',no);}
   }else{
    // Only configurable:false and, for frozen data properties, writable:false.
    // DefineOwnProperty handles synthetic array length and mapped arguments.
    a.mov('r10',F.configurable);
    if(frozen){const accessor=a.unique('accessor');a.and('rax',A.accessor);a.test('rax','rax');a.jcc('ne',accessor);a.or('r10',F.writable);a.label(accessor);}
    a.store(slot(112+D.present),'r10');a.mov('rax',2);a.store(slot(112+D.configurable),'rax');a.store(slot(112+D.writable),'rax');
    a.lea('rcx',slot(64));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.call('rt.defineOwnProperty');a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
   }
   a.label(next);a.load('rax',slot(216));a.add('rax',1);a.store(slot(216),'rax');a.jmp(loop);
  }
  a.label(yes);a.mov('rax',1);a.jmp(save);a.label(no);a.mov('rax',0);a.label(save);
  if(query){a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',2);a.store({base:'rcx'},'rax');}
  a.label(done);
  if(!query){a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(64+n));a.store({base:'rcx',disp:n},'rax');}}
 });
}
