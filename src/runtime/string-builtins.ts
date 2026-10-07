import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {stringLiteral} from './value.js';
import {unicodeUpperCount,unicodeUpperData,unicodeLowerCount,unicodeLowerData,unicodeCasedCount,unicodeCasedData,unicodeCaseIgnorableCount,unicodeCaseIgnorableData} from './data/unicode-upper-data.js';

const searchMethods=['includes','startsWith','endsWith'] as const;
const positionMethods=['indexOf','lastIndexOf'] as const;
const indexMethods=['charAt','charCodeAt','codePointAt'] as const;
const trimMethods=['trim','trimStart','trimEnd'] as const;
const padMethods=['padStart','padEnd'] as const;
const stringMethods=[...searchMethods,...positionMethods,...indexMethods,'concat','toUpperCase','toLowerCase','toLocaleUpperCase','toLocaleLowerCase','substring','slice','repeat',...trimMethods,...padMethods];
export const stringBuiltinRoots=[...stringMethods.map(name=>'rt.string'+name[0]!.toUpperCase()+name.slice(1)+'.fn'),'rt.stringFromCharCode.fn','rt.stringFromCodePoint.fn','rt.stringRaw.fn'];
export const stringBuiltinPropertyRoots=[...stringMethods.flatMap(name=>builtinPropertyRoots('rt.string'+name[0]!.toUpperCase()+name.slice(1)+'.fn',name,'rt.stringPrototype')),...builtinPropertyRoots('rt.stringFromCharCode.fn','fromCharCode','rt.String'),...builtinPropertyRoots('rt.stringFromCodePoint.fn','fromCodePoint','rt.String'),...builtinPropertyRoots('rt.stringRaw.fn','raw','rt.String'),'rt.stringPrototype.trimLeft','rt.stringPrototype.trimRight'];

