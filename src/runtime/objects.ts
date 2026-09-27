import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {stringLiteral} from './value.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';
import {CellTag} from './environment-layout.js';
import {BoxLayout} from './boxing.js';
import {TypedArrayKind,TypedArrayLayout} from './typed-array.js';
import {ArrayBufferLayout} from './array-buffer.js';
import type {Assembler,Mem} from '../backend/x64/assembler.js';

function copyValue(a:Assembler,to:Mem,from:Mem):void {
  const plus=(m:Mem):Mem=>'base'in m?{base:m.base,disp:(m.disp??0)+8}:{rip:m.rip,addend:(m.addend??0)+8};
  a.load('rax',from);a.store(to,'rax');a.load('rax',plus(from));a.store(plus(to),'rax');
}

export function emitObjects(b:RuntimeBuilder):void {
  for(const [name,text] of Object.entries({length:'length',proto:'__proto__',objectValue:'[object Object]',empty:'',comma:','}))
    b.bundle.fragments.push(stringLiteral('rt.str.'+name,text));
  b.bundle.fragments.push({name:'rt.objectPrototype',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[{offset:O.properties,kind:'va64',target:'rt.objectPrototype.toString',addend:0}]});
  b.data('rt.protoAccessorEnabled',new Uint8Array([1,0,0,0,0,0,0,0]),'.data');
  const arrayProto=new Uint8Array(O.size);arrayProto[0]=1;
  b.bundle.fragments.push({name:'rt.arrayPrototype',section:'.data',alignment:8,bytes:arrayProto,symbols:{},fixups:[{offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},{offset:O.properties,kind:'va64',target:'rt.arrayPrototype.toString',addend:0}]});

  // RCX result Value*, RDX kind (0 object, 1 array), R8 initial array length.
  b.fn('rt.newObject',72,a=>{
    a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
    a.mov('rcx',O.size);a.call('rt.alloc');a.mov('r10',0);
    a.mov('r11',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r11');
    for(const offset of [O.properties,O.stringifying,O.flags])a.store({base:'rax',disp:offset},'r10');
    a.load('r10',slot(48));a.store({base:'rax',disp:O.kind},'r10');
    a.load('r11',slot(56));a.store({base:'rax',disp:O.length},'r11');
    const ordinary=a.unique('ordinary'),save=a.unique('save');a.test('r10','r10');a.jcc('e',ordinary);
    a.lea('r11',{rip:'rt.arrayPrototype'});a.jmp(save);a.label(ordinary);a.lea('r11',{rip:'rt.objectPrototype'});
    a.label(save);a.store({base:'rax',disp:O.prototype},'r11');a.load('rcx',slot(40));
    a.store({base:'rcx',disp:8},'rax');a.mov('rax',5);a.store({base:'rcx'},'rax');
  });

  // Canonical array index from UTF-16 string descriptor. -1 is not an index.
  b.fn('rt.arrayIndex',40,a=>{
    const bad=a.unique('bad'),loop=a.unique('loop'),done=a.unique('done');
    a.load('r8',{base:'rcx'});a.test('r8','r8');a.jcc('e',bad);a.cmp('r8',10);a.jcc('a',bad);
    a.add('rcx',8);a.cmp('r8',1);const single=a.unique('single');a.jcc('e',single);
    a.load('r10',{base:'rcx'},16);a.cmp('r10',48);a.jcc('e',bad);a.label(single);
    a.mov('rax',0);a.mov('r11',10);a.mov('rdx',0xfffffffe);
    a.label(loop);a.load('r10',{base:'rcx'},16);a.sub('r10',48);a.cmp('r10',9);a.jcc('a',bad);
    a.imul('rax','r11');a.add('rax','r10');a.cmp('rax','rdx');a.jcc('a',bad);
    a.add('rcx',2);a.sub('r8',1);a.jcc('ne',loop);a.jmp(done);
    a.label(bad);a.mov('rax',-1);a.label(done);
  });

  // Integer-indexed exotic objects distinguish ordinary names (-1),
  // canonical but invalid numeric names (-2), and usable indices.
  b.bundle.fragments.push(stringLiteral('rt.str.negativeZero','-0'));
  rootedFn(b,'rt.typedArrayNumericIndex',88,[{kind:'pointer',register:'rcx'}],a=>{
    a.store(slot(40),'rcx');a.call('rt.arrayIndex');a.cmp('rax',-1);const done=a.unique('done'),invalid=a.unique('invalid');a.jcc('ne',done);
    a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.str.negativeZero'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',invalid);
    a.load('rcx',slot(40));a.call('rt.parseNumber');a.call('rt.formatNumber');
    a.mov('rdx','rax');a.load('rcx',slot(40));a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',invalid);
    a.mov('rax',-1);a.jmp(done);a.label(invalid);a.mov('rax',-2);a.label(done);
  });

  // RCX object header, RDX key descriptor; RAX property node or null.
  b.fn('rt.findOwnProperty',72,a=>{
    a.store(slot(40),'rdx');a.load('rax',{base:'rcx',disp:O.properties});a.store(slot(48),'rax');
    const loop=a.unique('loop'),done=a.unique('done');a.label(loop);a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',done);
    a.load('rcx',{base:'rax',disp:P.key});a.load('rdx',slot(40));a.call('rt.compareStrings');
    a.test('rax','rax');const next=a.unique('next');a.jcc('ne',next);a.load('rax',slot(48));a.jmp(done);
    a.label(next);a.load('rax',slot(48));a.load('rax',{base:'rax',disp:P.next});a.store(slot(48),'rax');a.jmp(loop);a.label(done);
  });

  // RCX object, RDX key. RAX: node pointer, 0 missing, 1 array length,
  // 2 inherited __proto__ accessor, 3 global alias, 4 string length, 5 string
  // index. RDX is the owner, or the
  // aliased Value* for 3. Synthetic aliases never become property node pointers.
  b.fn('rt.lookupProperty',72,a=>{
    a.store(slot(40),'rdx');a.store(slot(48),'rcx');
    const loop=a.unique('loop'),done=a.unique('done'),normal=a.unique('normal'),next=a.unique('next');
    a.label(loop);a.load('rcx',slot(48));a.test('rcx','rcx');const present=a.unique('present');a.jcc('ne',present);a.mov('rax',0);a.jmp(done);
    a.label(present);a.load('rax',{base:'rcx',disp:O.kind});
    const notTyped=a.unique('notTyped');a.cmp('rax',TypedArrayKind);a.jcc('ne',notTyped);
    const typedMissing=a.unique('typedMissing');a.load('rcx',slot(40));a.call('rt.typedArrayNumericIndex');a.cmp('rax',-1);a.jcc('e',normal);a.cmp('rax',-2);a.jcc('e',typedMissing);
    a.load('rcx',slot(48));a.load('r10',{base:'rcx',disp:TypedArrayLayout.length});a.cmp('rax','r10');a.jcc('ae',typedMissing);
    a.mov('rax',6);a.jmp(done);a.label(typedMissing);a.mov('rax',0);a.jmp(done);
    a.label(notTyped);a.cmp('rax',1);a.jcc('ne',normal);
    a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('ne',normal);
    a.mov('rax',1);a.jmp(done);
    a.label(normal);a.mov('rax',5);a.store(slot(56),'rax');a.load('rax',slot(48));a.store(slot(64),'rax');
    a.lea('rcx',slot(56));a.load('rdx',slot(40));a.call('rt.isStringOwn');
    const nonString=a.unique('nonString');a.test('rax','rax');a.jcc('e',nonString);
    a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');a.mov('rax',4);a.jcc('e',done);a.mov('rax',5);a.jmp(done);
    a.label(nonString);a.load('rcx',slot(48));a.load('rdx',slot(40));a.call('rt.findGlobalBinding');
    const data=a.unique('data');a.test('rax','rax');a.jcc('e',data);a.store(slot(48),'rax');a.mov('rax',3);a.jmp(done);
    a.label(data);a.load('rcx',slot(48));a.load('rdx',slot(40));a.call('rt.findOwnProperty');a.test('rax','rax');a.jcc('ne',done);
    a.load('rcx',slot(48));a.lea('rax',{rip:'rt.objectPrototype'});a.cmp('rcx','rax');a.jcc('ne',next);
    a.load('rax',{rip:'rt.protoAccessorEnabled'});a.test('rax','rax');a.jcc('e',next);
    a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.str.proto'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('ne',next);
    a.mov('rax',2);a.jmp(done);
    a.label(next);a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:O.prototype});a.store(slot(48),'rcx');a.jmp(loop);
    a.label(done);a.load('rdx',slot(48));
  });

  // Explicit prototype literal / inherited __proto__ setter. Reject cycles.
  b.fn('rt.setPrototype',40,a=>{
    const done=a.unique('done'),set=a.unique('set'),loop=a.unique('loop');
    a.load('r10',{base:'rdx'});a.cmp('r10',1);a.mov('rax',0);a.jcc('e',set);
    a.cmp('r10',5);a.jcc('ne',done);a.load('rax',{base:'rdx',disp:8});
    a.label(set);a.load('rcx',{base:'rcx',disp:8});
    a.load('r10',{base:'rcx',disp:O.prototype});a.cmp('rax','r10');a.jcc('e',done);
    a.load('r10',{base:'rcx',disp:O.flags});a.and('r10',1);a.test('r10','r10');failIf(a,'ne','rt.throwTypeError');
    a.lea('r10',{rip:'rt.objectPrototype'});a.cmp('rcx','r10');const mutable=a.unique('mutable');a.jcc('ne',mutable);
    a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');a.label(mutable);
    a.mov('r10','rax');a.label(loop);a.test('r10','r10');const write=a.unique('write');a.jcc('e',write);
    a.cmp('r10','rcx');failIf(a,'e','rt.throwTypeError');a.load('r10',{base:'r10',disp:O.prototype});a.jmp(loop);
    a.label(write);a.store({base:'rcx',disp:O.prototype},'rax');a.label(done);
  });

  // Shared public read/has: arguments are result, base Value, key Value.
  for(const mode of ['get','has'] as const)rootedFn(b,'rt.'+mode+'Property',136,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:80,count:3}],a=>{
    a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
    a.load('rax',{base:'rdx'});a.cmp('rax',mode==='has'?5:1);failIf(a,mode==='has'?'ne':'be','rt.throwTypeError');
    a.lea('rcx',slot(80));a.mov('rdx','r8');a.call('rt.toPropertyKey');a.load('rax',slot(88));a.store(slot(64),'rax');
    const missing=a.unique('missing'),save=a.unique('save'),number=a.unique('number'),string=a.unique('string'),character=a.unique('character'),done=a.unique('done');
    const object=a.unique('object');a.load('rcx',slot(48));a.call('rt.stringBase');a.test('rax','rax');a.jcc('e',object);a.store(slot(72),'rax');
    a.load('rcx',slot(64));a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');const index=a.unique('index');a.jcc('ne',index);
    a.load('r10',slot(72));a.load('rax',{base:'r10'});a.jmp(number);
    a.label(index);a.load('rcx',slot(64));a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',object);
    a.load('r10',slot(72));a.load('r11',{base:'r10'});a.cmp('rax','r11');a.jcc('ae',object);
    if(mode==='has'){a.mov('rax',1);a.jmp(save);}
    a.label(character);a.load('r10',slot(72));a.shl('rax',1);a.add('r10','rax');a.load('rax',{base:'r10',disp:8},16);a.store(slot(104),'rax');
    a.mov('rcx',10);a.call('rt.alloc');a.mov('r10',1);a.store({base:'rax'},'r10');a.load('r10',slot(104));a.store({base:'rax',disp:8},'r10',16);a.jmp(string);
    a.label(object);a.load('rcx',slot(48));a.call('rt.propertyBase');a.mov('rcx','rax');a.load('rdx',slot(64));a.call('rt.lookupProperty');
    if(mode==='has'){
      a.test('rax','rax');a.mov('rax',0);a.jcc('e',save);a.mov('rax',1);a.jmp(save);
    }else{
      a.test('rax','rax');a.jcc('e',missing);
      const notStringLength=a.unique('notStringLength'),notStringIndex=a.unique('notStringIndex');
      a.cmp('rax',4);a.jcc('ne',notStringLength);a.load('rdx',{base:'rdx',disp:BoxLayout.value+8});a.load('rax',{base:'rdx'});a.jmp(number);
      a.label(notStringLength);a.cmp('rax',5);a.jcc('ne',notStringIndex);
      a.load('rdx',{base:'rdx',disp:BoxLayout.value+8});a.store(slot(72),'rdx');a.load('rcx',slot(64));a.call('rt.arrayIndex');a.jmp(character);
      a.label(notStringIndex);a.cmp('rax',1);const notLength=a.unique('notLength');a.jcc('ne',notLength);
      a.load('rax',{base:'rdx',disp:O.length});a.jmp(number);
      a.label(notLength);a.cmp('rax',2);const property=a.unique('property');a.jcc('ne',property);
      a.load('rcx',slot(40));a.load('rdx',slot(48));a.call('rt.getPrototype');a.jmp(done);
      a.label(property);const copy=a.unique('copy'),dataProperty=a.unique('dataProperty'),notTypedIndex=a.unique('notTypedIndex');
      a.cmp('rax',6);a.jcc('ne',notTypedIndex);
      a.load('rcx',slot(64));a.call('rt.arrayIndex');
      a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.load('r10',{base:'rdx',disp:TypedArrayLayout.elementType});
      const byteIndex=a.unique('byteIndex'),wordIndex=a.unique('wordIndex');a.cmp('r10',4);a.jcc('b',byteIndex);a.cmp('r10',6);a.jcc('b',wordIndex);a.shl('rax',2);a.jmp(byteIndex);a.label(wordIndex);a.shl('rax',1);a.label(byteIndex);
      a.load('r11',{base:'rdx',disp:TypedArrayLayout.byteOffset});a.add('rax','r11');
      a.load('rdx',{base:'rdx',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.add('rdx','rax');
      const byteLoad=a.unique('byteLoad'),wordLoad=a.unique('wordLoad'),loaded=a.unique('loaded'),unsigned=a.unique('unsigned');a.cmp('r10',4);a.jcc('b',byteLoad);a.cmp('r10',6);a.jcc('b',wordLoad);a.load('rax',{base:'rdx'},32);a.jmp(loaded);a.label(wordLoad);a.load('rax',{base:'rdx'},16);a.jmp(loaded);a.label(byteLoad);a.load('rax',{base:'rdx'},8);a.label(loaded);
      a.cmp('r10',2);const signed16=a.unique('signed16');a.jcc('ne',signed16);a.shl('rax',56);a.sar('rax',56);a.jmp(unsigned);
      a.label(signed16);a.cmp('r10',5);const signed32=a.unique('signed32');a.jcc('ne',signed32);a.shl('rax',48);a.sar('rax',48);a.jmp(unsigned);
      a.label(signed32);a.cmp('r10',7);a.jcc('ne',unsigned);a.shl('rax',32);a.sar('rax',32);a.label(unsigned);a.jmp(number);
      a.label(notTypedIndex);a.cmp('rax',3);a.jcc('e',copy);
      a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.accessor);a.test('r10','r10');a.jcc('e',dataProperty);
      a.mov('r10','rax');copyValue(a,slot(96),{base:'r10',disp:P.getter});a.load('rax',slot(96));a.test('rax','rax');a.jcc('e',missing);
      a.load('rdx',slot(48));copyValue(a,slot(112),{base:'rdx'});a.lea('rax',slot(112));a.store(slot(32),'rax');
      a.load('rcx',slot(40));a.lea('rdx',slot(96));a.mov('r8',0);a.lea('r9',{rip:'rt.undefinedValue'});a.call('rt.invoke');a.jmp(done);
      a.label(dataProperty);a.lea('rdx',{base:'rax',disp:P.value});
      a.label(copy);a.load('rcx',slot(40));a.load('rax',{base:'rdx'});a.cmp('rax',CellTag);
      const ordinary=a.unique('ordinary');a.jcc('ne',ordinary);a.call('rt.readCell');a.jmp(done);
      a.label(ordinary);copyValue(a,{base:'rcx'},{base:'rdx'});a.jmp(done);
    }
    a.label(missing);a.mov('rax',0);a.mov('r10',mode==='has'?2:0);a.jmp(save+'.tag');
    a.label(number);
    if(mode==='has'){a.mov('rax',1);a.jmp(save);}else{a.cvtsi2sd('xmm0','rax');a.movqFromXmm('rax','xmm0');a.mov('r10',3);a.jmp(save+'.tag');}
    a.label(string);a.mov('r10',4);a.jmp(save+'.tag');
    a.label(save);a.mov('r10',2);a.label(save+'.tag');a.load('rcx',slot(40));a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');a.label(done);
  });

  // RCX base Value, RDX key (already normalized), R8 source Value, R9 define flag.
  rootedFn(b,'rt.setProperty',168,[{kind:'value',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:96,count:4}],a=>{
    a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(88),'r9');a.and('r9',1);a.store(slot(64),'r9');
    const rejected=a.unique('rejected'),finish=a.unique('finish'),done=a.unique('done'),normal=a.unique('normal'),write=a.unique('write'),create=a.unique('create'),setter=a.unique('setter'),primitive=a.unique('primitive');
    a.load('rax',{base:'rcx'});a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');a.cmp('rax',5);a.jcc('ne',primitive);
    a.load('rdx',{base:'rdx',disp:8});a.call('rt.isStringOwn');a.test('rax','rax');a.jcc('ne',rejected);
    a.load('rcx',slot(40));a.load('rdx',slot(48));
    a.load('rax',{base:'rcx',disp:8});a.store(slot(72),'rax');a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',1);a.jcc('ne',normal);
    a.load('rcx',{base:'rdx',disp:8});a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('ne',normal);
    a.load('rcx',slot(72));a.load('rax',{base:'rcx',disp:O.flags});a.and('rax',2);a.test('rax','rax');a.jcc('ne',rejected);a.load('rdx',slot(56));a.call('rt.setArrayLength');a.test('rax','rax');a.jcc('e',rejected);a.jmp(done);
    a.label(normal);const ordinaryObject=a.unique('ordinaryObject');a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);a.jcc('ne',ordinaryObject);
    a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:8});a.call('rt.typedArrayNumericIndex');a.cmp('rax',-1);a.jcc('e',ordinaryObject);a.cmp('rax',-2);a.jcc('e',rejected);
    a.load('r10',slot(72));a.load('r11',{base:'r10',disp:TypedArrayLayout.length});a.cmp('rax','r11');a.jcc('ae',rejected);a.store(slot(80),'rax');
    const regularByte=a.unique('regularByte'),byteReady=a.unique('byteReady');a.load('r10',slot(72));a.load('rax',{base:'r10',disp:TypedArrayLayout.elementType});a.cmp('rax',3);a.jcc('ne',regularByte);
    a.load('rcx',slot(56));a.call('rt.toUint8Clamp');a.jmp(byteReady);
    a.label(regularByte);a.load('rcx',slot(56));a.call('rt.toInt32');a.load('r10',slot(72));a.load('r10',{base:'r10',disp:TypedArrayLayout.elementType});const mask16=a.unique('mask16'),mask32=a.unique('mask32');a.cmp('r10',4);a.jcc('ae',mask16);a.and('rax',255);a.jmp(byteReady);a.label(mask16);a.cmp('r10',6);a.jcc('ae',mask32);a.and('rax',65535);a.jmp(byteReady);a.label(mask32);a.mov('r10',0xffffffffn);a.and('rax','r10');a.label(byteReady);a.store(slot(80),'rax');
    a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:8});a.call('rt.arrayIndex');
    a.load('r10',slot(72));a.load('r11',{base:'r10',disp:TypedArrayLayout.elementType});const byteAddress=a.unique('byteAddress'),wordAddress=a.unique('wordAddress');a.cmp('r11',4);a.jcc('b',byteAddress);a.cmp('r11',6);a.jcc('b',wordAddress);a.shl('rax',2);a.jmp(byteAddress);a.label(wordAddress);a.shl('rax',1);a.label(byteAddress);a.load('r11',{base:'r10',disp:TypedArrayLayout.byteOffset});a.add('rax','r11');
    a.load('rdx',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.add('rdx','rax');
    a.load('rax',slot(80));a.load('r10',{base:'r10',disp:TypedArrayLayout.elementType});const storeByte=a.unique('storeByte'),storeWord=a.unique('storeWord');a.cmp('r10',4);a.jcc('b',storeByte);a.cmp('r10',6);a.jcc('b',storeWord);a.store({base:'rdx'},'rax',32);a.jmp(done);a.label(storeWord);a.store({base:'rdx'},'rax',16);a.jmp(done);a.label(storeByte);a.store({base:'rdx'},'rax',8);a.jmp(done);
    a.label(ordinaryObject);a.load('rcx',slot(72));a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.findGlobalBinding');
    const own=a.unique('own');a.test('rax','rax');a.jcc('e',own);a.load('r10',{base:'rdx'});a.and('r10',A.writable);a.test('r10','r10');a.jcc('e',rejected);a.mov('rcx','rax');a.load('rdx',slot(56));copyValue(a,{base:'rcx'},{base:'rdx'});a.jmp(done);
    a.label(own);a.load('rcx',slot(72));a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.findOwnProperty');
    a.test('rax','rax');a.jcc('ne',write);
    a.load('r10',slot(64));a.test('r10','r10');a.jcc('ne',create);
    a.load('rcx',slot(72));a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.lookupProperty');a.cmp('rax',2);
    const inherited=a.unique('inherited');a.jcc('ne',inherited);
    a.load('rcx',slot(40));a.load('rdx',slot(56));a.call('rt.setPrototype');a.jmp(done);
    a.label(inherited);const notArrayLength=a.unique('notArrayLength'),notAlias=a.unique('notAlias');
    a.cmp('rax',1);a.jcc('ne',notArrayLength);a.load('r10',{base:'rdx',disp:O.flags});a.and('r10',2);a.test('r10','r10');a.jcc('ne',rejected);a.jmp(create);
    a.label(notArrayLength);a.cmp('rax',3);a.jcc('ne',notAlias);a.lea('rcx',{rip:'rt.globalObject'});a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.findGlobalBinding');a.load('r10',{base:'rdx'});a.and('r10',A.writable);a.test('r10','r10');a.jcc('e',rejected);a.jmp(create);
    a.label(notAlias);a.cmp('rax',3);a.jcc('be',create);
    a.cmp('rax',5);a.jcc('be',rejected);
    a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.accessor);a.test('r10','r10');a.jcc('ne',setter);
    a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.writable);a.test('r10','r10');a.jcc('e',rejected);
    a.label(create);const extensible=a.unique('extensible');a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.flags});a.and('rax',1);a.test('rax','rax');a.jcc('ne',rejected);
    a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('ne',extensible);a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:8});a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',extensible);
    a.load('r10',slot(72));a.load('r11',{base:'r10',disp:O.length});a.cmp('rax','r11');a.jcc('b',extensible);a.load('r10',{base:'r10',disp:O.flags});a.and('r10',2);a.test('r10','r10');a.jcc('ne',rejected);
    a.label(extensible);a.mov('rcx',P.size);a.call('rt.alloc');
    a.mov('r10',0);for(const offset of [P.value,P.value+8,P.getter,P.getter+8,P.setter,P.setter+8])a.store({base:'rax',disp:offset},'r10');
    a.mov('r10',A.ordinary);a.store({base:'rax',disp:P.attributes},'r10');
    a.mov('r10',HeapKind.property);a.store({base:'rax',disp:H.kind-H.size},'r10');
    a.load('r10',slot(72));a.load('r11',{base:'r10',disp:O.properties});a.store({base:'rax',disp:P.next},'r11');a.store({base:'r10',disp:O.properties},'rax');
    a.load('r10',slot(48));a.load('r10',{base:'r10',disp:8});a.store({base:'rax',disp:P.key},'r10');
    a.label(write);a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.accessor);a.test('r10','r10');a.jcc('ne',setter);
    a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.writable);a.test('r10','r10');a.jcc('e',rejected);
    a.lea('rcx',{base:'rax',disp:P.value});a.load('rdx',slot(56));a.load('r10',{base:'rcx'});a.cmp('r10',CellTag);
    const ordinaryWrite=a.unique('ordinaryWrite'),afterWrite=a.unique('afterWrite');a.jcc('ne',ordinaryWrite);
    a.call('rt.writeCell');a.jmp(afterWrite);a.label(ordinaryWrite);copyValue(a,{base:'rcx'},{base:'rdx'});a.label(afterWrite);
    a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('ne',done);
    a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:8});a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',done);
    a.load('r10',slot(72));a.load('r11',{base:'r10',disp:O.length});a.cmp('rax','r11');a.jcc('b',done);a.add('rax',1);a.store({base:'r10',disp:O.length},'rax');a.jmp(done);
    a.label(primitive);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.isStringOwn');a.test('rax','rax');a.jcc('ne',rejected);
    a.load('rcx',slot(40));a.call('rt.propertyBase');a.mov('rcx','rax');a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.lookupProperty');
    a.cmp('rax',5);a.jcc('be',rejected);a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.accessor);a.test('r10','r10');a.jcc('e',rejected);
    a.label(setter);a.load('r10',slot(64));a.test('r10','r10');const invokeSetter=a.unique('invokeSetter');a.jcc('e',invokeSetter);
    // Internal CreateDataProperty replaces a configurable accessor instead of
    // invoking it. Public descriptor validation is implemented separately.
    a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.configurable);a.test('r10','r10');failIf(a,'e','rt.throwTypeError');
    a.mov('r10',A.ordinary);a.store({base:'rax',disp:P.attributes},'r10');a.mov('r10',0);
    for(const offset of [P.getter,P.getter+8,P.setter,P.setter+8])a.store({base:'rax',disp:offset},'r10');a.jmp(write);
    a.label(invokeSetter);a.mov('r10','rax');copyValue(a,slot(112),{base:'r10',disp:P.setter});a.load('rax',slot(112));a.test('rax','rax');a.jcc('e',rejected);
    a.load('rdx',slot(40));copyValue(a,slot(128),{base:'rdx'});a.load('rdx',slot(56));copyValue(a,slot(144),{base:'rdx'});
    a.lea('rax',slot(128));a.store(slot(32),'rax');a.lea('rcx',slot(96));a.lea('rdx',slot(112));a.mov('r8',1);a.lea('r9',slot(144));a.call('rt.invoke');a.label(done);a.jmp(finish);a.label(rejected);a.load('rax',slot(88));a.and('rax',2);a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');a.label(finish);
  });

  rootedFn(b,'rt.deleteProperty',136,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:80,count:1}],a=>{
    a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
    a.load('rax',{base:'rdx'});a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
    const yes=a.unique('yes'),no=a.unique('no'),save=a.unique('save'),object=a.unique('object'),loop=a.unique('loop'),next=a.unique('next');
    a.lea('rcx',slot(80));a.mov('rdx','r8');a.call('rt.toPropertyKey');a.load('rax',slot(88));a.store(slot(64),'rax');
    a.load('rcx',slot(48));a.mov('rdx','rax');a.call('rt.isStringOwn');a.test('rax','rax');a.jcc('ne',no);
    a.load('rdx',slot(48));a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('e',object);a.cmp('rax',4);a.jcc('ne',yes);
    a.load('rax',{base:'rdx',disp:8});a.store(slot(72),'rax');
    a.load('rcx',slot(64));a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',no);
    a.load('rcx',slot(64));a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',yes);a.load('r10',slot(72));a.load('r10',{base:'r10'});a.cmp('rax','r10');a.jcc('b',no);a.jmp(yes);
    a.label(object);a.load('rax',{base:'rdx',disp:8});a.store(slot(72),'rax');a.load('r10',{base:'rax',disp:O.kind});
    const notTyped=a.unique('notTyped');a.cmp('r10',TypedArrayKind);a.jcc('ne',notTyped);
    a.load('rcx',slot(64));a.call('rt.typedArrayNumericIndex');a.cmp('rax',-1);a.jcc('e',notTyped);a.cmp('rax',-2);a.jcc('e',yes);
    a.load('r10',slot(72));a.load('r10',{base:'r10',disp:TypedArrayLayout.length});a.cmp('rax','r10');a.jcc('b',no);a.jmp(yes);
    a.label(notTyped);a.load('r10',slot(72));a.load('r10',{base:'r10',disp:O.kind});a.cmp('r10',1);const scan=a.unique('scan');a.jcc('ne',scan);
    a.load('rcx',slot(64));a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',no);
    a.label(scan);a.load('rcx',slot(72));a.load('rdx',slot(64));a.call('rt.findGlobalBinding');a.test('rax','rax');a.jcc('ne',no);
    a.load('rax',slot(72));a.lea('r10',{rip:'rt.objectPrototype'});a.cmp('rax','r10');const dataOnly=a.unique('dataOnly');a.jcc('ne',dataOnly);
    a.load('rcx',slot(64));a.lea('rdx',{rip:'rt.str.proto'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('ne',dataOnly);
    a.mov('rax',0);a.store({rip:'rt.protoAccessorEnabled'},'rax');
    a.label(dataOnly);
    a.load('rax',slot(72));a.add('rax',O.properties);a.store(slot(104),'rax');
    a.label(loop);a.load('r10',slot(104));a.load('rax',{base:'r10'});a.test('rax','rax');a.jcc('e',yes);a.store(slot(112),'rax');
    a.load('rcx',{base:'rax',disp:P.key});a.load('rdx',slot(64));a.call('rt.compareStrings');a.test('rax','rax');a.jcc('ne',next);
    a.load('rax',slot(112));a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.configurable);a.test('r10','r10');a.jcc('e',no);
    a.load('rax',{base:'rax',disp:P.next});a.load('r10',slot(104));a.store({base:'r10'},'rax');
    // Detached static nodes are still visited by the GC root table. Clear all
    // edges so deleting a reassigned builtin property releases the former value.
    a.load('r11',slot(112));a.mov('rax',0);
    for(const offset of [P.next,P.key,P.value,P.value+8,P.getter,P.getter+8,P.setter,P.setter+8])a.store({base:'r11',disp:offset},'rax');
    a.jmp(yes);
    a.label(next);a.load('rax',slot(112));a.add('rax',P.next);a.store(slot(104),'rax');a.jmp(loop);
    a.label(no);a.mov('rax',0);a.jmp(save);a.label(yes);a.mov('rax',1);a.label(save);
    a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',2);a.store({base:'rcx'},'rax');
  });
}
