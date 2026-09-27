import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {stringLiteral} from './value.js';
import {emitNativeFunction,prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const RegExpKind=10;
export const RegExpLayout={pattern:O.size,flags:O.size+8,size:O.size+16} as const;
const flagGetters=[['global','g'],['ignoreCase','i'],['multiline','m'],['dotAll','s'],['unicode','u'],['sticky','y']] as const;
export const regexpRoots=['rt.RegExp.species.fn','rt.regexpSource.fn','rt.regexpFlags.fn','rt.regexpToString.fn','rt.regexpTest.fn','rt.regexpExec.fn',...flagGetters.map(([name])=>'rt.regexpFlag.'+name+'.fn')];
export const regexpPropertyRoots=['rt.RegExp.@@species','rt.RegExp.species.fn.name','rt.RegExp.species.fn.length','rt.regexpPrototype.source','rt.regexpPrototype.flags',...regexpRoots.slice(1,3).flatMap(name=>[name+'.name',name+'.length']),...['toString','test','exec'].flatMap(name=>builtinPropertyRoots('rt.regexp'+(name==='toString'?'ToString':name==='test'?'Test':'Exec')+'.fn',name,'rt.regexpPrototype')),...flagGetters.flatMap(([name])=>['rt.regexpPrototype.'+name,'rt.regexpFlag.'+name+'.fn.name','rt.regexpFlag.'+name+'.fn.length'])];

export function emitRegExpPrototype(b:RuntimeBuilder):void {
 b.data('rt.regexpVmCell',new Uint8Array(8),'.data');
 const bytes=new Uint8Array(O.size);
 b.bundle.fragments.push({name:'rt.regexpPrototype',section:'.data',alignment:8,bytes,symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
 ]});
 b.bundle.fragments.push(stringLiteral('rt.str.lastIndex','lastIndex'));
 b.bundle.fragments.push(stringLiteral('rt.regexpEmptySource','(?:)'));
 b.bundle.fragments.push(stringLiteral('rt.regexpSlash','/'));
 for(const key of ['0','index','input','groups'])b.bundle.fragments.push(stringLiteral('rt.regexpKey.'+key,key));
 for(const [name] of flagGetters)b.bundle.fragments.push(stringLiteral('rt.regexpFlagKey.'+name,name));
}

