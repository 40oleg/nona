import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';

export const jsonRoots=['rt.JSON','rt.JSON.parse.fn','rt.JSON.stringify.fn'];
export const jsonPropertyRoots=['rt.globalObject.JSON','rt.JSON.@@toStringTag',...['parse','stringify'].flatMap(name=>builtinPropertyRoots('rt.JSON.'+name+'.fn',name,'rt.JSON'))];

export function emitJson(b:RuntimeBuilder):void {
 b.bundle.fragments.push({name:'rt.JSON',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[{offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0}]});
 prependFunctionBuiltin(b,'rt.JSON.parse.fn','parse',2,'rt.JSON');
 prependFunctionBuiltin(b,'rt.JSON.stringify.fn','stringify',3,'rt.JSON');
 for(const [name,value] of [['JSON','JSON'],['null','null'],['true','true'],['false','false']] as const)b.bundle.fragments.push(stringLiteral('rt.json.'+name,value));
 const json=b.bundle.fragments.find(f=>f.name==='rt.JSON')!,head=json.fixups.find(f=>f.offset===O.properties)!;
 const tag=new Uint8Array(P.size);tag[P.value]=4;tag[P.attributes]=A.configurable;
 b.bundle.fragments.push({name:'rt.JSON.@@toStringTag',section:'.data',alignment:8,bytes:tag,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:head.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.json.JSON',addend:0},
 ]});head.target='rt.JSON.@@toStringTag';
 const global=b.bundle.fragments.find(f=>f.name==='rt.globalObject')!,globalHead=global.fixups.find(f=>f.offset===O.properties)!;
 const property=new Uint8Array(P.size);property[P.value]=5;property[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push({name:'rt.globalObject.JSON',section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:globalHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.json.JSON',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.JSON',addend:0},
 ]});globalHead.target='rt.globalObject.JSON';

 // JSON.parse: ToString, the value through rt.jsonParseAt (json-parser.ts),
 // only JSON whitespace after it, then the reviver traversal.
 rootedFn(b,'rt.JSON.parse.fn.code',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1},{kind:'locals',offset:112,count:3}],a=>{
  a.store(slot(40),'rcx');a.cmp('rdx',2);const noReviver=a.unique('noReviver');a.jcc('b',noReviver);for(const n of [0,8]){a.load('rax',{base:'r8',disp:16+n});a.store(slot(112+n),'rax');}a.label(noReviver);
  a.test('rdx','rdx');const supplied=a.unique('supplied');a.jcc('ne',supplied);a.lea('rdx',{rip:'rt.undefinedValue'});const convert=a.unique('convert');a.jmp(convert);
  a.label(supplied);a.mov('rdx','r8');a.label(convert);a.lea('rcx',slot(64));a.call('rt.toString');
  // The value, then only JSON whitespace up to the end of the text.
  const done=a.unique('done'),invalid=a.unique('invalid'),trailing=a.unique('trailing'),complete=a.unique('complete');
  a.load('rcx',slot(40));a.lea('rdx',slot(64));a.mov('r8',0);a.call('rt.jsonParseAt');a.store(slot(80),'rax');
  a.load('r10',slot(72));a.load('rax',{base:'r10'});a.store(slot(88),'rax');
  a.label(trailing);a.load('rax',slot(80));a.load('r10',slot(88));a.cmp('rax','r10');a.jcc('ae',complete);a.shl('rax',1);a.load('r10',slot(72));a.add('r10','rax');a.load('r11',{base:'r10',disp:8},16);
  for(const code of [9,10,13,32]){a.cmp('r11',code);a.jcc('e','rt.JSON.parse.trailingNext');}a.jmp(invalid);
  a.label('rt.JSON.parse.trailingNext');a.load('rax',slot(80));a.add('rax',1);a.store(slot(80),'rax');a.jmp(trailing);
  a.label(complete);a.jmp(done);
  a.label(invalid);a.call('rt.throwSyntaxError');a.label(done);
  a.load('rax',slot(112));const noWalk=a.unique('noWalk');a.cmp('rax',5);a.jcc('ne',noWalk);a.load('r10',slot(120));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',2);a.jcc('ne',noWalk);
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',{base:'rcx',disp:n});a.store(slot(128+n),'rax');}
  a.lea('rcx',slot(144));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(104),'rax');
  a.lea('rcx',slot(144));a.lea('rdx',slot(96));a.lea('r8',slot(128));a.mov('r9',1);a.call('rt.setProperty');
  a.load('rcx',slot(40));a.lea('rdx',slot(144));a.lea('r8',slot(96));a.lea('r9',slot(112));a.call('rt.jsonRevive');a.label(noWalk);
 });

 // JSON Quote escapes controls and unpaired UTF-16 surrogates. The allocation
 // uses the maximum possible expansion, then records the actual string length.
 rootedFn(b,'rt.jsonQuote',120,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',4);a.store(slot(64),'rax');a.store(slot(72),'rdx');
  a.load('rax',{base:'rdx'});a.store(slot(96),'rax');a.mov('r10',12);a.imul('rax','r10');a.add('rax',12);a.mov('rcx','rax');a.call('rt.alloc');
  a.mov('r10',4);a.store(slot(80),'r10');a.store(slot(88),'rax');a.lea('r9',{base:'rax',disp:8});a.mov('r10',34);a.store({base:'r9'},'r10',16);a.add('r9',2);
  a.mov('rax',0);a.store(slot(104),'rax');
  const emit=(code:number)=>{a.mov('r10',code);a.store({base:'r9'},'r10',16);a.add('r9',2);};
  const emitHex=(shifts:number[])=>{for(const shift of shifts){a.mov('rax','r11');if(shift)a.shr('rax',shift);a.and('rax',15);const digit=a.unique('digit'),ready=a.unique('ready');a.cmp('rax',10);a.jcc('b',digit);a.add('rax',87);a.jmp(ready);a.label(digit);a.add('rax',48);a.label(ready);a.store({base:'r9'},'rax',16);a.add('r9',2);}};
  const loop=a.unique('loop'),end=a.unique('end'),plain=a.unique('plain'),escape=a.unique('escape'),control=a.unique('control'),surrogate=a.unique('surrogate'),next=a.unique('next');
  a.label(loop);a.load('rax',slot(104));a.load('r10',slot(96));a.cmp('rax','r10');a.jcc('ae',end);
  a.shl('rax',1);a.load('r8',slot(72));a.add('r8','rax');a.load('r11',{base:'r8',disp:8},16);
  a.cmp('r11',34);a.jcc('e',escape);a.cmp('r11',92);a.jcc('e',escape);
  a.cmp('r11',32);a.jcc('b',control);a.cmp('r11',0xd800);a.jcc('b',plain);a.cmp('r11',0xdfff);a.jcc('be',surrogate);a.jmp(plain);
  a.label(escape);emit(92);a.store({base:'r9'},'r11',16);a.add('r9',2);a.jmp(next);
  a.label(control);
  for(const [code,letter] of [[8,98],[9,116],[10,110],[12,102],[13,114]] as const){const skip=a.unique('skip');a.cmp('r11',code);a.jcc('ne',skip);emit(92);emit(letter);a.jmp(next);a.label(skip);}
  emit(92);emit(117);emit(48);emit(48);emitHex([4,0]);a.jmp(next);
  a.label(surrogate);a.cmp('r11',0xdbff);const lone=a.unique('lone');a.jcc('a',lone);
  a.load('rax',slot(104));a.add('rax',1);a.load('r10',slot(96));a.cmp('rax','r10');a.jcc('ae',lone);
  a.shl('rax',1);a.load('r8',slot(72));a.add('r8','rax');a.load('r10',{base:'r8',disp:8},16);a.cmp('r10',0xdc00);a.jcc('b',lone);a.cmp('r10',0xdfff);a.jcc('a',lone);
  a.store({base:'r9'},'r11',16);a.add('r9',2);a.store({base:'r9'},'r10',16);a.add('r9',2);a.load('rax',slot(104));a.add('rax',1);a.store(slot(104),'rax');a.jmp(next);
  a.label(lone);emit(92);emit(117);emitHex([12,8,4,0]);a.jmp(next);
  a.label(plain);a.store({base:'r9'},'r11',16);a.add('r9',2);
  a.label(next);a.load('rax',slot(104));a.add('rax',1);a.store(slot(104),'rax');a.jmp(loop);
  a.label(end);emit(34);a.load('rax',slot(88));a.add('rax',8);a.sub('r9','rax');a.shr('r9',1);a.load('rax',slot(88));a.store({base:'rax'},'r9');
  a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(88));a.store({base:'rcx',disp:8},'rax');
 });

 // State record at slot 112: replacer, gap, indent, then the string builder
 // (string-builder.ts) every nested rt.jsonStringifyValue appends to.
 rootedFn(b,'rt.JSON.stringify.fn.code',216,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:6}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.mov('rax',0);for(const offset of [160,168,176])a.store(slot(offset),'rax');a.test('rdx','rdx');const supplied=a.unique('supplied');a.jcc('ne',supplied);a.lea('r8',{rip:'rt.undefinedValue'});a.label(supplied);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}
  a.cmp('rdx',2);const noReplacer=a.unique('noReplacer');a.jcc('b',noReplacer);for(const n of [0,8]){a.load('rax',{base:'r8',disp:16+n});a.store(slot(112+n),'rax');}a.label(noReplacer);
  a.lea('rcx',slot(112));a.lea('rdx',slot(112));a.call('rt.jsonBuildPropertyList');
  a.load('rax',slot(48));a.cmp('rax',3);const noSpace=a.unique('noSpace'),spaceReady=a.unique('spaceReady');a.jcc('b',noSpace);a.load('r10',slot(56));a.lea('rdx',{base:'r10',disp:32});a.jmp(spaceReady);a.label(noSpace);a.lea('rdx',{rip:'rt.undefinedValue'});a.label(spaceReady);a.lea('rcx',slot(128));a.call('rt.jsonNormalizeGap');
  a.mov('rax',4);a.store(slot(144),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(152),'rax');
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(104),'rax');
  a.lea('rcx',slot(80));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');a.lea('rcx',slot(80));a.lea('rdx',slot(96));a.lea('r8',slot(64));a.mov('r9',1);a.call('rt.setProperty');
  a.lea('rax',slot(112));a.store(slot(32),'rax');a.load('rcx',slot(40));a.lea('rdx',slot(64));a.lea('r8',slot(96));a.lea('r9',slot(80));a.call('rt.jsonStringifyValue');
  const omitted=a.unique('omitted');a.load('rcx',slot(40));a.load('rax',{base:'rcx'});a.test('rax','rax');a.jcc('e',omitted);a.lea('rcx',slot(160));a.load('rdx',slot(40));a.call('rt.builderFinish');a.label(omitted);
 });
}
