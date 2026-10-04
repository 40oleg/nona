import {RuntimeBuilder,slot,failIf} from './abi.js';
import {bumpEpochIfPrototype} from './property-cache.js';
import {rootedFn} from './root-scope.js';
import {propertyIndexThreshold} from './property-index.js';
import {stringLiteral} from './value.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';
import {CellTag} from './environment-layout.js';
import {BoxLayout} from './boxing.js';
import {TypedArrayKind,TypedArrayLayout} from './typed-array.js';
import {ArrayBufferLayout} from './array-buffer.js';
import {ProxyKind} from './proxy.js';
import {ElementsLayout as E,HoleTag} from './array-elements.js';
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
    // Canonical numeric strings start with a digit, '-', 'I'(nfinity) or 'N'(aN);
    // other names (length, buffer, methods) skip the number round trip.
    const numeric=a.unique('numeric');a.load('rcx',slot(40));a.load('r10',{base:'rcx'});a.test('r10','r10');a.jcc('e',done);
    a.load('r10',{base:'rcx',disp:8},16);
    for(const c of ['-','I','N'])a.cmp('r10',c.charCodeAt(0)),a.jcc('e',numeric);
    a.sub('r10',48);a.cmp('r10',9);a.jcc('a',done);
    a.label(numeric);a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.str.negativeZero'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',invalid);
    a.load('rcx',slot(40));a.call('rt.parseNumber');a.call('rt.formatNumber');
    a.mov('rdx','rax');a.load('rcx',slot(40));a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',invalid);
    a.mov('rax',-1);a.jmp(done);a.label(invalid);a.mov('rax',-2);a.label(done);
  });

  // RCX object header, RDX key descriptor; RAX property node or null.
  // Objects with an index table (property-index.ts) look keys up there; a
  // long linear scan builds one.
  b.fn('rt.findOwnProperty',88,a=>{
    a.store(slot(40),'rdx');a.store(slot(56),'rcx');a.load('rax',{base:'rcx',disp:O.properties});a.store(slot(48),'rax');a.mov('rax',0);a.store(slot(64),'rax');
    const loop=a.unique('loop'),done=a.unique('done'),scan=a.unique('scan'),finish=a.unique('finish');
    // A dense element (array-elements.ts) becomes a node for whoever needs one.
    {const noDense=a.unique('noDense');a.call('rt.denseFind');a.test('rax','rax');a.jcc('e',noDense);a.load('rcx',slot(56));a.call('rt.elementsMaterialize');a.jmp(finish);a.label(noDense);a.load('rcx',slot(56));}
    a.load('r10',{base:'rcx',disp:O.index});a.test('r10','r10');a.jcc('e',scan);
    a.call('rt.propIndexFind');a.jmp(finish);
    a.label(scan);a.label(loop);a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',done);
    a.load('r10',slot(64));a.add('r10',1);a.store(slot(64),'r10');
    // Same record, or same length and then the same code units (a symbol has
    // length -1 and is only equal to itself).
    const next=a.unique('next'),hit=a.unique('hit');
    a.load('rcx',{base:'rax',disp:P.key});a.load('rdx',slot(40));a.cmp('rcx','rdx');a.jcc('e',hit);
    a.load('r8',{base:'rcx'});a.load('r9',{base:'rdx'});a.cmp('r8','r9');a.jcc('ne',next);a.cmp('r8',-1);a.jcc('e',next);
    a.call('rt.compareStrings');a.test('rax','rax');a.jcc('ne',next);
    a.label(hit);a.load('rax',slot(48));a.jmp(done);
    a.label(next);a.load('rax',slot(48));a.load('rax',{base:'rax',disp:P.next});a.store(slot(48),'rax');a.jmp(loop);
    a.label(done);a.store(slot(72),'rax');
    const small=a.unique('small');a.load('r10',slot(64));a.cmp('r10',propertyIndexThreshold);a.jcc('b',small);
    a.load('rcx',slot(56));a.call('rt.propIndexBuild');
    a.label(small);a.load('rax',slot(72));a.label(finish);
  });

  // RCX object, RDX key. RAX: node pointer, 0 missing, 1 array length,
  // 2 inherited __proto__ accessor, 3 global alias, 4 string length, 5 string
  // index, 6 typed array element, 7 dense element (R8 its Value*). RDX is the
  // owner, or the aliased Value* for 3. Synthetic aliases never become
  // property node pointers.
  b.fn('rt.lookupProperty',72,a=>{
    a.store(slot(40),'rdx');a.store(slot(48),'rcx');
    const loop=a.unique('loop'),done=a.unique('done'),normal=a.unique('normal'),next=a.unique('next');
    a.label(loop);a.load('rcx',slot(48));a.test('rcx','rcx');const present=a.unique('present');a.jcc('ne',present);a.mov('rax',0);a.jmp(done);
    a.label(present);a.load('rax',{base:'rcx',disp:O.kind});
    const notTyped=a.unique('notTyped');a.cmp('rax',TypedArrayKind);a.jcc('ne',notTyped);
    const typedMissing=a.unique('typedMissing');a.load('rcx',slot(40));a.call('rt.typedArrayNumericIndex');a.cmp('rax',-1);a.jcc('e',normal);a.cmp('rax',-2);a.jcc('e',typedMissing);
    a.load('rcx',slot(48));a.load('r10',{base:'rcx',disp:TypedArrayLayout.buffer});a.load('r10',{base:'r10',disp:ArrayBufferLayout.detached});a.test('r10','r10');a.jcc('ne',typedMissing);a.load('r10',{base:'rcx',disp:TypedArrayLayout.length});a.cmp('rax','r10');a.jcc('ae',typedMissing);
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
    a.label(data);const scanOwn=a.unique('scanOwn'),afterOwn=a.unique('afterOwn');
    {const noDense=a.unique('noDense');a.load('rcx',slot(48));a.load('rdx',slot(40));a.call('rt.denseFind');a.test('rax','rax');a.jcc('e',noDense);a.mov('r8','rax');a.mov('rax',7);a.jmp(done);a.label(noDense);}
    a.load('r10',slot(48));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('ne',scanOwn);
    a.load('rcx',slot(40));a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',scanOwn);
    a.load('r10',slot(48));a.load('r10',{base:'r10',disp:O.length});a.cmp('rax','r10');a.jcc('b',scanOwn);
    a.mov('rax',0);a.jmp(afterOwn);
    a.label(scanOwn);a.load('rcx',slot(48));a.load('rdx',slot(40));a.call('rt.findOwnProperty');
    a.label(afterOwn);a.test('rax','rax');a.jcc('ne',done);
    a.load('rcx',slot(48));a.lea('rax',{rip:'rt.objectPrototype'});a.cmp('rcx','rax');a.jcc('ne',next);
    a.load('rax',{rip:'rt.protoAccessorEnabled'});a.test('rax','rax');a.jcc('e',next);
    a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.str.proto'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('ne',next);
    a.mov('rax',2);a.jmp(done);
    a.label(next);a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:O.prototype});a.store(slot(48),'rcx');a.jmp(loop);
    a.label(done);a.load('rdx',slot(48));
  });

  // Explicit prototype literal / inherited __proto__ setter. Reject cycles.
  rootedFn(b,'rt.setPrototype',40,[{kind:'value',register:'rcx'},{kind:'value',register:'rdx'}],a=>{
    a.load('r10',{base:'rcx'});a.cmp('r10',5);const ordinaryBase=a.unique('ordinaryBase');a.jcc('ne',ordinaryBase);
    a.load('r10',{base:'rcx',disp:8});a.load('r10',{base:'r10',disp:O.kind});a.cmp('r10',ProxyKind);a.jcc('ne',ordinaryBase);
    a.call('rt.proxySetPrototype');a.test('rax','rax');failIf(a,'e','rt.throwTypeError');const proxyDone=a.unique('proxyDone');a.jmp(proxyDone);a.label(ordinaryBase);
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
    a.label(write);a.store({base:'rcx',disp:O.prototype},'rax');bumpEpochIfPrototype(a,'rcx');a.label(done);a.label(proxyDone);
  });

  // Preserve the initial receiver through proxy forwarding and accessor calls.
  // Integer-indexed typed array access with a Number key avoids converting the
  // key to a string (ToPropertyKey) and back (CanonicalNumericIndexString).
  // Sets R11 to the element address and R10 to the element type, or jumps to slow.
  const typedElement=(a:Assembler,object:'rcx'|'rdx',key:'rdx'|'r8',slow:string):void=>{
    a.load('rax',{base:object});a.cmp('rax',5);a.jcc('ne',slow);
    a.load('r10',{base:object,disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);a.jcc('ne',slow);
    a.load('rax',{base:key});a.cmp('rax',3);a.jcc('ne',slow);
    a.movsd('xmm0',{base:key,disp:8});a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ne',slow);a.jcc('p',slow);
    a.test('rax','rax');a.jcc('s',slow);
    a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('r9',{base:'r11',disp:ArrayBufferLayout.detached});a.test('r9','r9');a.jcc('ne',slow);
    a.load('r9',{base:'r10',disp:TypedArrayLayout.length});a.cmp('rax','r9');a.jcc('ae',slow);
    a.load('r9',{base:'r11',disp:ArrayBufferLayout.bytes});a.load('r11',{base:'r10',disp:TypedArrayLayout.byteOffset});a.add('r9','r11');
    a.load('r10',{base:'r10',disp:TypedArrayLayout.elementType});a.cmp('r10',10);a.jcc('ae',slow);
    const scaled=a.unique('scaled'),two=a.unique('two'),eight=a.unique('eight');
    a.cmp('r10',4);a.jcc('b',scaled);a.cmp('r10',6);a.jcc('b',two);a.cmp('r10',9);a.jcc('e',eight);a.shl('rax',2);a.jmp(scaled);
    a.label(eight);a.shl('rax',3);a.jmp(scaled);a.label(two);a.shl('rax',1);a.label(scaled);
    a.mov('r11','r9');a.add('r11','rax');
  };
  b.fn('rt.getProperty',40,a=>{
    const slow=a.unique('slow'),done=a.unique('done'),named=a.unique('named'),indexed=a.unique('indexed'),typed=a.unique('typed');
    // A string key can only be a named property or a string-keyed index of
    // the indexed path; a Number key only an element: try the matching one.
    a.load('rax',{base:'r8'});a.cmp('rax',4);a.jcc('e',named);
    a.label(indexed);a.call('rt.arrayGetFast');a.test('rax','rax');a.jcc('ne',done);a.jmp(typed);
    a.label(named);a.call('rt.namedGetFast');a.test('rax','rax');a.jcc('ne',done);a.call('rt.arrayGetFast');a.test('rax','rax');a.jcc('ne',done);
    a.label(typed);typedElement(a,'rdx','r8',slow);
    const f32=a.unique('f32'),f64=a.unique('f64'),int=a.unique('int'),store=a.unique('store');
    a.cmp('r10',8);a.jcc('e',f32);a.cmp('r10',9);a.jcc('e',f64);
    const b16=a.unique('b16'),b32=a.unique('b32');
    a.cmp('r10',4);a.jcc('ae',b16);a.load('rax',{base:'r11'},8);a.cmp('r10',2);a.jcc('ne',int);a.shl('rax',56);a.sar('rax',56);a.jmp(int);
    a.label(b16);a.cmp('r10',6);a.jcc('ae',b32);a.load('rax',{base:'r11'},16);a.cmp('r10',5);a.jcc('ne',int);a.shl('rax',48);a.sar('rax',48);a.jmp(int);
    a.label(b32);a.load('rax',{base:'r11'},32);a.cmp('r10',7);a.jcc('ne',int);a.shl('rax',32);a.sar('rax',32);
    a.label(int);a.cvtsi2sd('xmm0','rax');a.jmp(store);
    a.label(f32);a.cvtss2sd('xmm0',{base:'r11'});a.jmp(store);
    a.label(f64);a.movsd('xmm0',{base:'r11'});
    a.label(store);a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');a.jmp(done);
    a.label(slow);a.mov('r9','rdx');a.call('rt.getPropertyWithReceiver');a.label(done);
  });
  // Unary propertyKeyIndex: Numbers are kept, everything else is ToPropertyKey.
  b.fn('rt.toPropertyKeyIndex',40,a=>{
    const convert=a.unique('convert'),done=a.unique('done');
    a.load('rax',{base:'rdx'});a.cmp('rax',3);a.jcc('ne',convert);
    a.store({base:'rcx'},'rax');a.load('rax',{base:'rdx',disp:8});a.store({base:'rcx',disp:8},'rax');a.jmp(done);
    a.label(convert);a.call('rt.toPropertyKey');a.label(done);
  });
  b.fn('rt.setProperty',72,a=>{
    const slow=a.unique('slow'),done=a.unique('done'),named=a.unique('named'),indexed=a.unique('indexed'),typed=a.unique('typed');
    a.load('rax',{base:'rdx'});a.cmp('rax',4);a.jcc('e',named);
    a.label(indexed);a.call('rt.arraySetFast');a.test('rax','rax');a.jcc('ne',done);a.jmp(typed);
    a.label(named);a.call('rt.namedSetFast');a.test('rax','rax');a.jcc('ne',done);a.call('rt.arraySetFast');a.test('rax','rax');a.jcc('ne',done);
    a.label(typed);
    // Only [[Set]] (not definitions) of finite Numbers into non-clamped, non-BigInt arrays.
    a.store(slot(32),'r8');a.store(slot(40),'r9');
    a.mov('rax','r9');a.and('rax',1);a.test('rax','rax');a.jcc('ne',slow);
    a.load('rax',{base:'r8'});a.cmp('rax',3);a.jcc('ne',slow);
    typedElement(a,'rcx','rdx',slow);
    a.load('r8',slot(32));a.movsd('xmm0',{base:'r8',disp:8});
    const f32=a.unique('f32'),f64=a.unique('f64'),b16=a.unique('b16'),b32=a.unique('b32');
    a.cmp('r10',3);a.jcc('e',slow);a.cmp('r10',8);a.jcc('e',f32);a.cmp('r10',9);a.jcc('e',f64);
    a.cvttsd2si('rax','xmm0');a.mov('r9',0x8000000000000000n);a.cmp('rax','r9');a.jcc('e',slow);
    a.cmp('r10',4);a.jcc('ae',b16);a.store({base:'r11'},'rax',8);a.jmp(done);
    a.label(b16);a.cmp('r10',6);a.jcc('ae',b32);a.store({base:'r11'},'rax',16);a.jmp(done);
    a.label(b32);a.store({base:'r11'},'rax',32);a.jmp(done);
    a.label(f32);a.cvtsd2ss('xmm0','xmm0');a.movqFromXmm('rax','xmm0');a.store({base:'r11'},'rax',32);a.jmp(done);
    a.label(f64);a.storesd({base:'r11'},'xmm0');a.jmp(done);
    a.label(slow);
    // Plain assignments pass the raw key (converted here, after the right-hand
    // side, as before); read-modify-write references may pass a Number.
    const stringKey=a.unique('stringKey');a.load('rax',{base:'rdx'});a.cmp('rax',4);a.jcc('e',stringKey);a.cmp('rax',6);a.jcc('e',stringKey);
    a.store(slot(48),'rcx');a.lea('rcx',slot(56));a.call('rt.toPropertyKey');a.load('rcx',slot(48));a.lea('rdx',slot(56));
    a.label(stringKey);a.load('r8',slot(32));a.load('r9',slot(40));a.call('rt.setPropertySlow');a.label(done);
  });
  // Shared public read/has: arguments are result, base Value, key Value.
  for(const mode of ['get','has'] as const)rootedFn(b,mode==='get'?'rt.getPropertyWithReceiver':'rt.hasProperty',mode==='get'?152:136,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},...(mode==='get'?[{kind:'value' as const,register:'r9' as const}]:[]),{kind:'locals',offset:80,count:mode==='get'?4:3}],a=>{
    a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
    if(mode==='get')copyValue(a,slot(128),{base:'r9'});
    a.load('rax',{base:'rdx'});a.cmp('rax',mode==='has'?5:1);failIf(a,mode==='has'?'ne':'be','rt.throwTypeError');
    if(mode==='has'){const slowHas=a.unique('slowHas');a.lea('rcx',slot(80));a.call('rt.arrayGetFast');a.test('rax','rax');a.jcc('e',slowHas);a.load('rcx',slot(40));a.mov('rax',2);a.store({base:'rcx'},'rax');a.mov('rax',1);a.store({base:'rcx',disp:8},'rax');a.jmp('rt.hasProperty.done');a.label(slowHas);a.load('rdx',slot(48));a.load('r8',slot(56));}
    a.lea('rcx',slot(80));a.mov('rdx','r8');a.call('rt.toPropertyKey');a.load('rax',slot(88));a.store(slot(64),'rax');
    const missing=a.unique('missing'),save=a.unique('save'),number=a.unique('number'),string=a.unique('string'),character=a.unique('character'),done=a.unique('done');
    {
      const ordinaryBase=a.unique('ordinaryBase');a.load('r10',slot(48));a.load('rax',{base:'r10'});a.cmp('rax',5);a.jcc('ne',ordinaryBase);
      a.load('r10',{base:'r10',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('ne',ordinaryBase);
      a.load('rcx',slot(40));a.load('rdx',slot(48));a.lea('r8',slot(80));if(mode==='get')a.lea('r9',slot(128));a.call(mode==='get'?'rt.proxyGet':'rt.proxyHas');a.jmp(done);a.label(ordinaryBase);
    }
    const object=a.unique('object');a.load('rcx',slot(48));a.call('rt.stringBase');a.test('rax','rax');a.jcc('e',object);a.store(slot(72),'rax');
    a.load('rcx',slot(64));a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');const index=a.unique('index');a.jcc('ne',index);
    a.load('r10',slot(72));a.load('rax',{base:'r10'});a.jmp(number);
    a.label(index);a.load('rcx',slot(64));a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',object);
    a.load('r10',slot(72));a.load('r11',{base:'r10'});a.cmp('rax','r11');a.jcc('ae',object);
    if(mode==='has'){a.mov('rax',1);a.jmp(save);}
    a.label(character);a.load('r10',slot(72));a.shl('rax',1);a.add('r10','rax');a.load('rax',{base:'r10',disp:8},16);a.store(slot(104),'rax');
    a.mov('rcx',10);a.call('rt.alloc');a.mov('r10',1);a.store({base:'rax'},'r10');a.load('r10',slot(104));a.store({base:'rax',disp:8},'r10',16);a.jmp(string);
    a.label(object);
    // Ordinary own properties before a proxy in the prototype chain win;
    // otherwise hand [[Get]]/[[HasProperty]] to that proxy.
    a.load('rcx',slot(48));a.call('rt.propertyBase');a.store(slot(72),'rax');
    const ancestor=a.unique('ancestor'),nextAncestor=a.unique('nextAncestor'),ordinaryLookup=a.unique('ordinaryLookup'),proxyAncestor=a.unique('proxyAncestor');
    a.label(ancestor);a.load('r10',slot(72));a.test('r10','r10');a.jcc('e',ordinaryLookup);
    a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('e',proxyAncestor);
    a.cmp('rax',1);const checkTyped=a.unique('checkTyped');a.jcc('ne',checkTyped);
    a.load('rcx',slot(64));a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',ordinaryLookup);
    a.label(checkTyped);a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);const checkOwn=a.unique('checkOwn');a.jcc('ne',checkOwn);
    a.load('rcx',slot(64));a.call('rt.typedArrayNumericIndex');a.cmp('rax',-1);a.jcc('ne',ordinaryLookup);
    a.label(checkOwn);a.load('rcx',slot(72));a.load('rdx',slot(64));a.call('rt.denseFind');a.test('rax','rax');a.jcc('ne',ordinaryLookup);
    a.load('rcx',slot(72));a.load('rdx',slot(64));a.call('rt.findOwnProperty');a.test('rax','rax');a.jcc('ne',ordinaryLookup);
    a.load('rcx',slot(72));a.load('rdx',slot(64));a.call('rt.findGlobalBinding');a.test('rax','rax');a.jcc('ne',ordinaryLookup);
    a.label(nextAncestor);a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.prototype});a.store(slot(72),'rax');a.jmp(ancestor);
    a.label(proxyAncestor);a.mov('rax',5);a.store(slot(96),'rax');a.load('rax',slot(72));a.store(slot(104),'rax');
    a.load('rcx',slot(40));a.lea('rdx',slot(96));a.lea('r8',slot(80));if(mode==='get')a.lea('r9',slot(128));a.call(mode==='get'?'rt.proxyGet':'rt.proxyHas');a.jmp(done);
    a.label(ordinaryLookup);a.load('rcx',slot(48));a.call('rt.propertyBase');a.mov('rcx','rax');a.load('rdx',slot(64));a.call('rt.lookupProperty');
    if(mode==='has'){
      a.test('rax','rax');a.mov('rax',0);a.jcc('e',save);a.mov('rax',1);a.jmp(save);
    }else{
      a.test('rax','rax');a.jcc('e',missing);
      {const notDense=a.unique('notDense');a.cmp('rax',7);a.jcc('ne',notDense);a.load('rcx',slot(40));copyValue(a,{base:'rcx'},{base:'r8'});a.jmp(done);a.label(notDense);}
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
      const byteIndex=a.unique('byteIndex'),wordIndex=a.unique('wordIndex'),doubleIndex=a.unique('doubleIndex');a.cmp('r10',4);a.jcc('b',byteIndex);a.cmp('r10',6);a.jcc('b',wordIndex);a.cmp('r10',9);a.jcc('ae',doubleIndex);a.shl('rax',2);a.jmp(byteIndex);a.label(doubleIndex);a.shl('rax',3);a.jmp(byteIndex);a.label(wordIndex);a.shl('rax',1);a.label(byteIndex);
      a.load('r11',{base:'rdx',disp:TypedArrayLayout.byteOffset});a.add('rax','r11');
      a.load('rdx',{base:'rdx',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.add('rdx','rax');
      const byteLoad=a.unique('byteLoad'),wordLoad=a.unique('wordLoad'),doubleLoad=a.unique('doubleLoad'),loaded=a.unique('loaded'),unsigned=a.unique('unsigned');a.cmp('r10',4);a.jcc('b',byteLoad);a.cmp('r10',6);a.jcc('b',wordLoad);a.cmp('r10',9);a.jcc('ae',doubleLoad);a.load('rax',{base:'rdx'},32);a.jmp(loaded);a.label(doubleLoad);a.load('rax',{base:'rdx'},64);a.jmp(loaded);a.label(wordLoad);a.load('rax',{base:'rdx'},16);a.jmp(loaded);a.label(byteLoad);a.load('rax',{base:'rdx'},8);a.label(loaded);
      const integer=a.unique('integer'),bigint=a.unique('bigint');a.cmp('r10',8);a.jcc('b',integer);a.cmp('r10',10);a.jcc('ae',bigint);const float64=a.unique('float64');a.cmp('r10',9);a.jcc('e',float64);a.movqToXmm('xmm0','rax');a.cvtss2sd('xmm0','xmm0');a.movqFromXmm('rax','xmm0');a.label(float64);a.mov('r10',3);a.jmp(save+'.tag');a.label(bigint);a.mov('rdx','rax');a.mov('r8',0);a.cmp('r10',10);const unsignedBigint=a.unique('unsignedBigint');a.jcc('ne',unsignedBigint);a.mov('r8',1);a.label(unsignedBigint);a.load('rcx',slot(40));a.call('rt.uint64ToBigInt');a.jmp(done);a.label(integer);
      a.cmp('r10',2);const signed16=a.unique('signed16');a.jcc('ne',signed16);a.shl('rax',56);a.sar('rax',56);a.jmp(unsigned);
      a.label(signed16);a.cmp('r10',5);const signed32=a.unique('signed32');a.jcc('ne',signed32);a.shl('rax',48);a.sar('rax',48);a.jmp(unsigned);
      a.label(signed32);a.cmp('r10',7);a.jcc('ne',unsigned);a.shl('rax',32);a.sar('rax',32);a.label(unsigned);a.jmp(number);
      a.label(notTypedIndex);a.cmp('rax',3);a.jcc('e',copy);
      a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.accessor);a.test('r10','r10');a.jcc('e',dataProperty);
      a.mov('r10','rax');copyValue(a,slot(96),{base:'r10',disp:P.getter});a.load('rax',slot(96));a.test('rax','rax');a.jcc('e',missing);
      a.lea('rdx',slot(128));copyValue(a,slot(112),{base:'rdx'});a.lea('rax',slot(112));a.store(slot(32),'rax');
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
    if(mode==='has')a.label('rt.hasProperty.done');
  });

  // RCX base Value, RDX key (already normalized), R8 source Value, R9 define flag.
  rootedFn(b,'rt.setPropertySlow',168,[{kind:'value',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:96,count:4}],a=>{
    a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(88),'r9');a.and('r9',1);a.store(slot(64),'r9');
    const rejected=a.unique('rejected'),finish=a.unique('finish'),done=a.unique('done'),normal=a.unique('normal'),write=a.unique('write'),create=a.unique('create'),setter=a.unique('setter'),primitive=a.unique('primitive');
    a.load('rax',{base:'rcx'});a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');a.cmp('rax',5);a.jcc('ne',primitive);
    const ordinarySet=a.unique('ordinarySet');a.load('r10',{base:'rcx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('ne',ordinarySet);
    a.load('r10',slot(40));for(const part of [0,8]){a.load('rax',{base:'r10',disp:part});a.store(slot(96+part),'rax');}
    a.load('rax',slot(88));a.store(slot(112),'rax');
    a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.lea('r9',slot(96));a.call('rt.proxySet');a.jmp(finish);a.label(ordinarySet);
    a.load('rdx',{base:'rdx',disp:8});a.call('rt.isStringOwn');a.test('rax','rax');a.jcc('ne',rejected);
    a.load('rcx',slot(40));a.load('rdx',slot(48));
    a.load('rax',{base:'rcx',disp:8});a.store(slot(72),'rax');a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',1);a.jcc('ne',normal);
    a.load('rcx',{base:'rdx',disp:8});a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('ne',normal);
    a.load('rcx',slot(72));a.load('rax',{base:'rcx',disp:O.flags});a.and('rax',2);a.test('rax','rax');a.jcc('ne',rejected);a.load('rdx',slot(56));a.call('rt.setArrayLength');a.test('rax','rax');a.jcc('e',rejected);a.jmp(done);
    a.label(normal);const ordinaryObject=a.unique('ordinaryObject');a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);a.jcc('ne',ordinaryObject);
    // Test262 (ES2022 TypedArraySetElement): convert the value first; an invalid index or a detached buffer then ignores the write.
    a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:8});a.call('rt.typedArrayNumericIndex');a.cmp('rax',-1);a.jcc('e',ordinaryObject);a.store(slot(160),'rax');

    const regularByte=a.unique('regularByte'),floating=a.unique('floating'),bigint=a.unique('bigint'),byteReady=a.unique('byteReady');a.load('r10',slot(72));a.load('rax',{base:'r10',disp:TypedArrayLayout.elementType});a.cmp('rax',10);a.jcc('ae',bigint);a.cmp('rax',8);a.jcc('ae',floating);a.cmp('rax',3);a.jcc('ne',regularByte);
    a.load('rcx',slot(56));a.call('rt.toUint8Clamp');a.jmp(byteReady);
    a.label(bigint);a.lea('rcx',slot(96));a.load('rdx',slot(56));a.call('rt.toBigIntValue');a.lea('rdx',slot(96));a.call('rt.bigintToUint64');a.jmp(byteReady);
    a.label(floating);a.lea('rcx',slot(96));a.load('rdx',slot(56));a.call('rt.toNumber');a.movsd('xmm0',slot(104));a.load('r10',slot(72));a.load('r10',{base:'r10',disp:TypedArrayLayout.elementType});a.cmp('r10',8);const rawFloat=a.unique('rawFloat');a.jcc('ne',rawFloat);a.cvtsd2ss('xmm0','xmm0');a.label(rawFloat);a.movqFromXmm('rax','xmm0');a.jmp(byteReady);
    a.label(regularByte);a.load('rcx',slot(56));a.call('rt.toInt32');a.load('r10',slot(72));a.load('r10',{base:'r10',disp:TypedArrayLayout.elementType});const mask16=a.unique('mask16'),mask32=a.unique('mask32');a.cmp('r10',4);a.jcc('ae',mask16);a.and('rax',255);a.jmp(byteReady);a.label(mask16);a.cmp('r10',6);a.jcc('ae',mask32);a.and('rax',65535);a.jmp(byteReady);a.label(mask32);a.mov('r10',0xffffffffn);a.and('rax','r10');a.label(byteReady);a.store(slot(80),'rax');
    a.load('rax',slot(160));a.cmp('rax',-2);a.jcc('e',done);a.load('r10',slot(72));a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('r11',{base:'r11',disp:ArrayBufferLayout.detached});a.test('r11','r11');a.jcc('ne',done);a.load('r11',{base:'r10',disp:TypedArrayLayout.length});a.cmp('rax','r11');a.jcc('ae',done);
    a.load('r10',slot(72));a.load('r11',{base:'r10',disp:TypedArrayLayout.elementType});const byteAddress=a.unique('byteAddress'),wordAddress=a.unique('wordAddress'),doubleAddress=a.unique('doubleAddress');a.cmp('r11',4);a.jcc('b',byteAddress);a.cmp('r11',6);a.jcc('b',wordAddress);a.cmp('r11',9);a.jcc('ae',doubleAddress);a.shl('rax',2);a.jmp(byteAddress);a.label(doubleAddress);a.shl('rax',3);a.jmp(byteAddress);a.label(wordAddress);a.shl('rax',1);a.label(byteAddress);a.load('r11',{base:'r10',disp:TypedArrayLayout.byteOffset});a.add('rax','r11');
    a.load('rdx',{base:'r10',disp:TypedArrayLayout.buffer});a.load('r11',{base:'rdx',disp:ArrayBufferLayout.detached});a.test('r11','r11');a.jcc('ne',done);a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.add('rdx','rax');
    a.load('rax',slot(80));a.load('r10',{base:'r10',disp:TypedArrayLayout.elementType});const storeByte=a.unique('storeByte'),storeWord=a.unique('storeWord'),storeDouble=a.unique('storeDouble');a.cmp('r10',4);a.jcc('b',storeByte);a.cmp('r10',6);a.jcc('b',storeWord);a.cmp('r10',9);a.jcc('ae',storeDouble);a.store({base:'rdx'},'rax',32);a.jmp(done);a.label(storeDouble);a.store({base:'rdx'},'rax',64);a.jmp(done);a.label(storeWord);a.store({base:'rdx'},'rax',16);a.jmp(done);a.label(storeByte);a.store({base:'rdx'},'rax',8);a.jmp(done);
    a.label(ordinaryObject);a.load('rcx',slot(72));a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.findGlobalBinding');
    const own=a.unique('own');a.test('rax','rax');a.jcc('e',own);a.load('r10',{base:'rdx'});a.and('r10',A.writable);a.test('r10','r10');a.jcc('e',rejected);a.mov('rcx','rax');a.load('rdx',slot(56));copyValue(a,{base:'rcx'},{base:'rdx'});a.jmp(done);
    a.label(own);const scanOwn=a.unique('scanOwn'),afterOwn=a.unique('afterOwn');
    a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('ne',scanOwn);
    a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:8});a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',scanOwn);
    a.load('r10',slot(72));a.load('r10',{base:'r10',disp:O.length});a.cmp('rax','r10');a.jcc('b',scanOwn);
    a.mov('rax',0);a.jmp(afterOwn);
    a.label(scanOwn);a.load('rcx',slot(72));a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.denseFind');a.test('rax','rax');
    {const notDense=a.unique('notDense');a.jcc('e',notDense);a.mov('rcx','rax');a.load('rdx',slot(56));copyValue(a,{base:'rcx'},{base:'rdx'});a.jmp(done);a.label(notDense);}
    a.load('rcx',slot(72));a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.findOwnProperty');
    a.label(afterOwn);
    a.test('rax','rax');a.jcc('ne',write);
    a.load('r10',slot(64));a.test('r10','r10');a.jcc('ne',create);
    const inheritedOrdinary=a.unique('inheritedOrdinary'),scanAncestor=a.unique('scanAncestor'),nextAncestor=a.unique('nextAncestor'),proxyAncestor=a.unique('proxyAncestor');
    a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.prototype});a.store(slot(80),'rax');
    a.label(scanAncestor);a.load('r10',slot(80));a.test('r10','r10');a.jcc('e',inheritedOrdinary);
    a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('e',proxyAncestor);
    // A TypedArray ancestor with a canonical numeric key and a different
    // Receiver (Test262 follows ES2022 10.4.5.5): an invalid index succeeds
    // without effect, a valid one continues as OrdinarySet on the Receiver.
    {const plainAncestor=a.unique('plainAncestor');a.cmp('rax',TypedArrayKind);a.jcc('ne',plainAncestor);
    a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:8});a.call('rt.typedArrayNumericIndex');a.cmp('rax',-1);a.jcc('e',plainAncestor);a.cmp('rax',-2);a.jcc('e',done);
    a.load('r10',slot(80));a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('r11',{base:'r11',disp:ArrayBufferLayout.detached});a.test('r11','r11');a.jcc('ne',done);
    a.load('r11',{base:'r10',disp:TypedArrayLayout.length});a.cmp('rax','r11');a.jcc('ae',done);a.jmp(create);a.label(plainAncestor);}
    a.load('rcx',slot(80));a.load('r10',slot(48));a.load('rdx',{base:'r10',disp:8});a.call('rt.findOwnProperty');a.test('rax','rax');a.jcc('ne',inheritedOrdinary);
    a.load('rcx',slot(80));a.load('r10',slot(48));a.load('rdx',{base:'r10',disp:8});a.call('rt.findGlobalBinding');a.test('rax','rax');a.jcc('ne',inheritedOrdinary);
    a.label(nextAncestor);a.load('r10',slot(80));a.load('rax',{base:'r10',disp:O.prototype});a.store(slot(80),'rax');a.jmp(scanAncestor);
    a.label(proxyAncestor);a.mov('rax',5);a.store(slot(96),'rax');a.load('rax',slot(80));a.store(slot(104),'rax');
    a.load('r10',slot(40));for(const part of [0,8]){a.load('rax',{base:'r10',disp:part});a.store(slot(112+part),'rax');}a.load('rax',slot(88));a.store(slot(128),'rax');
    a.lea('rcx',slot(96));a.load('rdx',slot(48));a.load('r8',slot(56));a.lea('r9',slot(112));a.call('rt.proxySet');a.jmp(finish);
    a.label(inheritedOrdinary);
    a.load('rcx',slot(72));a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.lookupProperty');a.cmp('rax',2);
    const inherited=a.unique('inherited');a.jcc('ne',inherited);
    a.load('rcx',slot(40));a.load('rdx',slot(56));a.call('rt.setPrototype');a.jmp(done);
    a.label(inherited);const notArrayLength=a.unique('notArrayLength'),notAlias=a.unique('notAlias');
    a.cmp('rax',1);a.jcc('ne',notArrayLength);a.load('r10',{base:'rdx',disp:O.flags});a.and('r10',2);a.test('r10','r10');a.jcc('ne',rejected);a.jmp(create);
    a.label(notArrayLength);a.cmp('rax',3);a.jcc('ne',notAlias);a.lea('rcx',{rip:'rt.globalObject'});a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.findGlobalBinding');a.load('r10',{base:'rdx'});a.and('r10',A.writable);a.test('r10','r10');a.jcc('e',rejected);a.jmp(create);
    a.label(notAlias);a.cmp('rax',3);a.jcc('be',create);a.cmp('rax',7);a.jcc('e',create);
    a.cmp('rax',5);a.jcc('be',rejected);
    a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.accessor);a.test('r10','r10');a.jcc('ne',setter);
    a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.writable);a.test('r10','r10');a.jcc('e',rejected);
    a.label(create);const extensible=a.unique('extensible');a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.flags});a.and('rax',1);a.test('rax','rax');a.jcc('ne',rejected);
    a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('ne',extensible);a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:8});a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',extensible);
    a.load('r10',slot(72));a.load('r11',{base:'r10',disp:O.length});a.cmp('rax','r11');a.jcc('b',extensible);a.load('r10',{base:'r10',disp:O.flags});a.and('r10',2);a.test('r10','r10');a.jcc('ne',rejected);
    a.label(extensible);a.load('r10',slot(72));bumpEpochIfPrototype(a,'r10');a.mov('rcx',P.size);a.call('rt.alloc');
    a.mov('r10',0);for(const offset of [P.value,P.value+8,P.getter,P.getter+8,P.setter,P.setter+8])a.store({base:'rax',disp:offset},'r10');
    a.mov('r10',A.ordinary);a.store({base:'rax',disp:P.attributes},'r10');
    a.mov('r10',HeapKind.property);a.store({base:'rax',disp:H.kind-H.size},'r10');
    a.load('r10',slot(72));a.load('r11',{base:'r10',disp:O.properties});a.store({base:'rax',disp:P.next},'r11');a.store({base:'r10',disp:O.properties},'rax');
    a.load('r10',slot(48));a.load('r10',{base:'r10',disp:8});a.store({base:'rax',disp:P.key},'r10');
    a.load('rcx',slot(72));a.mov('rdx','rax');a.call('rt.propIndexAdd');
    a.label(write);a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.accessor);a.test('r10','r10');a.jcc('ne',setter);
    a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.writable);a.test('r10','r10');a.jcc('e',rejected);
    a.lea('rcx',{base:'rax',disp:P.value});a.load('rdx',slot(56));a.load('r10',{base:'rcx'});a.cmp('r10',CellTag);
    const ordinaryWrite=a.unique('ordinaryWrite'),afterWrite=a.unique('afterWrite');a.jcc('ne',ordinaryWrite);
    a.call('rt.writeCell');a.jmp(afterWrite);a.label(ordinaryWrite);copyValue(a,{base:'rcx'},{base:'rdx'});a.label(afterWrite);
    a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('ne',done);
    a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:8});a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',done);
    a.load('r10',slot(72));a.load('r11',{base:'r10',disp:O.length});a.cmp('rax','r11');a.jcc('b',done);a.add('rax',1);a.store({base:'r10',disp:O.length},'rax');a.jmp(done);
    a.label(primitive);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.isStringOwn');a.test('rax','rax');a.jcc('ne',rejected);
    // OrdinarySet on ToObject(base): a Proxy met before the property is found
    // receives [[Set]] with the primitive as Receiver (ES2020 6.2.4.9, 9.1.9.2).
    {const scanPrimitive=a.unique('scanPrimitive'),nextPrimitive=a.unique('nextPrimitive'),proxyPrimitive=a.unique('proxyPrimitive'),lookupPrimitive=a.unique('lookupPrimitive');
    a.load('rcx',slot(40));a.call('rt.propertyBase');a.store(slot(80),'rax');
    a.label(scanPrimitive);a.load('r10',slot(80));a.test('r10','r10');a.jcc('e',lookupPrimitive);
    a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('e',proxyPrimitive);
    a.load('rcx',slot(80));a.load('r10',slot(48));a.load('rdx',{base:'r10',disp:8});a.call('rt.findOwnProperty');a.test('rax','rax');a.jcc('ne',lookupPrimitive);
    a.load('rcx',slot(80));a.load('r10',slot(48));a.load('rdx',{base:'r10',disp:8});a.call('rt.findGlobalBinding');a.test('rax','rax');a.jcc('ne',lookupPrimitive);
    a.label(nextPrimitive);a.load('r10',slot(80));a.load('rax',{base:'r10',disp:O.prototype});a.store(slot(80),'rax');a.jmp(scanPrimitive);
    a.label(proxyPrimitive);a.mov('rax',5);a.store(slot(96),'rax');a.load('rax',slot(80));a.store(slot(104),'rax');
    a.load('r10',slot(40));for(const part of [0,8]){a.load('rax',{base:'r10',disp:part});a.store(slot(112+part),'rax');}a.load('rax',slot(88));a.store(slot(128),'rax');
    a.lea('rcx',slot(96));a.load('rdx',slot(48));a.load('r8',slot(56));a.lea('r9',slot(112));a.call('rt.proxySet');a.jmp(finish);
    a.label(lookupPrimitive);}
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
    a.lea('rax',slot(128));a.store(slot(32),'rax');a.lea('rcx',slot(96));a.lea('rdx',slot(112));a.mov('r8',1);a.lea('r9',slot(144));a.call('rt.invoke');a.label(done);a.mov('rax',1);a.jmp(finish);a.label(rejected);a.load('rax',slot(88));a.and('rax',2);a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');a.mov('rax',0);a.label(finish);
  });

  rootedFn(b,'rt.deleteProperty',136,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:80,count:1}],a=>{
    a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
    a.load('rax',{base:'rdx'});a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
    const yes=a.unique('yes'),no=a.unique('no'),save=a.unique('save'),object=a.unique('object'),loop=a.unique('loop'),next=a.unique('next');
    a.lea('rcx',slot(80));a.mov('rdx','r8');a.call('rt.toPropertyKey');a.load('rax',slot(88));a.store(slot(64),'rax');
    const ordinaryDelete=a.unique('ordinaryDelete'),proxyDone=a.unique('proxyDone');a.load('r10',slot(48));a.load('rax',{base:'r10'});a.cmp('rax',5);a.jcc('ne',ordinaryDelete);
    a.load('r10',{base:'r10',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ProxyKind);a.jcc('ne',ordinaryDelete);
    a.load('rcx',slot(40));a.load('rdx',slot(48));a.lea('r8',slot(80));a.call('rt.proxyDelete');a.jmp(proxyDone);
    a.label(ordinaryDelete);
    // Only a flagged prototype can be on a cached chain (property-cache.ts).
    {const unflagged=a.unique('unflagged');a.load('r10',slot(48));a.load('rax',{base:'r10'});a.cmp('rax',5);a.jcc('ne',unflagged);a.load('r10',{base:'r10',disp:8});bumpEpochIfPrototype(a,'r10');a.label(unflagged);}
    a.load('rax',slot(64));
    a.load('rcx',slot(48));a.mov('rdx','rax');a.call('rt.isStringOwn');a.test('rax','rax');a.jcc('ne',no);
    a.load('rdx',slot(48));a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('e',object);a.cmp('rax',4);a.jcc('ne',yes);
    a.load('rax',{base:'rdx',disp:8});a.store(slot(72),'rax');
    a.load('rcx',slot(64));a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',no);
    a.load('rcx',slot(64));a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',yes);a.load('r10',slot(72));a.load('r10',{base:'r10'});a.cmp('rax','r10');a.jcc('b',no);a.jmp(yes);
    a.label(object);a.load('rax',{base:'rdx',disp:8});a.store(slot(72),'rax');a.load('r10',{base:'rax',disp:O.kind});
    const notTyped=a.unique('notTyped');a.cmp('r10',TypedArrayKind);a.jcc('ne',notTyped);
    a.load('rcx',slot(64));a.call('rt.typedArrayNumericIndex');a.cmp('rax',-1);a.jcc('e',notTyped);a.cmp('rax',-2);a.jcc('e',yes);
    a.load('r10',slot(72));a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('r11',{base:'r11',disp:ArrayBufferLayout.detached});a.test('r11','r11');a.jcc('ne',yes);a.load('r10',{base:'r10',disp:TypedArrayLayout.length});a.cmp('rax','r10');a.jcc('b',no);a.jmp(yes);
    a.label(notTyped);a.load('r10',slot(72));a.load('r10',{base:'r10',disp:O.kind});a.cmp('r10',1);const scan=a.unique('scan');a.jcc('ne',scan);
    a.load('rcx',slot(64));a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',no);
    a.label(scan);a.load('rcx',slot(72));a.load('rdx',slot(64));a.call('rt.findGlobalBinding');a.test('rax','rax');a.jcc('ne',no);
    a.load('rax',slot(72));a.lea('r10',{rip:'rt.objectPrototype'});a.cmp('rax','r10');const dataOnly=a.unique('dataOnly');a.jcc('ne',dataOnly);
    a.load('rcx',slot(64));a.lea('rdx',{rip:'rt.str.proto'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('ne',dataOnly);
    a.mov('rax',0);a.store({rip:'rt.protoAccessorEnabled'},'rax');
    a.label(dataOnly);
    {const notDense=a.unique('notDense');a.load('rcx',slot(72));a.load('rdx',slot(64));a.call('rt.denseFind');a.test('rax','rax');a.jcc('e',notDense);
    a.mov('r10',HoleTag);a.store({base:'rax'},'r10');a.load('r10',slot(72));a.load('r10',{base:'r10',disp:O.elements});a.load('r11',{base:'r10',disp:E.count});a.sub('r11',1);a.store({base:'r10',disp:E.count},'r11');a.jmp(yes);a.label(notDense);}
    a.load('rax',slot(72));a.add('rax',O.properties);a.store(slot(104),'rax');
    a.label(loop);a.load('r10',slot(104));a.load('rax',{base:'r10'});a.test('rax','rax');a.jcc('e',yes);a.store(slot(112),'rax');
    a.load('rcx',{base:'rax',disp:P.key});a.load('rdx',slot(64));a.call('rt.compareStrings');a.test('rax','rax');a.jcc('ne',next);
    a.load('rax',slot(112));a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.configurable);a.test('r10','r10');a.jcc('e',no);
    a.load('rax',{base:'rax',disp:P.next});a.load('r10',slot(104));a.store({base:'r10'},'rax');
    a.load('rcx',slot(72));a.load('rdx',slot(64));a.call('rt.propIndexDrop');
    // Detached static nodes are still visited by the GC root table. Clear all
    // edges so deleting a reassigned builtin property releases the former value.
    a.load('r11',slot(112));a.mov('rax',0);
    for(const offset of [P.next,P.key,P.value,P.value+8,P.getter,P.getter+8,P.setter,P.setter+8])a.store({base:'r11',disp:offset},'rax');
    a.jmp(yes);
    a.label(next);a.load('rax',slot(112));a.add('rax',P.next);a.store(slot(104),'rax');a.jmp(loop);
    a.label(no);a.mov('rax',0);a.jmp(save);a.label(yes);a.mov('rax',1);a.label(save);
    a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',2);a.store({base:'rcx'},'rax');a.label(proxyDone);
  });
}