export function emitRegExp(b:RuntimeBuilder):void {
 emitNativeFunction(b,'rt.RegExp.species.fn','get [Symbol.species]',0);
 const speciesProperty=new Uint8Array(P.size);speciesProperty[P.attributes]=A.accessor|A.configurable;speciesProperty[P.getter]=5;
 const regexpConstructor=b.bundle.fragments.find(f=>f.name==='rt.RegExp')!;
 const speciesHead=regexpConstructor.fixups.find(f=>f.offset===O.properties)!;
 b.bundle.fragments.push({name:'rt.RegExp.@@species',section:'.data',alignment:8,bytes:speciesProperty,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:speciesHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.species.value',addend:0},
  {offset:P.getter+8,kind:'va64',target:'rt.RegExp.species.fn',addend:0},
 ]});speciesHead.target='rt.RegExp.@@species';
 b.fn('rt.RegExp.species.fn.code',40,a=>{a.load('rdx',slot(80));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store({base:'rcx',disp:offset},'rax');}});
 rootedFn(b,'rt.escapeRegExpSource',120,[{kind:'pointer',register:'rcx'}],a=>{
  a.store(slot(40),'rcx');a.load('r9',{base:'rcx'});a.store(slot(48),'r9');a.add('rcx',8);a.mov('r8','rcx');a.mov('rdx',0);a.mov('r11',0);
  const scan=a.unique('scan'),scanned=a.unique('scanned'),slash=a.unique('slash'),line=a.unique('line'),unicodeLine=a.unique('unicodeLine'),backslash=a.unique('backslash'),advance=a.unique('advance');
  a.label(scan);a.test('r9','r9');a.jcc('e',scanned);a.load('rax',{base:'r8'},16);
  a.cmp('rax',92);a.jcc('e',backslash);a.cmp('rax',47);a.jcc('e',slash);
  a.cmp('rax',10);a.jcc('e',line);a.cmp('rax',13);a.jcc('e',line);
  a.cmp('rax',0x2028);a.jcc('e',unicodeLine);a.cmp('rax',0x2029);a.jcc('e',unicodeLine);
  a.mov('r11',0);a.jmp(advance);
  a.label(backslash);a.xor('r11',1);a.jmp(advance);
  a.label(slash);a.test('r11','r11');const escaped=a.unique('escaped');a.jcc('ne',escaped);a.add('rdx',1);a.label(escaped);a.mov('r11',0);a.jmp(advance);
  a.label(line);a.add('rdx',1);a.mov('r11',0);a.jmp(advance);
  a.label(unicodeLine);a.add('rdx',5);a.mov('r11',0);
  a.label(advance);a.add('r8',2);a.sub('r9',1);a.jmp(scan);
  a.label(scanned);a.test('rdx','rdx');const changed=a.unique('changed'),done=a.unique('done');a.jcc('ne',changed);a.load('rax',slot(40));a.jmp(done);
  a.label(changed);a.load('r10',slot(48));a.add('r10','rdx');a.store(slot(56),'r10');a.mov('rcx','r10');a.shl('rcx',1);a.add('rcx',8);a.call('rt.alloc');
  a.store(slot(88),'rax');a.load('r10',slot(56));a.store({base:'rax'},'r10');a.lea('r8',{base:'rax',disp:8});
  a.load('rdx',slot(40));a.add('rdx',8);a.load('r9',slot(48));a.mov('r11',0);
  const copy=a.unique('copy'),copied=a.unique('copied'),copySlash=a.unique('copySlash'),copyLine=a.unique('copyLine'),copyUnicode=a.unique('copyUnicode'),copyBackslash=a.unique('copyBackslash'),copyOrdinary=a.unique('copyOrdinary'),copyAdvance=a.unique('copyAdvance');
  a.label(copy);a.test('r9','r9');a.jcc('e',copied);a.load('rax',{base:'rdx'},16);
  a.cmp('rax',92);a.jcc('e',copyBackslash);a.cmp('rax',47);a.jcc('e',copySlash);
  a.cmp('rax',10);a.jcc('e',copyLine);a.cmp('rax',13);a.jcc('e',copyLine);
  a.cmp('rax',0x2028);a.jcc('e',copyUnicode);a.cmp('rax',0x2029);a.jcc('e',copyUnicode);a.jmp(copyOrdinary);
  a.label(copyBackslash);a.xor('r11',1);a.jmp(copyOrdinary+'.write');
  a.label(copySlash);a.test('r11','r11');const alreadyEscaped=a.unique('alreadyEscaped');a.jcc('ne',alreadyEscaped);
  a.mov('r10',92);a.store({base:'r8'},'r10',16);a.add('r8',2);a.label(alreadyEscaped);a.mov('r11',0);a.jmp(copyOrdinary+'.write');
  a.label(copyLine);a.mov('r10',92);a.store({base:'r8'},'r10',16);a.add('r8',2);a.mov('r10',110);a.cmp('rax',10);const isLf=a.unique('isLf');a.jcc('e',isLf);a.mov('r10',114);a.label(isLf);a.store({base:'r8'},'r10',16);a.mov('r11',0);a.jmp(copyAdvance);
  a.label(copyUnicode);a.mov('r10',92);a.store({base:'r8'},'r10',16);a.add('r8',2);
  for(const code of [117,50,48,50]){a.mov('r10',code);a.store({base:'r8'},'r10',16);a.add('r8',2);}
  a.mov('r10',56);a.cmp('rax',0x2028);const is2028=a.unique('is2028');a.jcc('e',is2028);a.mov('r10',57);a.label(is2028);a.store({base:'r8'},'r10',16);a.mov('r11',0);a.jmp(copyAdvance);
  a.label(copyOrdinary);a.mov('r11',0);a.label(copyOrdinary+'.write');a.mov('r10','rax');a.store({base:'r8'},'r10',16);
  a.label(copyAdvance);a.add('rdx',2);a.add('r8',2);a.sub('r9',1);a.jmp(copy);a.label(copied);a.load('rax',slot(88));a.label(done);
 });
 prependFunctionBuiltin(b,'rt.regexpToString.fn','toString',0,'rt.regexpPrototype');
 prependFunctionBuiltin(b,'rt.regexpTest.fn','test',1,'rt.regexpPrototype');
 prependFunctionBuiltin(b,'rt.regexpExec.fn','exec',1,'rt.regexpPrototype');
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
 for(const [name,flag] of flagGetters){
  const symbol='rt.regexpFlag.'+name+'.fn';emitNativeFunction(b,symbol,'get '+name,0);
  const property=new Uint8Array(P.size);property[P.attributes]=A.accessor|A.configurable;property[P.getter]=5;
  const owner=b.bundle.fragments.find(f=>f.name==='rt.regexpPrototype')!,head=owner.fixups.find(f=>f.offset===O.properties)!;
  b.bundle.fragments.push({name:'rt.regexpPrototype.'+name,section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
   {offset:P.next,kind:'va64',target:head.target,addend:0},
   {offset:P.key,kind:'va64',target:'rt.regexpFlagKey.'+name,addend:0},
   {offset:P.getter+8,kind:'va64',target:symbol,addend:0},
  ]});head.target='rt.regexpPrototype.'+name;
  b.fn(symbol+'.code',40,a=>{
   a.load('rdx',slot(80));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
   a.load('rdx',{base:'rdx',disp:8});a.lea('r10',{rip:'rt.regexpPrototype'});a.cmp('rdx','r10');const ordinary=a.unique('ordinary'),done=a.unique('done');a.jcc('ne',ordinary);
   a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');a.jmp(done);
   a.label(ordinary);a.load('rax',{base:'rdx',disp:O.kind});a.cmp('rax',RegExpKind);failIf(a,'ne','rt.throwTypeError');
   a.load('r8',{base:'rdx',disp:RegExpLayout.flags});a.load('r9',{base:'r8'});a.add('r8',8);
   const scan=a.unique('scan'),found=a.unique('found'),result=a.unique('result');a.label(scan);a.test('r9','r9');a.jcc('e',result);
   a.load('r10',{base:'r8'},16);a.cmp('r10',flag.charCodeAt(0));a.jcc('e',found);a.add('r8',2);a.sub('r9',1);a.jmp(scan);
   a.label(found);a.mov('rax',1);a.jmp(result+'.save');a.label(result);a.mov('rax',0);a.label(result+'.save');
   a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');a.label(done);
  });
 }
 for(const name of ['source'] as const)b.fn('rt.regexpSource.fn.code',56,a=>{
  a.load('rdx',slot(96));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rdx',{base:'rdx',disp:8});a.lea('r10',{rip:'rt.regexpPrototype'});a.cmp('rdx','r10');
  const ordinary=a.unique('ordinary'),finish=a.unique('finish');a.jcc('ne',ordinary);
  a.lea('rax',{rip:name==='source'?'rt.regexpEmptySource':'rt.str.empty'});a.jmp(finish);
  a.label(ordinary);a.load('r10',{base:'rdx',disp:O.kind});a.cmp('r10',RegExpKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rdx',disp:name==='source'?RegExpLayout.pattern:RegExpLayout.flags});
  if(name==='source'){
   a.load('r10',{base:'rax'});a.test('r10','r10');const nonempty=a.unique('nonempty'),escaped=a.unique('escaped');a.jcc('ne',nonempty);a.lea('rax',{rip:'rt.regexpEmptySource'});a.jmp(escaped);
   a.label(nonempty);a.store(slot(40),'rcx');a.mov('rcx','rax');a.call('rt.escapeRegExpSource');a.load('rcx',slot(40));a.label(escaped);
  }
  a.label(finish);a.mov('r10',4);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.regexpFlags.fn.code',136,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:3}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(frame+40));
  for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(64+offset),'rax');}
  a.load('rax',slot(64));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(112),'rax');
  for(const [index,[name]] of flagGetters.entries()){
   a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.regexpFlagKey.'+name});a.store(slot(88),'rax');
   a.lea('rcx',slot(96));a.lea('rdx',slot(64));a.lea('r8',slot(80));a.call('rt.getProperty');
   a.lea('rcx',slot(96));a.call('rt.toBoolean');a.test('rax','rax');const next=a.unique('next');a.jcc('e',next);
   a.load('rax',slot(112));a.or('rax',1<<index);a.store(slot(112),'rax');a.label(next);
  }
  a.mov('rdx',0);for(let index=0;index<flagGetters.length;index++){
   const next=a.unique('next');a.load('rax',slot(112));a.and('rax',1<<index);a.test('rax','rax');a.jcc('e',next);a.add('rdx',1);a.label(next);
  }
  a.store(slot(120),'rdx');a.mov('rcx','rdx');a.shl('rcx',1);a.add('rcx',8);a.call('rt.alloc');
  a.load('r10',slot(120));a.store({base:'rax'},'r10');a.lea('rdx',{base:'rax',disp:8});a.store(slot(128),'rax');
  for(const [index,[,flag]] of flagGetters.entries()){
   const next=a.unique('next');a.load('rax',slot(112));a.and('rax',1<<index);a.test('rax','rax');a.jcc('e',next);
   a.mov('r10',flag.charCodeAt(0));a.store({base:'rdx'},'r10',16);a.add('rdx',2);a.label(next);
  }
  a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(128));a.store({base:'rcx',disp:8},'rax');
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
  // Basic UTF-16 matcher. R8 supplies the starting index and R9 selects
  // sticky mode. RAX returns the match index or -1. Metacharacters need a VM.
 b.fn('rt.regexpClassContains',104,a=>{
  a.lea('r9',{base:'rcx',disp:2});a.mov('r10','r8');a.sub('r10',1);a.mov('r11','rdx');
  for(const offset of [40,48]){a.mov('rax',0);a.store(slot(offset),'rax');}a.mov('rax',1);a.store(slot(56),'rax');
  const scan=a.unique('scan'),close=a.unique('close'),ordinary=a.unique('ordinary'),advance=a.unique('advance'),invalid=a.unique('invalid'),shorthand=a.unique('shorthand');
  a.test('r10','r10');a.jcc('e',invalid);a.load('rax',{base:'r9'},16);a.cmp('rax',94);a.jcc('ne',scan);
  a.mov('rax',1);a.store(slot(40),'rax');a.add('r9',2);a.sub('r10',1);a.load('rax',slot(56));a.add('rax',1);a.store(slot(56),'rax');
  a.label(scan);a.test('r10','r10');a.jcc('e',invalid);a.load('rax',{base:'r9'},16);a.cmp('rax',93);a.jcc('e',close);
  a.cmp('rax',92);a.jcc('ne',ordinary);a.add('r9',2);a.sub('r10',1);a.load('rax',slot(56));a.add('rax',1);a.store(slot(56),'rax');
  a.test('r10','r10');a.jcc('e',invalid);a.load('rax',{base:'r9'},16);
  for(const code of 'dDwWsS'){a.cmp('rax',code.charCodeAt(0));a.jcc('e',shorthand);}
  for(const code of 'uUxXcCpPkK'){a.cmp('rax',code.charCodeAt(0));a.jcc('e',invalid);}
  for(const [code,value] of [['n',10],['r',13],['t',9],['v',11],['f',12],['0',0],['b',8]] as const){
   const next=a.unique('nextClassEscape');a.cmp('rax',code.charCodeAt(0));a.jcc('ne',next);a.mov('rax',value);a.jmp(ordinary);a.label(next);
  }
  a.label(ordinary);a.store(slot(64),'rax');a.add('r9',2);a.sub('r10',1);a.load('rax',slot(56));a.add('rax',1);a.store(slot(56),'rax');
  a.cmp('r10',2);a.jcc('b',advance);a.load('rax',{base:'r9'},16);a.cmp('rax',45);a.jcc('ne',advance);
  a.load('rax',{base:'r9',disp:2},16);a.cmp('rax',93);a.jcc('e',advance);a.cmp('rax',92);a.jcc('e',invalid);
  a.load('rdx',slot(64));a.cmp('rdx','rax');a.jcc('a',invalid);a.cmp('r11','rdx');const nextRange=a.unique('nextRange');a.jcc('b',nextRange);a.cmp('r11','rax');a.jcc('a',nextRange);
  a.mov('rdx',1);a.store(slot(48),'rdx');a.label(nextRange);a.add('r9',4);a.sub('r10',2);a.load('rax',slot(56));a.add('rax',2);a.store(slot(56),'rax');a.jmp(scan);
  a.label(advance);a.load('rax',slot(64));a.cmp('r11','rax');const notEqual=a.unique('notEqual');a.jcc('ne',notEqual);a.mov('rax',1);a.store(slot(48),'rax');a.label(notEqual);a.jmp(scan);
  a.label(shorthand);a.store(slot(72),'r9');a.store(slot(80),'r10');a.store(slot(88),'r11');
  a.lea('rcx',{base:'r9',disp:-2});a.mov('rdx','r10');a.add('rdx',1);a.mov('r8','r11');a.mov('r9',0);a.call('rt.regexpAtomMatches');
  a.test('rax','rax');const noShorthandMatch=a.unique('noShorthandMatch');a.jcc('e',noShorthandMatch);a.mov('rax',1);a.store(slot(48),'rax');a.label(noShorthandMatch);
  a.load('r9',slot(72));a.load('r10',slot(80));a.load('r11',slot(88));
  a.cmp('r10',2);const noRange=a.unique('noShorthandRange');a.jcc('b',noRange);a.load('rax',{base:'r9',disp:2},16);a.cmp('rax',45);a.jcc('e',invalid);a.label(noRange);
  a.add('r9',2);a.sub('r10',1);a.load('rax',slot(56));a.add('rax',1);a.store(slot(56),'rax');a.jmp(scan);
  a.label(close);a.load('rax',slot(56));a.add('rax',1);a.mov('rdx','rax');a.load('rax',slot(48));a.load('r10',slot(40));a.xor('rax','r10');const done=a.unique('done');a.jmp(done);
  a.label(invalid);a.call('rt.throwTypeError');a.label(done);
 });
 b.fn('rt.regexpIsWordCodeUnit',40,a=>{
  const yes=a.unique('yes'),done=a.unique('done');
  for(const [first,last] of [[48,57],[65,90],[97,122]] as const){const after=a.unique('afterRange');a.cmp('rcx',first);a.jcc('b',after);a.cmp('rcx',last);a.jcc('be',yes);a.label(after);}
  a.cmp('rcx',95);a.jcc('e',yes);a.mov('rax',0);a.jmp(done);a.label(yes);a.mov('rax',1);a.label(done);
 });
 b.fn('rt.regexpAtomMatches',88,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.load('r11',{base:'rcx'},16);const classMatch=a.unique('classMatch'),escape=a.unique('escape'),dot=a.unique('dot'),literal=a.unique('literal'),yes=a.unique('yes'),no=a.unique('no'),done=a.unique('done');
  a.cmp('r11',91);a.jcc('e',classMatch);a.cmp('r11',92);a.jcc('e',escape);a.cmp('r11',46);a.jcc('e',dot);a.mov('rdx',1);a.jmp(literal);
  a.label(classMatch);a.mov('r10','rdx');a.mov('rdx','r8');a.mov('r8','r10');a.call('rt.regexpClassContains');a.jmp(done);
  a.label(dot);a.mov('rdx',1);a.load('rax',slot(64));a.and('rax',1);a.test('rax','rax');a.jcc('ne',yes);
  for(const code of [10,13,0x2028,0x2029]){a.cmp('r8',code);a.jcc('e',no);}a.jmp(yes);
  a.label(escape);a.load('r10',slot(48));a.cmp('r10',1);failIf(a,'e','rt.throwTypeError');a.load('rcx',slot(40));a.load('r11',{base:'rcx',disp:2},16);a.mov('rdx',2);
  const digit=a.unique('digit'),notDigit=a.unique('notDigit'),word=a.unique('word'),space=a.unique('space');
  a.cmp('r11',100);a.jcc('e',digit);a.cmp('r11',68);a.jcc('e',notDigit);
  a.cmp('r11',119);a.jcc('e',word);a.cmp('r11',87);a.jcc('e',word);
  a.cmp('r11',115);a.jcc('e',space);a.cmp('r11',83);a.jcc('e',space);
  for(const [code,value] of [['n',10],['r',13],['t',9],['v',11],['f',12],['0',0]] as const){const next=a.unique('nextAtomEscape');a.cmp('r11',code.charCodeAt(0));a.jcc('ne',next);a.mov('r11',value);a.jmp(literal);a.label(next);}
  a.jmp(literal);
  a.label(digit);a.cmp('r8',48);a.jcc('b',no);a.cmp('r8',57);a.jcc('a',no);a.jmp(yes);
  a.label(notDigit);a.cmp('r8',48);a.jcc('b',yes);a.cmp('r8',57);a.jcc('be',no);a.jmp(yes);
  const wordYes=a.unique('wordYes'),wordNo=a.unique('wordNo');a.label(word);
  for(const [first,last] of [[48,57],[65,90],[97,122]] as const){const next=a.unique('nextAtomWord');a.cmp('r8',first);a.jcc('b',next);a.cmp('r8',last);a.jcc('be',wordYes);a.label(next);}
  a.cmp('r8',95);a.jcc('e',wordYes);a.jmp(wordNo);
  a.label(wordYes);a.cmp('r11',119);a.jcc('e',yes);a.jmp(no);a.label(wordNo);a.cmp('r11',87);a.jcc('e',yes);a.jmp(no);
  const spaceYes=a.unique('spaceYes'),spaceNo=a.unique('spaceNo');a.label(space);
  a.cmp('r8',9);const afterAscii=a.unique('atomAfterAscii');a.jcc('b',afterAscii);a.cmp('r8',13);a.jcc('be',spaceYes);a.label(afterAscii);
  a.cmp('r8',0x2000);const afterRange=a.unique('atomAfterRange');a.jcc('b',afterRange);a.cmp('r8',0x200a);a.jcc('be',spaceYes);a.label(afterRange);
  for(const code of [32,160,0x1680,0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff]){a.cmp('r8',code);a.jcc('e',spaceYes);}
  a.jmp(spaceNo);a.label(spaceYes);a.cmp('r11',115);a.jcc('e',yes);a.jmp(no);a.label(spaceNo);a.cmp('r11',83);a.jcc('e',yes);a.jmp(no);
  a.label(literal);a.cmp('r8','r11');a.jcc('e',yes);a.load('rax',slot(64));a.and('rax',8);a.test('rax','rax');a.jcc('e',no);
  a.mov('rax','r11');a.or('rax',32);a.cmp('rax',97);a.jcc('b',no);a.cmp('rax',122);a.jcc('a',no);
  a.mov('rax','r8');a.or('rax',32);a.cmp('rax',97);a.jcc('b',no);a.cmp('rax',122);a.jcc('a',no);
  a.or('r11',32);a.cmp('rax','r11');a.jcc('ne',no);
  a.label(yes);a.mov('rax',1);a.jmp(done);a.label(no);a.mov('rax',0);a.label(done);
 });
 b.fn('rt.regexpFindSingleQuantifier',136,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.load('r10',{base:'rcx'});a.cmp('r10',2);const unsupported=a.unique('unsupported'),parseClass=a.unique('parseClass'),atomReady=a.unique('atomReady');a.jcc('b',unsupported);
  a.load('r11',{base:'rcx',disp:8},16);a.cmp('r11',91);a.jcc('e',parseClass);
  a.cmp('r11',92);const notEscape=a.unique('notEscape');a.jcc('ne',notEscape);a.mov('rax',2);a.jmp(atomReady);
  a.label(notEscape);for(const code of '^$*+?(){}|'){a.cmp('r11',code.charCodeAt(0));a.jcc('e',unsupported);}
  a.mov('rax',1);a.jmp(atomReady);
  a.label(parseClass);a.mov('rdx',0);a.mov('r8','r10');a.lea('rcx',{base:'rcx',disp:8});a.call('rt.regexpClassContains');a.mov('rax','rdx');
  a.label(atomReady);a.store(slot(80),'rax');a.load('r10',slot(40));a.load('r10',{base:'r10'});a.add('rax',1);a.cmp('rax','r10');a.jcc('ne',unsupported);
  a.load('r11',slot(40));a.load('rax',slot(80));a.shl('rax',1);a.add('r11',8);a.add('r11','rax');a.load('rax',{base:'r11'},16);
  a.cmp('rax',42);const quantifierReady=a.unique('quantifierReady');a.jcc('e',quantifierReady);a.cmp('rax',43);a.jcc('e',quantifierReady);a.cmp('rax',63);a.jcc('ne',unsupported);a.label(quantifierReady);a.store(slot(88),'rax');
  a.load('r10',slot(40));a.load('r11',{base:'r10',disp:8},16);a.load('rax',slot(64));a.and('rax',10);
  a.cmp('r11',91);const noClass=a.unique('noClass');a.jcc('ne',noClass);a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');a.label(noClass);
  a.cmp('r11',46);const noDot=a.unique('noDot');a.jcc('ne',noDot);a.load('rax',slot(64));a.and('rax',2);failIf(a,'ne','rt.throwTypeError');a.label(noDot);
  a.load('rax',slot(64));a.and('rax',8);a.test('rax','rax');const checkedCase=a.unique('checkedCase');a.jcc('e',checkedCase);a.cmp('r11',127);failIf(a,'a','rt.throwTypeError');a.label(checkedCase);
  a.cmp('r11',92);const checkedEscape=a.unique('checkedEscape');a.jcc('ne',checkedEscape);a.load('rax',{base:'r10',disp:10},16);
  const validEscape=a.unique('validEscape');for(const code of 'dDwWsSnrtvf0\\.^$*+?()[]{}|/'){a.cmp('rax',code.charCodeAt(0));a.jcc('e',validEscape);}a.call('rt.throwTypeError');a.label(validEscape);a.label(checkedEscape);
  a.load('r10',slot(48));a.load('r10',{base:'r10'});a.store(slot(112),'r10');a.load('rax',slot(56));a.store(slot(96),'rax');
  const outer=a.unique('outer'),repeat=a.unique('repeat'),finishRepeat=a.unique('finishRepeat'),nextCandidate=a.unique('nextCandidate'),found=a.unique('found'),no=a.unique('no'),done=a.unique('done');
  a.label(outer);a.load('rax',slot(96));a.load('r10',slot(112));a.cmp('rax','r10');a.jcc('a',no);a.mov('rax',0);a.store(slot(104),'rax');
  a.label(repeat);a.load('rax',slot(96));a.load('r10',slot(104));a.add('rax','r10');a.load('r10',slot(112));a.cmp('rax','r10');a.jcc('ae',finishRepeat);
  a.shl('rax',1);a.load('r10',slot(48));a.add('r10',8);a.add('r10','rax');a.load('r8',{base:'r10'},16);
  a.load('r10',slot(40));a.lea('rcx',{base:'r10',disp:8});a.load('rdx',{base:'r10'});a.load('r9',slot(64));a.call('rt.regexpAtomMatches');a.test('rax','rax');a.jcc('e',finishRepeat);
  a.load('rax',slot(104));a.add('rax',1);a.store(slot(104),'rax');a.load('rax',slot(88));a.cmp('rax',63);a.jcc('e',finishRepeat);a.jmp(repeat);
  a.label(finishRepeat);a.load('rax',slot(88));a.cmp('rax',43);a.jcc('ne',found);a.load('rax',slot(104));a.test('rax','rax');a.jcc('e',nextCandidate);
  a.label(found);a.load('rax',slot(96));a.load('rdx',slot(104));a.jmp(done);
  a.label(nextCandidate);a.load('rax',slot(64));a.and('rax',32);a.test('rax','rax');a.jcc('ne',no);a.load('rax',slot(96));a.add('rax',1);a.store(slot(96),'rax');a.jmp(outer);
  a.label(no);a.mov('rax',-1);a.mov('rdx',0);a.jmp(done);
  a.label(unsupported);a.mov('rax',-2);a.mov('rdx',0);a.label(done);
 });
 b.fn('rt.regexpFindLiteralAlternatives',136,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.load('r10',{base:'rcx'});a.store(slot(72),'r10');a.lea('r11',{base:'rcx',disp:8});a.mov('r8',0);a.mov('r9',0);
  const validate=a.unique('validate'),validated=a.unique('validated'),bar=a.unique('bar'),unsupported=a.unique('unsupported'),done=a.unique('done');
  a.label(validate);a.cmp('r8','r10');a.jcc('ae',validated);a.load('rax',{base:'r11'},16);a.cmp('rax',124);a.jcc('e',bar);
  for(const code of '.^$*+?()[]{}\\'){a.cmp('rax',code.charCodeAt(0));a.jcc('e',unsupported);}
  a.load('rdx',slot(64));a.and('rdx',8);a.test('rdx','rdx');const advance=a.unique('advance');a.jcc('e',advance);a.cmp('rax',127);failIf(a,'a','rt.throwTypeError');
  a.label(advance);a.add('r11',2);a.add('r8',1);a.jmp(validate);
  a.label(bar);a.mov('r9',1);a.jmp(advance);
  a.label(validated);a.test('r9','r9');a.jcc('e',unsupported);
  a.load('r10',slot(48));a.load('r10',{base:'r10'});a.store(slot(112),'r10');a.load('rax',slot(56));a.store(slot(88),'rax');
  const outer=a.unique('outer'),branch=a.unique('branch'),compare=a.unique('compare'),branchFailed=a.unique('branchFailed'),skipBranch=a.unique('skipBranch'),nextCandidate=a.unique('nextCandidate'),found=a.unique('found'),no=a.unique('no');
  a.label(outer);a.load('rax',slot(88));a.load('r10',slot(112));a.cmp('rax','r10');a.jcc('a',no);a.mov('rax',0);a.store(slot(96),'rax');
  a.label(branch);a.mov('rax',0);a.store(slot(104),'rax');
  a.label(compare);a.load('r10',slot(96));a.load('r11',slot(72));a.cmp('r10','r11');a.jcc('ae',found);
  a.shl('r10',1);a.load('r11',slot(40));a.add('r11',8);a.add('r11','r10');a.load('r11',{base:'r11'},16);a.cmp('r11',124);a.jcc('e',found);
  a.load('rax',slot(88));a.load('r10',slot(104));a.add('rax','r10');a.load('r10',slot(112));a.cmp('rax','r10');a.jcc('ae',branchFailed);
  a.shl('rax',1);a.load('r10',slot(48));a.add('r10',8);a.add('r10','rax');a.load('r10',{base:'r10'},16);a.cmp('r10','r11');const equal=a.unique('equal');a.jcc('e',equal);
  a.load('rax',slot(64));a.and('rax',8);a.test('rax','rax');a.jcc('e',branchFailed);
  a.mov('rax','r11');a.or('rax',32);a.cmp('rax',97);a.jcc('b',branchFailed);a.cmp('rax',122);a.jcc('a',branchFailed);
  a.mov('rax','r10');a.or('rax',32);a.cmp('rax',97);a.jcc('b',branchFailed);a.cmp('rax',122);a.jcc('a',branchFailed);
  a.or('r11',32);a.cmp('rax','r11');a.jcc('ne',branchFailed);
  a.label(equal);a.load('rax',slot(96));a.add('rax',1);a.store(slot(96),'rax');a.load('rax',slot(104));a.add('rax',1);a.store(slot(104),'rax');a.jmp(compare);
  a.label(branchFailed);a.label(skipBranch);a.load('rax',slot(96));a.load('r10',slot(72));a.cmp('rax','r10');a.jcc('ae',nextCandidate);
  a.shl('rax',1);a.load('r10',slot(40));a.add('r10',8);a.add('r10','rax');a.load('rax',{base:'r10'},16);a.cmp('rax',124);const skip=a.unique('skip');a.jcc('ne',skip);
  a.load('rax',slot(96));a.add('rax',1);a.store(slot(96),'rax');a.jmp(branch);
  a.label(skip);a.load('rax',slot(96));a.add('rax',1);a.store(slot(96),'rax');a.jmp(skipBranch);
  a.label(nextCandidate);a.load('rax',slot(64));a.and('rax',32);a.test('rax','rax');a.jcc('ne',no);a.load('rax',slot(88));a.add('rax',1);a.store(slot(88),'rax');a.jmp(outer);
  a.label(found);a.load('rax',slot(88));a.load('rdx',slot(104));a.jmp(done);
  a.label(no);a.mov('rax',-1);a.mov('rdx',0);a.jmp(done);
  a.label(unsupported);a.mov('rax',-2);a.mov('rdx',0);a.label(done);
 });
 b.fn('rt.regexpFindUnicodeEscape',120,a=>{
  const unsupported=a.unique('unsupported'),no=a.unique('no'),done=a.unique('done');
  a.load('rax',{base:'rcx'});a.cmp('rax',6);a.jcc('ne',unsupported);
  a.load('rax',{base:'rcx',disp:8},16);a.cmp('rax',92);a.jcc('ne',unsupported);
  a.load('rax',{base:'rcx',disp:10},16);a.cmp('rax',117);a.jcc('ne',unsupported);
  a.store(slot(40),'rdx');a.store(slot(48),'r8');a.store(slot(56),'r9');
  a.mov('r11',0);
  for(const offset of [12,14,16,18]){
   const digit=a.unique('hexDigit'),upper=a.unique('hexUpper'),lower=a.unique('hexLower'),ready=a.unique('hexReady');
   a.load('rax',{base:'rcx',disp:offset},16);a.cmp('rax',48);a.jcc('b',unsupported);a.cmp('rax',57);a.jcc('be',digit);
   a.cmp('rax',65);a.jcc('b',unsupported);a.cmp('rax',70);a.jcc('be',upper);
   a.cmp('rax',97);a.jcc('b',unsupported);a.cmp('rax',102);a.jcc('be',lower);a.jmp(unsupported);
   a.label(digit);a.sub('rax',48);a.jmp(ready);
   a.label(upper);a.sub('rax',55);a.jmp(ready);
   a.label(lower);a.sub('rax',87);
   a.label(ready);a.shl('r11',4);a.or('r11','rax');
  }
  a.store(slot(64),'r11');a.load('r10',slot(40));a.load('r10',{base:'r10'});a.store(slot(72),'r10');
  const initialReady=a.unique('initialReady');a.load('rax',slot(56));a.and('rax',2);a.test('rax','rax');a.jcc('e',initialReady);
  a.load('r8',slot(48));a.test('r8','r8');a.jcc('e',initialReady);a.cmp('r8','r10');a.jcc('ae',initialReady);
  a.load('rdx',slot(40));a.lea('rdx',{base:'rdx',disp:8});a.mov('rax','r8');a.shl('rax',1);a.add('rdx','rax');
  a.load('rax',{base:'rdx'},16);a.cmp('rax',0xdc00);a.jcc('b',initialReady);a.cmp('rax',0xdfff);a.jcc('a',initialReady);
  a.load('rax',{base:'rdx',disp:-2},16);a.cmp('rax',0xd800);a.jcc('b',initialReady);a.cmp('rax',0xdbff);a.jcc('a',initialReady);
  a.sub('r8',1);a.store(slot(48),'r8');a.label(initialReady);
  const outer=a.unique('outer'),compare=a.unique('compare'),advance=a.unique('advance'),found=a.unique('found');
  a.label(outer);a.load('r8',slot(48));a.load('r10',slot(72));a.cmp('r8','r10');a.jcc('ae',no);
  a.load('r10',slot(40));a.lea('r10',{base:'r10',disp:8});a.mov('rax','r8');a.shl('rax',1);a.add('r10','rax');
  a.load('rax',slot(56));a.and('rax',2);a.test('rax','rax');a.jcc('e',compare);
  a.test('r8','r8');a.jcc('e',compare);
  a.load('rax',{base:'r10'},16);a.cmp('rax',0xdc00);a.jcc('b',compare);a.cmp('rax',0xdfff);a.jcc('a',compare);
  a.load('rax',{base:'r10',disp:-2},16);a.cmp('rax',0xd800);a.jcc('b',compare);a.cmp('rax',0xdbff);a.jcc('a',compare);
  a.jmp(advance);
  a.label(compare);a.load('rax',{base:'r10'},16);a.load('r11',slot(64));a.cmp('rax','r11');a.jcc('e',found);
  a.label(advance);a.load('rax',slot(56));a.and('rax',32);a.test('rax','rax');a.jcc('ne',no);
  a.load('r8',slot(48));a.add('r8',1);a.store(slot(48),'r8');a.jmp(outer);
  a.label(found);a.mov('rax','r8');a.mov('rdx',1);a.jmp(done);
  a.label(no);a.mov('rax',-1);a.mov('rdx',0);a.jmp(done);
  a.label(unsupported);a.mov('rax',-2);a.mov('rdx',0);a.label(done);
 });
 b.fn('rt.regexpFindUnicodeDot',104,a=>{
  a.load('rax',{base:'rcx'});const unsupported=a.unique('unsupported'),no=a.unique('no'),done=a.unique('done');a.cmp('rax',1);a.jcc('ne',unsupported);
  a.load('rax',{base:'rcx',disp:8},16);a.cmp('rax',46);a.jcc('ne',unsupported);
  a.mov('rax','r9');a.and('rax',2);a.test('rax','rax');a.jcc('e',unsupported);
  a.store(slot(40),'rdx');a.store(slot(48),'r9');a.store(slot(56),'r8');
  a.load('r10',{base:'rdx'});a.store(slot(64),'r10');
  const outer=a.unique('outer'),read=a.unique('read'),single=a.unique('single'),found=a.unique('found'),advance=a.unique('advance');
  a.label(outer);a.load('r8',slot(56));a.load('r10',slot(64));a.cmp('r8','r10');a.jcc('ae',no);
  a.test('r8','r8');a.jcc('e',read);
  a.load('rdx',slot(40));a.lea('rdx',{base:'rdx',disp:8});a.mov('rax','r8');a.shl('rax',1);a.add('rdx','rax');
  a.load('rax',{base:'rdx'},16);a.cmp('rax',0xdc00);a.jcc('b',read);a.cmp('rax',0xdfff);a.jcc('a',read);
  a.load('rax',{base:'rdx',disp:-2},16);a.cmp('rax',0xd800);a.jcc('b',read);a.cmp('rax',0xdbff);a.jcc('a',read);
  a.sub('r8',1);a.store(slot(56),'r8');
  a.label(read);a.load('rdx',slot(40));a.lea('rdx',{base:'rdx',disp:8});a.mov('rax','r8');a.shl('rax',1);a.add('rdx','rax');
  a.load('rax',{base:'rdx'},16);a.load('r9',slot(48));a.and('r9',1);a.test('r9','r9');a.jcc('ne',single);
  for(const code of [10,13,0x2028,0x2029]){a.cmp('rax',code);a.jcc('e',advance);}
  a.label(single);a.mov('rdx',1);a.cmp('rax',0xd800);a.jcc('b',found);a.cmp('rax',0xdbff);a.jcc('a',found);
  a.load('r10',slot(64));a.mov('r9','r8');a.add('r9',1);a.cmp('r9','r10');a.jcc('ae',found);
  a.load('r10',slot(40));a.lea('r10',{base:'r10',disp:8});a.shl('r9',1);a.add('r10','r9');a.load('r10',{base:'r10'},16);
  a.cmp('r10',0xdc00);a.jcc('b',found);a.cmp('r10',0xdfff);a.jcc('a',found);a.mov('rdx',2);
  a.label(found);a.mov('rax','r8');a.jmp(done);
  a.label(advance);a.load('r9',slot(48));a.and('r9',32);a.test('r9','r9');a.jcc('ne',no);a.load('r8',slot(56));a.add('r8',1);a.store(slot(56),'r8');a.jmp(outer);
  a.label(no);a.mov('rax',-1);a.mov('rdx',0);a.jmp(done);
  a.label(unsupported);a.mov('rax',-2);a.mov('rdx',0);a.label(done);
 });
 b.fn('rt.regexpFindPlain',136,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(80),'r8');a.store(slot(88),'r9');
  const done=a.unique('done');
  a.load('rax',{base:'rcx',disp:O.kind});a.cmp('rax',RegExpKind);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'rcx',disp:RegExpLayout.flags});a.load('r9',{base:'r10'});a.add('r10',8);a.mov('rax',0);a.store(slot(96),'rax');
  const flagScan=a.unique('flagScan'),flagsDone=a.unique('flagsDone'),nextFlag=a.unique('nextFlag');a.label(flagScan);a.test('r9','r9');a.jcc('e',flagsDone);
  a.load('rax',{base:'r10'},16);a.cmp('rax',105);const checkDotAll=a.unique('checkDotAll');a.jcc('ne',checkDotAll);a.load('rax',slot(96));a.or('rax',8);a.store(slot(96),'rax');a.jmp(nextFlag);
  a.label(checkDotAll);
  a.cmp('rax',115);const checkUnicode=a.unique('checkUnicode');a.jcc('ne',checkUnicode);a.load('rax',slot(96));a.or('rax',1);a.store(slot(96),'rax');a.jmp(nextFlag);
  a.label(checkUnicode);a.cmp('rax',117);const checkMultiline=a.unique('checkMultiline');a.jcc('ne',checkMultiline);a.load('rax',slot(96));a.or('rax',2);a.store(slot(96),'rax');a.jmp(nextFlag);
  a.label(checkMultiline);a.cmp('rax',109);a.jcc('ne',nextFlag);a.load('rax',slot(96));a.or('rax',4);a.store(slot(96),'rax');a.label(nextFlag);
  a.add('r10',2);a.sub('r9',1);a.jmp(flagScan);a.label(flagsDone);
  a.load('rax',slot(96));a.and('rax',10);a.cmp('rax',10);failIf(a,'e','rt.throwTypeError');
  a.load('r10',{base:'rcx',disp:RegExpLayout.pattern});a.store(slot(56),'r10');
  a.mov('rcx','r10');a.load('rdx',slot(48));a.load('r8',slot(80));a.load('r9',slot(96));a.load('r10',slot(88));a.test('r10','r10');const notSticky=a.unique('notSticky');a.jcc('e',notSticky);a.or('r9',32);a.label(notSticky);
  a.store(slot(128),'r9');a.call('rt.regexpFindLiteralAlternatives');a.cmp('rax',-2);a.jcc('ne',done);
  a.load('rcx',slot(56));a.load('rdx',slot(48));a.load('r8',slot(80));a.load('r9',slot(128));
  a.call('rt.regexpFindUnicodeEscape');a.cmp('rax',-2);a.jcc('ne',done);
  a.load('rcx',slot(56));a.load('rdx',slot(48));a.load('r8',slot(80));a.load('r9',slot(128));
  a.call('rt.regexpFindUnicodeDot');a.cmp('rax',-2);a.jcc('ne',done);
  a.load('rcx',slot(56));a.load('rdx',slot(48));a.load('r8',slot(80));a.load('r9',slot(128));
  a.call('rt.regexpFindSingleQuantifier');a.cmp('rax',-2);a.jcc('ne',done);
  a.load('r10',slot(56));
  a.load('r9',{base:'r10'});a.lea('rdx',{base:'r10',disp:8});a.mov('r8',0);
  const validate=a.unique('validate'),validated=a.unique('validated'),escape=a.unique('escape'),advance=a.unique('advance'),classValidate=a.unique('classValidate'),startAnchor=a.unique('startAnchor'),endAnchor=a.unique('endAnchor');a.label(validate);a.test('r9','r9');a.jcc('e',validated);
  a.load('rax',{base:'rdx'},16);a.cmp('rax',92);a.jcc('e',escape);a.cmp('rax',91);a.jcc('e',classValidate);
  a.cmp('rax',94);a.jcc('e',startAnchor);a.cmp('rax',36);a.jcc('e',endAnchor);
  for(const code of '*+?()[]{}|'){a.cmp('rax',code.charCodeAt(0));failIf(a,'e','rt.throwTypeError');}
  a.cmp('rax',127);const asciiPattern=a.unique('asciiPattern');a.jcc('be',asciiPattern);a.load('rax',slot(96));a.and('rax',8);failIf(a,'ne','rt.throwTypeError');a.label(asciiPattern);a.load('rax',{base:'rdx'},16);
  a.cmp('rax',46);const ordinary=a.unique('ordinary');a.jcc('ne',ordinary);a.load('rax',slot(96));a.and('rax',2);failIf(a,'ne','rt.throwTypeError');a.label(ordinary);
  a.add('rdx',2);a.sub('r9',1);a.jmp(advance);
  a.label(escape);a.cmp('r9',1);failIf(a,'e','rt.throwTypeError');a.load('rax',{base:'rdx',disp:2},16);
  const validEscape=a.unique('validEscape');for(const code of 'dDwWsSbBnrtvf0\\.^$*+?()[]{}|/'){a.cmp('rax',code.charCodeAt(0));a.jcc('e',validEscape);}
  a.call('rt.throwTypeError');a.label(validEscape);a.add('rdx',4);a.sub('r9',2);
  a.cmp('rax',98);a.jcc('e',validate);a.cmp('rax',66);a.jcc('e',validate);
  const nextValidated=a.unique('nextValidated');a.jmp(nextValidated);
  a.label(classValidate);a.load('rax',slot(96));a.and('rax',10);failIf(a,'ne','rt.throwTypeError');
  a.store(slot(104),'r8');a.store(slot(112),'r9');a.store(slot(120),'rdx');a.mov('rcx','rdx');a.mov('rdx',0);a.mov('r8','r9');a.call('rt.regexpClassContains');
  a.mov('r10','rdx');a.mov('rax','rdx');a.shl('rax',1);a.load('rdx',slot(120));a.add('rdx','rax');a.load('r9',slot(112));a.sub('r9','r10');
  a.load('r8',slot(104));a.add('r8',1);a.jmp(validate);
  a.label(startAnchor);a.load('r10',slot(56));a.add('r10',8);a.cmp('rdx','r10');failIf(a,'ne','rt.throwTypeError');a.add('rdx',2);a.sub('r9',1);a.jmp(validate);
  a.label(endAnchor);a.cmp('r9',1);failIf(a,'ne','rt.throwTypeError');a.add('rdx',2);a.sub('r9',1);a.jmp(validate);
  a.label(nextValidated);
  a.label(advance);a.add('r8',1);a.jmp(validate);a.label(validated);a.store(slot(64),'r8');
  a.load('r10',slot(48));a.load('rax',{base:'r10'});a.load('r9',slot(64));const no=a.unique('no'),yes=a.unique('yes');a.cmp('rax','r9');a.jcc('b',no);
  a.sub('rax','r9');a.store(slot(72),'rax');
  const outer=a.unique('outer'),inner=a.unique('inner'),mismatch=a.unique('mismatch');
  a.load('rax',slot(96));a.and('rax',2);a.test('rax','rax');const initialReady=a.unique('initialReady');a.jcc('e',initialReady);
  a.load('rax',slot(80));a.test('rax','rax');a.jcc('e',initialReady);
  a.load('r10',slot(48));a.load('r11',{base:'r10'});a.cmp('rax','r11');a.jcc('ae',initialReady);
  a.shl('rax',1);a.add('r10',8);a.add('r10','rax');a.load('rax',{base:'r10'},16);a.cmp('rax',0xdc00);a.jcc('b',initialReady);a.cmp('rax',0xdfff);a.jcc('a',initialReady);
  a.load('rax',{base:'r10',disp:-2},16);a.cmp('rax',0xd800);a.jcc('b',initialReady);a.cmp('rax',0xdbff);a.jcc('a',initialReady);
  a.load('rax',slot(80));a.sub('rax',1);a.store(slot(80),'rax');
  a.label(initialReady);a.label(outer);
  a.load('rax',slot(80));a.load('r10',slot(72));a.cmp('rax','r10');a.jcc('a',no);
  a.shl('rax',1);a.load('rdx',slot(48));a.add('rdx',8);a.add('rdx','rax');a.load('r8',slot(56));a.load('r9',{base:'r8'});a.add('r8',8);
  a.label(inner);a.test('r9','r9');a.jcc('e',yes);a.load('r11',{base:'r8'},16);
  const literal=a.unique('literal'),matched=a.unique('matched'),escaped=a.unique('escaped'),classMatch=a.unique('classMatch'),startMatch=a.unique('startMatch'),endMatch=a.unique('endMatch'),anchorMatched=a.unique('anchorMatched'),boundary=a.unique('boundary');
  a.cmp('r11',94);a.jcc('e',startMatch);a.cmp('r11',36);a.jcc('e',endMatch);
  a.cmp('r11',92);const notBoundary=a.unique('notBoundary');a.jcc('ne',notBoundary);a.load('r10',{base:'r8',disp:2},16);a.cmp('r10',98);a.jcc('e',boundary);a.cmp('r10',66);a.jcc('e',boundary);a.label(notBoundary);
  a.load('r10',{base:'rdx'},16);
  a.cmp('r11',92);a.jcc('e',escaped);a.cmp('r11',91);a.jcc('e',classMatch);
  a.cmp('r11',46);a.jcc('ne',literal);
  a.load('rax',slot(96));a.and('rax',1);a.test('rax','rax');a.jcc('ne',matched);
  for(const lineEnd of [10,13,0x2028,0x2029]){a.cmp('r10',lineEnd);a.jcc('e',mismatch);}
  a.jmp(matched);
  a.label(escaped);a.add('r8',2);a.sub('r9',1);a.load('r11',{base:'r8'},16);
  const digit=a.unique('digit'),notDigit=a.unique('notDigit');a.cmp('r11',100);a.jcc('e',digit);a.cmp('r11',68);a.jcc('e',notDigit);
  const word=a.unique('word'),space=a.unique('space');a.cmp('r11',119);a.jcc('e',word);a.cmp('r11',87);a.jcc('e',word);
  a.cmp('r11',115);a.jcc('e',space);a.cmp('r11',83);a.jcc('e',space);
  for(const [code,value] of [['n',10],['r',13],['t',9],['v',11],['f',12],['0',0]] as const){
   const next=a.unique('nextEscape');a.cmp('r11',code.charCodeAt(0));a.jcc('ne',next);a.mov('r11',value);a.jmp(literal);a.label(next);
  }
  a.jmp(literal);
  a.label(digit);a.cmp('r10',48);a.jcc('b',mismatch);a.cmp('r10',57);a.jcc('a',mismatch);a.jmp(matched);
  a.label(notDigit);a.cmp('r10',48);a.jcc('b',matched);a.cmp('r10',57);a.jcc('be',mismatch);a.jmp(matched);
  const wordYes=a.unique('wordYes'),wordNo=a.unique('wordNo');a.label(word);
  for(const [first,last] of [[48,57],[65,90],[97,122]] as const){const next=a.unique('nextWordRange');a.cmp('r10',first);a.jcc('b',next);a.cmp('r10',last);a.jcc('be',wordYes);a.label(next);}
  a.cmp('r10',95);a.jcc('e',wordYes);a.jmp(wordNo);
  a.label(wordYes);a.cmp('r11',119);a.jcc('e',matched);a.jmp(mismatch);
  a.label(wordNo);a.cmp('r11',87);a.jcc('e',matched);a.jmp(mismatch);
  const spaceYes=a.unique('spaceYes'),spaceNo=a.unique('spaceNo');a.label(space);
  a.cmp('r10',9);const afterAscii=a.unique('afterAscii');a.jcc('b',afterAscii);a.cmp('r10',13);a.jcc('be',spaceYes);a.label(afterAscii);
  a.cmp('r10',0x2000);const afterUnicodeRange=a.unique('afterUnicodeRange');a.jcc('b',afterUnicodeRange);a.cmp('r10',0x200a);a.jcc('be',spaceYes);a.label(afterUnicodeRange);
  for(const code of [32,160,0x1680,0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff]){a.cmp('r10',code);a.jcc('e',spaceYes);}
  a.jmp(spaceNo);a.label(spaceYes);a.cmp('r11',115);a.jcc('e',matched);a.jmp(mismatch);
  a.label(spaceNo);a.cmp('r11',83);a.jcc('e',matched);a.jmp(mismatch);
  a.label(startMatch);a.load('r10',slot(48));a.add('r10',8);a.cmp('rdx','r10');a.jcc('e',anchorMatched);
  a.load('rax',slot(96));a.and('rax',4);a.test('rax','rax');a.jcc('e',mismatch);a.load('r10',{base:'rdx',disp:-2},16);
  for(const code of [10,13,0x2028,0x2029]){a.cmp('r10',code);a.jcc('e',anchorMatched);}a.jmp(mismatch);
  a.label(endMatch);a.load('r10',slot(48));a.load('rax',{base:'r10'});a.shl('rax',1);a.add('r10',8);a.add('r10','rax');a.cmp('rdx','r10');a.jcc('e',anchorMatched);
  a.load('rax',slot(96));a.and('rax',4);a.test('rax','rax');a.jcc('e',mismatch);
  a.load('rax',{base:'rdx'},16);const lineFound=a.unique('lineFound');for(const code of [10,13,0x2028,0x2029]){a.cmp('rax',code);a.jcc('e',lineFound);}a.jmp(mismatch);
  a.label(lineFound);
  a.label(anchorMatched);a.add('r8',2);a.sub('r9',1);a.jmp(inner);
  a.label(boundary);a.store(slot(64),'r10');a.store(slot(104),'rdx');a.store(slot(112),'r8');a.store(slot(120),'r9');
  a.load('r10',slot(48));a.add('r10',8);a.cmp('rdx','r10');const prevZero=a.unique('prevZero'),prevReady=a.unique('prevReady');a.jcc('e',prevZero);
  a.load('rcx',{base:'rdx',disp:-2},16);a.call('rt.regexpIsWordCodeUnit');a.jmp(prevReady);a.label(prevZero);a.mov('rax',0);a.label(prevReady);a.store(slot(128),'rax');
  a.load('r10',slot(48));a.load('rax',{base:'r10'});a.shl('rax',1);a.add('r10',8);a.add('r10','rax');a.load('rdx',slot(104));a.cmp('rdx','r10');const nextZero=a.unique('nextZero'),nextReady=a.unique('nextReady');a.jcc('e',nextZero);
  a.load('rcx',{base:'rdx'},16);a.call('rt.regexpIsWordCodeUnit');a.jmp(nextReady);a.label(nextZero);a.mov('rax',0);a.label(nextReady);
  a.load('r10',slot(128));a.xor('rax','r10');a.load('r10',slot(64));a.cmp('r10',98);const nonBoundary=a.unique('nonBoundary'),boundaryReady=a.unique('boundaryReady');a.jcc('ne',nonBoundary);a.test('rax','rax');a.jcc('e',mismatch);a.jmp(boundaryReady);
  a.label(nonBoundary);a.test('rax','rax');a.jcc('ne',mismatch);a.label(boundaryReady);
  a.load('rdx',slot(104));a.load('r8',slot(112));a.add('r8',4);a.load('r9',slot(120));a.sub('r9',2);a.jmp(inner);
  a.label(classMatch);a.store(slot(104),'rdx');a.store(slot(112),'r8');a.store(slot(120),'r9');a.mov('rcx','r8');a.mov('rdx','r10');a.mov('r8','r9');a.call('rt.regexpClassContains');
  a.test('rax','rax');a.jcc('e',mismatch);a.mov('r11','rdx');a.load('r9',slot(120));a.sub('r9','r11');a.shl('r11',1);a.load('r8',slot(112));a.add('r8','r11');a.load('rdx',slot(104));a.add('rdx',2);a.jmp(inner);
  a.label(literal);a.cmp('r10','r11');a.jcc('e',matched);
  a.load('rax',slot(96));a.and('rax',8);a.test('rax','rax');a.jcc('e',mismatch);
  a.mov('rax','r11');a.or('rax',32);a.cmp('rax',97);a.jcc('b',mismatch);a.cmp('rax',122);a.jcc('a',mismatch);
  a.mov('rax','r10');a.or('rax',32);a.cmp('rax',97);a.jcc('b',mismatch);a.cmp('rax',122);a.jcc('a',mismatch);
  a.or('r11',32);a.cmp('rax','r11');a.jcc('ne',mismatch);a.label(matched);
  a.add('rdx',2);a.add('r8',2);a.sub('r9',1);a.jmp(inner);
  a.label(mismatch);a.load('rax',slot(88));a.test('rax','rax');a.jcc('ne',no);
  a.load('rax',slot(80));a.add('rax',1);a.store(slot(80),'rax');
  a.load('r10',slot(96));a.and('r10',2);a.test('r10','r10');a.jcc('e',outer);
  a.load('r10',slot(48));a.load('r11',{base:'r10'});a.cmp('rax','r11');a.jcc('ae',outer);
  a.shl('rax',1);a.add('r10',8);a.add('r10','rax');a.load('rax',{base:'r10'},16);a.cmp('rax',0xdc00);a.jcc('b',outer);a.cmp('rax',0xdfff);a.jcc('a',outer);
  a.load('rax',{base:'r10',disp:-2},16);a.cmp('rax',0xd800);a.jcc('b',outer);a.cmp('rax',0xdbff);a.jcc('a',outer);
  a.load('rax',slot(80));a.add('rax',1);a.store(slot(80),'rax');a.jmp(outer);
  a.label(yes);a.mov('rax','rdx');a.load('r10',slot(48));a.add('r10',8);a.sub('rax','r10');a.shr('rax',1);a.load('r10',slot(80));a.sub('rax','r10');a.mov('rdx','rax');a.mov('rax','r10');
  a.jmp(done);a.label(no);a.mov('rax',-1);a.mov('rdx',0);a.label(done);
 });
 rootedFn(b,'rt.regexpExec.fn.code',328,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:8},{kind:'locals',offset:216,count:6}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('r10',slot(frame+40));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store(slot(64+offset),'rax');}
  a.load('rax',slot(64));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',RegExpKind);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(80),'rax');a.store(slot(88),'rax');
  const absent=a.unique('absent');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',absent);
  a.load('r10',slot(56));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store(slot(80+offset),'rax');}a.label(absent);
  a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.call('rt.toString');
  a.load('r10',slot(72));a.load('r8',{base:'r10',disp:RegExpLayout.flags});a.load('r9',{base:'r8'});a.add('r8',8);a.mov('r11',0);
  const flagScan=a.unique('flagScan'),flagsDone=a.unique('flagsDone'),nextFlag=a.unique('nextFlag');a.label(flagScan);a.test('r9','r9');a.jcc('e',flagsDone);
  a.load('rax',{base:'r8'},16);a.cmp('rax',103);a.jcc('ne',nextFlag);a.or('r11',1);a.label(nextFlag);
  a.cmp('rax',121);const notSticky=a.unique('notSticky');a.jcc('ne',notSticky);a.or('r11',2);a.label(notSticky);
  a.add('r8',2);a.sub('r9',1);a.jmp(flagScan);a.label(flagsDone);a.store(slot(208),'r11');
  a.mov('rax',0);a.store(slot(192),'rax');a.store(slot(200),'rax');a.mov('rax','r11');a.and('rax',2);a.store(slot(200),'rax');
  const indexReady=a.unique('indexReady');
  a.mov('rax',4);a.store(slot(128),'rax');a.lea('rax',{rip:'rt.str.lastIndex'});a.store(slot(136),'rax');
  a.lea('rcx',slot(176));a.lea('rdx',slot(64));a.lea('r8',slot(128));a.call('rt.getProperty');
  a.lea('rcx',slot(160));a.lea('rdx',slot(176));a.call('rt.toNumber');
  a.movsd('xmm0',slot(168));a.ucomisd('xmm0','xmm0');a.jcc('p',indexReady);
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',indexReady);
  a.load('r10',slot(104));a.load('r10',{base:'r10'});a.cvtsi2sd('xmm1','r10');a.ucomisd('xmm0','xmm1');const tooFar=a.unique('tooFar');a.jcc('a',tooFar);
  a.cvttsd2si('rax','xmm0');a.store(slot(192),'rax');a.jmp(indexReady);
  a.label(tooFar);a.add('r10',1);a.store(slot(192),'r10');a.label(indexReady);
  a.load('rax',slot(208));a.test('rax','rax');const useIndex=a.unique('useIndex');a.jcc('ne',useIndex);a.mov('rax',0);a.store(slot(192),'rax');a.label(useIndex);
  const done=a.unique('done'),nativeMatch=a.unique('nativeMatch'),vmMatch=a.unique('vmMatch');
  a.load('r10',slot(72));a.load('r10',{base:'r10',disp:RegExpLayout.pattern});a.load('r11',{base:'r10'});a.add('r10',8);
  const scan=a.unique('vmScan'),scanEscape=a.unique('vmScanEscape'),scanClass=a.unique('vmScanClass'),scanNext=a.unique('vmScanNext'),inClass=a.unique('vmInClass');
  a.mov('r8',0);a.label(scan);a.test('r11','r11');a.jcc('e',nativeMatch);
  a.load('rax',{base:'r10'},16);a.cmp('rax',92);a.jcc('e',scanEscape);a.cmp('rax',91);a.jcc('e',scanClass);a.cmp('rax',93);a.jcc('e',scanClass);
  a.test('r8','r8');a.jcc('ne',scanNext);
  for(const code of '(){}*+?|'){a.cmp('rax',code.charCodeAt(0));a.jcc('e',vmMatch);}
  a.jmp(scanNext);
  a.label(scanEscape);a.cmp('r11',1);a.jcc('be',scanNext);a.load('rax',{base:'r10',disp:2},16);
  a.test('r8','r8');a.jcc('ne',vmMatch);
  for(const code of [112,80,107,120,88,99,117]){a.cmp('rax',code);a.jcc('e',vmMatch);}a.add('r10',2);a.sub('r11',1);a.jmp(scanNext);
  a.label(scanClass);a.xor('r8',1);
  a.label(scanNext);a.add('r10',2);a.sub('r11',1);a.jmp(scan);
  a.label(vmMatch);
  for(const [from,to] of [[64,216],[96,232]] as const)for(const offset of [0,8]){a.load('rax',slot(from+offset));a.store(slot(to+offset),'rax');}
  a.mov('rax',3);a.store(slot(248),'rax');a.load('rax',slot(192));a.cvtsi2sd('xmm0','rax');a.storesd(slot(256),'xmm0');
  a.mov('rax',2);a.store(slot(264),'rax');a.load('rax',slot(200));a.test('rax','rax');const stickyReady=a.unique('vmStickyReady');a.jcc('e',stickyReady);a.mov('rax',1);a.label(stickyReady);a.store(slot(272),'rax');
  a.mov('rax',4);a.store(slot(280),'rax');a.store(slot(296),'rax');
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:RegExpLayout.pattern});a.store(slot(288),'rax');
  a.load('rax',{base:'r10',disp:RegExpLayout.flags});a.store(slot(304),'rax');
  a.lea('rax',{rip:'rt.undefinedValue'});a.store(slot(32),'rax');
  a.load('rcx',slot(40));a.load('rdx',{rip:'rt.regexpVmCell'});a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');a.mov('r8',6);a.lea('r9',slot(216));a.call('rt.invoke');a.jmp(done);
  a.label(nativeMatch);
  a.load('rcx',slot(72));a.load('rdx',slot(104));a.load('r8',slot(192));a.load('r9',slot(200));a.call('rt.regexpFindPlain');a.store(slot(192),'rax');a.store(slot(200),'rdx');
  const writeLastIndex=(zero:boolean)=>{
   a.mov('rax',4);a.store(slot(128),'rax');a.lea('rax',{rip:'rt.str.lastIndex'});a.store(slot(136),'rax');
   if(zero)a.mov('rax',0);else{a.load('rax',slot(192));a.load('r10',slot(200));a.add('rax','r10');}
   a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(144),'rax');a.storesd(slot(152),'xmm0');
   a.lea('rcx',slot(64));a.lea('rdx',slot(128));a.lea('r8',slot(144));a.mov('r9',2);a.call('rt.setProperty');
  };
  const found=a.unique('found');a.cmp('rax',-1);a.jcc('ne',found);
  a.load('rax',slot(208));a.test('rax','rax');const skipReset=a.unique('skipReset');a.jcc('e',skipReset);writeLastIndex(true);a.label(skipReset);
  a.load('rcx',slot(40));a.mov('rax',1);a.store({base:'rcx'},'rax');a.mov('rax',0);a.store({base:'rcx',disp:8},'rax');a.jmp(done);
  a.label(found);a.load('rax',slot(208));a.test('rax','rax');const skipAdvance=a.unique('skipAdvance');a.jcc('e',skipAdvance);writeLastIndex(false);a.label(skipAdvance);
  a.load('r10',slot(200));a.mov('rax','r10');a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');
  a.store(slot(184),'rax');a.mov('r10',4);a.store(slot(176),'r10');a.load('r10',slot(200));a.store({base:'rax'},'r10');a.add('rax',8);
  a.load('rdx',slot(104));a.add('rdx',8);a.load('r10',slot(192));a.shl('r10',1);a.add('rdx','r10');
  a.load('r8',slot(200));const copy=a.unique('copy'),copied=a.unique('copied');a.label(copy);a.test('r8','r8');a.jcc('e',copied);
  a.load('r10',{base:'rdx'},16);a.store({base:'rax'},'r10',16);a.add('rdx',2);a.add('rax',2);a.sub('r8',1);a.jmp(copy);a.label(copied);
  a.lea('rcx',slot(112));a.mov('rdx',1);a.mov('r8',1);a.call('rt.newObject');
  a.load('rax',slot(176));a.store(slot(144),'rax');a.load('rax',slot(184));a.store(slot(152),'rax');
  const put=(key:string)=>{a.mov('rax',4);a.store(slot(128),'rax');a.lea('rax',{rip:'rt.regexpKey.'+key});a.store(slot(136),'rax');a.lea('rcx',slot(112));a.lea('rdx',slot(128));a.lea('r8',slot(144));a.mov('r9',1);a.call('rt.setProperty');};
  put('0');
  a.load('rax',slot(192));a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(144),'rax');a.storesd(slot(152),'xmm0');put('index');
  for(const offset of [0,8]){a.load('rax',slot(96+offset));a.store(slot(144+offset),'rax');}put('input');
  a.mov('rax',0);a.store(slot(144),'rax');a.store(slot(152),'rax');put('groups');
  a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',slot(112+offset));a.store({base:'rcx',disp:offset},'rax');}
  a.label(done);
 });
 rootedFn(b,'rt.regexpTest.fn.code',184,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:6}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('r10',slot(frame+40));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store(slot(64+offset),'rax');}
  a.load('rax',slot(64));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(80),'rax');a.store(slot(88),'rax');
  const absent=a.unique('absent');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',absent);
  a.load('r10',slot(56));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store(slot(80+offset),'rax');}a.label(absent);
  a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.call('rt.toString');
  a.mov('rax',4);a.store(slot(112),'rax');a.lea('rax',{rip:'rt.regexpExec.fn.key'});a.store(slot(120),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(64));a.lea('r8',slot(112));a.call('rt.getProperty');
  a.lea('rax',slot(64));a.store(slot(32),'rax');a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.mov('r8',1);a.lea('r9',slot(96));a.call('rt.invoke');
  a.load('rax',slot(144));a.cmp('rax',1);const empty=a.unique('empty'),done=a.unique('done');a.jcc('e',empty);
  a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.mov('rax',1);a.jmp(done);a.label(empty);a.mov('rax',0);a.label(done);
  a.load('rcx',slot(40));a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
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
 b.fn('rt.validateRegExpStructure',40,a=>{
  a.load('r9',{base:'rcx'});a.lea('r8',{base:'rcx',disp:8});a.mov('r10',0);a.mov('r11',0);
  const loop=a.unique('loop'),advance=a.unique('advance'),escaped=a.unique('escaped'),inClass=a.unique('inClass'),close=a.unique('close'),done=a.unique('done'),invalid=a.unique('invalid');
  a.label(loop);a.test('r9','r9');a.jcc('e',done);a.load('rax',{base:'r8'},16);
  a.cmp('rax',92);a.jcc('e',escaped);a.test('r11','r11');a.jcc('ne',inClass);
  a.cmp('rax',91);const openClass=a.unique('openClass');a.jcc('e',openClass);
  a.cmp('rax',40);const openGroup=a.unique('openGroup');a.jcc('e',openGroup);
  a.cmp('rax',41);a.jcc('e',close);a.jmp(advance);
  a.label(openClass);a.mov('r11',1);a.jmp(advance);
  a.label(openGroup);a.add('r10',1);a.jmp(advance);
  a.label(close);a.test('r10','r10');a.jcc('e',invalid);a.sub('r10',1);a.jmp(advance);
  a.label(inClass);a.cmp('rax',93);a.jcc('ne',advance);a.mov('r11',0);a.jmp(advance);
  a.label(escaped);a.add('r8',2);a.sub('r9',1);a.test('r9','r9');a.jcc('e',invalid);
  a.label(advance);a.add('r8',2);a.sub('r9',1);a.jmp(loop);
  a.label(done);a.test('r10','r10');a.jcc('ne',invalid);a.test('r11','r11');a.jcc('ne',invalid);const finish=a.unique('finish');a.jmp(finish);
  a.label(invalid);a.call('rt.throwSyntaxError');a.label(finish);
 });
 rootedFn(b,'rt.regexpIsRegExp',104,[{kind:'value',register:'rdx'},{kind:'locals',offset:48,count:2}],a=>{
  a.store(slot(40),'rdx');a.load('rax',{base:'rdx'});const no=a.unique('no'),done=a.unique('done'),internal=a.unique('internal');a.cmp('rax',5);a.jcc('ne',no);
  a.mov('rax',6);a.store(slot(48),'rax');a.lea('rax',{rip:'rt.Symbol.match.value'});a.store(slot(56),'rax');
  a.lea('rcx',slot(64));a.load('rdx',slot(40));a.lea('r8',slot(48));a.call('rt.getProperty');
  a.load('rax',slot(64));a.test('rax','rax');a.jcc('e',internal);
  a.lea('rcx',slot(64));a.call('rt.toBoolean');a.jmp(done);
  a.label(internal);a.load('rdx',slot(40));a.load('rdx',{base:'rdx',disp:8});a.load('rax',{base:'rdx',disp:O.kind});a.cmp('rax',RegExpKind);a.mov('rax',0);a.jcc('ne',done);a.mov('rax',1);a.jmp(done);
  a.label(no);a.mov('rax',0);a.label(done);
 });
 rootedFn(b,'rt.newRegExp',296,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:5},{kind:'locals',offset:160,count:1},{kind:'locals',offset:176,count:6}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.mov('rax',0);a.store(slot(112),'rax');a.store(slot(120),'rax');a.store(slot(96),'rax');a.store(slot(104),'rax');
  const noPattern=a.unique('noPattern');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',noPattern);
  a.load('r10',slot(56));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store(slot(112+offset),'rax');}a.label(noPattern);
  const noFlags=a.unique('noFlags');a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',noFlags);
  a.load('r10',slot(56));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:16+offset});a.store(slot(96+offset),'rax');}a.label(noFlags);
  a.lea('rdx',slot(112));a.call('rt.regexpIsRegExp');a.test('rax','rax');const ordinary=a.unique('ordinary'),convert=a.unique('convert');a.jcc('e',ordinary);
  a.mov('rax',4);a.store(slot(128),'rax');a.lea('rax',{rip:'rt.regexpPrototype.source.key'});a.store(slot(136),'rax');
  a.lea('rcx',slot(80));a.lea('rdx',slot(112));a.lea('r8',slot(128));a.call('rt.getProperty');
  a.load('rax',slot(96));a.test('rax','rax');a.jcc('ne',convert);
  a.mov('rax',4);a.store(slot(128),'rax');a.lea('rax',{rip:'rt.regexpPrototype.flags.key'});a.store(slot(136),'rax');
  a.lea('rcx',slot(96));a.lea('rdx',slot(112));a.lea('r8',slot(128));a.call('rt.getProperty');a.jmp(convert);
  a.label(ordinary);for(const offset of [0,8]){a.load('rax',slot(112+offset));a.store(slot(80+offset),'rax');}
  a.label(convert);
  for(const offset of [80,96]){
   a.load('rax',slot(offset));a.test('rax','rax');const supplied=a.unique('supplied'),ready=a.unique('ready');a.jcc('ne',supplied);
   a.mov('rax',4);a.store(slot(offset),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(offset+8),'rax');a.jmp(ready);
   a.label(supplied);a.lea('rcx',slot(offset));a.lea('rdx',slot(offset));a.call('rt.toString');a.label(ready);
  }
  a.load('rcx',slot(104));a.call('rt.validateRegExpFlags');a.store(slot(72),'rax');
  a.load('rcx',slot(88));a.call('rt.validateRegExpStructure');
  const withoutVm=a.unique('withoutVm');
  a.load('rdx',{rip:'rt.regexpVmCell'});a.test('rdx','rdx');a.jcc('e',withoutVm);
  a.mov('rax',0);
  for(const offset of [176,192,208,224]){a.store(slot(offset),'rax');a.store(slot(offset+8),'rax');}
  for(const [source,target] of [[80,240],[96,256]] as const)for(const offset of [0,8]){a.load('rax',slot(source+offset));a.store(slot(target+offset),'rax');}
  a.lea('rax',{rip:'rt.undefinedValue'});a.store(slot(32),'rax');
  a.lea('rcx',slot(160));a.mov('r8',6);a.lea('r9',slot(176));a.call('rt.invoke');
  a.label(withoutVm);
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
 rootedFn(b,'rt.RegExp.code',152,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:3}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');const create=a.unique('create'),reuse=a.unique('reuse'),done=a.unique('done');
  a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',create);
  a.load('r10',slot(56));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store(slot(64+offset),'rax');}
  a.lea('rdx',slot(64));a.call('rt.regexpIsRegExp');a.test('rax','rax');a.jcc('e',create);
  a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',reuse);a.load('r10',slot(56));a.load('rax',{base:'r10',disp:16});a.test('rax','rax');a.jcc('ne',create);
  a.label(reuse);a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.str.constructor'});a.store(slot(88),'rax');
  a.lea('rcx',slot(96));a.lea('rdx',slot(64));a.lea('r8',slot(80));a.call('rt.getProperty');
  a.load('rax',slot(96));a.cmp('rax',5);a.jcc('ne',create);a.load('rax',slot(104));a.lea('r10',{rip:'rt.RegExp'});a.cmp('rax','r10');a.jcc('ne',create);
  a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',slot(64+offset));a.store({base:'rcx',disp:offset},'rax');}a.jmp(done);
  a.label(create);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.call('rt.newRegExp');a.label(done);
 });
 rootedFn(b,'rt.RegExp.construct',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'}],(a,frame)=>{
  a.store(slot(40),'rcx');a.call('rt.newRegExp');
  // The prepared receiver has the prototype selected from new.target.
  a.load('r10',slot(frame+40));a.load('r10',{base:'r10',disp:8});a.load('r10',{base:'r10',disp:O.prototype});
  a.load('rax',slot(40));a.load('rax',{base:'rax',disp:8});a.store({base:'rax',disp:O.prototype},'r10');
 });
}
