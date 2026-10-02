import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {stringLiteral} from './value.js';
import {rootedFn} from './root-scope.js';

const immutableGlobals=[
 {name:'undefined',tag:0,payload:0n},
 {name:'NaN',tag:3,payload:0x7ff8000000000000n},
 {name:'Infinity',tag:3,payload:0x7ff0000000000000n},
] as const;
export const globalStaticProperties=['rt.globalObject.globalThis',...immutableGlobals.map(({name})=>'rt.globalObject.'+name)];

/** Script var/function properties alias the compiler's existing global Values. */
export function emitGlobals(b:RuntimeBuilder):void {
 b.bundle.fragments.push({name:'rt.globalObject',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},
  fixups:[{offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},{offset:O.properties,kind:'va64',target:'rt.globalObject.undefined',addend:0}]});
 b.bundle.fragments.push(stringLiteral('rt.str.globalThis','globalThis'));
 const property=new Uint8Array(P.size);property[P.value]=5;property[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push({name:'rt.globalObject.globalThis',section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
  {offset:P.key,kind:'va64',target:'rt.str.globalThis',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.globalObject',addend:0},
 ]});
 immutableGlobals.forEach(({name,tag,payload},index)=>{
  b.bundle.fragments.push(stringLiteral('rt.globalKey.'+name,name));
  const bytes=new Uint8Array(P.size);bytes[P.value]=tag;
  new DataView(bytes.buffer).setBigUint64(P.value+8,payload,true);
  b.bundle.fragments.push({name:'rt.globalObject.'+name,section:'.data',alignment:8,bytes,symbols:{},fixups:[
   {offset:P.key,kind:'va64',target:'rt.globalKey.'+name,addend:0},
   {offset:P.next,kind:'va64',target:index+1<immutableGlobals.length?'rt.globalObject.'+immutableGlobals[index+1]!.name:'rt.globalObject.globalThis',addend:0},
  ]});
 });
 const value=new Uint8Array(16);value[0]=5;
 b.bundle.fragments.push({name:'rt.globalValue',section:'.rdata',alignment:8,bytes:value,symbols:{},
  fixups:[{offset:8,kind:'va64',target:'rt.globalObject',addend:0}]});
 b.data('rt.undefinedValue',new Uint8Array(16),'.rdata');
 for(const name of ['globalBindings','globalBindingCount'])b.data('rt.'+name,new Uint8Array(8),'.data');
 // RCX out, RDX static name descriptor, R8 flags: bit 0 allow absent binding
 // (typeof), bit 1 the name is not a script var/function binding (so the
 // global object is an ordinary object for it and the named fast path may
 // answer: a found data property is the value; a miss, an accessor or an
 // absent name take the generic path, which also throws for absent names).
 rootedFn(b,'rt.readGlobalProperty',104,[{kind:'output',register:'rcx'},{kind:'locals',offset:56,count:2}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',4);a.store(slot(56),'rax');a.store(slot(64),'rdx');a.store(slot(48),'r8');
  const read=a.unique('read'),generic=a.unique('generic');
  a.and('r8',2);a.test('r8','r8');a.jcc('e',generic);
  a.lea('rcx',slot(72));a.lea('rdx',{rip:'rt.globalValue'});a.lea('r8',slot(56));a.call('rt.namedGetFastGlobal');a.test('rax','rax');a.jcc('e',generic);
  a.load('rax',slot(72));a.test('rax','rax');a.jcc('e',generic);
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(72+n));a.store({base:'rcx',disp:n},'rax');}a.jmp('rt.readGlobalProperty.done');
  a.label(generic);a.load('r8',slot(48));a.and('r8',1);a.test('r8','r8');a.jcc('ne',read);
  a.lea('rcx',slot(72));a.lea('rdx',{rip:'rt.globalValue'});a.lea('r8',slot(56));a.call('rt.hasProperty');
  a.load('rax',slot(80));a.test('rax','rax');failIf(a,'e','rt.throwReferenceError');
  a.label(read);a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.globalValue'});a.lea('r8',slot(56));a.call('rt.getProperty');
  a.label('rt.readGlobalProperty.done');
 });
 // RCX object header, RDX string descriptor -> RAX aliased Value* or zero.
 // On success RDX points to the mutable attributes word of the 24-byte entry.
 b.fn('rt.findGlobalBinding',72,a=>{
  const missing=a.unique('missing'),loop=a.unique('loop'),found=a.unique('found'),done=a.unique('done');
  a.lea('rax',{rip:'rt.globalObject'});a.cmp('rcx','rax');a.jcc('ne',missing);
  a.store(slot(40),'rdx');a.load('rax',{rip:'rt.globalBindings'});a.store(slot(48),'rax');
  a.load('rax',{rip:'rt.globalBindingCount'});a.store(slot(56),'rax');
  a.label(loop);a.load('rax',slot(56));a.test('rax','rax');a.jcc('e',missing);
  a.load('rax',slot(48));a.load('rcx',{base:'rax'});a.load('rdx',slot(40));a.call('rt.compareStrings');
  a.test('rax','rax');a.jcc('e',found);
  a.load('rax',slot(48));a.add('rax',24);a.store(slot(48),'rax');
  a.load('rax',slot(56));a.sub('rax',1);a.store(slot(56),'rax');a.jmp(loop);
  a.label(found);a.load('rax',slot(48));a.lea('rdx',{base:'rax',disp:16});a.load('rax',{base:'rax',disp:8});a.jmp(done);
  a.label(missing);a.mov('rax',0);a.label(done);
 });
}
