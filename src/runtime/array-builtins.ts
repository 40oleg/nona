import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O} from './object-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';

export const arrayBuiltinRoots=['rt.Array.isArray.fn','rt.arrayPush.fn','rt.arrayPop.fn','rt.arrayIncludes.fn','rt.arrayIndexOf.fn','rt.arrayLastIndexOf.fn','rt.arrayForEach.fn','rt.arraySome.fn','rt.arrayEvery.fn','rt.arrayFind.fn','rt.arrayFindIndex.fn','rt.arrayReduce.fn','rt.arrayReduceRight.fn','rt.arrayFill.fn','rt.arrayCopyWithin.fn','rt.arrayReverse.fn'];
export const arrayBuiltinPropertyRoots=[...builtinPropertyRoots('rt.Array.isArray.fn','isArray','rt.Array'),...builtinPropertyRoots('rt.arrayPush.fn','push','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayPop.fn','pop','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayIncludes.fn','includes','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayIndexOf.fn','indexOf','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayLastIndexOf.fn','lastIndexOf','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayForEach.fn','forEach','rt.arrayPrototype'),...builtinPropertyRoots('rt.arraySome.fn','some','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayEvery.fn','every','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayFind.fn','find','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayFindIndex.fn','findIndex','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayReduce.fn','reduce','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayReduceRight.fn','reduceRight','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayFill.fn','fill','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayCopyWithin.fn','copyWithin','rt.arrayPrototype'),...builtinPropertyRoots('rt.arrayReverse.fn','reverse','rt.arrayPrototype')];

