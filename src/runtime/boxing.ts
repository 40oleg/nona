import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O} from './object-layout.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';

export const BoxKind=4;
export const BoxLayout={value:O.size,size:O.size+16} as const;
export function emitBoxing(b:RuntimeBuilder):void {
 for(const [name,tag] of [['boolean',2],['number',3],['string',4],['symbol',6],['bigint',7]] as const){
  const bytes=new Uint8Array(BoxLayout.size);if(name!=='bigint'){bytes[O.kind]=BoxKind;bytes[BoxLayout.value]=tag;}
  const fixups:{offset:number;kind:'va64';target:string;addend:number}[]=[{offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0}];
  fixups.push({offset:O.properties,kind:'va64',target:'rt.'+name+'Prototype.toString',addend:0});
  if(tag===4)fixups.push({offset:BoxLayout.value+8,kind:'va64',target:'rt.str.empty',addend:0});
  b.bundle.fragments.push({name:'rt.'+name+'Prototype',section:'.data',alignment:8,bytes,symbols:{},fixups});
 }
 // RCX non-nullish Value* -> RAX object header for property lookup. Primitives
 // start at their prototype; boxed receivers keep their own object identity.
 b.fn('rt.propertyBase',40,a=>{
  const boolean=a.unique('boolean'),number=a.unique('number'),string=a.unique('string'),symbol=a.unique('symbol'),done=a.unique('done');
  a.load('rax',{base:'rcx'});a.cmp('rax',2);a.jcc('e',boolean);a.cmp('rax',3);a.jcc('e',number);a.cmp('rax',4);a.jcc('e',string);a.cmp('rax',6);a.jcc('e',symbol);
  a.cmp('rax',7);a.jcc('e','rt.propertyBase.bigint');a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('rax',{base:'rcx',disp:8});a.jmp(done);
  a.label(boolean);a.lea('rax',{rip:'rt.booleanPrototype'});a.jmp(done);
  a.label(number);a.lea('rax',{rip:'rt.numberPrototype'});a.jmp(done);
  a.label(string);a.lea('rax',{rip:'rt.stringPrototype'});a.jmp(done);a.label(symbol);a.lea('rax',{rip:'rt.symbolPrototype'});a.jmp(done);a.label('rt.propertyBase.bigint');a.lea('rax',{rip:'rt.bigintPrototype'});a.label(done);
 });
 // RCX result, RDX primitive Value*. Caller publishes result before any safepoint.
 b.fn('rt.boxReceiver',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  a.mov('rcx','rdx');a.call('rt.propertyBase');a.store(slot(56),'rax');
  a.mov('rcx',BoxLayout.size);a.call('rt.alloc');a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',BoxKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying,O.flags])a.store({base:'rax',disp:offset},'r10');
  a.load('r10',slot(56));a.store({base:'rax',disp:O.prototype},'r10');
  a.load('rdx',slot(48));a.load('r10',{base:'rdx'});a.store({base:'rax',disp:BoxLayout.value},'r10');
  a.load('r10',{base:'rdx',disp:8});a.store({base:'rax',disp:BoxLayout.value+8},'r10');
  a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',5);a.store({base:'rcx'},'rax');
 });
 // RCX Value* -> descriptor for primitive/boxed String, zero otherwise.
 b.fn('rt.stringBase',40,a=>{
  const value=a.unique('value'),missing=a.unique('missing'),done=a.unique('done');
  a.load('rax',{base:'rcx'});a.cmp('rax',4);a.jcc('e',value);a.cmp('rax',5);a.jcc('ne',missing);
  a.load('rcx',{base:'rcx',disp:8});a.load('rax',{base:'rcx',disp:O.kind});a.cmp('rax',BoxKind);a.jcc('ne',missing);
  a.add('rcx',BoxLayout.value);a.load('rax',{base:'rcx'});a.cmp('rax',4);a.jcc('ne',missing);
  a.label(value);a.load('rax',{base:'rcx',disp:8});a.jmp(done);a.label(missing);a.mov('rax',0);a.label(done);
 });
 // RCX base Value*, RDX key descriptor -> true for immutable string own keys.
 b.fn('rt.isStringOwn',72,a=>{
  a.store(slot(40),'rdx');a.call('rt.stringBase');const no=a.unique('no'),yes=a.unique('yes'),done=a.unique('done');
  a.test('rax','rax');a.jcc('e',no);a.store(slot(48),'rax');
  a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.str.length'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',yes);
  a.load('rcx',slot(40));a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',no);
  a.load('r10',slot(48));a.load('r10',{base:'r10'});a.cmp('rax','r10');a.jcc('b',yes);
  a.label(no);a.mov('rax',0);a.jmp(done);a.label(yes);a.mov('rax',1);a.label(done);
 });
 b.fn('rt.getPrototype',56,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.mov('rcx','rdx');a.call('rt.propertyBase');
  a.load('rdx',slot(48));a.load('r10',{base:'rdx'});a.cmp('r10',5);const save=a.unique('save');a.jcc('ne',save);
  a.load('rax',{base:'rax',disp:O.prototype});a.label(save);a.mov('r10',5);a.test('rax','rax');const object=a.unique('object');a.jcc('ne',object);a.mov('r10',1);
  a.label(object);a.load('rcx',slot(40));a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
}
