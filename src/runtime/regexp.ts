import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {stringLiteral} from './value.js';
import {emitNativeFunction,prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const RegExpKind=10;
export const RegExpLayout={pattern:O.size,flags:O.size+8,size:O.size+16} as const;
export const regexpRoots=['rt.regexpSource.fn','rt.regexpFlags.fn','rt.regexpToString.fn'];
export const regexpPropertyRoots=['rt.regexpPrototype.source','rt.regexpPrototype.flags',...regexpRoots.slice(0,2).flatMap(name=>[name+'.name',name+'.length']),...builtinPropertyRoots('rt.regexpToString.fn','toString','rt.regexpPrototype')];

export function emitRegExpPrototype(b:RuntimeBuilder):void {
 const bytes=new Uint8Array(O.size);
 b.bundle.fragments.push({name:'rt.regexpPrototype',section:'.data',alignment:8,bytes,symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
 ]});
 b.bundle.fragments.push(stringLiteral('rt.str.lastIndex','lastIndex'));
 b.bundle.fragments.push(stringLiteral('rt.regexpEmptySource','(?:)'));
 b.bundle.fragments.push(stringLiteral('rt.regexpSlash','/'));
}

export function emitRegExp(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.regexpToString.fn','toString',0,'rt.regexpPrototype');
 for(const [name,symbol] of [['source','rt.regexpSource.fn'],['flags','rt.regexpFlags.fn']] as const){
  emitNativeFunction(b,symbol,'get '+name,0);
  const property=new Uint8Array(P.size);property[P.attributes]=A.accessor|A.configurable;property[P.getter]=5;
  b.bundle.fragments.push(stringLiteral('rt.regexpPrototype.'+name+'.key',name));
  const owner=b.bundle.fragments.find(f=>f.name==='rt.regexpPrototype')!;
  const head=owner.fixups.find(f=>f.offset===O.properties)!;
  b.bundle.fragments.push({name:'rt.regexpPrototype.'+name,section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
   {offset:P.next,kind:'va64',target:head.target,addend:0},
   {offset:P.key,kind:'va64',target:'rt.regexpPrototype.'+name+'.key',addend:0},
   {offset:P.getter+8,kind:'va64',target:symbol,addend:0},
  ]});head.target='rt.regexpPrototype.'+name;
 }
 for(const name of ['source','flags'] as const)b.fn('rt.regexp'+(name==='source'?'Source':'Flags')+'.fn.code',40,a=>{
  a.load('rdx',slot(80));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rdx',{base:'rdx',disp:8});a.lea('r10',{rip:'rt.regexpPrototype'});a.cmp('rdx','r10');
  const ordinary=a.unique('ordinary'),finish=a.unique('finish');a.jcc('ne',ordinary);
  a.lea('rax',{rip:name==='source'?'rt.regexpEmptySource':'rt.str.empty'});a.jmp(finish);
  a.label(ordinary);a.load('r10',{base:'rdx',disp:O.kind});a.cmp('r10',RegExpKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rdx',disp:name==='source'?RegExpLayout.pattern:RegExpLayout.flags});
  if(name==='source'){
   a.load('r10',{base:'rax'});a.test('r10','r10');const nonempty=a.unique('nonempty');a.jcc('ne',nonempty);a.lea('rax',{rip:'rt.regexpEmptySource'});a.label(nonempty);
  }
  a.label(finish);a.mov('r10',4);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.regexpToString.fn.code',216,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:9}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(frame+40));
  for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(64+offset),'rax');}
  for(const [key,dest] of [['source',96],['flags',112]] as const){
   a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.regexpPrototype.'+key+'.key'});a.store(slot(88),'rax');
   a.lea('rcx',slot(dest));a.lea('rdx',slot(64));a.lea('r8',slot(80));a.call('rt.getProperty');
  }
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.call('rt.toString');
  a.lea('rcx',slot(144));a.lea('rdx',slot(112));a.call('rt.toString');
  a.mov('rax',4);a.store(slot(160),'rax');a.lea('rax',{rip:'rt.regexpSlash'});a.store(slot(168),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(160));a.lea('r8',slot(128));a.call('rt.concat');
  a.lea('rcx',slot(128));a.lea('rdx',slot(128));a.lea('r8',slot(160));a.call('rt.concat');
  a.load('rcx',slot(40));a.lea('rdx',slot(128));a.lea('r8',slot(144));a.call('rt.concat');
 });
 b.fn('rt.validateRegExpFlags',40,a=>{
  a.load('rdx',{base:'rcx'});a.add('rcx',8);a.mov('r8','rcx');a.mov('r10',0);
  const loop=a.unique('loop'),done=a.unique('done'),check=a.unique('check'),invalid=a.unique('invalid');
  a.label(loop);a.test('rdx','rdx');a.jcc('e',done);a.load('rax',{base:'r8'},16);
  for(const [flag,bit] of [['g',1],['i',2],['m',4],['s',8],['u',16],['y',32]] as const){
   const next=a.unique('next');a.cmp('rax',flag.charCodeAt(0));a.jcc('ne',next);a.mov('rcx',bit);a.jmp(check);a.label(next);
  }
  a.jmp(invalid);a.label(check);a.mov('rax','r10');a.and('rax','rcx');a.test('rax','rax');a.jcc('ne',invalid);
  a.or('r10','rcx');a.add('r8',2);a.sub('rdx',1);a.jmp(loop);
  a.label(invalid);a.call('rt.throwSyntaxError');a.label(done);a.mov('rax','r10');
 });
 rootedFn(b,'rt.newRegExp',152,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:3}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  for(const [index,offset] of [[0,80],[1,96]] as const){
   const absent=a.unique('absent'),ready=a.unique('ready');
   a.load('rax',slot(48));a.cmp('rax',index);a.jcc('be',absent);
   a.load('rax',slot(56));if(index)a.add('rax',16);
   a.load('r10',{base:'rax'});a.cmp('r10',0);a.jcc('e',absent);
   a.lea('rcx',slot(offset));a.mov('rdx','rax');a.call('rt.toString');a.jmp(ready);
   a.label(absent);a.mov('rax',4);a.store(slot(offset),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(offset+8),'rax');
   a.label(ready);
  }
  a.load('rcx',slot(104));a.call('rt.validateRegExpFlags');a.store(slot(72),'rax');
  a.mov('rdx',0);
  for(const bit of [1,2,4,8,16,32]){const next=a.unique('next');a.load('rax',slot(72));a.and('rax',bit);a.test('rax','rax');a.jcc('e',next);a.add('rdx',1);a.label(next);}
  a.store(slot(64),'rdx');a.mov('rcx','rdx');a.shl('rcx',1);a.add('rcx',8);a.call('rt.alloc');
  a.load('r10',slot(64));a.store({base:'rax'},'r10');a.store(slot(104),'rax');a.lea('rdx',{base:'rax',disp:8});
  for(const [flag,bit] of [['g',1],['i',2],['m',4],['s',8],['u',16],['y',32]] as const){
   const next=a.unique('next');a.load('rax',slot(72));a.and('rax',bit);a.test('rax','rax');a.jcc('e',next);
   a.mov('r10',flag.charCodeAt(0));a.store({base:'rdx'},'r10',16);a.add('rdx',2);a.label(next);
  }
  a.mov('rcx',RegExpLayout.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',RegExpKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying,O.flags])a.store({base:'rax',disp:offset},'r10');
  a.lea('r10',{rip:'rt.regexpPrototype'});a.store({base:'rax',disp:O.prototype},'r10');
  a.load('r10',slot(88));a.store({base:'rax',disp:RegExpLayout.pattern},'r10');
  a.load('r10',slot(104));a.store({base:'rax',disp:RegExpLayout.flags},'r10');
  a.load('rcx',slot(40));a.mov('r10',5);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
  a.mov('rcx',P.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.property);a.store({base:'rax',disp:H.kind-H.size},'r10');a.mov('r10',0);
  for(const offset of [P.next,P.value+8,P.getter,P.getter+8,P.setter,P.setter+8])a.store({base:'rax',disp:offset},'r10');
  a.lea('r10',{rip:'rt.str.lastIndex'});a.store({base:'rax',disp:P.key},'r10');
  a.mov('r10',3);a.store({base:'rax',disp:P.value},'r10');
  a.mov('r10',A.writable);a.store({base:'rax',disp:P.attributes},'r10');
  a.load('r10',slot(40));a.load('r10',{base:'r10',disp:8});a.store({base:'r10',disp:O.properties},'rax');
 });
 for(const name of ['code','construct'])b.fn('rt.RegExp.'+name,40,a=>a.call('rt.newRegExp'));
}
