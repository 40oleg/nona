import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {DescriptorLayout as D,DescriptorFields as F} from './descriptor-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {CellTag} from './environment-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots,emitNativeFunction} from './function-builtin.js';
import {stringLiteral} from './value.js';
import {emitDefineProperty} from './define-property.js';
import {emitArrayDescriptors} from './array-descriptors.js';
import {emitDescriptorConversion} from './descriptor-conversion.js';

export const descriptorRoots=['rt.objectGetOwnDescriptor','rt.objectDefineProperty','rt.protoGetter','rt.protoSetter'];
export const descriptorPropertyRoots=[
 'rt.objectPrototype.protoAccessor',
 ...builtinPropertyRoots('rt.objectDefineProperty','defineProperty','rt.Object'),
 ...builtinPropertyRoots('rt.objectGetOwnDescriptor','getOwnPropertyDescriptor','rt.Object'),
 ...['rt.protoGetter','rt.protoSetter'].flatMap(s=>[s+'.name',s+'.length']),
];

export function emitPropertyDescriptors(b:RuntimeBuilder):void {
 emitDescriptorConversion(b);emitDefineProperty(b);emitArrayDescriptors(b);
 for(const name of ['enumerable','configurable','value','writable','get','set'])b.bundle.fragments.push(stringLiteral('rt.descriptorKey.'+name,name));
 prependFunctionBuiltin(b,'rt.objectGetOwnDescriptor','getOwnPropertyDescriptor',2,'rt.Object');
 emitNativeFunction(b,'rt.protoGetter','get __proto__',0);
 emitNativeFunction(b,'rt.protoSetter','set __proto__',1);
 const protoHeader=b.bundle.fragments.find(f=>f.name==='rt.objectPrototype')!;
 const head=protoHeader.fixups.find(f=>f.offset===O.properties)!;
 const protoProperty=new Uint8Array(P.size);protoProperty[P.attributes]=A.accessor|A.configurable;protoProperty[P.getter]=5;protoProperty[P.setter]=5;
 b.bundle.fragments.push({name:'rt.objectPrototype.protoAccessor',section:'.data',alignment:8,bytes:protoProperty,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:head.target,addend:0},{offset:P.key,kind:'va64',target:'rt.str.proto',addend:0},
  {offset:P.getter+8,kind:'va64',target:'rt.protoGetter',addend:0},{offset:P.setter+8,kind:'va64',target:'rt.protoSetter',addend:0},
 ]});head.target='rt.objectPrototype.protoAccessor';
 b.bundle.fragments.find(f=>f.name==='rt.protoAccessorEnabled')!.bytes.fill(0);

 // The materialized legacy __proto__ property has stable accessor identities.
 // Getter boxes primitives; setter checks nullish receiver before prototype.
 rootedFn(b,'rt.protoGetter.code',56,[{kind:'output',register:'rcx'}],(a,frame)=>{
  a.load('rdx',slot(frame+40));a.call('rt.getPrototype');
 });
 rootedFn(b,'rt.protoSetter.code',88,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('rcx',slot(frame+40));a.load('rax',{base:'rcx'});a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
  const done=a.unique('done');a.cmp('rax',5);a.jcc('ne',done);a.test('rdx','rdx');a.jcc('e',done);
  a.mov('rdx','r8');a.call('rt.setPrototype');a.label(done);
  a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });

 // RCX result Value*, RDX initialized descriptor record. The result uses own
 // data definitions so inherited setters cannot observe descriptor creation.
 rootedFn(b,'rt.fromPropertyDescriptor',104,[{kind:'output',register:'rcx'},{kind:'range',register:'rdx',count:6},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  const missing=a.unique('missing'),done=a.unique('done');a.load('rax',{base:'rdx',disp:D.present});a.cmp('rax',-1);a.jcc('e',missing);
  a.lea('rcx',slot(64));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
  for(const name of ['value','writable','get','set','enumerable','configurable'] as const){
   const absent=a.unique('absent');a.load('rdx',slot(48));a.load('rax',{base:'rdx',disp:D.present});a.and('rax',F[name]);a.test('rax','rax');a.jcc('e',absent);
   a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.descriptorKey.'+name});a.store(slot(88),'rax');
   a.lea('r8',{base:'rdx',disp:D[name]});a.lea('rcx',slot(64));a.lea('rdx',slot(80));a.mov('r9',1);a.call('rt.setProperty');a.label(absent);
  }
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(64+n));a.store({base:'rcx',disp:n},'rax');}a.jmp(done);
  a.label(missing);a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');a.label(done);
 });

 rootedFn(b,'rt.objectGetOwnDescriptor.code',232,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:9}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  for(const i of [0,1]){
   const absent=a.unique('absent');a.load('rax',slot(48));a.cmp('rax',i);a.jcc('be',absent);a.load('r8',slot(56));
   for(const n of [0,8]){a.load('rax',{base:'r8',disp:16*i+n});a.store(slot(64+16*i+n),'rax');}a.label(absent);
  }
  a.lea('rcx',slot(96));a.lea('rdx',slot(64));a.call('rt.toObject');
  a.lea('rcx',slot(64));a.lea('rdx',slot(80));a.call('rt.toString');
  a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.lea('r8',slot(64));a.call('rt.getOwnDescriptor');
  a.load('rcx',slot(40));a.lea('rdx',slot(112));a.call('rt.fromPropertyDescriptor');
 });
 // RCX output record, RDX Object Value*, R8 normalized key Value*.
 rootedFn(b,'rt.getOwnDescriptor',232,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:64,count:9}],a=>{
  a.store(slot(40),'rcx');
  for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}
  a.lea('rcx',slot(96));a.load('rdx',slot(72));a.call('rt.ownAttributes');a.store(slot(216),'rax');
  const missing=a.unique('missing'),data=a.unique('data'),accessor=a.unique('accessor'),finish=a.unique('finish');
  a.cmp('rax',-1);a.jcc('e',missing);
  for(const [name,bit] of [['enumerable',A.enumerable],['configurable',A.configurable],['writable',A.writable]] as const){
   a.load('rax',slot(216));a.and('rax',bit);const zero=a.unique('zero');a.test('rax','rax');a.jcc('e',zero);a.mov('rax',1);a.label(zero);
   a.store(slot(112+D[name]+8),'rax');a.mov('rax',2);a.store(slot(112+D[name]),'rax');
  }
  a.load('rcx',slot(104));a.load('rdx',slot(72));a.call('rt.findGlobalBinding');a.test('rax','rax');
  const ordinary=a.unique('ordinary');a.jcc('e',ordinary);a.mov('rdx','rax');a.jmp(data);
  a.label(ordinary);a.load('rcx',slot(104));a.load('rdx',slot(72));a.call('rt.findOwnProperty');a.store(slot(224),'rax');a.test('rax','rax');
  const special=a.unique('special');a.jcc('e',special);
  a.load('r10',slot(216));a.and('r10',A.accessor);a.test('r10','r10');a.jcc('ne',accessor);
  a.lea('rdx',{base:'rax',disp:P.value});a.jmp(data);
  a.label(accessor);a.mov('r11','rax');
  for(const [field,offset] of [[D.get,P.getter],[D.set,P.setter]])for(const n of [0,8]){a.load('rax',{base:'r11',disp:offset!+n});a.store(slot(112+field!+n),'rax');}
  a.mov('rax',F.accessor);a.store(slot(208),'rax');a.jmp(finish);
  a.label(special);a.load('rax',slot(104));a.lea('r10',{rip:'rt.objectPrototype'});a.cmp('rax','r10');
  const exoticData=a.unique('exoticData');a.jcc('ne',exoticData);
  // Only the still-enabled virtual own __proto__ property reaches this branch.
  for(const [field,symbol] of [[D.get,'rt.protoGetter'],[D.set,'rt.protoSetter']] as const){
   a.mov('rax',5);a.store(slot(112+field),'rax');a.lea('rax',{rip:symbol});a.store(slot(120+field),'rax');
  }
  a.mov('rax',F.accessor);a.store(slot(208),'rax');a.jmp(finish);
  a.label(exoticData);a.lea('rcx',slot(112+D.value));a.lea('rdx',slot(96));a.lea('r8',slot(64));a.call('rt.getProperty');
  a.mov('rax',F.data);a.store(slot(208),'rax');a.jmp(finish);
  a.label(data);a.lea('rcx',slot(112+D.value));a.load('rax',{base:'rdx'});a.cmp('rax',CellTag);
  const direct=a.unique('direct'),saved=a.unique('saved');a.jcc('ne',direct);a.call('rt.readCell');a.jmp(saved);
  a.label(direct);for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store({base:'rcx',disp:n},'rax');}a.label(saved);
  a.mov('rax',F.data);a.store(slot(208),'rax');a.jmp(finish);
  a.label(missing);a.mov('rax',-1);a.store(slot(208),'rax');
  a.label(finish);a.load('rcx',slot(40));for(let n=0;n<D.size;n+=8){a.load('rax',slot(112+n));a.store({base:'rcx',disp:n},'rax');}

 });
}
