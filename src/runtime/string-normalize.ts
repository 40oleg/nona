import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';
import {unicodeNormalizeCanonicalCount,unicodeNormalizeCanonicalData,unicodeNormalizeCompatibilityCount,unicodeNormalizeCompatibilityData,unicodeNormalizeCccCount,unicodeNormalizeCccData,unicodeNormalizeComposeCount,unicodeNormalizeComposeData} from './unicode-normalize-data.js';

export const stringNormalizeRoots=['rt.stringNormalize.fn'];
export const stringNormalizePropertyRoots=builtinPropertyRoots('rt.stringNormalize.fn','normalize','rt.stringPrototype');

export function emitStringNormalize(b:RuntimeBuilder):void {
 for(const form of ['NFC','NFD','NFKC','NFKD'])b.bundle.fragments.push(stringLiteral('rt.str.'+form,form));
 for(const [name,data] of [['Canonical',unicodeNormalizeCanonicalData],['Compatibility',unicodeNormalizeCompatibilityData],['CccTable',unicodeNormalizeCccData],['ComposeTable',unicodeNormalizeComposeData]] as const)b.data('rt.normalize'+name,data);
 // RCX code point; RAX canonical combining class.
 b.fn('rt.normalizeCcc',40,a=>{
  a.mov('r8',0);a.mov('r9',unicodeNormalizeCccCount);
  const loop=a.unique('loop'),less=a.unique('less'),found=a.unique('found'),done=a.unique('done');
  a.label(loop);a.cmp('r8','r9');a.jcc('ae',done);
  a.mov('rax','r8');a.add('rax','r9');a.shr('rax',1);a.mov('r10','rax');a.shl('r10',3);a.lea('r11',{rip:'rt.normalizeCccTable'});a.add('r10','r11');
  a.load('r11',{base:'r10'},32);a.cmp('rcx','r11');a.jcc('b',less);a.jcc('e',found);
  a.add('rax',1);a.mov('r8','rax');a.jmp(loop);
  a.label(less);a.mov('r9','rax');a.jmp(loop);
  a.label(found);a.load('rax',{base:'r10',disp:4},32);a.jmp(done+'Return');
  a.label(done);a.mov('rax',0);a.label(done+'Return');
 });
 // RCX code point, RDX compatibility flag; RAX record pointer or zero.
 b.fn('rt.normalizeDecomp',40,a=>{
  a.mov('r8',0);a.test('rdx','rdx');const compat=a.unique('compat'),ready=a.unique('ready');a.jcc('ne',compat);
  a.mov('r9',unicodeNormalizeCanonicalCount);a.lea('r11',{rip:'rt.normalizeCanonical'});a.jmp(ready);
  a.label(compat);a.mov('r9',unicodeNormalizeCompatibilityCount);a.lea('r11',{rip:'rt.normalizeCompatibility'});a.label(ready);
  const loop=a.unique('loop'),less=a.unique('less'),found=a.unique('found'),done=a.unique('done');
  a.label(loop);a.cmp('r8','r9');a.jcc('ae',done);
  a.mov('rax','r8');a.add('rax','r9');a.shr('rax',1);a.mov('r10','rax');a.mov('rax',80);a.imul('r10','rax');a.add('r10','r11');
  a.load('rax',{base:'r10'},32);a.cmp('rcx','rax');a.jcc('b',less);a.jcc('e',found);
  a.mov('rax','r8');a.add('rax','r9');a.shr('rax',1);a.add('rax',1);a.mov('r8','rax');a.jmp(loop);
  a.label(less);a.mov('rax','r8');a.add('rax','r9');a.shr('rax',1);a.mov('r9','rax');a.jmp(loop);
  a.label(found);a.mov('rax','r10');a.jmp(done+'Return');
  a.label(done);a.mov('rax',0);a.label(done+'Return');
 });
 // RCX starter, RDX next code point; RAX composite or zero.
 b.fn('rt.normalizeCompose',40,a=>{
  const ordinary=a.unique('ordinary'),hangul=a.unique('hangul'),done=a.unique('done');
  a.mov('rax','rcx');a.sub('rax',0x1100);a.cmp('rax',19);a.jcc('ae',ordinary);
  a.mov('r8','rdx');a.sub('r8',0x1161);a.cmp('r8',21);a.jcc('ae',ordinary);
  a.mov('r9',588);a.imul('rax','r9');a.mov('r9',28);a.imul('r8','r9');a.add('rax','r8');a.add('rax',0xac00);a.jmp(done);
  a.label(ordinary);a.mov('rax','rcx');a.sub('rax',0xac00);a.cmp('rax',11172);a.jcc('ae',hangul);
  a.mov('r8','rdx');a.mov('r9',28);a.xor('rdx','rdx');a.div('r9');a.test('rdx','rdx');a.mov('rdx','r8');a.jcc('ne',hangul);
  a.mov('rax','rdx');a.sub('rax',0x11a8);a.cmp('rax',27);a.jcc('ae',hangul);a.add('rax',1);a.add('rax','rcx');a.jmp(done);
  a.label(hangul);
  a.mov('r8',0);a.mov('r9',unicodeNormalizeComposeCount);
  const loop=a.unique('loop'),less=a.unique('less'),found=a.unique('found');
  a.label(loop);a.cmp('r8','r9');a.jcc('ae',done+'Zero');
  a.mov('rax','r8');a.add('rax','r9');a.shr('rax',1);a.mov('r10','rax');a.mov('rax',12);a.imul('r10','rax');a.lea('r11',{rip:'rt.normalizeComposeTable'});a.add('r10','r11');
  a.load('rax',{base:'r10'},32);a.cmp('rcx','rax');a.jcc('b',less);a.jcc('a',loop+'More');
  a.load('rax',{base:'r10',disp:4},32);a.cmp('rdx','rax');a.jcc('b',less);a.jcc('e',found);
  a.label(loop+'More');a.mov('rax','r8');a.add('rax','r9');a.shr('rax',1);a.add('rax',1);a.mov('r8','rax');a.jmp(loop);
  a.label(less);a.mov('rax','r8');a.add('rax','r9');a.shr('rax',1);a.mov('r9','rax');a.jmp(loop);
  a.label(found);a.load('rax',{base:'r10',disp:8},32);a.jmp(done);
  a.label(done+'Zero');a.mov('rax',0);a.label(done);
 });
 prependFunctionBuiltin(b,'rt.stringNormalize.fn','normalize',0,'rt.stringPrototype');
 rootedFn(b,'rt.stringNormalize.fn.code',296,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:8}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
  a.load('rax',slot(64));a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');
  a.lea('rcx',slot(80));a.lea('rdx',slot(64));a.call('rt.toString');
  a.mov('rax',0);a.store(slot(144),'rax'); // form: 0 NFC, 1 NFD, 2 NFKC, 3 NFKD.
  const formReady=a.unique('formReady'),invalid=a.unique('invalid');
  a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',formReady);
  a.load('rdx',slot(56));a.load('rax',{base:'rdx'});a.test('rax','rax');a.jcc('e',formReady);
  a.lea('rcx',slot(96));a.load('rdx',slot(56));a.call('rt.toString');
  for(const [name,index] of [['NFC',0],['NFD',1],['NFKC',2],['NFKD',3]] as const){
   const next=a.unique('nextForm');a.load('r10',slot(104));a.load('rax',{base:'r10'});a.cmp('rax',name.length);a.jcc('ne',next);
   for(let i=0;i<name.length;i++){a.load('rax',{base:'r10',disp:8+2*i},16);a.cmp('rax',name.charCodeAt(i));a.jcc('ne',next);}
   a.mov('rax',index);a.store(slot(144),'rax');a.jmp(formReady);a.label(next);
  }
  a.label(invalid);a.call('rt.throwRangeError');a.label(formReady);
  a.load('r10',slot(88));a.load('rax',{base:'r10'});a.store(slot(152),'rax');
  a.test('rax','rax');const empty=a.unique('empty'),done=a.unique('done');a.jcc('e',empty);
  a.mov('rcx','rax');a.mov('r10',72);a.imul('rcx','r10');a.add('rcx',8);a.call('rt.alloc');a.mov('r10',4);a.store(slot(112),'r10');a.store(slot(120),'rax');
  a.mov('rax',0);a.store(slot(160),'rax');a.store(slot(168),'rax'); // input index, code point count.
  const input=a.unique('input'),inputDone=a.unique('inputDone'),append=a.unique('append'),appendLoop=a.unique('appendLoop'),one=a.unique('one'),ordered=a.unique('ordered'),nextInput=a.unique('nextInput');
  a.label(input);a.load('rax',slot(160));a.load('r10',slot(152));a.cmp('rax','r10');a.jcc('ae',inputDone);
  a.shl('rax',1);a.load('r10',slot(88));a.add('r10',8);a.add('r10','rax');a.load('rcx',{base:'r10'},16);a.store(slot(176),'rcx');
  a.load('rax',slot(160));a.add('rax',1);a.store(slot(160),'rax');
  const noPair=a.unique('noPair');a.cmp('rcx',0xd800);a.jcc('b',noPair);a.cmp('rcx',0xdbff);a.jcc('a',noPair);
  a.load('rax',slot(160));a.load('r11',slot(152));a.cmp('rax','r11');a.jcc('ae',noPair);
  a.load('r11',{base:'r10',disp:2},16);a.cmp('r11',0xdc00);a.jcc('b',noPair);a.cmp('r11',0xdfff);a.jcc('a',noPair);
  a.sub('rcx',0xd800);a.shl('rcx',10);a.sub('r11',0xdc00);a.add('rcx','r11');a.add('rcx',0x10000);a.store(slot(176),'rcx');a.add('rax',1);a.store(slot(160),'rax');
  a.label(noPair);
  a.load('rax',slot(176));a.sub('rax',0xac00);const lookup=a.unique('lookup'),hangul=a.unique('hangul');a.cmp('rax',11172);a.jcc('b',hangul);
  a.label(lookup);a.load('rcx',slot(176));a.load('rdx',slot(144));a.shr('rdx',1);a.call('rt.normalizeDecomp');
  a.store(slot(184),'rax');a.test('rax','rax');a.jcc('e',one);a.load('r10',{base:'rax',disp:4},32);a.store(slot(192),'r10');a.mov('r11',0);a.store(slot(200),'r11');a.jmp(appendLoop);
  a.label(hangul);a.mov('r10',588);a.xor('rdx','rdx');a.div('r10');a.store(slot(208),'rax');a.mov('rax','rdx');a.mov('r10',28);a.xor('rdx','rdx');a.div('r10');a.store(slot(216),'rax');a.store(slot(224),'rdx');
  a.mov('rax',2);a.test('rdx','rdx');const hangulReady=a.unique('hangulReady');a.jcc('e',hangulReady);a.mov('rax',3);a.label(hangulReady);a.store(slot(192),'rax');a.mov('rax',0);a.store(slot(200),'rax');a.mov('rax',1);a.store(slot(184),'rax');a.jmp(appendLoop);
  a.label(one);a.mov('rax',1);a.store(slot(192),'rax');a.mov('rax',0);a.store(slot(200),'rax');
  a.label(appendLoop);a.load('rax',slot(200));a.load('r10',slot(192));a.cmp('rax','r10');a.jcc('ae',nextInput);
  a.load('r10',slot(184));a.test('r10','r10');const fromOne=a.unique('fromOne'),fromHangul=a.unique('fromHangul'),gotCp=a.unique('gotCp');a.jcc('e',fromOne);a.cmp('r10',1);a.jcc('e',fromHangul);
  a.shl('rax',2);a.add('r10',8);a.add('r10','rax');a.load('rcx',{base:'r10'},32);a.jmp(gotCp);
  a.label(fromOne);a.load('rcx',slot(176));a.jmp(gotCp);
  a.label(fromHangul);a.load('rax',slot(200));a.test('rax','rax');const v=a.unique('v'),t=a.unique('t');a.jcc('ne',v);a.load('rcx',slot(208));a.add('rcx',0x1100);a.jmp(gotCp);
  a.label(v);a.cmp('rax',1);a.jcc('ne',t);a.load('rcx',slot(216));a.add('rcx',0x1161);a.jmp(gotCp);
  a.label(t);a.load('rcx',slot(224));a.add('rcx',0x11a7);
  a.label(gotCp);a.store(slot(232),'rcx');a.load('rax',slot(168));a.shl('rax',2);a.load('r10',slot(120));a.add('r10',8);a.add('r10','rax');a.store({base:'r10'},'rcx',32);a.load('rax',slot(168));a.add('rax',1);a.store(slot(168),'rax');a.store(slot(280),'rax');
  const reorder=a.unique('reorder'),reorderDone=a.unique('reorderDone');a.label(reorder);a.load('rax',slot(280));a.cmp('rax',2);a.jcc('b',reorderDone);
  a.load('rcx',slot(232));a.call('rt.normalizeCcc');a.test('rax','rax');a.jcc('e',reorderDone);a.store(slot(240),'rax');
  a.load('rax',slot(280));a.sub('rax',2);a.shl('rax',2);a.load('r10',slot(120));a.add('r10',8);a.add('r10','rax');a.load('rcx',{base:'r10'},32);a.store(slot(248),'rcx');a.call('rt.normalizeCcc');a.load('r11',slot(240));a.cmp('rax','r11');a.jcc('be',reorderDone);
  a.load('r10',slot(120));a.add('r10',8);a.load('rax',slot(280));a.sub('rax',2);a.shl('rax',2);a.add('r10','rax');a.load('r11',slot(232));a.store({base:'r10'},'r11',32);a.load('r11',slot(248));a.store({base:'r10',disp:4},'r11',32);
  a.load('rax',slot(280));a.sub('rax',1);a.store(slot(280),'rax');a.jmp(reorder);
  a.label(reorderDone);a.load('rax',slot(200));a.add('rax',1);a.store(slot(200),'rax');a.jmp(appendLoop);
  a.label(nextInput);a.jmp(input);
  a.label(inputDone);
  // Compose in place for NFC/NFKC. The decomposed buffer remains rooted.
  a.load('rax',slot(144));a.and('rax',1);const compositionDone=a.unique('compositionDone');a.jcc('ne',compositionDone);
  a.mov('rax',1);a.store(slot(256),'rax');a.mov('rax',0);a.store(slot(248),'rax');a.store(slot(264),'rax');a.store(slot(272),'rax'); // read, starter, previous class.
  const composeLoop=a.unique('composeLoop'),keep=a.unique('keep'),tryCompose=a.unique('tryCompose');
  a.label(composeLoop);a.load('rax',slot(256));a.load('r10',slot(168));a.cmp('rax','r10');a.jcc('ae',compositionDone);
  a.shl('rax',2);a.load('r10',slot(120));a.add('r10',8);a.add('r10','rax');a.load('rcx',{base:'r10'},32);a.store(slot(232),'rcx');a.call('rt.normalizeCcc');a.store(slot(240),'rax');
  a.load('r10',slot(272));a.test('r10','r10');a.jcc('e',tryCompose);a.cmp('r10','rax');a.jcc('ae',keep);
  a.label(tryCompose);a.load('rax',slot(264));a.shl('rax',2);a.load('r10',slot(120));a.add('r10',8);a.add('r10','rax');a.load('rcx',{base:'r10'},32);a.load('rdx',slot(232));a.call('rt.normalizeCompose');a.test('rax','rax');a.jcc('e',keep);
  a.load('r10',slot(264));a.shl('r10',2);a.load('r11',slot(120));a.add('r11',8);a.add('r11','r10');a.store({base:'r11'},'rax',32);a.jmp(composeLoop+'Next');
  a.label(keep);a.load('rax',slot(248));a.add('rax',1);a.store(slot(248),'rax');a.shl('rax',2);a.load('r10',slot(120));a.add('r10',8);a.add('r10','rax');a.load('r11',slot(232));a.store({base:'r10'},'r11',32);
  a.load('rax',slot(240));a.test('rax','rax');const keepStarter=a.unique('keepStarter');a.jcc('ne',keepStarter);a.load('rax',slot(248));a.store(slot(264),'rax');a.label(keepStarter);a.load('rax',slot(240));a.store(slot(272),'rax');
  a.label(composeLoop+'Next');a.load('rax',slot(256));a.add('rax',1);a.store(slot(256),'rax');a.jmp(composeLoop);
  a.label(compositionDone);
  a.load('rax',slot(144));a.and('rax',1);const countReady=a.unique('countReady');a.jcc('ne',countReady);a.load('rax',slot(248));a.add('rax',1);a.store(slot(168),'rax');a.label(countReady);a.load('rax',slot(168));a.store(slot(248),'rax');
  // Encode code points back to UTF-16; the allocation is capped by 2 units per code point.
  a.mov('rcx','rax');a.shl('rcx',2);a.add('rcx',8);a.call('rt.alloc');a.mov('r10',4);a.store(slot(128),'r10');a.store(slot(136),'rax');
  a.mov('rax',0);a.store(slot(160),'rax');a.store(slot(152),'rax');
  const encode=a.unique('encode'),encodeDone=a.unique('encodeDone'),bmp=a.unique('bmp');a.label(encode);a.load('rax',slot(160));a.load('r10',slot(248));a.cmp('rax','r10');a.jcc('ae',encodeDone);
  a.shl('rax',2);a.load('r10',slot(120));a.add('r10',8);a.add('r10','rax');a.load('rax',{base:'r10'},32);
  a.cmp('rax',0xffff);a.jcc('be',bmp);a.sub('rax',0x10000);a.mov('r11','rax');a.shr('r11',10);a.add('r11',0xd800);a.and('rax',1023);a.add('rax',0xdc00);
  a.load('r10',slot(152));a.shl('r10',1);a.load('rcx',slot(136));a.add('rcx',8);a.add('rcx','r10');a.store({base:'rcx'},'r11',16);a.store({base:'rcx',disp:2},'rax',16);a.load('rax',slot(152));a.add('rax',2);a.store(slot(152),'rax');a.jmp(encode+'Next');
  a.label(bmp);a.load('r10',slot(152));a.shl('r10',1);a.load('rcx',slot(136));a.add('rcx',8);a.add('rcx','r10');a.store({base:'rcx'},'rax',16);a.load('rax',slot(152));a.add('rax',1);a.store(slot(152),'rax');
  a.label(encode+'Next');a.load('rax',slot(160));a.add('rax',1);a.store(slot(160),'rax');a.jmp(encode);
  a.label(encodeDone);a.load('r10',slot(136));a.load('rax',slot(152));a.store({base:'r10'},'rax');
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(128+n));a.store({base:'rcx',disp:n},'rax');}a.jmp(done);
  a.label(empty);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.lea('rax',{rip:'rt.str.empty'});a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
}
