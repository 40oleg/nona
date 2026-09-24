import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyLayout as P} from './object-layout.js';
import {ValueListLayout as L} from './heap-layout.js';
import {nativeConstructorNames} from '../global-builtins.js';
import {emitValueList} from './value-list.js';
import {emitKeySort} from './key-sort.js';

export function emitOwnKeys(b:RuntimeBuilder):void {
 emitValueList(b);emitKeySort(b);
 const intrinsicNodes=['globalThis','undefined','NaN','Infinity','console',...nativeConstructorNames];
 b.fn('rt.isIntrinsicGlobalKey',40,a=>{
  a.mov('rdx','rcx');a.lea('rcx',{rip:'rt.globalObject'});a.call('rt.findOwnProperty');
  const yes=a.unique('yes'),done=a.unique('done');
  for(const name of intrinsicNodes){a.lea('r10',{rip:'rt.globalObject.'+name});a.cmp('rax','r10');a.jcc('e',yes);}
  a.mov('rax',0);a.jmp(done);a.label(yes);a.mov('rax',1);a.label(done);
 });
 // RCX internal Value result, RDX Object Value*. This snapshot is leaf-only:
 // formatting synthetic indices never calls user code. Consumers root the
 // typed ValueList so keys survive deletion of their original properties.
 rootedFn(b,'rt.ownKeys',216,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:128,count:3}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.load('rax',{base:'rdx',disp:8});a.store(slot(56),'rax');a.load('rax',{base:'rax',disp:O.properties});a.store(slot(112),'rax');
  a.mov('rax',0);for(const n of [64,72,80,88,96,104,120,208])a.store(slot(n),'rax');
  const count=a.unique('count'),next=a.unique('next'),counted=a.unique('counted');
  a.label(count);a.load('rax',slot(112));a.test('rax','rax');a.jcc('e',counted);a.load('rdx',{base:'rax',disp:P.key});a.load('rcx',slot(56));a.call('rt.findGlobalBinding');a.test('rax','rax');const keepnext=a.unique('keepnext');a.jcc('e',keepnext);a.load('rax',slot(112));
  for(const name of intrinsicNodes){a.lea('r10',{rip:'rt.globalObject.'+name});a.cmp('rax','r10');a.jcc('e',keepnext);}a.jmp(next);a.label(keepnext);
  a.load('rax',slot(64));a.add('rax',1);a.store(slot(64),'rax');
  const isStatic=a.unique('isStatic'),notStatic=a.unique('notStatic');a.load('rax',slot(112));
  for(const name of intrinsicNodes){a.lea('r10',{rip:'rt.globalObject.'+name});a.cmp('rax','r10');a.jcc('e',isStatic);}a.jmp(notStatic);
  a.label(isStatic);a.load('rax',slot(120));a.add('rax',1);a.store(slot(120),'rax');a.label(notStatic);
  a.label(next);a.load('rax',slot(112));a.load('rax',{base:'rax',disp:P.next});a.store(slot(112),'rax');a.jmp(count);
  a.label(counted);a.load('rax',slot(56));a.lea('r10',{rip:'rt.globalObject'});a.cmp('rax','r10');const notGlobal=a.unique('notGlobal');a.jcc('ne',notGlobal);a.load('rax',{rip:'rt.globalBindingCount'});a.store(slot(208),'rax');a.label(notGlobal);
  a.load('rax',{rip:'rt.globalBindings'});a.store(slot(200),'rax');a.mov('rax',0);a.store(slot(192),'rax');
  const countAliases=a.unique('countAliases'),countAliasNext=a.unique('countAliasNext'),aliasesCounted=a.unique('aliasesCounted');
  a.label(countAliases);a.load('rax',slot(192));a.load('r10',slot(208));a.cmp('rax','r10');a.jcc('ae',aliasesCounted);
  a.load('rax',slot(200));a.load('rcx',{base:'rax'});a.call('rt.isIntrinsicGlobalKey');a.test('rax','rax');a.jcc('ne',countAliasNext);
  a.load('rax',slot(80));a.add('rax',1);a.store(slot(80),'rax');a.label(countAliasNext);
  a.load('rax',slot(192));a.add('rax',1);a.store(slot(192),'rax');a.load('rax',slot(200));a.add('rax',24);a.store(slot(200),'rax');a.jmp(countAliases);a.label(aliasesCounted);
  a.load('rcx',slot(48));a.call('rt.stringBase');a.test('rax','rax');const notString=a.unique('notString'),allocate=a.unique('allocate');a.jcc('e',notString);
  a.load('rax',{base:'rax'});a.store(slot(88),'rax');a.add('rax',1);a.store(slot(72),'rax');a.mov('rax',1);a.store(slot(96),'rax');a.jmp(allocate);
  a.label(notString);a.load('rax',slot(56));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',1);a.jcc('ne',allocate);a.mov('rax',1);a.store(slot(72),'rax');a.store(slot(96),'rax');
  a.label(allocate);a.load('rdx',slot(64));a.load('rax',slot(72));a.add('rdx','rax');a.load('rax',slot(80));a.add('rdx','rax');a.store(slot(184),'rdx');a.lea('rcx',slot(128));a.call('rt.newValueList');
  a.load('rcx',slot(184));a.shl('rcx',3);a.call('rt.alloc');a.store(slot(176),'rax');
  // Store temp Value at cursor. The list was initialized by newValueList.
  const storeKey=()=>{a.load('rax',slot(104));a.shl('rax',4);a.load('r11',slot(136));a.add('r11',L.values);a.add('r11','rax');for(const n of [0,8]){a.load('rax',slot(144+n));a.store({base:'r11',disp:n},'rax');}};
  const indices=a.unique('indices'),length=a.unique('length'),properties=a.unique('properties');
  a.label(indices);a.load('rax',slot(104));a.load('r10',slot(88));a.cmp('rax','r10');a.jcc('ae',length);
  a.cvtsi2sd('xmm0','rax');a.storesd(slot(152),'xmm0');a.mov('rax',3);a.store(slot(144),'rax');a.lea('rcx',slot(144));a.lea('rdx',slot(144));a.call('rt.toString');storeKey();a.load('rax',slot(104));a.add('rax',1);a.store(slot(104),'rax');a.jmp(indices);
  a.label(length);a.load('rax',slot(96));a.test('rax','rax');a.jcc('e',properties);a.mov('rax',4);a.store(slot(144),'rax');a.lea('rax',{rip:'rt.str.length'});a.store(slot(152),'rax');storeKey();
  // Property lists prepend newly created nodes: copy in reverse to recover
  // chronological order, leaving room for script aliases before dynamic keys.
  a.label(properties);a.load('rax',slot(184));a.sub('rax',1);a.store(slot(104),'rax');a.load('rax',slot(56));a.load('rax',{base:'rax',disp:O.properties});a.store(slot(112),'rax');
  const propertyLoop=a.unique('propertyLoop'),propertyNext=a.unique('propertyNext'),aliases=a.unique('aliases');
  a.label(propertyLoop);a.load('rax',slot(112));a.test('rax','rax');a.jcc('e',aliases);a.load('rdx',{base:'rax',disp:P.key});a.load('rcx',slot(56));a.call('rt.findGlobalBinding');a.test('rax','rax');const keeppropertyNext=a.unique('keeppropertyNext');a.jcc('e',keeppropertyNext);a.load('rax',slot(112));
  for(const name of intrinsicNodes){a.lea('r10',{rip:'rt.globalObject.'+name});a.cmp('rax','r10');a.jcc('e',keeppropertyNext);}a.jmp(propertyNext);a.label(keeppropertyNext);
  a.load('rax',slot(112));a.load('rax',{base:'rax',disp:P.key});a.store(slot(152),'rax');a.mov('rax',4);a.store(slot(144),'rax');storeKey();a.load('rax',slot(104));a.sub('rax',1);a.store(slot(104),'rax');
  a.label(propertyNext);a.load('rax',slot(112));a.load('rax',{base:'rax',disp:P.next});a.store(slot(112),'rax');a.jmp(propertyLoop);
  // Globals existed before script declarations. Move the surviving intrinsic
  // prefix ahead of aliases, then fill the gap with aliases in declaration order.
  a.label(aliases);a.mov('rax',0);a.store(slot(104),'rax');const move=a.unique('move'),fill=a.unique('fill');
  a.label(move);a.load('rax',slot(104));a.load('r10',slot(120));a.cmp('rax','r10');a.jcc('ae',fill);a.load('r10',slot(72));a.add('rax','r10');a.mov('r11','rax');a.load('r10',slot(80));a.add('rax','r10');a.shl('rax',4);a.shl('r11',4);a.load('rdx',slot(136));a.add('rdx',L.values);a.add('rax','rdx');a.add('r11','rdx');a.mov('r8','rax');
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store({base:'r11',disp:n},'rax');}a.load('rax',slot(104));a.add('rax',1);a.store(slot(104),'rax');a.jmp(move);
  a.label(fill);a.load('rax',slot(72));a.load('r10',slot(120));a.add('rax','r10');a.store(slot(104),'rax');a.load('rax',{rip:'rt.globalBindings'});a.store(slot(200),'rax');a.mov('rax',0);a.store(slot(192),'rax');
  const aliasLoop=a.unique('aliasLoop'),ordering=a.unique('ordering');a.label(aliasLoop);a.load('rax',slot(192));a.load('r10',slot(208));a.cmp('rax','r10');a.jcc('ae',ordering);
  a.load('rax',slot(200));a.load('rcx',{base:'rax'});a.call('rt.isIntrinsicGlobalKey');a.test('rax','rax');const aliasNext=a.unique('aliasNext');a.jcc('ne',aliasNext);a.load('rax',slot(200));a.load('rax',{base:'rax'});a.store(slot(152),'rax');a.mov('rax',4);a.store(slot(144),'rax');storeKey();
  a.load('rax',slot(104));a.add('rax',1);a.store(slot(104),'rax');a.label(aliasNext);a.load('rax',slot(192));a.add('rax',1);a.store(slot(192),'rax');a.load('rax',slot(200));a.add('rax',24);a.store(slot(200),'rax');a.jmp(aliasLoop);
  a.label(ordering);a.mov('rax',0);a.store(slot(104),'rax');const orderLoop=a.unique('orderLoop'),sort=a.unique('sort');
  a.label(orderLoop);a.load('rax',slot(104));a.load('r10',slot(184));a.cmp('rax','r10');a.jcc('ae',sort);a.shl('rax',4);a.load('rcx',slot(136));a.add('rcx',L.values);a.add('rcx','rax');a.load('rcx',{base:'rcx',disp:8});a.call('rt.arrayIndex');a.cmp('rax',-1);const numeric=a.unique('numeric');a.jcc('ne',numeric);a.mov('rax',0x100000000n);a.load('r10',slot(104));a.add('rax','r10');a.label(numeric);
  a.load('r10',slot(104));a.shl('r10',3);a.load('r11',slot(176));a.add('r11','r10');a.store({base:'r11'},'rax');a.load('rax',slot(104));a.add('rax',1);a.store(slot(104),'rax');a.jmp(orderLoop);
  a.label(sort);a.load('rcx',slot(136));a.add('rcx',L.values);a.load('rdx',slot(176));a.load('r8',slot(184));a.call('rt.sortOwnKeys');
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(128+n));a.store({base:'rcx',disp:n},'rax');}
 });
}
