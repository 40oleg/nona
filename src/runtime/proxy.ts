import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';

export const ProxyKind=21;
export const ProxyLayout={target:O.size,handler:O.size+16,revoked:O.size+32,size:O.size+40} as const;
export const proxyPropertyRoots=[...builtinPropertyRoots('rt.proxyCreateInternal','__nonaProxyCreateInternal'),
 ...builtinPropertyRoots('rt.proxyRevokeInternal','__nonaProxyRevokeInternal'),
 ...builtinPropertyRoots('rt.proxyPreventInternal','__nonaProxyPreventInternal'),
 ...builtinPropertyRoots('rt.proxySetPrototypeInternal','__nonaProxySetPrototypeInternal'),
 ...builtinPropertyRoots('rt.reflectGetInternal','__nonaReflectGetInternal')];

export function emitProxy(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.proxyCreateInternal','__nonaProxyCreateInternal',2,'rt.functionPrototype');
 rootedFn(b,'rt.proxyCreateInternal.code',104,[{kind:'output',register:'rcx'},
  {kind:'range',register:'r8',count:'rdx'}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.cmp('rdx',2);failIf(a,'b','rt.throwTypeError');
  for(const index of [0,1]){a.load('r10',slot(56));a.load('rax',{base:'r10',disp:index*16});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');}
  a.mov('rcx',ProxyLayout.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',ProxyKind);a.store({base:'rax',disp:O.kind},'r10');
  a.mov('r10',0);for(const offset of [O.properties,O.length,O.stringifying,O.flags,ProxyLayout.revoked])a.store({base:'rax',disp:offset},'r10');
  a.lea('r10',{rip:'rt.objectPrototype'});a.store({base:'rax',disp:O.prototype},'r10');
  a.load('r11',slot(56));for(const [index,offset] of [[0,ProxyLayout.target],[1,ProxyLayout.handler]] as const)
   for(const part of [0,8]){a.load('r10',{base:'r11',disp:index*16+part});a.store({base:'rax',disp:offset+part},'r10');}
  a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('r10',5);a.store({base:'rcx'},'r10');
 });
 prependFunctionBuiltin(b,'rt.proxyRevokeInternal','__nonaProxyRevokeInternal',1,'rt.functionPrototype');
 b.fn('rt.proxyRevokeInternal.code',40,a=>{
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r8',disp:8});a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',ProxyKind);failIf(a,'ne','rt.throwTypeError');
  a.mov('r10',1);a.store({base:'rax',disp:ProxyLayout.revoked},'r10');
  a.mov('r10',0);for(const offset of [ProxyLayout.target,ProxyLayout.handler]){a.mov('r11',1);a.store({base:'rax',disp:offset},'r11');a.store({base:'rax',disp:offset+8},'r10');}
  a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'r10');
 });
 prependFunctionBuiltin(b,'rt.proxyPreventInternal','__nonaProxyPreventInternal',1,'rt.functionPrototype');
 rootedFn(b,'rt.proxyPreventInternal.code',88,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:48,count:1}],a=>{
  a.store(slot(40),'rcx');a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  for(const part of [0,8]){a.load('rax',{base:'r8',disp:part});a.store(slot(48+part),'rax');}
  const ordinary=a.unique('ordinary'),done=a.unique('done');a.load('r10',slot(56));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('ne',ordinary);
  a.lea('rcx',slot(48));a.call('rt.proxyPreventExtensions');a.jmp(done);
  a.label(ordinary);a.load('rax',{base:'r10',disp:O.flags});a.or('rax',1);a.store({base:'r10',disp:O.flags},'rax');a.mov('rax',1);
  a.label(done);a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',2);a.store({base:'rcx'},'rax');
 });
 prependFunctionBuiltin(b,'rt.proxySetPrototypeInternal','__nonaProxySetPrototypeInternal',2,'rt.functionPrototype');
 rootedFn(b,'rt.proxySetPrototypeInternal.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:48,count:2}],a=>{
  a.store(slot(40),'rcx');a.cmp('rdx',2);failIf(a,'b','rt.throwTypeError');
  a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  for(const part of [0,8]){a.load('rax',{base:'r8',disp:part});a.store(slot(48+part),'rax');a.load('rax',{base:'r8',disp:16+part});a.store(slot(64+part),'rax');}
  const ordinary=a.unique('ordinary'),done=a.unique('done');a.load('r10',slot(56));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('ne',ordinary);
  a.lea('rcx',slot(48));a.lea('rdx',slot(64));a.call('rt.proxySetPrototype');
  a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',2);a.store({base:'rcx'},'rax');a.jmp(done);
  a.label(ordinary);a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
 prependFunctionBuiltin(b,'rt.reflectGetInternal','__nonaReflectGetInternal',3,'rt.functionPrototype');
 rootedFn(b,'rt.reflectGetInternal.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:3}],a=>{
  a.store(slot(40),'rcx');a.cmp('rdx',3);failIf(a,'b','rt.throwTypeError');
  a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  for(const index of [0,1,2])for(const part of [0,8]){a.load('rax',{base:'r8',disp:index*16+part});a.store(slot(64+index*16+part),'rax');}
  a.load('rcx',slot(40));a.lea('rdx',slot(64));a.lea('r8',slot(80));a.lea('r9',slot(96));a.call('rt.getPropertyWithReceiver');
 });
 b.bundle.fragments.push(stringLiteral('rt.proxyGetKey','get'));
 b.bundle.fragments.push(stringLiteral('rt.proxyHasKey','has'));
 b.bundle.fragments.push(stringLiteral('rt.proxyDeleteKey','deleteProperty'));
 b.bundle.fragments.push(stringLiteral('rt.proxyIsExtensibleKey','isExtensible'));
 b.bundle.fragments.push(stringLiteral('rt.proxyPreventExtensionsKey','preventExtensions'));
 b.bundle.fragments.push(stringLiteral('rt.proxyGetPrototypeKey','getPrototypeOf'));
 b.bundle.fragments.push(stringLiteral('rt.proxySetPrototypeKey','setPrototypeOf'));
 rootedFn(b,'rt.proxySetPrototype',216,[{kind:'value',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:80,count:8}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  a.load('r10',{base:'rcx',disp:8});a.load('rax',{base:'r10',disp:ProxyLayout.revoked});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  for(const [offset,to] of [[ProxyLayout.target,80],[ProxyLayout.handler,96]] as const)
   for(const part of [0,8]){a.load('rax',{base:'r10',disp:offset+part});a.store(slot(to+part),'rax');}
  a.mov('rax',4);a.store(slot(112),'rax');a.lea('rax',{rip:'rt.proxySetPrototypeKey'});a.store(slot(120),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.call('rt.getProperty');
  const forward=a.unique('forward'),done=a.unique('done'),ordinary=a.unique('ordinary'),compare=a.unique('compare');
  a.load('rax',slot(128));a.cmp('rax',1);a.jcc('be',forward);
  for(const part of [0,8]){a.load('rax',slot(80+part));a.store(slot(160+part),'rax');}
  a.load('r10',slot(48));for(const part of [0,8]){a.load('rax',{base:'r10',disp:part});a.store(slot(176+part),'rax');}
  a.lea('rax',slot(96));a.store(slot(32),'rax');a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.mov('r8',2);a.lea('r9',slot(160));a.call('rt.invoke');
  a.lea('rcx',slot(144));a.call('rt.toBoolean');a.test('rax','rax');a.jcc('e',done);
  a.load('r10',slot(88));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('ne',ordinary);
  a.lea('rcx',slot(80));a.call('rt.proxyIsExtensible');a.test('rax','rax');a.jcc('e',compare);a.mov('rax',1);a.jmp(done);
  a.label(ordinary);a.load('rax',{base:'r10',disp:O.flags});a.and('rax',1);a.test('rax','rax');a.jcc('ne',compare);a.mov('rax',1);a.jmp(done);
  a.label(compare);a.lea('rcx',slot(192));a.lea('rdx',slot(80));a.call('rt.getPrototype');a.load('rcx',slot(48));a.lea('rdx',slot(192));a.call('rt.sameValue');a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.mov('rax',1);a.jmp(done);
  a.label(forward);a.load('r10',slot(88));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);const ordinaryForward=a.unique('ordinaryForward');a.jcc('ne',ordinaryForward);
  a.lea('rcx',slot(80));a.load('rdx',slot(48));a.call('rt.proxySetPrototype');a.jmp(done);
  a.label(ordinaryForward);a.lea('rcx',slot(80));a.load('rdx',slot(48));a.call('rt.setPrototype');a.mov('rax',1);a.label(done);
 });
 rootedFn(b,'rt.proxyGetPrototype',200,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:80,count:7}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:ProxyLayout.revoked});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  for(const [offset,to] of [[ProxyLayout.target,80],[ProxyLayout.handler,96]] as const)
   for(const part of [0,8]){a.load('rax',{base:'r10',disp:offset+part});a.store(slot(to+part),'rax');}
  a.mov('rax',4);a.store(slot(112),'rax');a.lea('rax',{rip:'rt.proxyGetPrototypeKey'});a.store(slot(120),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.call('rt.getProperty');
  const forward=a.unique('forward'),done=a.unique('done'),extensible=a.unique('extensible'),compare=a.unique('compare');
  a.load('rax',slot(128));a.cmp('rax',1);a.jcc('be',forward);
  for(const part of [0,8]){a.load('rax',slot(80+part));a.store(slot(176+part),'rax');}
  a.lea('rax',slot(96));a.store(slot(32),'rax');a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.mov('r8',1);a.lea('r9',slot(176));a.call('rt.invoke');
  a.load('rax',slot(144));a.cmp('rax',1);a.jcc('e',extensible);a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.label(extensible);a.load('r10',slot(88));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);const ordinary=a.unique('ordinary');a.jcc('ne',ordinary);
  a.lea('rcx',slot(80));a.call('rt.proxyIsExtensible');a.test('rax','rax');a.jcc('e',compare);a.jmp(done);
  a.label(ordinary);a.load('rax',{base:'r10',disp:O.flags});a.and('rax',1);a.test('rax','rax');a.jcc('e',done);
  a.label(compare);a.lea('rcx',slot(160));a.lea('rdx',slot(80));a.call('rt.getPrototype');
  a.lea('rcx',slot(144));a.lea('rdx',slot(160));a.call('rt.sameValue');a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.jmp(done);
  a.label(forward);a.load('rcx',slot(40));a.lea('rdx',slot(80));a.call('rt.getPrototype');a.jmp(done);
  a.label(done);a.load('r10',slot(128));a.cmp('r10',1);const already=a.unique('already');a.jcc('be',already);
  a.load('rcx',slot(40));for(const part of [0,8]){a.load('rax',slot(144+part));a.store({base:'rcx',disp:part},'rax');}a.label(already);
 });
 rootedFn(b,'rt.proxyPreventExtensions',184,[{kind:'value',register:'rcx'},{kind:'locals',offset:80,count:6}],a=>{
  a.load('r10',{base:'rcx',disp:8});a.load('rax',{base:'r10',disp:ProxyLayout.revoked});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  for(const [offset,to] of [[ProxyLayout.target,80],[ProxyLayout.handler,96]] as const)
   for(const part of [0,8]){a.load('rax',{base:'r10',disp:offset+part});a.store(slot(to+part),'rax');}
  a.mov('rax',4);a.store(slot(112),'rax');a.lea('rax',{rip:'rt.proxyPreventExtensionsKey'});a.store(slot(120),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.call('rt.getProperty');
  const forward=a.unique('forward'),done=a.unique('done'),ordinary=a.unique('ordinary');
  a.load('rax',slot(128));a.cmp('rax',1);a.jcc('be',forward);
  for(const part of [0,8]){a.load('rax',slot(80+part));a.store(slot(160+part),'rax');}
  a.lea('rax',slot(96));a.store(slot(32),'rax');a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.mov('r8',1);a.lea('r9',slot(160));a.call('rt.invoke');
  a.lea('rcx',slot(144));a.call('rt.toBoolean');a.test('rax','rax');a.jcc('e',done);
  a.load('r10',slot(88));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('ne',ordinary);
  a.lea('rcx',slot(80));a.call('rt.proxyIsExtensible');a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');a.mov('rax',1);a.jmp(done);
  a.label(ordinary);a.load('rax',{base:'r10',disp:O.flags});a.and('rax',1);a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.mov('rax',1);a.jmp(done);
  a.label(forward);a.load('r10',slot(88));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);const ordinaryForward=a.unique('ordinaryForward');a.jcc('ne',ordinaryForward);
  a.lea('rcx',slot(80));a.call('rt.proxyPreventExtensions');a.jmp(done);
  a.label(ordinaryForward);a.load('rax',{base:'r10',disp:O.flags});a.or('rax',1);a.store({base:'r10',disp:O.flags},'rax');a.mov('rax',1);a.label(done);
 });
 rootedFn(b,'rt.proxyIsExtensible',184,[{kind:'value',register:'rcx'},{kind:'locals',offset:80,count:6}],a=>{
  a.load('r10',{base:'rcx',disp:8});a.load('rax',{base:'r10',disp:ProxyLayout.revoked});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  for(const [offset,to] of [[ProxyLayout.target,80],[ProxyLayout.handler,96]] as const)
   for(const part of [0,8]){a.load('rax',{base:'r10',disp:offset+part});a.store(slot(to+part),'rax');}
  a.mov('rax',4);a.store(slot(112),'rax');a.lea('rax',{rip:'rt.proxyIsExtensibleKey'});a.store(slot(120),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.call('rt.getProperty');
  const forward=a.unique('forward'),compare=a.unique('compare'),ordinary=a.unique('ordinary'),finish=a.unique('finish'),doneExt=a.unique('doneExt');
  a.load('rax',slot(128));a.cmp('rax',1);a.jcc('be',forward);
  for(const part of [0,8]){a.load('rax',slot(80+part));a.store(slot(160+part),'rax');}
  a.lea('rax',slot(96));a.store(slot(32),'rax');a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.mov('r8',1);a.lea('r9',slot(160));a.call('rt.invoke');
  a.lea('rcx',slot(144));a.call('rt.toBoolean');a.store(slot(72),'rax');a.jmp(compare);
  a.label(forward);a.jmp(compare);
  a.label(compare);a.load('r10',slot(88));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('ne',ordinary);
  a.lea('rcx',slot(80));a.call('rt.proxyIsExtensible');a.jmp(finish);
  a.label(ordinary);a.load('rax',{base:'r10',disp:O.flags});a.and('rax',1);a.cmp('rax',0);a.mov('rax',0);const nonext=a.unique('nonext');a.jcc('ne',nonext);a.mov('rax',1);a.label(nonext);
  a.label(finish);a.load('r10',slot(128));a.cmp('r10',1);a.jcc('be',doneExt);
  a.load('r10',slot(72));a.cmp('rax','r10');failIf(a,'ne','rt.throwTypeError');a.label(doneExt);
 });
 rootedFn(b,'rt.proxyGet',216,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},
  {kind:'value',register:'r8'},{kind:'value',register:'r9'},{kind:'locals',offset:80,count:8}],a=>{
  a.store(slot(48),'rcx');a.store(slot(56),'rdx');a.store(slot(64),'r8');a.store(slot(72),'r9');
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:ProxyLayout.revoked});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  for(const [offset,to] of [[ProxyLayout.target,80],[ProxyLayout.handler,96]] as const)
   for(const part of [0,8]){a.load('rax',{base:'r10',disp:offset+part});a.store(slot(to+part),'rax');}
  a.mov('rax',4);a.store(slot(112),'rax');a.lea('rax',{rip:'rt.proxyGetKey'});a.store(slot(120),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.call('rt.getProperty');
  const forward=a.unique('forward'),done=a.unique('done');a.load('rax',slot(128));a.cmp('rax',1);a.jcc('be',forward);
  for(const part of [0,8]){a.load('rax',slot(80+part));a.store(slot(160+part),'rax');}
  a.load('r10',slot(64));for(const part of [0,8]){a.load('rax',{base:'r10',disp:part});a.store(slot(176+part),'rax');}
  a.load('r10',slot(72));for(const part of [0,8]){a.load('rax',{base:'r10',disp:part});a.store(slot(192+part),'rax');}
  a.lea('rax',slot(96));a.store(slot(32),'rax');
  a.load('rcx',slot(48));a.lea('rdx',slot(128));a.mov('r8',3);a.lea('r9',slot(160));a.call('rt.invoke');
  // [[Get]] cannot lie about a frozen own data value or an accessor with no
  // getter. Nested proxy targets will use their own descriptor path later.
  a.load('r10',slot(88));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('e',done);
  a.load('rcx',slot(88));a.load('r10',slot(64));a.load('rdx',{base:'r10',disp:8});a.call('rt.findOwnProperty');a.test('rax','rax');a.jcc('e',done);
  a.load('r10',{base:'rax',disp:P.attributes});a.mov('r11','r10');a.and('r11',A.configurable);a.test('r11','r11');a.jcc('ne',done);
  const accessor=a.unique('accessor'),getterPresent=a.unique('getterPresent');a.mov('r11','r10');a.and('r11',A.accessor);a.test('r11','r11');a.jcc('ne',accessor);
  a.and('r10',A.writable);a.test('r10','r10');a.jcc('ne',done);
  a.lea('rcx',{base:'rax',disp:P.value});a.load('rdx',slot(48));a.call('rt.sameValue');a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.jmp(done);
  a.label(accessor);a.load('r10',{base:'rax',disp:P.getter});a.test('r10','r10');a.jcc('ne',getterPresent);
  a.load('r10',slot(48));a.load('rax',{base:'r10'});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');a.label(getterPresent);a.jmp(done);
  a.label(forward);a.load('rcx',slot(48));a.lea('rdx',slot(80));a.load('r8',slot(64));a.load('r9',slot(72));a.call('rt.getPropertyWithReceiver');a.label(done);
 });
 rootedFn(b,'rt.proxyHas',200,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},
  {kind:'value',register:'r8'},{kind:'locals',offset:80,count:7}],a=>{
  a.store(slot(48),'rcx');a.store(slot(56),'rdx');a.store(slot(64),'r8');
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:ProxyLayout.revoked});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  for(const [offset,to] of [[ProxyLayout.target,80],[ProxyLayout.handler,96]] as const)
   for(const part of [0,8]){a.load('rax',{base:'r10',disp:offset+part});a.store(slot(to+part),'rax');}
  a.mov('rax',4);a.store(slot(112),'rax');a.lea('rax',{rip:'rt.proxyHasKey'});a.store(slot(120),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.call('rt.getProperty');
  const forward=a.unique('forward'),done=a.unique('done'),save=a.unique('save');a.load('rax',slot(128));a.cmp('rax',1);a.jcc('be',forward);
  for(const part of [0,8]){a.load('rax',slot(80+part));a.store(slot(160+part),'rax');}
  a.load('r10',slot(64));for(const part of [0,8]){a.load('rax',{base:'r10',disp:part});a.store(slot(176+part),'rax');}
  a.lea('rax',slot(96));a.store(slot(32),'rax');a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.mov('r8',2);a.lea('r9',slot(160));a.call('rt.invoke');
  a.lea('rcx',slot(144));a.call('rt.toBoolean');a.store(slot(72),'rax');a.test('rax','rax');a.jcc('ne',save);
  a.load('r10',slot(88));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('e',save);
  a.load('rcx',slot(88));a.load('r10',slot(64));a.load('rdx',{base:'r10',disp:8});a.call('rt.findOwnProperty');a.test('rax','rax');a.jcc('e',save);
  a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.configurable);a.test('r10','r10');failIf(a,'e','rt.throwTypeError');
  a.load('r10',slot(88));a.load('r10',{base:'r10',disp:O.flags});a.and('r10',1);a.test('r10','r10');failIf(a,'ne','rt.throwTypeError');
  a.jmp(save);
  a.label(forward);a.load('rcx',slot(48));a.lea('rdx',slot(80));a.load('r8',slot(64));a.call('rt.hasProperty');a.jmp(done);
  a.label(save);a.load('rcx',slot(48));a.mov('rax',2);a.store({base:'rcx'},'rax');a.load('rax',slot(72));a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
 rootedFn(b,'rt.proxyDelete',200,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},
  {kind:'value',register:'r8'},{kind:'locals',offset:80,count:7}],a=>{
  a.store(slot(48),'rcx');a.store(slot(56),'rdx');a.store(slot(64),'r8');
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:ProxyLayout.revoked});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  for(const [offset,to] of [[ProxyLayout.target,80],[ProxyLayout.handler,96]] as const)
   for(const part of [0,8]){a.load('rax',{base:'r10',disp:offset+part});a.store(slot(to+part),'rax');}
  a.mov('rax',4);a.store(slot(112),'rax');a.lea('rax',{rip:'rt.proxyDeleteKey'});a.store(slot(120),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.call('rt.getProperty');
  const forward=a.unique('forward'),done=a.unique('done'),save=a.unique('save');a.load('rax',slot(128));a.cmp('rax',1);a.jcc('be',forward);
  for(const part of [0,8]){a.load('rax',slot(80+part));a.store(slot(160+part),'rax');}
  a.load('r10',slot(64));for(const part of [0,8]){a.load('rax',{base:'r10',disp:part});a.store(slot(176+part),'rax');}
  a.lea('rax',slot(96));a.store(slot(32),'rax');a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.mov('r8',2);a.lea('r9',slot(160));a.call('rt.invoke');
  a.lea('rcx',slot(144));a.call('rt.toBoolean');a.store(slot(72),'rax');a.test('rax','rax');a.jcc('e',save);
  a.load('r10',slot(88));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('e',save);
  a.load('rcx',slot(88));a.load('r10',slot(64));a.load('rdx',{base:'r10',disp:8});a.call('rt.findOwnProperty');a.test('rax','rax');a.jcc('e',save);
  a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.configurable);a.test('r10','r10');failIf(a,'e','rt.throwTypeError');
  a.load('r10',slot(88));a.load('r10',{base:'r10',disp:O.flags});a.and('r10',1);a.test('r10','r10');failIf(a,'ne','rt.throwTypeError');
  a.jmp(save);
  a.label(forward);a.load('rcx',slot(48));a.lea('rdx',slot(80));a.load('r8',slot(64));a.call('rt.deleteProperty');a.jmp(done);
  a.label(save);a.load('rcx',slot(48));a.mov('rax',2);a.store({base:'rcx'},'rax');a.load('rax',slot(72));a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
}
