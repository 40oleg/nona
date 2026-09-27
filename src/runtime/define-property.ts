import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {DescriptorLayout as D,DescriptorFields as F} from './descriptor-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A,ObjectFlags as OF} from './object-layout.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';
import {CellTag} from './environment-layout.js';
import {emitDescriptorValidation} from './descriptor-validation.js';
import {prependFunctionBuiltin} from './function-builtin.js';
import {TypedArrayKind,TypedArrayLayout} from './typed-array.js';
import {ArrayBufferLayout} from './array-buffer.js';

export function emitDefineProperty(b:RuntimeBuilder):void {
 emitDescriptorValidation(b);
 prependFunctionBuiltin(b,'rt.objectDefineProperty','defineProperty',3,'rt.Object');
 rootedFn(b,'rt.objectDefineProperty.code',232,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:10}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  for(const i of [0,1,2]){const absent=a.unique('absent');a.load('rax',slot(48));a.cmp('rax',i);a.jcc('be',absent);a.load('r8',slot(56));for(const n of [0,8]){a.load('rax',{base:'r8',disp:16*i+n});a.store(slot(64+16*i+n),'rax');}a.label(absent);}
  a.load('rax',slot(64));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.call('rt.toPropertyKey');
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.call('rt.toPropertyDescriptor');
  a.lea('rcx',slot(64));a.lea('rdx',slot(112));a.lea('r8',slot(128));a.call('rt.defineOwnProperty');a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(64+n));a.store({base:'rcx',disp:n},'rax');}
 });
 // RCX complete record -> RAX compact property attributes.
 b.fn('rt.descriptorAttributes',40,a=>{
  a.load('rax',{base:'rcx',disp:D.enumerable+8});a.shl('rax',1);a.load('r10',{base:'rcx',disp:D.configurable+8});a.shl('r10',2);a.or('rax','r10');
  a.load('r10',{base:'rcx',disp:D.present});a.and('r10',F.get|F.set);a.test('r10','r10');const data=a.unique('data'),done=a.unique('done');a.jcc('e',data);a.or('rax',A.accessor);a.jmp(done);
  a.label(data);a.load('r10',{base:'rcx',disp:D.writable+8});a.or('rax','r10');a.label(done);
 });
 // Target/key are stable Values; partial descriptor is initialized. Array
 // length normalization may call JS, so all records and temporaries are roots.
 rootedFn(b,'rt.defineOwnProperty',248,[{kind:'value',register:'rcx'},{kind:'value',register:'rdx'},{kind:'range',register:'r8',count:6},{kind:'locals',offset:80,count:6},{kind:'locals',offset:184,count:1}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.load('rax',{base:'rcx',disp:8});a.store(slot(64),'rax');
  a.mov('r10',-1);a.store(slot(72),'r10');a.mov('r10',0);a.store(slot(224),'r10');
  const lookup=a.unique('lookup'),index=a.unique('index'),typed=a.unique('typed'),no=a.unique('no'),yes=a.unique('yes'),done=a.unique('done');
  a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',TypedArrayKind);a.jcc('e',typed);a.cmp('rax',1);a.jcc('ne',lookup);
  a.load('rcx',{base:'rdx',disp:8});a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('ne',index);
  a.mov('rax',1);a.store(slot(224),'rax');a.load('r8',slot(56));a.load('rax',{base:'r8',disp:D.present});a.and('rax',F.value);a.test('rax','rax');a.jcc('e',lookup);
  a.lea('rcx',slot(184));a.lea('rdx',{base:'r8',disp:D.value});a.call('rt.normalizeArrayLength');a.load('r8',slot(56));
  for(const n of [0,8]){a.load('rax',slot(184+n));a.store({base:'r8',disp:D.value+n},'rax');}a.jmp(lookup);
  a.label(index);a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:8});a.call('rt.arrayIndex');a.store(slot(72),'rax');a.cmp('rax',-1);a.jcc('e',lookup);
  a.load('r10',slot(64));a.load('r11',{base:'r10',disp:O.length});a.cmp('rax','r11');a.jcc('b',lookup);a.load('r10',{base:'r10',disp:O.flags});a.and('r10',OF.lengthReadonly);a.test('r10','r10');a.jcc('ne',no);a.jmp(lookup);
  a.label(typed);a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:8});a.call('rt.typedArrayNumericIndex');a.cmp('rax',-1);a.jcc('e',lookup);a.cmp('rax',-2);a.jcc('e',no);
  a.load('r10',slot(64));a.load('r11',{base:'r10',disp:TypedArrayLayout.length});a.cmp('rax','r11');a.jcc('ae',no);a.store(slot(208),'rax');
  a.load('r8',slot(56));a.load('rax',{base:'r8',disp:D.present});a.and('rax',F.get|F.set);a.test('rax','rax');a.jcc('ne',no);
  for(const [field,flag] of [[D.configurable,F.configurable],[D.enumerable,F.enumerable],[D.writable,F.writable]] as const){
   const allowed=a.unique('allowed');a.load('rax',{base:'r8',disp:D.present});a.and('rax',flag);a.test('rax','rax');a.jcc('e',allowed);
   a.load('rax',{base:'r8',disp:field+8});a.test('rax','rax');a.jcc('e',no);a.label(allowed);
  }
  a.load('rax',{base:'r8',disp:D.present});a.and('rax',F.value);a.test('rax','rax');a.jcc('e',yes);
  const regularByte=a.unique('regularByte'),byteReady=a.unique('byteReady');a.load('r10',slot(64));a.load('rax',{base:'r10',disp:TypedArrayLayout.elementType});a.cmp('rax',3);a.jcc('ne',regularByte);
  a.lea('rcx',{base:'r8',disp:D.value});a.call('rt.toUint8Clamp');a.jmp(byteReady);
  a.label(regularByte);a.lea('rcx',{base:'r8',disp:D.value});a.call('rt.toInt32');a.and('rax',255);a.label(byteReady);a.store(slot(200),'rax');
  a.load('r10',slot(64));a.load('rax',slot(208));a.load('r11',{base:'r10',disp:TypedArrayLayout.byteOffset});a.add('rax','r11');
  a.load('rdx',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.add('rdx','rax');
  a.load('rax',slot(200));a.store({base:'rdx'},'rax',8);a.jmp(yes);
  a.label(lookup);a.lea('rcx',slot(80));a.load('rdx',slot(40));a.load('r8',slot(48));a.call('rt.getOwnDescriptor');
  a.load('rcx',slot(56));a.lea('rdx',slot(80));a.load('r8',slot(64));a.load('r8',{base:'r8',disp:O.flags});a.and('r8',OF.nonExtensible);a.xor('r8',1);a.call('rt.validateDescriptor');a.test('rax','rax');a.jcc('e',no);
  a.load('rax',slot(224));a.test('rax','rax');const nonLength=a.unique('nonLength');a.jcc('e',nonLength);
  a.load('rcx',slot(64));a.lea('rdx',slot(80));a.call('rt.applyArrayLength');a.jmp(done);
  a.label(nonLength);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.isStringOwn');a.test('rax','rax');a.jcc('ne',yes);
  a.lea('rcx',slot(80));a.call('rt.descriptorAttributes');a.store(slot(200),'rax');
  a.load('rcx',slot(64));a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.findGlobalBinding');a.test('rax','rax');
  const ordinary=a.unique('ordinary');a.jcc('e',ordinary);a.mov('r11','rax');a.load('rax',slot(200));a.store({base:'rdx'},'rax');
  for(const n of [0,8]){a.load('rax',slot(80+D.value+n));a.store({base:'r11',disp:n},'rax');}a.jmp(yes);
  a.label(ordinary);a.load('rcx',slot(64));a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.findOwnProperty');a.test('rax','rax');
  const node=a.unique('node');a.jcc('ne',node);a.mov('rcx',P.size);a.call('rt.alloc');a.mov('r10',HeapKind.property);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',0);for(const n of [P.value,P.value+8,P.getter,P.getter+8,P.setter,P.setter+8])a.store({base:'rax',disp:n},'r10');
  a.load('r10',slot(64));a.load('r11',{base:'r10',disp:O.properties});a.store({base:'rax',disp:P.next},'r11');a.store({base:'r10',disp:O.properties},'rax');a.load('r10',slot(48));a.load('r10',{base:'r10',disp:8});a.store({base:'rax',disp:P.key},'r10');
  a.label(node);a.store(slot(208),'rax');a.load('r10',slot(200));a.store({base:'rax',disp:P.attributes},'r10');a.and('r10',A.accessor);a.test('r10','r10');
  const accessor=a.unique('accessor'),stored=a.unique('stored'),copyData=a.unique('copyData'),clearMethods=a.unique('clearMethods');a.jcc('ne',accessor);
  a.load('r10',{base:'rax',disp:P.value});a.cmp('r10',CellTag);a.jcc('ne',copyData);
  // Mapped arguments update the parameter first. Readonly then disconnects it.
  a.lea('rcx',{base:'rax',disp:P.value});a.lea('rdx',slot(80+D.value));a.call('rt.writeCell');a.load('rax',slot(80+D.writable+8));a.test('rax','rax');a.jcc('ne',clearMethods);
  a.label(copyData);a.load('r11',slot(208));for(const n of [0,8]){a.load('rax',slot(80+D.value+n));a.store({base:'r11',disp:P.value+n},'rax');}
  a.label(clearMethods);a.load('r11',slot(208));a.mov('rax',0);for(const n of [P.getter,P.getter+8,P.setter,P.setter+8])a.store({base:'r11',disp:n},'rax');a.jmp(stored);
  a.label(accessor);a.load('r11',slot(208));a.mov('rax',0);a.store({base:'r11',disp:P.value},'rax');a.store({base:'r11',disp:P.value+8},'rax');
  for(const [field,offset] of [[D.get,P.getter],[D.set,P.setter]])for(const n of [0,8]){a.load('rax',slot(80+field!+n));a.store({base:'r11',disp:offset!+n},'rax');}
  a.label(stored);a.load('rax',slot(72));a.cmp('rax',-1);a.jcc('e',yes);a.load('r10',slot(64));a.load('r11',{base:'r10',disp:O.length});a.cmp('rax','r11');a.jcc('b',yes);a.add('rax',1);a.store({base:'r10',disp:O.length},'rax');
  a.label(yes);a.mov('rax',1);a.jmp(done);a.label(no);a.mov('rax',0);a.label(done);
 });
}
