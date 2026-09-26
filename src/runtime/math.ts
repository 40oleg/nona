import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';

const unaryMath=['abs','sign','sqrt','trunc','floor','ceil','round','fround'] as const;
const integerMath=['imul','clz32'] as const;
const trigMath=['sin','cos','tan'] as const;
const logMath=['log','log2','log10'] as const;
const inverseTrigMath=['asin','acos'] as const;
const hyperbolicMath=['sinh','cosh','tanh'] as const;
export const mathRoots=['rt.Math','rt.Math.pow.fn','rt.Math.min.fn','rt.Math.max.fn','rt.Math.hypot.fn','rt.Math.random.fn','rt.Math.exp.fn','rt.Math.expm1.fn','rt.Math.log1p.fn','rt.Math.cbrt.fn','rt.Math.atan.fn','rt.Math.atan2.fn','rt.Math.atanh.fn','rt.Math.asinh.fn','rt.Math.acosh.fn',...unaryMath.map(name=>'rt.Math.'+name+'.fn'),...trigMath.map(name=>'rt.Math.'+name+'.fn'),...inverseTrigMath.map(name=>'rt.Math.'+name+'.fn'),...hyperbolicMath.map(name=>'rt.Math.'+name+'.fn'),...logMath.map(name=>'rt.Math.'+name+'.fn'),...integerMath.map(name=>'rt.Math.'+name+'.fn')];
const mathConstants=[['E',Math.E],['LN10',Math.LN10],['LN2',Math.LN2],['LOG10E',Math.LOG10E],['LOG2E',Math.LOG2E],['PI',Math.PI],['SQRT1_2',Math.SQRT1_2],['SQRT2',Math.SQRT2]] as const;
export const mathPropertyRoots=['rt.globalObject.Math','rt.Math.@@toStringTag',...mathConstants.map(([name])=>'rt.Math.'+name),...['pow','min','max','hypot','random','exp','expm1','log1p','cbrt','atan','atan2','atanh','asinh','acosh',...unaryMath,...trigMath,...inverseTrigMath,...hyperbolicMath,...logMath,...integerMath].flatMap(name=>builtinPropertyRoots('rt.Math.'+name+'.fn',name,'rt.Math'))];