export function emitStringBuiltins(b:RuntimeBuilder):void {
 b.bundle.fragments.push(stringLiteral('rt.str.padSpace',' '));
 b.data('rt.unicodeUpper',unicodeUpperData);
 b.data('rt.unicodeLower',unicodeLowerData);
 b.data('rt.unicodeCased',unicodeCasedData);
 b.data('rt.unicodeCaseIgnorable',unicodeCaseIgnorableData);
 const finalSigma=new Uint8Array(16);const sigmaView=new DataView(finalSigma.buffer);sigmaView.setUint32(0,0x03a3,true);sigmaView.setUint32(4,1,true);sigmaView.setUint16(8,0x03c2,true);b.data('rt.sigmaFinal',finalSigma);
 for(const [name,count] of [['Cased',unicodeCasedCount],['CaseIgnorable',unicodeCaseIgnorableCount]] as const){
  b.fn('rt.is'+name,40,a=>{
   a.mov('r8',0);a.mov('r9',count);const loop=a.unique('classLoop'),less=a.unique('classLess'),yes=a.unique('classYes'),no=a.unique('classNo');
   a.label(loop);a.cmp('r8','r9');a.jcc('ae',no);a.mov('rax','r8');a.add('rax','r9');a.shr('rax',1);
   a.mov('r10','rax');a.shl('r10',3);a.lea('r11',{rip:'rt.unicode'+name});a.add('r10','r11');
   a.load('r11',{base:'r10'},32);a.cmp('rcx','r11');a.jcc('b',less);
   a.load('r11',{base:'r10',disp:4},32);a.cmp('rcx','r11');a.jcc('be',yes);
   a.add('rax',1);a.mov('r8','rax');a.jmp(loop);
   a.label(less);a.mov('r9','rax');a.jmp(loop);
   a.label(yes);a.mov('rax',1);a.jmp(no+'Return');a.label(no);a.mov('rax',0);a.label(no+'Return');
  });
 }
 for(const direction of ['Previous','Next'] as const){
  b.fn('rt.sigma'+direction,88,a=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');
   const loop=a.unique('sigmaLoop'),end=a.unique('sigmaEnd'),classify=a.unique('sigmaClassify'),found=a.unique('sigmaFound'),skip=a.unique('sigmaSkip');
   a.label(loop);a.load('rax',slot(48));a.load('r10',slot(40));
   if(direction==='Previous'){a.test('rax','rax');a.jcc('e',end);a.sub('rax',1);a.store(slot(48),'rax');}
   else {a.load('r11',{base:'r10'});a.cmp('rax','r11');a.jcc('ae',end);}
   a.shl('rax',1);a.add('r10',8);a.add('r10','rax');a.load('rcx',{base:'r10'},16);
   if(direction==='Previous'){
    a.cmp('rcx',0xdc00);a.jcc('b',classify);a.cmp('rcx',0xdfff);a.jcc('a',classify);
    a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',classify);
    a.load('rdx',{base:'r10',disp:-2},16);a.cmp('rdx',0xd800);a.jcc('b',classify);a.cmp('rdx',0xdbff);a.jcc('a',classify);
    a.sub('rcx',0xdc00);a.sub('rdx',0xd800);a.shl('rdx',10);a.add('rcx','rdx');a.add('rcx',0x10000);
    a.load('rax',slot(48));a.sub('rax',1);a.store(slot(48),'rax');
   }else{
    a.load('rax',slot(48));a.add('rax',1);a.store(slot(48),'rax');
    a.cmp('rcx',0xd800);a.jcc('b',classify);a.cmp('rcx',0xdbff);a.jcc('a',classify);
    a.load('rax',slot(40));a.load('r11',{base:'rax'});a.load('rax',slot(48));a.cmp('rax','r11');a.jcc('ae',classify);
    a.load('rdx',{base:'r10',disp:2},16);a.cmp('rdx',0xdc00);a.jcc('b',classify);a.cmp('rdx',0xdfff);a.jcc('a',classify);
    a.sub('rcx',0xd800);a.shl('rcx',10);a.sub('rdx',0xdc00);a.add('rcx','rdx');a.add('rcx',0x10000);
    a.load('rax',slot(48));a.add('rax',1);a.store(slot(48),'rax');
   }
   a.label(classify);a.store(slot(56),'rcx');a.call('rt.isCaseIgnorable');a.test('rax','rax');a.jcc('ne',skip);
   a.load('rcx',slot(56));a.call('rt.isCased');a.test('rax','rax');a.jcc('ne',found);a.jmp(end);
   a.label(skip);a.jmp(loop);
   a.label(found);a.mov('rax',1);a.jmp(end+'Return');a.label(end);a.mov('rax',0);a.label(end+'Return');
  });
 }
 prependFunctionBuiltin(b,'rt.stringFromCharCode.fn','fromCharCode',1,'rt.String');
 rootedFn(b,'rt.stringFromCharCode.fn.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  const empty=a.unique('empty'),loop=a.unique('loop'),done=a.unique('done'),finish=a.unique('finish');
  a.test('rdx','rdx');a.jcc('e',empty);a.mov('r10',0x3fffffffn);a.cmp('rdx','r10');failIf(a,'a','rt.throwRangeError');
  a.mov('rcx','rdx');a.shl('rcx',1);a.add('rcx',8);a.call('rt.alloc');
  a.mov('r10',4);a.store(slot(64),'r10');a.store(slot(72),'rax');a.load('r10',slot(48));a.store({base:'rax'},'r10');
  a.mov('rax',0);a.store(slot(96),'rax');
  a.label(loop);a.load('rax',slot(96));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('ae',done);
  a.shl('rax',4);a.load('rcx',slot(56));a.add('rcx','rax');a.call('rt.toInt32');a.and('rax',0xffff);
  a.load('r10',slot(96));a.shl('r10',1);a.load('rdx',slot(72));a.add('rdx',8);a.add('rdx','r10');a.store({base:'rdx'},'rax',16);
  a.load('rax',slot(96));a.add('rax',1);a.store(slot(96),'rax');a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(64+n));a.store({base:'rcx',disp:n},'rax');}a.jmp(finish);
  a.label(empty);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.lea('rax',{rip:'rt.str.empty'});a.store({base:'rcx',disp:8},'rax');a.label(finish);
 });
 prependFunctionBuiltin(b,'rt.stringFromCodePoint.fn','fromCodePoint',1,'rt.String');
 rootedFn(b,'rt.stringFromCodePoint.fn.code',152,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  const empty=a.unique('empty'),loop=a.unique('loop'),done=a.unique('done'),finish=a.unique('finish'),pair=a.unique('pair'),next=a.unique('next');
  a.test('rdx','rdx');a.jcc('e',empty);a.mov('r10',0x1fffffff);a.cmp('rdx','r10');failIf(a,'a','rt.throwRangeError');
  a.mov('rcx','rdx');a.shl('rcx',2);a.add('rcx',8);a.call('rt.alloc');
  a.mov('r10',4);a.store(slot(64),'r10');a.store(slot(72),'rax');
  a.mov('rax',0);a.store(slot(96),'rax');a.store(slot(104),'rax');
  a.label(loop);a.load('rax',slot(96));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('ae',done);
  a.shl('rax',4);a.load('rdx',slot(56));a.add('rdx','rax');a.lea('rcx',slot(80));a.call('rt.toNumber');
  a.movsd('xmm0',slot(88));a.ucomisd('xmm0','xmm0');failIf(a,'p','rt.throwRangeError');
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'b','rt.throwRangeError');
  a.mov('rax',0x10ffff);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'a','rt.throwRangeError');
  a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'ne','rt.throwRangeError');
  a.cmp('rax',0xffff);a.jcc('a',pair);
  a.load('r10',slot(104));a.shl('r10',1);a.load('rdx',slot(72));a.add('rdx',8);a.add('rdx','r10');a.store({base:'rdx'},'rax',16);
  a.load('rax',slot(104));a.add('rax',1);a.store(slot(104),'rax');a.jmp(next);
  a.label(pair);a.sub('rax',0x10000);a.mov('r10','rax');a.shr('r10',10);a.add('r10',0xd800);
  a.mov('r11','rax');a.and('r11',1023);a.add('r11',0xdc00);
  a.load('rax',slot(104));a.shl('rax',1);a.load('rdx',slot(72));a.add('rdx',8);a.add('rdx','rax');
  a.store({base:'rdx'},'r10',16);a.store({base:'rdx',disp:2},'r11',16);
  a.load('rax',slot(104));a.add('rax',2);a.store(slot(104),'rax');
  a.label(next);a.load('rax',slot(96));a.add('rax',1);a.store(slot(96),'rax');a.jmp(loop);
  a.label(done);a.load('rdx',slot(72));a.load('rax',slot(104));a.store({base:'rdx'},'rax');
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(64+n));a.store({base:'rcx',disp:n},'rax');}a.jmp(finish);
  a.label(empty);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.lea('rax',{rip:'rt.str.empty'});a.store({base:'rcx',disp:8},'rax');a.label(finish);
 });
 b.bundle.fragments.push(stringLiteral('rt.str.raw','raw'));
 prependFunctionBuiltin(b,'rt.stringRaw.fn','raw',1,'rt.String');
 rootedFn(b,'rt.stringRaw.fn.code',280,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:8}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  a.sub('rdx',1);a.store(slot(240),'rdx');
  a.lea('rcx',slot(80));a.load('rdx',slot(56));a.call('rt.toObject');
  a.mov('rax',4);a.store(slot(144),'rax');a.lea('rax',{rip:'rt.str.raw'});a.store(slot(152),'rax');
  a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.lea('r8',slot(144));a.call('rt.getProperty');
  a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.call('rt.toObject');
  a.lea('rcx',slot(112));a.call('rt.arrayFlattenLength');a.store(slot(232),'rax');
  a.mov('rax',4);a.store(slot(128),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(136),'rax');
  a.mov('rax',0);a.store(slot(224),'rax');
  const loop=a.unique('loop'),substitute=a.unique('substitute'),emptySub=a.unique('emptySub'),next=a.unique('next'),done=a.unique('done');
  a.label(loop);a.load('rax',slot(224));a.load('r10',slot(232));a.cmp('rax','r10');a.jcc('ae',done);
  a.lea('rcx',slot(144));a.load('rdx',slot(224));a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(160));a.lea('rdx',slot(112));a.lea('r8',slot(144));a.call('rt.getProperty');
  a.lea('rcx',slot(176));a.lea('rdx',slot(160));a.call('rt.toString');
  a.lea('rcx',slot(128));a.lea('rdx',slot(128));a.lea('r8',slot(176));a.call('rt.concat');
  a.load('rax',slot(224));a.add('rax',1);a.load('r10',slot(232));a.cmp('rax','r10');a.jcc('ae',done);
  a.load('rax',slot(224));a.load('r10',slot(240));a.cmp('rax','r10');a.jcc('ae',emptySub);
  a.add('rax',1);a.shl('rax',4);a.load('rdx',slot(56));a.add('rdx','rax');
  a.lea('rcx',slot(192));a.call('rt.toString');a.jmp(substitute);
  a.label(emptySub);a.mov('rax',4);a.store(slot(192),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(200),'rax');
  a.label(substitute);a.lea('rcx',slot(128));a.lea('rdx',slot(128));a.lea('r8',slot(192));a.call('rt.concat');
  a.label(next);a.load('rax',slot(224));a.add('rax',1);a.store(slot(224),'rax');a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(128+n));a.store({base:'rcx',disp:n},'rax');}
 });
 prependFunctionBuiltin(b,'rt.stringConcat.fn','concat',1,'rt.stringPrototype');
 rootedFn(b,'rt.stringConcat.fn.code',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:3}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}
  a.load('rax',slot(96));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
  a.lea('rcx',slot(64));a.lea('rdx',slot(96));a.call('rt.toString');
  a.mov('rax',0);a.store(slot(136),'rax');const loop=a.unique('loop'),done=a.unique('done');
  a.label(loop);a.load('rax',slot(136));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('ae',done);
  a.shl('rax',4);a.load('rdx',slot(56));a.add('rdx','rax');a.lea('rcx',slot(80));a.call('rt.toString');
  a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.lea('r8',slot(80));a.call('rt.concat');
  a.load('rax',slot(136));a.add('rax',1);a.store(slot(136),'rax');a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(64+n));a.store({base:'rcx',disp:n},'rax');}
 });
 for(const [name,table,count] of [['toUpperCase','rt.unicodeUpper',unicodeUpperCount],['toLowerCase','rt.unicodeLower',unicodeLowerCount]] as const){
 const symbol='rt.string'+name[0]!.toUpperCase()+name.slice(1)+'.fn';
 prependFunctionBuiltin(b,symbol,name,0,'rt.stringPrototype');
 rootedFn(b,symbol+'.code',200,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:3}],(a,frame)=>{
  a.store(slot(40),'rcx');
  a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}
  a.load('rax',slot(96));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
  a.lea('rcx',slot(64));a.lea('rdx',slot(96));a.call('rt.toString');
  a.load('r10',slot(72));a.load('rax',{base:'r10'});a.store(slot(160),'rax');
  a.mov('r11',0x15555555);a.cmp('rax','r11');failIf(a,'a','rt.throwRangeError');
  a.mov('r10',6);a.imul('rax','r10');a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');
  a.mov('r10',4);a.store(slot(80),'r10');a.store(slot(88),'rax');
  a.mov('rax',0);a.store(slot(112),'rax');a.store(slot(120),'rax');
  const loop=a.unique('upperLoop'),done=a.unique('upperDone'),one=a.unique('upperOne'),lookup=a.unique('upperLookup'),search=a.unique('upperSearch'),less=a.unique('upperLess'),found=a.unique('upperFound'),copy=a.unique('upperCopy'),write=a.unique('upperWrite'),next=a.unique('upperNext');
  a.label(loop);a.load('rax',slot(112));a.load('r10',slot(160));a.cmp('rax','r10');a.jcc('ae',done);
  a.mov('r10',1);a.store(slot(176),'r10');
  a.shl('rax',1);a.load('r10',slot(72));a.add('r10',8);a.add('r10','rax');a.load('rax',{base:'r10'},16);a.store(slot(128),'rax');
  a.cmp('rax',0xd800);a.jcc('b',lookup);a.cmp('rax',0xdbff);a.jcc('a',lookup);
  a.load('r11',slot(112));a.add('r11',1);a.load('rdx',slot(160));a.cmp('r11','rdx');a.jcc('ae',lookup);
  a.load('rdx',{base:'r10',disp:2},16);a.cmp('rdx',0xdc00);a.jcc('b',lookup);a.cmp('rdx',0xdfff);a.jcc('a',lookup);
  a.sub('rax',0xd800);a.shl('rax',10);a.sub('rdx',0xdc00);a.add('rax','rdx');a.add('rax',0x10000);a.store(slot(128),'rax');a.mov('r10',2);a.store(slot(176),'r10');
  a.label(lookup);a.mov('rax',0);a.store(slot(144),'rax');a.mov('rax',count);a.store(slot(152),'rax');
  a.label(search);a.load('rax',slot(144));a.load('r10',slot(152));a.cmp('rax','r10');a.jcc('ae',copy);
  a.add('rax','r10');a.shr('rax',1);a.store(slot(136),'rax');a.shl('rax',4);a.lea('r10',{rip:table});a.add('r10','rax');
  a.load('rax',{base:'r10'},32);a.load('r11',slot(128));a.cmp('rax','r11');a.jcc('e',found);a.jcc('a',less);
  a.load('rax',slot(136));a.add('rax',1);a.store(slot(144),'rax');a.jmp(search);
  a.label(less);a.load('rax',slot(136));a.store(slot(152),'rax');a.jmp(search);
  a.label(found);
  if(name==='toLowerCase'){
   const normal=a.unique('normalSigma');a.load('rax',slot(128));a.cmp('rax',0x03a3);a.jcc('ne',normal);
   a.load('rcx',slot(72));a.load('rdx',slot(112));a.call('rt.sigmaPrevious');a.test('rax','rax');a.jcc('e',normal);
   a.load('rcx',slot(72));a.load('rdx',slot(112));a.add('rdx',1);a.call('rt.sigmaNext');a.test('rax','rax');a.jcc('ne',normal);
   a.lea('r10',{rip:'rt.sigmaFinal'});a.jmp(normal+'Ready');
   a.label(normal);a.load('rax',slot(136));a.shl('rax',4);a.lea('r10',{rip:table});a.add('r10','rax');a.label(normal+'Ready');
  }
  a.load('rax',{base:'r10',disp:4},32);a.store(slot(168),'rax');a.store(slot(184),'r10');a.mov('rax',0);a.store(slot(192),'rax');a.jmp(write);
  a.label(copy);a.load('rax',slot(176));a.store(slot(168),'rax');a.mov('rax',0);a.store(slot(192),'rax');a.mov('r10',0);a.store(slot(184),'r10');
  a.label(write);a.load('rax',slot(192));a.load('r10',slot(168));a.cmp('rax','r10');a.jcc('ae',next);
  a.load('r10',slot(184));a.test('r10','r10');a.jcc('e',one);
  a.shl('rax',1);a.add('r10','rax');a.load('r11',{base:'r10',disp:8},16);a.jmp(write+'Value');
  a.label(one);a.load('r10',slot(112));a.add('r10','rax');a.shl('r10',1);a.load('rdx',slot(72));a.add('rdx',8);a.add('rdx','r10');a.load('r11',{base:'rdx'},16);
  a.label(write+'Value');a.load('r10',slot(120));a.shl('r10',1);a.load('rdx',slot(88));a.add('rdx',8);a.add('rdx','r10');a.store({base:'rdx'},'r11',16);
  a.load('rax',slot(120));a.add('rax',1);a.store(slot(120),'rax');a.load('rax',slot(192));a.add('rax',1);a.store(slot(192),'rax');a.jmp(write);
  a.label(next);a.load('rax',slot(112));a.load('r10',slot(176));a.add('rax','r10');a.store(slot(112),'rax');a.jmp(loop);
  a.label(done);a.load('r10',slot(88));a.load('rax',slot(120));a.store({base:'r10'},'rax');
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
 });
 }
 for(const [localeName,baseName] of [['toLocaleUpperCase','toUpperCase'],['toLocaleLowerCase','toLowerCase']] as const){
  const symbol='rt.string'+localeName[0]!.toUpperCase()+localeName.slice(1)+'.fn';
  prependFunctionBuiltin(b,symbol,localeName,0,'rt.stringPrototype');
  b.fn(symbol+'.code',56,a=>{
   a.load('rax',slot(96));a.store(slot(32),'rax');
   a.call('rt.string'+baseName[0]!.toUpperCase()+baseName.slice(1)+'.fn.code');
  });
 }
 for(const name of searchMethods){
 const symbol='rt.string'+name[0]!.toUpperCase()+name.slice(1)+'.fn';
 prependFunctionBuiltin(b,symbol,name,1,'rt.stringPrototype');
 rootedFn(b,symbol+'.code',248,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:5}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}
  a.load('rax',slot(96));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
  a.lea('rcx',slot(64));a.lea('rdx',slot(96));a.call('rt.toString');
  a.load('r10',slot(72));a.load('rax',{base:'r10'});a.store(slot(152),'rax');
  a.mov('rax',0);a.store(slot(96),'rax');a.store(slot(104),'rax');
  const noSearch=a.unique('noSearch');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',noSearch);
  a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}a.label(noSearch);
  const searchReady=a.unique('searchReady');a.load('rax',slot(96));a.cmp('rax',5);a.jcc('ne',searchReady);
  a.mov('rax',6);a.store(slot(112),'rax');a.lea('rax',{rip:'rt.Symbol.match.value'});a.store(slot(120),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.call('rt.getProperty');
  a.lea('rcx',slot(128));a.call('rt.toBoolean');a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  a.label(searchReady);a.lea('rcx',slot(80));a.lea('rdx',slot(96));a.call('rt.toString');
  a.load('r10',slot(88));a.load('rax',{base:'r10'});a.store(slot(160),'rax');
  if(name==='endsWith')a.load('rax',slot(152));else a.mov('rax',0);
  a.store(slot(144),'rax');const positionReady=a.unique('positionReady');a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',positionReady);
  a.load('rdx',slot(56));a.lea('rcx',slot(96));a.lea('rdx',{base:'rdx',disp:16});a.call('rt.toNumber');a.movsd('xmm0',slot(104));
  a.ucomisd('xmm0','xmm0');const zeroPosition=a.unique('zeroPosition');a.jcc('p',zeroPosition);a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',zeroPosition);
  a.load('rax',slot(152));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');const atEnd=a.unique('atEnd');a.jcc('ae',atEnd);
  a.cvttsd2si('rax','xmm0');a.store(slot(144),'rax');a.jmp(positionReady);
  a.label(atEnd);a.load('rax',slot(152));a.store(slot(144),'rax');a.jmp(positionReady);
  a.label(zeroPosition);a.mov('rax',0);a.store(slot(144),'rax');a.label(positionReady);
  const yes=a.unique('yes'),no=a.unique('no'),outer=a.unique('outer'),inner=a.unique('inner'),mismatch=a.unique('mismatch');
  a.load('rax',slot(160));a.test('rax','rax');a.jcc('e',yes);a.load('r10',slot(152));a.cmp('rax','r10');a.jcc('a',no);a.sub('r10','rax');a.store(slot(168),'r10');
  if(name==='endsWith'){
   a.load('rax',slot(144));a.load('r10',slot(160));a.cmp('rax','r10');a.jcc('b',no);a.sub('rax','r10');a.store(slot(144),'rax');
  }
  a.label(outer);a.load('rax',slot(144));a.load('r10',slot(168));a.cmp('rax','r10');a.jcc('a',no);
  a.shl('rax',1);a.load('rdx',slot(72));a.add('rdx',8);a.add('rdx','rax');a.load('r8',slot(88));a.add('r8',8);a.load('r9',slot(160));
  a.label(inner);a.test('r9','r9');a.jcc('e',yes);a.load('r10',{base:'rdx'},16);a.load('r11',{base:'r8'},16);a.cmp('r10','r11');a.jcc('ne',mismatch);a.add('rdx',2);a.add('r8',2);a.sub('r9',1);a.jmp(inner);
  a.label(mismatch);if(name==='includes'){a.load('rax',slot(144));a.add('rax',1);a.store(slot(144),'rax');a.jmp(outer);}else a.jmp(no);
  a.label(no);a.mov('rax',0);a.jmp(no+'.result');a.label(yes);a.mov('rax',1);a.label(no+'.result');a.load('rcx',slot(40));a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 }
 for(const name of positionMethods){
  const symbol='rt.string'+name[0]!.toUpperCase()+name.slice(1)+'.fn';
  prependFunctionBuiltin(b,symbol,name,1,'rt.stringPrototype');
  rootedFn(b,symbol+'.code',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:3}],(a,frame)=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
   a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}
   a.load('rax',slot(96));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
   a.lea('rcx',slot(64));a.lea('rdx',slot(96));a.call('rt.toString');
   a.load('r10',slot(72));a.load('rax',{base:'r10'});a.store(slot(120),'rax');
   a.mov('rax',0);a.store(slot(96),'rax');a.store(slot(104),'rax');
   const noSearch=a.unique('noSearch');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',noSearch);
   a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}a.label(noSearch);
   a.lea('rcx',slot(80));a.lea('rdx',slot(96));a.call('rt.toString');
   a.load('r10',slot(88));a.load('rax',{base:'r10'});a.store(slot(128),'rax');
   if(name==='lastIndexOf')a.load('rax',slot(120));else a.mov('rax',0);
   a.store(slot(112),'rax');
   const posReady=a.unique('posReady'),atZero=a.unique('atZero'),atEnd=a.unique('atEnd');
   a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',posReady);
   a.load('rdx',slot(56));a.lea('rcx',slot(96));a.lea('rdx',{base:'rdx',disp:16});a.call('rt.toNumber');
   a.movsd('xmm0',slot(104));a.ucomisd('xmm0','xmm0');a.jcc('p',name==='lastIndexOf'?atEnd:atZero);
   a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',atZero);
   a.load('rax',slot(120));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',atEnd);
   a.cvttsd2si('rax','xmm0');a.store(slot(112),'rax');a.jmp(posReady);
   a.label(atZero);a.mov('rax',0);a.store(slot(112),'rax');a.jmp(posReady);
   a.label(atEnd);a.load('rax',slot(120));a.store(slot(112),'rax');a.label(posReady);
   const found=a.unique('found'),notFound=a.unique('notFound'),result=a.unique('result');
   a.load('rax',slot(128));a.test('rax','rax');a.jcc('e',found);
   a.load('r10',slot(120));a.cmp('rax','r10');a.jcc('a',notFound);a.sub('r10','rax');a.store(slot(136),'r10');
   if(name==='lastIndexOf'){
    const inRange=a.unique('inRange');a.load('rax',slot(112));a.cmp('rax','r10');a.jcc('be',inRange);a.store(slot(112),'r10');a.label(inRange);
   }
   const outer=a.unique('outer'),inner=a.unique('inner'),mismatch=a.unique('mismatch');
   a.label(outer);a.load('rax',slot(112));a.load('r10',slot(136));a.cmp('rax','r10');a.jcc('a',notFound);
   a.shl('rax',1);a.load('rdx',slot(72));a.add('rdx',8);a.add('rdx','rax');a.load('r8',slot(88));a.add('r8',8);a.load('r9',slot(128));
   a.label(inner);a.test('r9','r9');a.jcc('e',found);a.load('r10',{base:'rdx'},16);a.load('r11',{base:'r8'},16);a.cmp('r10','r11');a.jcc('ne',mismatch);
   a.add('rdx',2);a.add('r8',2);a.sub('r9',1);a.jmp(inner);
   a.label(mismatch);a.load('rax',slot(112));
   if(name==='lastIndexOf'){a.test('rax','rax');a.jcc('e',notFound);a.sub('rax',1);}
   else a.add('rax',1);
   a.store(slot(112),'rax');a.jmp(outer);
   a.label(found);a.load('rax',slot(112));a.jmp(result);
   a.label(notFound);a.mov('rax',-1);a.label(result);a.cvtsi2sd('xmm0','rax');a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
  });
 }
 for(const name of indexMethods){
  const symbol='rt.string'+name[0]!.toUpperCase()+name.slice(1)+'.fn';
  prependFunctionBuiltin(b,symbol,name,1,'rt.stringPrototype');
  rootedFn(b,symbol+'.code',152,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:3}],(a,frame)=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
   a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}
   a.load('rax',slot(96));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
   a.lea('rcx',slot(64));a.lea('rdx',slot(96));a.call('rt.toString');
   a.mov('rax',0);a.store(slot(120),'rax');
   const positionReady=a.unique('positionReady'),out=a.unique('out'),finish=a.unique('finish');
   a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',positionReady);
   a.lea('rcx',slot(80));a.load('rdx',slot(56));a.call('rt.toNumber');
   a.movsd('xmm0',slot(88));a.ucomisd('xmm0','xmm0');a.jcc('p',positionReady);
   a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');
   const negative=a.unique('negative');a.jcc('b',negative);
   a.load('r10',slot(72));a.load('rax',{base:'r10'});a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',out);
   a.cvttsd2si('rax','xmm0');a.store(slot(120),'rax');a.jmp(positionReady);
   a.label(negative);a.mov('rax',0xbff0000000000000n);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',out);
   a.label(positionReady);a.load('r10',slot(72));a.load('r11',{base:'r10'});a.load('rax',slot(120));a.cmp('rax','r11');a.jcc('ae',out);
   if(name==='charAt'){
    a.mov('rcx',10);a.call('rt.alloc');a.store(slot(128),'rax');a.mov('r10',1);a.store({base:'rax'},'r10');
    a.load('r10',slot(72));a.load('rdx',slot(120));a.shl('rdx',1);a.add('r10',8);a.add('r10','rdx');a.load('r11',{base:'r10'},16);a.store({base:'rax',disp:8},'r11',16);
    a.load('rcx',slot(40));a.mov('r10',4);a.store({base:'rcx'},'r10');a.load('rax',slot(128));a.store({base:'rcx',disp:8},'rax');a.jmp(finish);
   }
   a.shl('rax',1);a.add('r10',8);a.add('r10','rax');a.load('rax',{base:'r10'},16);
   if(name==='codePointAt'){
    const scalar=a.unique('scalar');a.cmp('rax',0xd800);a.jcc('b',scalar);a.cmp('rax',0xdbff);a.jcc('a',scalar);
    a.load('rdx',slot(120));a.add('rdx',1);a.load('r11',slot(72));a.load('r11',{base:'r11'});a.cmp('rdx','r11');a.jcc('ae',scalar);
    a.load('r11',{base:'r10',disp:2},16);a.cmp('r11',0xdc00);a.jcc('b',scalar);a.cmp('r11',0xdfff);a.jcc('a',scalar);
    a.sub('rax',0xd800);a.shl('rax',10);a.sub('r11',0xdc00);a.add('rax','r11');a.add('rax',0x10000);
    a.label(scalar);
   }
   a.cvtsi2sd('xmm0','rax');a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');a.jmp(finish);
   a.label(out);a.load('rcx',slot(40));
   if(name==='charAt'){a.mov('rax',4);a.store({base:'rcx'},'rax');a.lea('rax',{rip:'rt.str.empty'});a.store({base:'rcx',disp:8},'rax');}
   else if(name==='charCodeAt'){a.mov('rax',3);a.store({base:'rcx'},'rax');a.mov('rax',0x7ff8000000000000n);a.store({base:'rcx',disp:8},'rax');}
   else{a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');}
   a.label(finish);
  });
 }
 for(const name of ['substring','slice'] as const){
 const symbol='rt.string'+name[0]!.toUpperCase()+name.slice(1)+'.fn';
 prependFunctionBuiltin(b,symbol,name,2,'rt.stringPrototype');
 rootedFn(b,symbol+'.code',184,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:3}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}
  a.load('rax',slot(96));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
  a.lea('rcx',slot(64));a.lea('rdx',slot(96));a.call('rt.toString');
  a.load('rax',slot(72));a.load('rax',{base:'rax'});a.store(slot(112),'rax');
  a.mov('rax',0);a.store(slot(120),'rax');a.load('rax',slot(112));a.store(slot(128),'rax');
  for(let i=0;i<2;i++){
   const ready=a.unique('positionReady'),zero=a.unique('zero'),atEnd=a.unique('atEnd');
   a.load('rax',slot(48));a.cmp('rax',i+1);a.jcc('b',ready);
   a.load('rdx',slot(56));if(i){a.add('rdx',16);a.load('rax',{base:'rdx'});a.test('rax','rax');a.jcc('e',ready);}a.lea('rcx',slot(80));a.call('rt.toNumber');
   a.movsd('xmm0',slot(88));a.ucomisd('xmm0','xmm0');a.jcc('p',zero);
   a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');
   const negative=a.unique('negative');a.jcc(name==='slice'?'b':'be',name==='slice'?negative:zero);
   a.load('rax',slot(112));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',atEnd);
   a.cvttsd2si('rax','xmm0');a.store(slot(i?128:120),'rax');a.jmp(ready);
   if(name==='slice'){
    a.label(negative);a.load('rax',slot(112));a.cvtsi2sd('xmm1','rax');a.mov('rax',0);a.movqToXmm('xmm2','rax');a.subsd('xmm2','xmm1');a.ucomisd('xmm0','xmm2');a.jcc('be',zero);
    a.cvttsd2si('rax','xmm0');a.test('rax','rax');a.jcc('e',zero);a.load('r10',slot(112));a.add('rax','r10');a.store(slot(i?128:120),'rax');a.jmp(ready);
   }
   a.label(zero);a.mov('rax',0);a.store(slot(i?128:120),'rax');a.jmp(ready);
   a.label(atEnd);a.load('rax',slot(112));a.store(slot(i?128:120),'rax');a.label(ready);
  }
  const empty=a.unique('empty'),finish=a.unique('finish');
  a.load('rax',slot(120));a.load('r10',slot(128));const ordered=a.unique('ordered');a.cmp('rax','r10');
  if(name==='slice')a.jcc('ae',empty);else{a.jcc('be',ordered);a.store(slot(128),'rax');a.store(slot(120),'r10');}
  a.label(ordered);
  a.load('rax',slot(128));a.load('r10',slot(120));a.sub('rax','r10');a.store(slot(144),'rax');
  a.test('rax','rax');a.jcc('e',empty);
  a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');a.store(slot(136),'rax');
  a.load('r10',slot(144));a.store({base:'rax'},'r10');a.add('rax',8);
  a.load('rdx',slot(72));a.load('r10',slot(120));a.shl('r10',1);a.add('rdx',8);a.add('rdx','r10');
  a.load('r8',slot(144));const copy=a.unique('copy'),copied=a.unique('copied');a.label(copy);a.test('r8','r8');a.jcc('e',copied);
  a.load('r10',{base:'rdx'},16);a.store({base:'rax'},'r10',16);a.add('rdx',2);a.add('rax',2);a.sub('r8',1);a.jmp(copy);
  a.label(copied);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(136));a.store({base:'rcx',disp:8},'rax');a.jmp(finish);
  a.label(empty);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.lea('rax',{rip:'rt.str.empty'});a.store({base:'rcx',disp:8},'rax');a.label(finish);
 });
 }
 prependFunctionBuiltin(b,'rt.stringRepeat.fn','repeat',1,'rt.stringPrototype');
 rootedFn(b,'rt.stringRepeat.fn.code',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:3}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}
  a.load('rax',slot(96));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
  a.lea('rcx',slot(64));a.lea('rdx',slot(96));a.call('rt.toString');
  a.load('rax',slot(72));a.load('rax',{base:'rax'});a.store(slot(112),'rax');
  a.mov('rax',0);a.store(slot(120),'rax');
  const converted=a.unique('converted'),empty=a.unique('empty'),finish=a.unique('finish');
  a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',converted);
  a.lea('rcx',slot(80));a.load('rdx',slot(56));a.call('rt.toNumber');
  a.movsd('xmm0',slot(88));a.ucomisd('xmm0','xmm0');a.jcc('p',converted);
  a.mov('rax',0xbff0000000000000n);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'be','rt.throwRangeError');
  a.mov('rax',0x7ff0000000000000n);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'ae','rt.throwRangeError');
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',converted);
  a.load('rax',slot(112));a.test('rax','rax');a.jcc('e',empty);
  a.mov('rax',0x41d0000000000000n);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'ae','rt.throwRangeError');
  a.cvttsd2si('rax','xmm0');a.store(slot(120),'rax');
  a.label(converted);a.load('rax',slot(120));a.test('rax','rax');a.jcc('e',empty);
  a.load('r10',slot(112));a.test('r10','r10');a.jcc('e',empty);
  a.imul('rax','r10');a.mov('r10',0x3fffffffn);a.cmp('rax','r10');failIf(a,'a','rt.throwRangeError');a.store(slot(128),'rax');
  a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');a.store(slot(136),'rax');
  a.load('r10',slot(128));a.store({base:'rax'},'r10');a.add('rax',8);
  a.load('rdx',slot(72));a.add('rdx',8);a.load('r8',slot(120));
  const outer=a.unique('outer'),inner=a.unique('inner'),next=a.unique('next'),copied=a.unique('copied');
  a.label(outer);a.test('r8','r8');a.jcc('e',copied);a.mov('r9','rdx');a.load('r11',slot(112));
  a.label(inner);a.test('r11','r11');a.jcc('e',next);a.load('r10',{base:'r9'},16);a.store({base:'rax'},'r10',16);a.add('r9',2);a.add('rax',2);a.sub('r11',1);a.jmp(inner);
  a.label(next);a.sub('r8',1);a.jmp(outer);
  a.label(copied);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(136));a.store({base:'rcx',disp:8},'rax');a.jmp(finish);
  a.label(empty);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.lea('rax',{rip:'rt.str.empty'});a.store({base:'rcx',disp:8},'rax');a.label(finish);
 });
 for(const name of padMethods){
  const symbol='rt.string'+name[0]!.toUpperCase()+name.slice(1)+'.fn';
  prependFunctionBuiltin(b,symbol,name,1,'rt.stringPrototype');
  rootedFn(b,symbol+'.code',184,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:3}],(a,frame)=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
   a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(96+n),'rax');}
   a.load('rax',slot(96));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
   a.lea('rcx',slot(64));a.lea('rdx',slot(96));a.call('rt.toString');
   a.load('r10',slot(72));a.load('rax',{base:'r10'});a.store(slot(112),'rax');
   const original=a.unique('original'),done=a.unique('done');
   a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',original);
   a.lea('rcx',slot(80));a.load('rdx',slot(56));a.call('rt.toNumber');
   a.movsd('xmm0',slot(88));a.ucomisd('xmm0','xmm0');a.jcc('p',original);
   a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',original);
   a.mov('rax',0x41d0000000000000n);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'ae','rt.throwRangeError');
   a.cvttsd2si('rax','xmm0');a.load('r10',slot(112));a.cmp('rax','r10');a.jcc('be',original);
   a.store(slot(120),'rax');a.sub('rax','r10');a.store(slot(136),'rax');
   a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.str.padSpace'});a.store(slot(104),'rax');
   const fillReady=a.unique('fillReady');a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',fillReady);
   a.load('rdx',slot(56));a.load('rax',{base:'rdx',disp:16});a.test('rax','rax');a.jcc('e',fillReady);
   a.load('rax',{base:'rdx',disp:16});a.store(slot(96),'rax');a.load('rax',{base:'rdx',disp:24});a.store(slot(104),'rax');
   a.lea('rcx',slot(96));a.lea('rdx',slot(96));a.call('rt.toString');
   a.label(fillReady);a.load('r10',slot(104));a.load('rax',{base:'r10'});a.store(slot(128),'rax');a.test('rax','rax');a.jcc('e',original);
   a.load('rax',slot(120));a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');a.store(slot(144),'rax');
   a.load('r10',slot(120));a.store({base:'rax'},'r10');a.lea('rdx',{base:'rax',disp:8});
   const copySource=()=>{
    const loop=a.unique('sourceLoop'),end=a.unique('sourceEnd');a.load('r8',slot(112));a.load('r10',slot(72));a.add('r10',8);
    a.label(loop);a.test('r8','r8');a.jcc('e',end);a.load('rax',{base:'r10'},16);a.store({base:'rdx'},'rax',16);a.add('r10',2);a.add('rdx',2);a.sub('r8',1);a.jmp(loop);a.label(end);
   };
   const copyFill=()=>{
    const loop=a.unique('fillLoop'),end=a.unique('fillEnd'),wrap=a.unique('fillWrap');
    a.load('r8',slot(136));a.mov('r9',0);a.load('r10',slot(104));a.add('r10',8);a.load('r11',slot(128));
    a.label(loop);a.test('r8','r8');a.jcc('e',end);a.load('rax',{base:'r10'},16);a.store({base:'rdx'},'rax',16);a.add('rdx',2);a.add('r10',2);a.add('r9',1);a.sub('r8',1);
    a.cmp('r9','r11');a.jcc('ne',loop);a.label(wrap);a.load('r10',slot(104));a.add('r10',8);a.mov('r9',0);a.jmp(loop);a.label(end);
   };
   if(name==='padStart'){copyFill();copySource();}else{copySource();copyFill();}
   a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(144));a.store({base:'rcx',disp:8},'rax');a.jmp(done);
   a.label(original);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(72));a.store({base:'rcx',disp:8},'rax');a.label(done);
  });
 }
 b.fn('rt.isTrimWhitespace',40,a=>{
  const yes=a.unique('yes'),done=a.unique('done');
  a.cmp('rcx',9);a.jcc('b',done);a.cmp('rcx',13);a.jcc('be',yes);
  for(const point of [0x20,0xa0,0x1680,0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff]){a.cmp('rcx',point);a.jcc('e',yes);}
  a.cmp('rcx',0x2000);a.jcc('b',done);a.cmp('rcx',0x200a);a.jcc('a',done);
  a.label(yes);a.mov('rax',1);a.jmp(done+'.return');
  a.label(done);a.mov('rax',0);a.label(done+'.return');
 });
 for(const name of trimMethods){
  const symbol='rt.string'+name[0]!.toUpperCase()+name.slice(1)+'.fn';
  prependFunctionBuiltin(b,symbol,name,0,'rt.stringPrototype');
  rootedFn(b,symbol+'.code',168,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:2}],(a,frame)=>{
   a.store(slot(40),'rcx');a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(80+n),'rax');}
   a.load('rax',slot(80));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
   a.lea('rcx',slot(64));a.lea('rdx',slot(80));a.call('rt.toString');
   a.load('rax',slot(72));a.load('rax',{base:'rax'});a.store(slot(112),'rax');a.store(slot(128),'rax');
   a.mov('rax',0);a.store(slot(120),'rax');
   if(name!=='trimEnd'){
    const start=a.unique('start'),startDone=a.unique('startDone');a.label(start);a.load('rax',slot(120));a.load('r10',slot(128));a.cmp('rax','r10');a.jcc('ae',startDone);
    a.shl('rax',1);a.load('r10',slot(72));a.add('r10',8);a.add('r10','rax');a.load('rcx',{base:'r10'},16);a.call('rt.isTrimWhitespace');a.test('rax','rax');a.jcc('e',startDone);
    a.load('rax',slot(120));a.add('rax',1);a.store(slot(120),'rax');a.jmp(start);a.label(startDone);
   }
   if(name!=='trimStart'){
    const end=a.unique('end'),endDone=a.unique('endDone');a.label(end);a.load('rax',slot(128));a.load('r10',slot(120));a.cmp('rax','r10');a.jcc('be',endDone);
    a.sub('rax',1);a.shl('rax',1);a.load('r10',slot(72));a.add('r10',8);a.add('r10','rax');a.load('rcx',{base:'r10'},16);a.call('rt.isTrimWhitespace');a.test('rax','rax');a.jcc('e',endDone);
    a.load('rax',slot(128));a.sub('rax',1);a.store(slot(128),'rax');a.jmp(end);a.label(endDone);
   }
   const empty=a.unique('empty'),finish=a.unique('finish'),copy=a.unique('copy'),copied=a.unique('copied');
   a.load('rax',slot(128));a.load('r10',slot(120));a.sub('rax','r10');a.store(slot(136),'rax');a.test('rax','rax');a.jcc('e',empty);
   a.load('r10',slot(112));a.cmp('rax','r10');const allocate=a.unique('allocate');a.jcc('ne',allocate);
   a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(72));a.store({base:'rcx',disp:8},'rax');a.jmp(finish);
   a.label(allocate);a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');a.store(slot(144),'rax');
   a.load('r10',slot(136));a.store({base:'rax'},'r10');a.add('rax',8);
   a.load('rdx',slot(72));a.load('r10',slot(120));a.shl('r10',1);a.add('rdx',8);a.add('rdx','r10');a.load('r8',slot(136));
   a.label(copy);a.test('r8','r8');a.jcc('e',copied);a.load('r10',{base:'rdx'},16);a.store({base:'rax'},'r10',16);a.add('rdx',2);a.add('rax',2);a.sub('r8',1);a.jmp(copy);
   a.label(copied);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(144));a.store({base:'rcx',disp:8},'rax');a.jmp(finish);
   a.label(empty);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.lea('rax',{rip:'rt.str.empty'});a.store({base:'rcx',disp:8},'rax');a.label(finish);
  });
 }
 const prototype=b.bundle.fragments.find(f=>f.name==='rt.stringPrototype')!;
 const head=prototype.fixups.find(f=>f.offset===O.properties)!;
 for(const [alias,original] of [['trimLeft','trimStart'],['trimRight','trimEnd']] as const){
  const node='rt.stringPrototype.'+alias,key=node+'.key';b.bundle.fragments.push(stringLiteral(key,alias));
  const bytes=new Uint8Array(P.size);bytes[P.value]=5;bytes[P.attributes]=A.writable|A.configurable;
  b.bundle.fragments.push({name:node,section:'.data',alignment:8,bytes,symbols:{},fixups:[
   {offset:P.next,kind:'va64',target:head.target,addend:0},
   {offset:P.key,kind:'va64',target:key,addend:0},
   {offset:P.value+8,kind:'va64',target:'rt.string'+original[0]!.toUpperCase()+original.slice(1)+'.fn',addend:0},
  ]});head.target=node;
 }
}