export function emitArrayBuiltins(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.Array.isArray.fn','isArray',1,'rt.Array');
 prependFunctionBuiltin(b,'rt.arrayPush.fn','push',1,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayPop.fn','pop',0,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayIncludes.fn','includes',1,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayIndexOf.fn','indexOf',1,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayLastIndexOf.fn','lastIndexOf',1,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayForEach.fn','forEach',1,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arraySome.fn','some',1,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayEvery.fn','every',1,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayFind.fn','find',1,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayFindIndex.fn','findIndex',1,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayReduce.fn','reduce',1,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayReduceRight.fn','reduceRight',1,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayFill.fn','fill',1,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayCopyWithin.fn','copyWithin',2,'rt.arrayPrototype');
 prependFunctionBuiltin(b,'rt.arrayReverse.fn','reverse',0,'rt.arrayPrototype');
 b.fn('rt.Array.isArray.fn.code',40,a=>{
  a.mov('rax',0);const save=a.unique('save');a.test('rdx','rdx');a.jcc('e',save);a.load('r10',{base:'r8'});a.cmp('r10',5);a.jcc('ne',save);a.load('r10',{base:'r8',disp:8});a.load('r10',{base:'r10',disp:O.kind});a.cmp('r10',1);a.jcc('ne',save);a.mov('rax',1);
  a.label(save);a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 b.bundle.fragments.push(stringLiteral('rt.arrayPush.length','length'));
 rootedFn(b,'rt.arrayPush.fn.code',232,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:6}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(136));
  const zero=a.unique('zero'),lengthReady=a.unique('lengthReady');a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zero);a.jcc('be',zero);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zero);a.mov('rax',0);a.label(lengthReady);a.store(slot(64),'rax');
  a.load('r10',slot(48));a.add('rax','r10');a.mov('r11',9007199254740991n);a.cmp('rax','r11');failIf(a,'a','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(72),'rax');const loop=a.unique('loop'),finish=a.unique('finish');a.label(loop);a.load('rax',slot(72));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('ae',finish);
  a.load('r10',slot(64));a.add('rax','r10');a.cvtsi2sd('xmm0','rax');a.storesd(slot(152),'xmm0');a.mov('rax',3);a.store(slot(144),'rax');
  a.lea('rcx',slot(160));a.lea('rdx',slot(144));a.call('rt.toString');
  a.load('rax',slot(72));a.shl('rax',4);a.load('r8',slot(56));a.add('r8','rax');
  a.lea('rcx',slot(80));a.lea('rdx',slot(160));a.mov('r9',2);a.call('rt.setProperty');
  a.load('rax',slot(72));a.add('rax',1);a.store(slot(72),'rax');a.jmp(loop);
  a.label(finish);a.load('rax',slot(64));a.load('r10',slot(48));a.add('rax','r10');a.cvtsi2sd('xmm0','rax');a.storesd(slot(120),'xmm0');a.mov('rax',3);a.store(slot(112),'rax');
  a.lea('rcx',slot(80));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.mov('r9',2);a.call('rt.setProperty');
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(120));a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.arrayIncludes.fn.code',232,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:7}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.mov('rax',4);a.store(slot(128),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(136),'rax');
  a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.lea('r8',slot(128));a.call('rt.getProperty');
  a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.call('rt.toNumber');a.movsd('xmm0',slot(120));
  const zero=a.unique('zero'),lengthReady=a.unique('lengthReady'),no=a.unique('no'),yes=a.unique('yes');
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zero);a.jcc('be',zero);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);
  a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zero);a.mov('rax',0);a.label(lengthReady);a.store(slot(72),'rax');a.test('rax','rax');a.jcc('e',no);
  a.load('rax',slot(48));const missingSearch=a.unique('missingSearch'),searchReady=a.unique('searchReady');a.test('rax','rax');a.jcc('e',missingSearch);
  a.load('rdx',slot(56));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(160+offset),'rax');}a.jmp(searchReady);
  a.label(missingSearch);a.mov('rax',0);a.store(slot(160),'rax');a.store(slot(168),'rax');a.label(searchReady);
  a.mov('rax',0);a.store(slot(64),'rax');a.load('rax',slot(48));a.cmp('rax',2);const startReady=a.unique('startReady');a.jcc('b',startReady);
  a.load('rdx',slot(56));a.lea('rcx',slot(112));a.lea('rdx',{base:'rdx',disp:16});a.call('rt.toNumber');a.movsd('xmm0',slot(120));
  a.ucomisd('xmm0','xmm0');a.jcc('p',startReady);
  a.load('rax',slot(72));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',no);
  a.mov('r10',0);a.sub('r10','rax');a.cvtsi2sd('xmm1','r10');a.ucomisd('xmm0','xmm1');a.jcc('be',startReady);
  a.cvttsd2si('rax','xmm0');a.test('rax','rax');const positive=a.unique('positive');a.jcc('ns',positive);a.load('r10',slot(72));a.add('rax','r10');a.label(positive);a.store(slot(64),'rax');a.label(startReady);
  const loop=a.unique('loop'),next=a.unique('next');a.label(loop);a.load('rax',slot(64));a.load('r10',slot(72));a.cmp('rax','r10');a.jcc('ae',no);
  a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(112),'rax');a.storesd(slot(120),'xmm0');
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toString');
  a.lea('rcx',slot(144));a.lea('rdx',slot(80));a.lea('r8',slot(128));a.call('rt.getProperty');
  a.lea('rcx',slot(176));a.lea('rdx',slot(144));a.lea('r8',slot(160));a.call('rt.strictEq');a.load('rax',slot(184));a.test('rax','rax');a.jcc('ne',yes);
  a.load('rax',slot(144));a.cmp('rax',3);a.jcc('ne',next);a.load('rax',slot(160));a.cmp('rax',3);a.jcc('ne',next);
  a.movsd('xmm0',slot(152));a.ucomisd('xmm0','xmm0');a.jcc('np',next);a.movsd('xmm0',slot(168));a.ucomisd('xmm0','xmm0');a.jcc('p',yes);
  a.label(next);a.load('rax',slot(64));a.add('rax',1);a.store(slot(64),'rax');a.jmp(loop);
  a.label(no);a.mov('rax',0);a.jmp(no+'.result');a.label(yes);a.mov('rax',1);a.label(no+'.result');a.load('rcx',slot(40));a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 for(const name of ['indexOf','lastIndexOf'] as const){
  const symbol='rt.array'+name[0]!.toUpperCase()+name.slice(1)+'.fn';
  rootedFn(b,symbol+'.code',248,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:9}],(a,frame)=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
   a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
   a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(104),'rax');
   a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.getProperty');
   a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(136));
   const zeroLength=a.unique('zeroLength'),lengthReady=a.unique('lengthReady'),notFound=a.unique('notFound'),found=a.unique('found'),result=a.unique('result');
   a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zeroLength);a.jcc('be',zeroLength);
   a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);
   a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zeroLength);a.mov('rax',0);
   a.label(lengthReady);a.store(slot(72),'rax');a.test('rax','rax');a.jcc('e',notFound);
   a.load('rax',slot(48));const missing=a.unique('missing'),searchReady=a.unique('searchReady');a.test('rax','rax');a.jcc('e',missing);
   a.load('rdx',slot(56));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(176+offset),'rax');}a.jmp(searchReady);
   a.label(missing);a.mov('rax',0);a.store(slot(176),'rax');a.store(slot(184),'rax');a.label(searchReady);
   if(name==='lastIndexOf'){a.load('rax',slot(72));a.sub('rax',1);}else a.mov('rax',0);
   a.store(slot(64),'rax');const startReady=a.unique('startReady'),startZero=a.unique('startZero'),startEnd=a.unique('startEnd');
   a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',startReady);
   a.load('rdx',slot(56));a.lea('rcx',slot(128));a.lea('rdx',{base:'rdx',disp:16});a.call('rt.toNumber');
   a.movsd('xmm0',slot(136));a.ucomisd('xmm0','xmm0');a.jcc('p',startZero);
   a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');const negative=a.unique('negative');a.jcc('b',negative);
   a.load('rax',slot(72));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',name==='indexOf'?notFound:startEnd);
   a.cvttsd2si('rax','xmm0');a.store(slot(64),'rax');a.jmp(startReady);
   a.label(negative);a.load('rax',slot(72));a.neg('rax');a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',name==='lastIndexOf'?notFound:startZero);
   a.cvttsd2si('rax','xmm0');a.test('rax','rax');a.jcc('e',startZero);a.load('r10',slot(72));a.add('rax','r10');a.store(slot(64),'rax');a.jmp(startReady);
   a.label(startZero);a.mov('rax',0);a.store(slot(64),'rax');a.jmp(startReady);
   a.label(startEnd);a.load('rax',slot(72));a.sub('rax',1);a.store(slot(64),'rax');a.label(startReady);
   const loop=a.unique('loop'),next=a.unique('next');a.label(loop);
   if(name==='indexOf'){a.load('rax',slot(64));a.load('r10',slot(72));a.cmp('rax','r10');a.jcc('ae',notFound);}
   a.load('rax',slot(64));a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(128),'rax');a.storesd(slot(136),'xmm0');
   a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.call('rt.toString');
   a.lea('rcx',slot(192));a.lea('rdx',slot(80));a.lea('r8',slot(144));a.call('rt.hasProperty');
   a.load('rax',slot(200));a.test('rax','rax');a.jcc('e',next);
   a.lea('rcx',slot(160));a.lea('rdx',slot(80));a.lea('r8',slot(144));a.call('rt.getProperty');
   a.lea('rcx',slot(208));a.lea('rdx',slot(160));a.lea('r8',slot(176));a.call('rt.strictEq');
   a.load('rax',slot(216));a.test('rax','rax');a.jcc('ne',found);
   a.label(next);a.load('rax',slot(64));
   if(name==='indexOf')a.add('rax',1);else{a.test('rax','rax');a.jcc('e',notFound);a.sub('rax',1);}
   a.store(slot(64),'rax');a.jmp(loop);
   a.label(found);a.load('rax',slot(64));a.jmp(result);
   a.label(notFound);a.mov('rax',-1);a.label(result);a.cvtsi2sd('xmm0','rax');a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
  });
 }
 for(const name of ['forEach','some','every','find','findIndex'] as const)rootedFn(b,'rt.array'+name[0]!.toUpperCase()+name.slice(1)+'.fn.code',296,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:13}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(136));
  const zero=a.unique('zero'),lengthReady=a.unique('lengthReady');
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zero);a.jcc('be',zero);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);
  a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zero);a.mov('rax',0);a.label(lengthReady);a.store(slot(72),'rax');
  a.load('rax',slot(48));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
  a.load('rdx',slot(56));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(144+offset),'rax');}
  a.load('rax',slot(144));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',slot(152));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',2);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(160),'rax');a.store(slot(168),'rax');
  a.load('rax',slot(48));a.cmp('rax',2);const noThis=a.unique('noThis');a.jcc('b',noThis);
  a.load('rdx',slot(56));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:16+offset});a.store(slot(160+offset),'rax');}a.label(noThis);
  a.mov('rax',0);a.store(slot(64),'rax');const loop=a.unique('loop'),next=a.unique('next'),done=a.unique('done'),shortCircuit=a.unique('shortCircuit'),result=a.unique('result');a.label(loop);
  a.load('rax',slot(64));a.load('r10',slot(72));a.cmp('rax','r10');a.jcc('ae',done);
  a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(176),'rax');a.storesd(slot(184),'xmm0');
  a.lea('rcx',slot(192));a.lea('rdx',slot(176));a.call('rt.toString');
  if(name!=='find'&&name!=='findIndex'){
   a.lea('rcx',slot(272));a.lea('rdx',slot(80));a.lea('r8',slot(192));a.call('rt.hasProperty');
   a.load('rax',slot(280));a.test('rax','rax');a.jcc('e',next);
  }
  a.lea('rcx',slot(208));a.lea('rdx',slot(80));a.lea('r8',slot(192));a.call('rt.getProperty');
  for(const offset of [0,8]){a.load('rax',slot(208+offset));a.store(slot(224+offset),'rax');a.load('rax',slot(176+offset));a.store(slot(240+offset),'rax');a.load('rax',slot(80+offset));a.store(slot(256+offset),'rax');}
  a.lea('rax',slot(160));a.store(slot(32),'rax');a.lea('rcx',slot(272));a.lea('rdx',slot(144));a.mov('r8',3);a.lea('r9',slot(224));a.call('rt.invoke');
  if(name!=='forEach'){
   a.lea('rcx',slot(272));a.call('rt.toBoolean');a.test('rax','rax');a.jcc(name==='every'?'e':'ne',shortCircuit);
  }
  a.label(next);a.load('rax',slot(64));a.add('rax',1);a.store(slot(64),'rax');a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));
  a.mov('rax',name==='forEach'||name==='find'?0:name==='findIndex'?3:2);a.store({base:'rcx'},'rax');
  if(name==='findIndex'){a.mov('rax',-1);a.cvtsi2sd('xmm0','rax');a.storesd({base:'rcx',disp:8},'xmm0');}
  else {a.mov('rax',name==='every'?1:0);a.store({base:'rcx',disp:8},'rax');}
  a.jmp(result);
  a.label(shortCircuit);a.load('rcx',slot(40));
  if(name==='find')for(const offset of [0,8]){a.load('rax',slot(208+offset));a.store({base:'rcx',disp:offset},'rax');}
  else if(name==='findIndex'){a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(64));a.cvtsi2sd('xmm0','rax');a.storesd({base:'rcx',disp:8},'xmm0');}
  else {a.mov('rax',2);a.store({base:'rcx'},'rax');a.mov('rax',name==='some'?1:0);a.store({base:'rcx',disp:8},'rax');}
  a.label(result);
 });
 for(const name of ['reduce','reduceRight'] as const)rootedFn(b,'rt.array'+name[0]!.toUpperCase()+name.slice(1)+'.fn.code',344,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:16}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(136));
  const zero=a.unique('zero'),lengthReady=a.unique('lengthReady');
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zero);a.jcc('be',zero);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);
  a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zero);a.mov('rax',0);a.label(lengthReady);a.store(slot(72),'rax');
  a.load('rax',slot(48));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
  a.load('rdx',slot(56));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(144+offset),'rax');}
  a.load('rax',slot(144));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',slot(152));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',2);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(320),'rax');
  a.load('rax',slot(48));a.cmp('rax',2);const noInitial=a.unique('noInitial');a.jcc('b',noInitial);
  a.load('rdx',slot(56));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:16+offset});a.store(slot(160+offset),'rax');}
  a.mov('rax',1);a.store(slot(320),'rax');a.label(noInitial);
  if(name==='reduceRight'){a.load('rax',slot(72));a.sub('rax',1);}else a.mov('rax',0);
  a.store(slot(64),'rax');const loop=a.unique('loop'),next=a.unique('next'),done=a.unique('done'),hasAcc=a.unique('hasAcc');a.label(loop);
  a.load('rax',slot(64));
  if(name==='reduceRight')a.cmp('rax',0);else{a.load('r10',slot(72));a.cmp('rax','r10');}
  a.jcc(name==='reduceRight'?'l':'ae',done);
  a.load('rax',slot(64));a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(176),'rax');a.storesd(slot(184),'xmm0');
  a.lea('rcx',slot(192));a.lea('rdx',slot(176));a.call('rt.toString');
  a.lea('rcx',slot(304));a.lea('rdx',slot(80));a.lea('r8',slot(192));a.call('rt.hasProperty');
  a.load('rax',slot(312));a.test('rax','rax');a.jcc('e',next);
  a.lea('rcx',slot(208));a.lea('rdx',slot(80));a.lea('r8',slot(192));a.call('rt.getProperty');
  a.load('rax',slot(320));a.test('rax','rax');a.jcc('ne',hasAcc);
  for(const offset of [0,8]){a.load('rax',slot(208+offset));a.store(slot(160+offset),'rax');}
  a.mov('rax',1);a.store(slot(320),'rax');a.jmp(next);
  a.label(hasAcc);
  for(const offset of [0,8]){
   a.load('rax',slot(160+offset));a.store(slot(224+offset),'rax');
   a.load('rax',slot(208+offset));a.store(slot(240+offset),'rax');
   a.load('rax',slot(176+offset));a.store(slot(256+offset),'rax');
   a.load('rax',slot(80+offset));a.store(slot(272+offset),'rax');
  }
  a.lea('rax',{rip:'rt.undefinedValue'});a.store(slot(32),'rax');a.lea('rcx',slot(288));a.lea('rdx',slot(144));a.mov('r8',4);a.lea('r9',slot(224));a.call('rt.invoke');
  for(const offset of [0,8]){a.load('rax',slot(288+offset));a.store(slot(160+offset),'rax');}
  a.label(next);a.load('rax',slot(64));if(name==='reduceRight')a.sub('rax',1);else a.add('rax',1);a.store(slot(64),'rax');a.jmp(loop);
  a.label(done);a.load('rax',slot(320));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
  a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',slot(160+offset));a.store({base:'rcx',disp:offset},'rax');}
 });
 rootedFn(b,'rt.arrayFill.fn.code',248,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:10}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(136));
  const zeroLength=a.unique('zeroLength'),lengthReady=a.unique('lengthReady');
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zeroLength);a.jcc('be',zeroLength);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);
  a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zeroLength);a.mov('rax',0);a.label(lengthReady);a.store(slot(64),'rax');
  a.mov('rax',0);a.store(slot(144),'rax');a.store(slot(152),'rax');
  a.load('rax',slot(48));const noValue=a.unique('noValue');a.test('rax','rax');a.jcc('e',noValue);
  a.load('rdx',slot(56));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(144+offset),'rax');}a.label(noValue);
  for(const [ordinal,target] of [[1,72],[2,232]] as const){
   const absent=a.unique('absent'),zero=a.unique('zero'),negative=a.unique('negative'),atEnd=a.unique('atEnd'),end=a.unique('end');
   a.load('rax',slot(48));a.cmp('rax',ordinal+1);a.jcc('b',absent);
   a.load('rdx',slot(56));a.lea('rdx',{base:'rdx',disp:ordinal*16});
   if(ordinal===2){a.load('rax',{base:'rdx'});a.test('rax','rax');a.jcc('e',absent);}
   a.lea('rcx',slot(160));a.call('rt.toNumber');a.movsd('xmm0',slot(168));
   a.ucomisd('xmm0','xmm0');a.jcc('p',zero);
   a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('b',negative);
   a.load('rax',slot(64));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',atEnd);
   a.cvttsd2si('rax','xmm0');a.jmp(end);
   a.label(negative);a.load('rax',slot(64));a.neg('rax');a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',zero);
   a.cvttsd2si('rax','xmm0');a.load('r10',slot(64));a.add('rax','r10');a.jmp(end);
   a.label(zero);a.mov('rax',0);a.jmp(end);
   a.label(absent);if(ordinal===1){a.mov('rax',0);a.jmp(end);}
   a.label(atEnd);a.load('rax',slot(64));
   a.label(end);a.store(slot(target),'rax');
  }
  const loop=a.unique('loop'),done=a.unique('done');a.label(loop);
  a.load('rax',slot(72));a.load('r10',slot(232));a.cmp('rax','r10');a.jcc('ae',done);
  a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(176),'rax');a.storesd(slot(184),'xmm0');
  a.lea('rcx',slot(192));a.lea('rdx',slot(176));a.call('rt.toString');
  a.lea('rcx',slot(80));a.lea('rdx',slot(192));a.lea('r8',slot(144));a.mov('r9',2);a.call('rt.setProperty');
  a.load('rax',slot(72));a.add('rax',1);a.store(slot(72),'rax');a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',slot(80+offset));a.store({base:'rcx',disp:offset},'rax');}
 });
 rootedFn(b,'rt.arrayCopyWithin.fn.code',328,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:15}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(136));
  const zeroLength=a.unique('zeroLength'),lengthReady=a.unique('lengthReady');
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zeroLength);a.jcc('be',zeroLength);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);
  a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zeroLength);a.mov('rax',0);a.label(lengthReady);a.store(slot(64),'rax');
  for(const [ordinal,target] of [[0,72],[1,312],[2,264]] as const){
   const absent=a.unique('absent'),zero=a.unique('zero'),negative=a.unique('negative'),atEnd=a.unique('atEnd'),end=a.unique('end');
   a.load('rax',slot(48));a.cmp('rax',ordinal+1);a.jcc('b',absent);
   a.load('rdx',slot(56));a.lea('rdx',{base:'rdx',disp:ordinal*16});
   if(ordinal===2){a.load('rax',{base:'rdx'});a.test('rax','rax');a.jcc('e',absent);}
   a.lea('rcx',slot(144));a.call('rt.toNumber');a.movsd('xmm0',slot(152));
   a.ucomisd('xmm0','xmm0');a.jcc('p',zero);
   a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('b',negative);
   a.load('rax',slot(64));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',atEnd);
   a.cvttsd2si('rax','xmm0');a.jmp(end);
   a.label(negative);a.load('rax',slot(64));a.neg('rax');a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',zero);
   a.cvttsd2si('rax','xmm0');a.load('r10',slot(64));a.add('rax','r10');a.jmp(end);
   a.label(zero);a.mov('rax',0);a.jmp(end);
   a.label(absent);if(ordinal!==2){a.mov('rax',0);a.jmp(end);}
   a.label(atEnd);a.load('rax',slot(64));a.label(end);a.store(slot(target),'rax');
  }
  const done=a.unique('done'),countReady=a.unique('countReady'),forward=a.unique('forward'),loop=a.unique('loop'),sourceAbsent=a.unique('sourceAbsent'),advance=a.unique('advance');
  a.load('rax',slot(264));a.load('r10',slot(312));a.sub('rax','r10');a.test('rax','rax');a.jcc('le',done);
  a.load('r10',slot(64));a.load('r11',slot(72));a.sub('r10','r11');a.test('r10','r10');a.jcc('le',done);
  a.cmp('rax','r10');a.jcc('le',countReady);a.mov('rax','r10');a.label(countReady);a.store(slot(280),'rax');
  a.mov('rax',1);a.store(slot(296),'rax');
  a.load('rax',slot(312));a.load('r10',slot(72));a.cmp('rax','r10');a.jcc('ae',forward);
  a.load('r11',slot(280));a.add('rax','r11');a.cmp('r10','rax');a.jcc('ae',forward);
  a.sub('r11',1);a.load('rax',slot(312));a.add('rax','r11');a.store(slot(312),'rax');
  a.load('rax',slot(72));a.add('rax','r11');a.store(slot(72),'rax');a.mov('rax',-1);a.store(slot(296),'rax');
  a.label(forward);a.label(loop);
  a.load('rax',slot(312));a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(192),'rax');a.storesd(slot(200),'xmm0');
  a.lea('rcx',slot(160));a.lea('rdx',slot(192));a.call('rt.toString');
  a.load('rax',slot(72));a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(208),'rax');a.storesd(slot(216),'xmm0');
  a.lea('rcx',slot(176));a.lea('rdx',slot(208));a.call('rt.toString');
  a.lea('rcx',slot(240));a.lea('rdx',slot(80));a.lea('r8',slot(160));a.call('rt.hasProperty');
  a.load('rax',slot(248));a.test('rax','rax');a.jcc('e',sourceAbsent);
  a.lea('rcx',slot(224));a.lea('rdx',slot(80));a.lea('r8',slot(160));a.call('rt.getProperty');
  a.lea('rcx',slot(80));a.lea('rdx',slot(176));a.lea('r8',slot(224));a.mov('r9',2);a.call('rt.setProperty');a.jmp(advance);
  a.label(sourceAbsent);a.lea('rcx',slot(240));a.lea('rdx',slot(80));a.lea('r8',slot(176));a.call('rt.deleteProperty');
  a.load('rax',slot(248));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
  a.label(advance);a.load('r10',slot(296));a.load('rax',slot(312));a.add('rax','r10');a.store(slot(312),'rax');
  a.load('rax',slot(72));a.add('rax','r10');a.store(slot(72),'rax');a.load('rax',slot(280));a.sub('rax',1);a.store(slot(280),'rax');a.test('rax','rax');a.jcc('ne',loop);
  a.label(done);a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',slot(80+offset));a.store({base:'rcx',disp:offset},'rax');}
 });
 rootedFn(b,'rt.arrayReverse.fn.code',296,[{kind:'output',register:'rcx'},{kind:'locals',offset:80,count:13}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(136));
  const zero=a.unique('zero'),lengthReady=a.unique('lengthReady');
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zero);a.jcc('be',zero);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);
  a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zero);a.mov('rax',0);a.label(lengthReady);a.store(slot(48),'rax');
  a.shr('rax',1);a.store(slot(72),'rax');a.mov('rax',0);a.store(slot(56),'rax');
  const loop=a.unique('loop'),done=a.unique('done'),lowerAbsent=a.unique('lowerAbsent'),lowerOnly=a.unique('lowerOnly'),upperOnly=a.unique('upperOnly'),next=a.unique('next');a.label(loop);
  a.load('rax',slot(56));a.load('r10',slot(72));a.cmp('rax','r10');a.jcc('ae',done);
  a.load('r10',slot(48));a.sub('r10',1);a.sub('r10','rax');a.store(slot(64),'r10');
  a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(208),'rax');a.storesd(slot(216),'xmm0');
  a.lea('rcx',slot(176));a.lea('rdx',slot(208));a.call('rt.toString');
  a.load('rax',slot(64));a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(224),'rax');a.storesd(slot(232),'xmm0');
  a.lea('rcx',slot(192));a.lea('rdx',slot(224));a.call('rt.toString');
  a.lea('rcx',slot(240));a.lea('rdx',slot(80));a.lea('r8',slot(176));a.call('rt.hasProperty');
  const lowerRead=a.unique('lowerRead');a.load('rax',slot(248));a.test('rax','rax');a.jcc('e',lowerRead);
  a.lea('rcx',slot(144));a.lea('rdx',slot(80));a.lea('r8',slot(176));a.call('rt.getProperty');a.label(lowerRead);
  a.lea('rcx',slot(256));a.lea('rdx',slot(80));a.lea('r8',slot(192));a.call('rt.hasProperty');
  a.load('rax',slot(248));a.test('rax','rax');a.jcc('e',lowerAbsent);
  a.load('rax',slot(264));a.test('rax','rax');a.jcc('e',lowerOnly);
  a.lea('rcx',slot(160));a.lea('rdx',slot(80));a.lea('r8',slot(192));a.call('rt.getProperty');
  a.lea('rcx',slot(80));a.lea('rdx',slot(176));a.lea('r8',slot(160));a.mov('r9',2);a.call('rt.setProperty');
  a.lea('rcx',slot(80));a.lea('rdx',slot(192));a.lea('r8',slot(144));a.mov('r9',2);a.call('rt.setProperty');a.jmp(next);
  a.label(lowerOnly);a.lea('rcx',slot(80));a.lea('rdx',slot(192));a.lea('r8',slot(144));a.mov('r9',2);a.call('rt.setProperty');
  a.lea('rcx',slot(240));a.lea('rdx',slot(80));a.lea('r8',slot(176));a.call('rt.deleteProperty');
  a.load('rax',slot(248));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.jmp(next);
  a.label(lowerAbsent);a.load('rax',slot(264));a.test('rax','rax');a.jcc('e',next);
  a.label(upperOnly);a.lea('rcx',slot(160));a.lea('rdx',slot(80));a.lea('r8',slot(192));a.call('rt.getProperty');
  a.lea('rcx',slot(80));a.lea('rdx',slot(176));a.lea('r8',slot(160));a.mov('r9',2);a.call('rt.setProperty');
  a.lea('rcx',slot(240));a.lea('rdx',slot(80));a.lea('r8',slot(192));a.call('rt.deleteProperty');
  a.load('rax',slot(248));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
  a.label(next);a.load('rax',slot(56));a.add('rax',1);a.store(slot(56),'rax');a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',slot(80+offset));a.store({base:'rcx',disp:offset},'rax');}
 });
 rootedFn(b,'rt.arrayPop.fn.code',248,[{kind:'output',register:'rcx'},{kind:'locals',offset:80,count:8}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.arrayPush.length'});a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(136));
  const zero=a.unique('zero'),lengthReady=a.unique('lengthReady'),empty=a.unique('empty'),setLength=a.unique('setLength');
  a.mov('rax',0);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',zero);a.jcc('be',zero);
  a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);
  a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zero);a.mov('rax',0);a.label(lengthReady);a.test('rax','rax');a.jcc('e',empty);a.sub('rax',1);a.store(slot(64),'rax');
  a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(128),'rax');a.storesd(slot(136),'xmm0');
  a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.call('rt.toString');
  a.lea('rcx',slot(160));a.lea('rdx',slot(80));a.lea('r8',slot(144));a.call('rt.getProperty');
  a.lea('rcx',slot(176));a.lea('rdx',slot(80));a.lea('r8',slot(144));a.call('rt.deleteProperty');
  a.load('rax',slot(184));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.jmp(setLength);
  a.label(empty);a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(160),'rax');a.store(slot(168),'rax');
  a.label(setLength);a.load('rax',slot(64));a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(192),'rax');a.storesd(slot(200),'xmm0');
  a.lea('rcx',slot(80));a.lea('rdx',slot(96));a.lea('r8',slot(192));a.mov('r9',2);a.call('rt.setProperty');
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(160+n));a.store({base:'rcx',disp:n},'rax');}
 });
}