export function emitMath(b:RuntimeBuilder):void {
 b.bundle.fragments.push({name:'rt.Math',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
 ]});
 prependFunctionBuiltin(b,'rt.Math.pow.fn','pow',2,'rt.Math');
 for(const name of ['min','max'])prependFunctionBuiltin(b,'rt.Math.'+name+'.fn',name,2,'rt.Math');
 prependFunctionBuiltin(b,'rt.Math.hypot.fn','hypot',2,'rt.Math');
 prependFunctionBuiltin(b,'rt.Math.random.fn','random',0,'rt.Math');
 b.data('rt.Math.random.state',new Uint8Array(8),'.data');
 for(const name of unaryMath)prependFunctionBuiltin(b,'rt.Math.'+name+'.fn',name,1,'rt.Math');
 for(const name of trigMath)prependFunctionBuiltin(b,'rt.Math.'+name+'.fn',name,1,'rt.Math');
 for(const name of inverseTrigMath)prependFunctionBuiltin(b,'rt.Math.'+name+'.fn',name,1,'rt.Math');
 for(const name of hyperbolicMath)prependFunctionBuiltin(b,'rt.Math.'+name+'.fn',name,1,'rt.Math');
 for(const name of logMath)prependFunctionBuiltin(b,'rt.Math.'+name+'.fn',name,1,'rt.Math');
 prependFunctionBuiltin(b,'rt.Math.exp.fn','exp',1,'rt.Math');
 prependFunctionBuiltin(b,'rt.Math.expm1.fn','expm1',1,'rt.Math');
 prependFunctionBuiltin(b,'rt.Math.log1p.fn','log1p',1,'rt.Math');
 prependFunctionBuiltin(b,'rt.Math.cbrt.fn','cbrt',1,'rt.Math');
 prependFunctionBuiltin(b,'rt.Math.atan.fn','atan',1,'rt.Math');
 prependFunctionBuiltin(b,'rt.Math.atan2.fn','atan2',2,'rt.Math');
 prependFunctionBuiltin(b,'rt.Math.atanh.fn','atanh',1,'rt.Math');
 prependFunctionBuiltin(b,'rt.Math.asinh.fn','asinh',1,'rt.Math');
 prependFunctionBuiltin(b,'rt.Math.acosh.fn','acosh',1,'rt.Math');
 for(const name of integerMath)prependFunctionBuiltin(b,'rt.Math.'+name+'.fn',name,name==='imul'?2:1,'rt.Math');
 b.bundle.fragments.push(stringLiteral('rt.str.Math','Math'));
 const math=b.bundle.fragments.find(f=>f.name==='rt.Math')!;
 const mathHead=math.fixups.find(f=>f.offset===O.properties)!;
 for(const [name,value] of mathConstants){
  const node='rt.Math.'+name,key=node+'.key';b.bundle.fragments.push(stringLiteral(key,name));
  const bytes=new Uint8Array(P.size);bytes[P.value]=3;new DataView(bytes.buffer).setFloat64(P.value+8,value,true);
  b.bundle.fragments.push({name:node,section:'.data',alignment:8,bytes,symbols:{},fixups:[
   {offset:P.next,kind:'va64',target:mathHead.target,addend:0},
   {offset:P.key,kind:'va64',target:key,addend:0},
  ]});mathHead.target=node;
 }
 const tag=new Uint8Array(P.size);tag[P.value]=4;tag[P.attributes]=A.configurable;
 b.bundle.fragments.push({name:'rt.Math.@@toStringTag',section:'.data',alignment:8,bytes:tag,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:mathHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.str.Math',addend:0},
 ]});mathHead.target='rt.Math.@@toStringTag';
 const global=b.bundle.fragments.find(f=>f.name==='rt.globalObject')!;
 const head=global.fixups.find(f=>f.offset===O.properties)!;
 const property=new Uint8Array(P.size);property[P.value]=5;property[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push({name:'rt.globalObject.Math',section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:head.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.str.Math',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.Math',addend:0},
 ]});head.target='rt.globalObject.Math';
 rootedFn(b,'rt.Math.pow.fn.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');a.store(slot(80),'rax');a.store(slot(88),'rax');
  const first=a.unique('first'),second=a.unique('second');a.test('rdx','rdx');a.jcc('e',first);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
  a.label(first);a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',second);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:16+n});a.store(slot(80+n),'rax');}
  a.label(second);a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.call('rt.toNumber');
  a.movsd('xmm0',slot(72));a.movsd('xmm1',slot(88));a.call('rt.numberPow');a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 for(const name of ['min','max'] as const)rootedFn(b,'rt.Math.'+name+'.fn.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:1}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.mov('rax',name==='min'?0x7ff0000000000000n:0xfff0000000000000n);a.store(slot(64),'rax');
  a.mov('rax',0);a.store(slot(72),'rax');
  const loop=a.unique('loop'),done=a.unique('done'),nan=a.unique('nan'),replace=a.unique('replace'),next=a.unique('next');
  a.label(loop);a.load('rax',slot(72));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('ae',done);
  a.shl('rax',4);a.load('rdx',slot(56));a.add('rdx','rax');a.lea('rcx',slot(80));a.call('rt.toNumber');
  a.movsd('xmm0',slot(88));a.load('rax',slot(64));a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',nan);
  a.jcc(name==='min'?'b':'a',replace);a.jcc('ne',next);
  // For equal numbers only the sign of zero can differ. OR picks -0 for
  // min; AND picks +0 for max, without changing any other equal value.
  a.load('rax',slot(88));a.load('r10',slot(64));if(name==='min')a.or('rax','r10');else a.and('rax','r10');a.store(slot(64),'rax');a.jmp(next);
  a.label(replace);a.load('rax',slot(88));a.store(slot(64),'rax');a.jmp(next);
  a.label(nan);a.mov('rax',0x7ff8000000000000n);a.store(slot(64),'rax');
  a.label(next);a.load('rax',slot(72));a.add('rax',1);a.store(slot(72),'rax');a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(64));a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.Math.hypot.fn.code',136,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:96,count:1}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.mov('rax',0);for(const offset of [64,72,80,88,96,104])a.store(slot(offset),'rax');
  const loop=a.unique('loop'),done=a.unique('done'),next=a.unique('next'),nan=a.unique('nan'),infinity=a.unique('infinity');
  const first=a.unique('first'),larger=a.unique('larger'),accumulate=a.unique('accumulate'),finish=a.unique('finish');
  a.label(loop);a.load('rax',slot(80));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('ae',done);
  a.shl('rax',4);a.load('rdx',slot(56));a.add('rdx','rax');a.lea('rcx',slot(96));a.call('rt.toNumber');
  a.load('rax',slot(104));a.mov('r10',0x7fffffffffffffffn);a.and('rax','r10');
  a.mov('r10',0x7ff0000000000000n);a.cmp('rax','r10');a.jcc('a',nan);a.jcc('e',infinity);
  a.test('rax','rax');a.jcc('e',next);a.load('r10',slot(64));a.test('r10','r10');a.jcc('e',first);
  a.cmp('rax','r10');a.jcc('a',larger);
  a.label(accumulate);a.movqToXmm('xmm0','rax');a.divsd('xmm0',slot(64));a.mulsd('xmm0','xmm0');a.addsd('xmm0',slot(72));a.storesd(slot(72),'xmm0');a.jmp(next);
  a.label(first);a.store(slot(64),'rax');a.mov('r10',0x3ff0000000000000n);a.store(slot(72),'r10');a.jmp(next);
  a.label(larger);a.movqToXmm('xmm0','r10');a.movqToXmm('xmm1','rax');a.divsd('xmm0','xmm1');a.mulsd('xmm0','xmm0');a.mulsd('xmm0',slot(72));
  a.mov('r10',0x3ff0000000000000n);a.movqToXmm('xmm1','r10');a.addsd('xmm0','xmm1');a.storesd(slot(72),'xmm0');a.store(slot(64),'rax');a.jmp(next);
  a.label(nan);a.load('r10',slot(88));a.cmp('r10',2);a.jcc('e',next);a.mov('rax',1);a.store(slot(88),'rax');a.jmp(next);
  a.label(infinity);a.mov('rax',2);a.store(slot(88),'rax');
  a.label(next);a.load('rax',slot(80));a.add('rax',1);a.store(slot(80),'rax');a.jmp(loop);
  a.label(done);a.load('rax',slot(88));a.cmp('rax',2);a.jcc('e',infinity+'.result');a.cmp('rax',1);a.jcc('e',nan+'.result');
  a.load('rax',slot(64));a.test('rax','rax');a.jcc('e',finish);a.movsd('xmm0',slot(72));a.sqrtsd('xmm0','xmm0');a.mulsd('xmm0',slot(64));a.movqFromXmm('rax','xmm0');a.jmp(finish);
  a.label(infinity+'.result');a.mov('rax',0x7ff0000000000000n);a.jmp(finish);
  a.label(nan+'.result');a.mov('rax',0x7ff8000000000000n);
  a.label(finish);a.load('rcx',slot(40));a.mov('r10',3);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 b.fn('rt.Math.random.fn.code',40,a=>{
  a.store(slot(32),'rcx');a.load('rax',{rip:'rt.Math.random.state'});
  const seeded=a.unique('seeded');a.test('rax','rax');a.jcc('ne',seeded);
  a.emit([0x0f,0x31]); // RDTSC seeds the per-process xorshift state.
  a.shl('rdx',32);a.or('rax','rdx');a.mov('r10',1);a.or('rax','r10');
  a.label(seeded);a.mov('r10','rax');a.shr('r10',12);a.xor('rax','r10');
  a.mov('r10','rax');a.shl('r10',25);a.xor('rax','r10');
  a.mov('r10','rax');a.shr('r10',27);a.xor('rax','r10');
  a.store({rip:'rt.Math.random.state'},'rax');a.mov('r10',2685821657736338717n);a.imul('rax','r10');a.shr('rax',11);
  a.cvtsi2sd('xmm0','rax');a.mov('rax',0x3ca0000000000000n);a.movqToXmm('xmm1','rax');a.mulsd('xmm0','xmm1');
  a.load('rcx',slot(32));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 for(const name of unaryMath)rootedFn(b,'rt.Math.'+name+'.fn.code',88,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');
  const missing=a.unique('missing');a.test('rdx','rdx');a.jcc('e',missing);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(missing);
  a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');a.load('rax',slot(72));
  if(name==='abs'){a.mov('r10',0x7fffffffffffffffn);a.and('rax','r10');}
  else if(name==='sqrt'){a.movqToXmm('xmm0','rax');a.sqrtsd('xmm0','xmm0');a.movqFromXmm('rax','xmm0');}
  else if(name==='fround'){a.movqToXmm('xmm0','rax');a.cvtsd2ss('xmm0','xmm0');a.cvtss2sd('xmm0','xmm0');a.movqFromXmm('rax','xmm0');}
  else if(name==='sign'){
   const save=a.unique('save');a.mov('r10','rax');a.mov('r11',0x7fffffffffffffffn);a.and('r10','r11');a.test('r10','r10');a.jcc('e',save);
   a.mov('r11',0x7ff0000000000000n);a.cmp('r10','r11');a.jcc('a',save);
   a.mov('r10',0x8000000000000000n);a.and('rax','r10');a.mov('r10',0x3ff0000000000000n);a.or('rax','r10');a.label(save);
  }else{
   const save=a.unique('save'),zero=a.unique('zero');a.mov('r10','rax');a.mov('r11',0x7fffffffffffffffn);a.and('r10','r11');
   a.mov('r11',0x4330000000000000n);a.cmp('r10','r11');a.jcc('ae',save);
   a.mov('r11',0x3ff0000000000000n);a.cmp('r10','r11');a.jcc('b',zero);
   a.shr('r10',52);a.sub('r10',1023);a.mov('rcx',52);a.sub('rcx','r10');a.mov('r11',-1);a.shl('r11','cl');a.and('rax','r11');a.jmp(save);
   a.label(zero);a.mov('r11',0x8000000000000000n);a.and('rax','r11');a.label(save);
   if(name==='floor'||name==='ceil'){
    const rounded=a.unique('rounded');a.load('r10',slot(72));a.movqToXmm('xmm0','r10');a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',rounded);a.jcc(name==='floor'?'ae':'be',rounded);
    a.movqToXmm('xmm0','rax');a.mov('r10',0x3ff0000000000000n);a.movqToXmm('xmm1','r10');if(name==='floor')a.subsd('xmm0','xmm1');else a.addsd('xmm0','xmm1');a.movqFromXmm('rax','xmm0');a.label(rounded);
   }
   if(name==='round'){
    const negative=a.unique('negative'),rounded=a.unique('rounded'),adjust=a.unique('adjust');
    a.load('r10',slot(72));a.movqToXmm('xmm0','r10');a.movqToXmm('xmm1','rax');a.subsd('xmm0','xmm1');
    a.mov('r10',0x3fe0000000000000n);a.movqToXmm('xmm1','r10');a.ucomisd('xmm0','xmm1');a.jcc('p',rounded);a.jcc('b',negative);
    a.mov('r10',0x3ff0000000000000n);a.jmp(adjust);
    a.label(negative);a.mov('r10',0xbfe0000000000000n);a.movqToXmm('xmm1','r10');a.ucomisd('xmm0','xmm1');a.jcc('ae',rounded);
    a.mov('r10',0xbff0000000000000n);
    a.label(adjust);a.movqToXmm('xmm0','rax');a.movqToXmm('xmm1','r10');a.addsd('xmm0','xmm1');a.movqFromXmm('rax','xmm0');a.label(rounded);
   }
  }
  a.load('rcx',slot(40));a.mov('r10',3);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 for(const name of trigMath)rootedFn(b,'rt.Math.'+name+'.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');
  const missing=a.unique('missing');a.test('rdx','rdx');a.jcc('e',missing);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(missing);
  a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');
  const large=a.unique('largeAngle'),done=a.unique('trigDone');
  a.load('rax',slot(72));a.mov('r10',0x7fffffffffffffffn);a.and('rax','r10');a.mov('r10',0x43e0000000000000n);a.cmp('rax','r10');a.jcc('ae',large);
  a.emit([0xdd,0x44,0x24,72]); // fld qword [rsp+72]
  a.emit(name==='sin'?[0xd9,0xfe]:name==='cos'?[0xd9,0xff]:[0xd9,0xf2]);
  if(name==='tan')a.emit([0xdd,0xd8]); // discard the extra 1.0 from fptan
  a.emit([0xdd,0x5c,0x24,80]); // fstp qword [rsp+80]
  a.jmp(done);a.label(large);a.mov('rax',0x7ff8000000000000n);a.store(slot(80),'rax');a.label(done);
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(80));a.store({base:'rcx',disp:8},'rax');
 });
 for(const name of logMath)rootedFn(b,'rt.Math.'+name+'.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');
  const missing=a.unique('missing');a.test('rdx','rdx');a.jcc('e',missing);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(missing);
  a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');
  a.emit(name==='log'?[0xd9,0xed]:name==='log10'?[0xd9,0xec]:[0xd9,0xe8]); // ln(2), lg(2), or 1
  a.emit([0xdd,0x44,0x24,72,0xd9,0xf1]); // fld x; fyl2x
  a.emit([0xdd,0x5c,0x24,80]); // fstp qword [rsp+80]
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(80));a.store({base:'rcx',disp:8},'rax');
 });
 b.fn('rt.mathLog1pCore',72,a=>{
  a.storesd(slot(40),'xmm0');a.load('rax',slot(40));a.mov('r10',0x7fffffffffffffffn);a.and('rax','r10');a.mov('r10',0x3fd0000000000000n);
  const ordinary=a.unique('ordinary'),done=a.unique('done');a.cmp('rax','r10');a.jcc('ae',ordinary);
  a.emit([0xd9,0xed,0xdd,0x44,0x24,40,0xd9,0xf9]); // ln(2) * log2(1+x), preserving small x
  a.jmp(done);
  a.label(ordinary);a.emit([0xd9,0xed,0xd9,0xe8,0xdc,0x44,0x24,40,0xd9,0xf1]); // ln(2) * log2(1+x)
  a.label(done);a.emit([0xdd,0x5c,0x24,48]);a.movsd('xmm0',slot(48));
 });
 rootedFn(b,'rt.Math.log1p.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');const missing=a.unique('missing');a.test('rdx','rdx');a.jcc('e',missing);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(missing);
  a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');a.movsd('xmm0',slot(72));a.call('rt.mathLog1pCore');
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 rootedFn(b,'rt.Math.cbrt.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');const missing=a.unique('missing');a.test('rdx','rdx');a.jcc('e',missing);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(missing);
  a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');
  a.load('rax',slot(72));a.mov('r10',0x7fffffffffffffffn);a.and('rax','r10');a.store(slot(80),'rax');
  const done=a.unique('done'),special=a.unique('special');a.test('rax','rax');a.jcc('e',special);a.mov('r10',0x7ff0000000000000n);a.cmp('rax','r10');a.jcc('ae',special);
  a.emit([0xd9,0xed,0xdd,0x44,0x24,80,0xd9,0xf1,0xdd,0x5c,0x24,88]); // ln(abs(x))
  a.movsd('xmm0',slot(88));a.mov('rax',0x4008000000000000n);a.movqToXmm('xmm1','rax');a.divsd('xmm0','xmm1');a.call('rt.mathExpCore');a.movqFromXmm('rax','xmm0');
  a.load('r10',slot(72));a.mov('r11',0x8000000000000000n);a.and('r10','r11');a.or('rax','r10');a.store(slot(80),'rax');
  a.jmp(done);a.label(special);a.load('rax',slot(72));a.store(slot(80),'rax');
  a.label(done);a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(80));a.store({base:'rcx',disp:8},'rax');
 });
 b.fn('rt.mathExpCore',72,a=>{
  a.movqFromXmm('rax','xmm0');a.store(slot(40),'rax');a.mov('r10',0x7fffffffffffffffn);a.and('r10','rax');
  const special=a.unique('expSpecial'),zero=a.unique('expZero'),done=a.unique('expDone');
  a.mov('r11',0x7ff0000000000000n);a.cmp('r10','r11');a.jcc('ae',special);
  a.test('r10','r10');a.jcc('e',zero);
  a.emit([0xd9,0xea,0xdd,0x44,0x24,40,0xde,0xc9]); // log2(e) * x
  a.emit([0xd9,0xc0,0xd9,0xfc,0xd9,0xc9,0xd8,0xe1,0xd9,0xf0,0xd9,0xe8,0xde,0xc1,0xd9,0xfd,0xdd,0xd9]);
  a.emit([0xdd,0x5c,0x24,48]);a.movsd('xmm0',slot(48));a.jmp(done);
  a.label(special);a.mov('r11',0x7ff0000000000000n);a.cmp('r10','r11');const save=a.unique('expSave');a.jcc('ne',save);
  a.test('rax','rax');a.jcc('s',zero);a.mov('rax',0x7ff0000000000000n);a.jmp(save);
  a.label(zero);a.mov('rax',0x3ff0000000000000n);a.load('r10',slot(40));a.test('r10','r10');const normalZero=a.unique('normalZero');a.jcc('ns',normalZero);a.mov('r11',0x7fffffffffffffffn);a.and('r10','r11');a.test('r10','r10');a.jcc('e',normalZero);a.mov('rax',0);a.label(normalZero);
  a.label(save);a.movqToXmm('xmm0','rax');a.label(done);
 });
 b.fn('rt.mathExpm1Core',72,a=>{
  a.movqFromXmm('rax','xmm0');a.store(slot(40),'rax');a.mov('r10',0x7fffffffffffffffn);a.and('rax','r10');
  const large=a.unique('expm1Large'),done=a.unique('expm1Done');a.mov('r10',0x3fe62e42fefa39efn);a.cmp('rax','r10');a.jcc('a',large);
  a.emit([0xd9,0xea,0xdd,0x44,0x24,40,0xde,0xc9,0xd9,0xf0,0xdd,0x5c,0x24,48]); // 2^(x*log2(e))-1
  a.movsd('xmm0',slot(48));a.jmp(done);
  a.label(large);a.call('rt.mathExpCore');a.mov('rax',0x3ff0000000000000n);a.movqToXmm('xmm1','rax');a.subsd('xmm0','xmm1');a.label(done);
 });
 rootedFn(b,'rt.Math.exp.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');const missing=a.unique('missing');a.test('rdx','rdx');a.jcc('e',missing);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(missing);
  a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');a.movsd('xmm0',slot(72));a.call('rt.mathExpCore');
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 rootedFn(b,'rt.Math.expm1.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');const missing=a.unique('missing');a.test('rdx','rdx');a.jcc('e',missing);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(missing);
  a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');a.movsd('xmm0',slot(72));a.call('rt.mathExpm1Core');
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 rootedFn(b,'rt.Math.atan.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');const missing=a.unique('missing');a.test('rdx','rdx');a.jcc('e',missing);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(missing);
  a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');
  a.emit([0xdd,0x44,0x24,72,0xd9,0xe8,0xd9,0xf3,0xdd,0x5c,0x24,80]); // atan2(x, 1)
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(80));a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.Math.atan2.fn.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.mov('rax',0);for(const offset of [64,72,80,88])a.store(slot(offset),'rax');
  for(let i=0;i<2;i++){
   const missing=a.unique('missing');a.load('rax',slot(48));a.cmp('rax',i+1);a.jcc('b',missing);
   a.load('rdx',slot(56));if(i)a.add('rdx',16);for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+i*16+n),'rax');}a.label(missing);
   a.lea('rcx',slot(64+i*16));a.lea('rdx',slot(64+i*16));a.call('rt.toNumber');
  }
  a.emit([0xdd,0x44,0x24,72,0xdd,0x44,0x24,88,0xd9,0xf3,0xdd,0x5c,0x24,104]); // atan2(y,x)
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(104));a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.Math.atanh.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');const missing=a.unique('missing');a.test('rdx','rdx');a.jcc('e',missing);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(missing);
  a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');a.load('rax',slot(72));a.store(slot(80),'rax');
  a.mov('r10',0x7fffffffffffffffn);a.and('rax','r10');const done=a.unique('done'),unit=a.unique('unit'),invalid=a.unique('invalid');
  a.test('rax','rax');a.jcc('e',done);a.mov('r10',0x3ff0000000000000n);a.cmp('rax','r10');a.jcc('e',unit);a.jcc('a',invalid);
  a.movsd('xmm0',slot(72));a.call('rt.mathLog1pCore');a.storesd(slot(88),'xmm0');
  a.load('rax',slot(72));a.mov('r10',0x8000000000000000n);a.xor('rax','r10');a.movqToXmm('xmm0','rax');a.call('rt.mathLog1pCore');
  a.movsd('xmm1',slot(88));a.subsd('xmm1','xmm0');a.mov('rax',0x3fe0000000000000n);a.movqToXmm('xmm0','rax');a.mulsd('xmm1','xmm0');a.storesd(slot(80),'xmm1');a.jmp(done);
  a.label(unit);a.load('rax',slot(72));a.mov('r10',0x8000000000000000n);a.and('rax','r10');a.mov('r10',0x7ff0000000000000n);a.or('rax','r10');a.store(slot(80),'rax');a.jmp(done);
  a.label(invalid);a.mov('rax',0x7ff8000000000000n);a.store(slot(80),'rax');
  a.label(done);a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(80));a.store({base:'rcx',disp:8},'rax');
 });
 for(const name of ['asinh','acosh'] as const)rootedFn(b,'rt.Math.'+name+'.fn.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');const missing=a.unique('missing');a.test('rdx','rdx');a.jcc('e',missing);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(missing);
  a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');a.load('rax',slot(72));
  const done=a.unique('done'),invalid=a.unique('invalid'),large=a.unique('large'),special=a.unique('special');
  if(name==='asinh'){
   a.mov('r10',0x7fffffffffffffffn);a.and('rax','r10');a.store(slot(80),'rax');a.test('rax','rax');a.jcc('e',special);
  }else{
   a.test('rax','rax');a.jcc('s',invalid);a.store(slot(80),'rax');a.mov('r10',0x3ff0000000000000n);a.cmp('rax','r10');a.jcc('b',invalid);
   const notOne=a.unique('notOne');a.jcc('ne',notOne);a.mov('rax',0);a.store(slot(80),'rax');a.jmp(done);a.label(notOne);
  }
  a.mov('r10',0x7ff0000000000000n);a.cmp('rax','r10');a.jcc('ae',special);
  a.mov('r10',0x5f30000000000000n);a.cmp('rax','r10');a.jcc('a',large);
  a.movsd('xmm0',slot(80));a.mov('rax',0x3ff0000000000000n);a.movqToXmm('xmm1','rax');
  if(name==='asinh'){
   a.mulsd('xmm0','xmm0');a.movsd('xmm2','xmm0');a.addsd('xmm0','xmm1');a.sqrtsd('xmm0','xmm0');a.addsd('xmm0','xmm1');a.divsd('xmm2','xmm0');a.addsd('xmm2',slot(80));a.movsd('xmm0','xmm2');
  }else{
   a.movsd('xmm2','xmm0');a.subsd('xmm2','xmm1');a.addsd('xmm0','xmm1');a.mulsd('xmm0','xmm2');a.sqrtsd('xmm0','xmm0');a.addsd('xmm0','xmm2');
  }
  a.call('rt.mathLog1pCore');a.storesd(slot(80),'xmm0');a.jmp(name==='asinh'?special:done);
  a.label(large);a.emit([0xd9,0xed,0xdd,0x44,0x24,80,0xd9,0xf1,0xdd,0x5c,0x24,88]); // ln(abs(x))
  a.movsd('xmm0',slot(88));a.mov('rax',0x3fe62e42fefa39efn);a.movqToXmm('xmm1','rax');a.addsd('xmm0','xmm1');a.storesd(slot(80),'xmm0');
  a.label(special);
  if(name==='asinh'){
   a.load('rax',slot(72));a.mov('r10',0x8000000000000000n);a.and('rax','r10');a.load('r11',slot(80));a.or('rax','r11');a.store(slot(80),'rax');
  }
  a.jmp(done);
  a.label(invalid);a.mov('rax',0x7ff8000000000000n);a.store(slot(80),'rax');
  a.label(done);a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(80));a.store({base:'rcx',disp:8},'rax');
 });
 for(const name of inverseTrigMath)rootedFn(b,'rt.Math.'+name+'.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');const missing=a.unique('missing');a.test('rdx','rdx');a.jcc('e',missing);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(missing);
  a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');
  a.movsd('xmm0',slot(72));a.mulsd('xmm0','xmm0');a.mov('rax',0x3ff0000000000000n);a.movqToXmm('xmm1','rax');a.subsd('xmm1','xmm0');a.sqrtsd('xmm1','xmm1');a.storesd(slot(80),'xmm1');
  if(name==='asin')a.emit([0xdd,0x44,0x24,72,0xdd,0x44,0x24,80]); // x, sqrt(1-x²)
  else a.emit([0xdd,0x44,0x24,80,0xdd,0x44,0x24,72]); // sqrt(1-x²), x
  a.emit([0xd9,0xf3,0xdd,0x5c,0x24,80]); // fpatan; fstp result
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(80));a.store({base:'rcx',disp:8},'rax');
 });
 for(const name of hyperbolicMath)rootedFn(b,'rt.Math.'+name+'.fn.code',136,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');const missing=a.unique('missing');a.test('rdx','rdx');a.jcc('e',missing);
  for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}a.label(missing);
  a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');a.load('rax',slot(72));a.mov('r10',0x7fffffffffffffffn);a.and('rax','r10');a.store(slot(80),'rax');
  const zero=a.unique('zero'),nonfinite=a.unique('nonfinite'),large=a.unique('large'),overflow=a.unique('overflow'),done=a.unique('done'),applySign=a.unique('applySign');
  a.test('rax','rax');a.jcc('e',zero);a.mov('r10',0x7ff0000000000000n);a.cmp('rax','r10');a.jcc('ae',nonfinite);
  a.mov('r10',0x4034000000000000n);a.cmp('rax','r10');a.jcc('a',large);
  a.movsd('xmm0',slot(80));a.call('rt.mathExpm1Core');a.storesd(slot(88),'xmm0');
  a.load('rax',slot(80));a.mov('r10',0x8000000000000000n);a.xor('rax','r10');a.movqToXmm('xmm0','rax');a.call('rt.mathExpm1Core');a.storesd(slot(96),'xmm0');
  a.movsd('xmm0',slot(88));a.movsd('xmm1',slot(96));
  if(name==='sinh')a.subsd('xmm0','xmm1');
  else if(name==='cosh')a.addsd('xmm0','xmm1');
  else{
   a.movsd('xmm2','xmm0');a.subsd('xmm2','xmm1');a.addsd('xmm0','xmm1');a.mov('rax',0x4000000000000000n);a.movqToXmm('xmm1','rax');a.addsd('xmm0','xmm1');a.divsd('xmm2','xmm0');a.movsd('xmm0','xmm2');
  }
  if(name!=='tanh'){a.mov('rax',0x3fe0000000000000n);a.movqToXmm('xmm1','rax');a.mulsd('xmm0','xmm1');if(name==='cosh'){a.mov('rax',0x3ff0000000000000n);a.movqToXmm('xmm1','rax');a.addsd('xmm0','xmm1');}}
  a.storesd(slot(104),'xmm0');a.jmp(name==='cosh'?done:applySign);
  a.label(large);
  if(name==='tanh'){a.mov('rax',0x3ff0000000000000n);a.store(slot(104),'rax');a.jmp(applySign);}
  else{
   a.mov('r10',0x4086380000000000n);a.cmp('rax','r10');a.jcc('ae',overflow);
   a.movsd('xmm0',slot(80));a.mov('rax',0x3fe62e42fefa39efn);a.movqToXmm('xmm1','rax');a.subsd('xmm0','xmm1');a.call('rt.mathExpCore');a.storesd(slot(104),'xmm0');a.jmp(name==='cosh'?done:applySign);
   a.label(overflow);a.mov('rax',0x7ff0000000000000n);a.store(slot(104),'rax');a.jmp(name==='cosh'?done:applySign);
  }
  a.label(nonfinite);a.mov('r10',0x7ff0000000000000n);a.cmp('rax','r10');
  if(name==='tanh'){
   const nan=a.unique('nan');a.jcc('a',nan);a.mov('rax',0x3ff0000000000000n);a.store(slot(104),'rax');a.jmp(applySign);a.label(nan);
  }
  a.store(slot(104),'rax');a.jmp(name==='cosh'?done:applySign);
  a.label(zero);a.mov('rax',name==='cosh'?0x3ff0000000000000n:0);a.store(slot(104),'rax');a.jmp(name==='cosh'?done:applySign);
  a.label(applySign);a.load('rax',slot(72));a.mov('r10',0x8000000000000000n);a.and('rax','r10');a.load('r11',slot(104));a.or('rax','r11');a.store(slot(104),'rax');
  a.label(done);a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(104));a.store({base:'rcx',disp:8},'rax');
 });
 for(const name of integerMath)rootedFn(b,'rt.Math.'+name+'.fn.code',88,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  for(let i=0;i<(name==='imul'?2:1);i++){
   const present=a.unique('present'),ready=a.unique('argumentReady');a.load('rax',slot(48));a.cmp('rax',i+1);a.jcc('ae',present);
   a.lea('rcx',{rip:'rt.undefinedValue'});a.jmp(ready);
   a.label(present);a.load('rcx',slot(56));if(i)a.add('rcx',16);a.label(ready);
   a.call('rt.toInt32');if(i===0&&name==='imul')a.store(slot(64),'rax');
  }
  if(name==='imul'){
   a.load('r10',slot(64));a.imul('rax','r10');a.shl('rax',32);a.sar('rax',32);
  }else{
   a.shl('rax',32);a.shr('rax',32);a.mov('r10','rax');a.mov('rax',32);
   const loop=a.unique('clzLoop'),done=a.unique('clzDone');a.label(loop);a.test('r10','r10');a.jcc('e',done);
   a.sub('rax',1);a.shr('r10',1);a.jmp(loop);a.label(done);
  }
  a.cvtsi2sd('xmm0','rax');a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
}
