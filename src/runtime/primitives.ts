import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn,type RuntimeRoot} from './root-scope.js';
const unaryRoots:RuntimeRoot[]=[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'}];
const binaryRoots:RuntimeRoot[]=[...unaryRoots,{kind:'value',register:'r8'},{kind:'locals',offset:64,count:2}];
import type {Assembler} from '../backend/x64/assembler.js';
import {ObjectLayout as O,ProxyKind,ProxyCallable} from './object-layout.js';
const copy=(a:Assembler)=>{a.load('rax',{base:'rdx'});a.store({base:'rcx'},'rax');a.load('rax',{base:'rdx',disp:8});a.store({base:'rcx',disp:8},'rax');};
const tag=(a:Assembler,n:number)=>{a.mov('rax',n);a.store({base:'rcx'},'rax');};
export function emitPrimitives(b:RuntimeBuilder):void {
 b.fn('rt.isNullish',40,a=>{
  const done=a.unique('done');a.load('r10',{base:'rdx'});a.mov('rax',0);a.cmp('r10',1);a.jcc('a',done);a.mov('rax',1);
  a.label(done);a.store({base:'rcx',disp:8},'rax');tag(a,2);
 });
 b.fn('rt.toBoolean',40,a=>{a.mov('rax',0);a.load('r10',{base:'rcx'});a.cmp('r10',2);a.jcc('b','rt.toBoolean.done');a.load('r11',{base:'rcx',disp:8});a.cmp('r10',4);a.jcc('e','rt.toBoolean.string');a.cmp('r10',7);a.jcc('e','rt.toBoolean.bigint');a.cmp('r10',3);a.jcc('e','rt.toBoolean.number');a.cmp('r10',2);a.jcc('e','rt.toBoolean.boolean');a.mov('rax',1);a.jmp('rt.toBoolean.done');a.label('rt.toBoolean.boolean');a.mov('rax','r11');a.jmp('rt.toBoolean.done');a.label('rt.toBoolean.number');a.movqToXmm('xmm0','r11');a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p','rt.toBoolean.done');a.jcc('e','rt.toBoolean.done');a.mov('rax',1);a.jmp('rt.toBoolean.done');a.label('rt.toBoolean.string');a.load('r11',{base:'r11'});a.test('r11','r11');a.jcc('e','rt.toBoolean.done');a.mov('rax',1);a.jmp('rt.toBoolean.done');a.label('rt.toBoolean.bigint');a.load('r10',{base:'r11'});a.cmp('r10',1);a.jcc('ne','rt.toBoolean.bigintTrue');a.load('r10',{base:'r11',disp:8},16);a.cmp('r10',48);a.jcc('ne','rt.toBoolean.bigintTrue');a.jmp('rt.toBoolean.done');a.label('rt.toBoolean.bigintTrue');a.mov('rax',1);a.label('rt.toBoolean.done');});
 rootedFn(b,'rt.toNumber',88,[...unaryRoots,{kind:'locals',offset:56,count:1}],a=>{a.store(slot(40),'rcx');a.load('r10',{base:'rdx'});a.load('rax',{base:'rdx',disp:8});a.cmp('r10',6);failIf(a,'e','rt.throwTypeError');a.cmp('r10',7);failIf(a,'e','rt.throwTypeError');a.cmp('r10',5);a.jcc('e','rt.toNumber.object');a.cmp('r10',3);a.jcc('e','rt.toNumber.save');a.cmp('r10',4);a.jcc('e','rt.toNumber.string');a.cmp('r10',0);a.jcc('e','rt.toNumber.nan');a.cmp('r10',1);a.jcc('e','rt.toNumber.zero');a.cvtsi2sd('xmm0','rax');a.movqFromXmm('rax','xmm0');a.jmp('rt.toNumber.save');a.label('rt.toNumber.zero');a.mov('rax',0);a.jmp('rt.toNumber.save');a.label('rt.toNumber.nan');a.mov('rax',0x7ff8000000000000n);a.jmp('rt.toNumber.save');a.label('rt.toNumber.string');a.mov('rcx','rax');a.call('rt.parseNumber');a.movqFromXmm('rax','xmm0');a.jmp('rt.toNumber.save');a.label('rt.toNumber.object');a.lea('rcx',slot(56));a.call('rt.objectToPrimitiveNumber');a.load('rcx',slot(40));a.lea('rdx',slot(56));a.call('rt.toNumber');a.jmp('rt.toNumber.done');a.label('rt.toNumber.save');a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');tag(a,3);a.label('rt.toNumber.done');});
 b.fn('rt.pos',40,a=>a.call('rt.toNumber'));
 rootedFn(b,'rt.toNumeric',88,[...unaryRoots,{kind:'locals',offset:56,count:1}],a=>{a.store(slot(40),'rcx');const primitive=a.unique('primitive'),number=a.unique('number'),done=a.unique('done');a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('ne',primitive);a.lea('rcx',slot(56));a.call('rt.objectToPrimitiveNumber');a.lea('rdx',slot(56));a.label(primitive);a.load('rax',{base:'rdx'});a.cmp('rax',7);a.jcc('ne',number);a.load('rcx',slot(40));copy(a);a.jmp(done);a.label(number);a.load('rcx',slot(40));a.call('rt.toNumber');a.label(done);});
 for(const [name,constant] of [['increment','rt.bigint.one'],['decrement','rt.bigint.minusone']] as const)rootedFn(b,'rt.'+name,88,[...unaryRoots,{kind:'locals',offset:56,count:1}],a=>{
  a.store(slot(40),'rcx');a.load('rax',{base:'rdx'});const number=a.unique('number'),done=a.unique('done');a.cmp('rax',7);a.jcc('ne',number);a.mov('rax',7);a.store(slot(56),'rax');a.lea('rax',{rip:constant});a.store(slot(64),'rax');a.lea('r8',slot(56));a.call('rt.bigintAdd');a.jmp(done);a.label(number);a.load('rcx',slot(40));a.call('rt.toNumber');a.load('rcx',slot(40));a.movsd('xmm0',{base:'rcx',disp:8});a.mov('rax',1);a.cvtsi2sd('xmm1','rax');if(name==='increment')a.addsd('xmm0','xmm1');else a.subsd('xmm0','xmm1');a.storesd({base:'rcx',disp:8},'xmm0');a.label(done);
 });
 rootedFn(b,'rt.neg',40,unaryRoots,a=>{a.store(slot(32),'rcx');a.call('rt.toNumeric');a.load('rcx',slot(32));a.load('rax',{base:'rcx'});const number=a.unique('number'),done=a.unique('done');a.cmp('rax',7);a.jcc('ne',number);a.mov('rdx','rcx');a.call('rt.bigintNeg');a.jmp(done);a.label(number);a.load('rax',{base:'rcx',disp:8});a.mov('r10',0x8000000000000000n);a.xor('rax','r10');a.store({base:'rcx',disp:8},'rax');a.label(done);});
 b.fn('rt.not',56,a=>{a.store(slot(40),'rcx');a.mov('rcx','rdx');a.call('rt.toBoolean');a.xor('rax',1);a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');tag(a,2);});
 rootedFn(b,'rt.toString',88,[...unaryRoots,{kind:'locals',offset:56,count:1}],a=>{a.store(slot(40),'rcx');a.load('r10',{base:'rdx'});a.cmp('r10',6);failIf(a,'e','rt.throwTypeError');a.cmp('r10',5);a.jcc('e','rt.toString.object');a.cmp('r10',4);a.jcc('e','rt.toString.copy');a.cmp('r10',7);a.jcc('e','rt.toString.copy');a.cmp('r10',3);a.jcc('e','rt.toString.number');a.cmp('r10',2);a.jcc('e','rt.toString.bool');a.cmp('r10',1);a.jcc('e','rt.toString.null');a.lea('rax',{rip:'rt.str.undefined'});a.jmp('rt.toString.save');a.label('rt.toString.null');a.lea('rax',{rip:'rt.str.null'});a.jmp('rt.toString.save');a.label('rt.toString.bool');a.load('rax',{base:'rdx',disp:8});a.test('rax','rax');a.jcc('e','rt.toString.false');a.lea('rax',{rip:'rt.str.true'});a.jmp('rt.toString.save');a.label('rt.toString.false');a.lea('rax',{rip:'rt.str.false'});a.jmp('rt.toString.save');a.label('rt.toString.number');a.movsd('xmm0',{base:'rdx',disp:8});a.call('rt.formatNumber');a.jmp('rt.toString.save');a.label('rt.toString.copy');a.load('rax',{base:'rdx',disp:8});a.jmp('rt.toString.save');a.label('rt.toString.object');a.lea('rcx',slot(56));a.call('rt.objectToPrimitiveString');a.load('rcx',slot(40));a.lea('rdx',slot(56));a.call('rt.toString');a.jmp('rt.toString.done');a.label('rt.toString.save');a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');tag(a,4);a.label('rt.toString.done');});
 // One key-conversion entry point for all property operations. Symbol support
 // will extend this without changing the frontend or property call sites.
 rootedFn(b,'rt.toPropertyKey',88,[...unaryRoots,{kind:'locals',offset:56,count:1}],a=>{
  a.store(slot(40),'rcx');a.lea('rcx',slot(56));a.call('rt.objectToPrimitiveStringOrCopy');
  a.load('rax',slot(56));const convert=a.unique('convert'),done=a.unique('done');a.cmp('rax',6);a.jcc('ne',convert);
  a.load('rcx',slot(40));a.lea('rdx',slot(56));copy(a);a.jmp(done);
  a.label(convert);a.load('rcx',slot(40));a.lea('rdx',slot(56));a.call('rt.toString');a.label(done);
 });
 b.fn('rt.typeof',40,a=>{a.load('r10',{base:'rdx'});for(const [n,s] of ['undefined','object','boolean','number','string','object','symbol','bigint'].entries()){a.cmp('r10',n);a.jcc('ne','rt.typeof.next'+n);a.lea('rax',{rip:'rt.str.'+s});if(n===5){a.load('r11',{base:'rdx',disp:8});a.load('r10',{base:'r11'});a.cmp('r10',2);a.jcc('e','rt.typeof.function');a.cmp('r10',ProxyKind);a.jcc('ne','rt.typeof.save');a.load('r10',{base:'r11',disp:O.flags});a.and('r10',ProxyCallable);a.test('r10','r10');a.jcc('e','rt.typeof.save');a.label('rt.typeof.function');a.lea('rax',{rip:'rt.str.function'});}a.jmp('rt.typeof.save');a.label('rt.typeof.next'+n);}a.label('rt.typeof.save');a.store({base:'rcx',disp:8},'rax');tag(a,4);});
 for(const op of ['add','sub','mul','div','rem','pow'])rootedFn(b,'rt.'+op,120,binaryRoots,a=>{
  const fastDone=a.unique('fastDone');
  if(op==='rem'){
   // Integral Numbers with a non-negative dividend (not -0) and a non-zero
   // divisor: the remainder is the integer one (its sign is the dividend's).
   const slow=a.unique('slow');
   a.load('rax',{base:'rdx'});a.cmp('rax',3);a.jcc('ne',slow);a.load('rax',{base:'r8'});a.cmp('rax',3);a.jcc('ne',slow);
   a.load('r10',{base:'rdx',disp:8});a.test('r10','r10');a.jcc('s',slow);
   a.movsd('xmm0',{base:'rdx',disp:8});a.cvttsd2si('r10','xmm0');a.cvtsi2sd('xmm1','r10');a.ucomisd('xmm0','xmm1');a.jcc('ne',slow);a.jcc('p',slow);
   a.movsd('xmm0',{base:'r8',disp:8});a.cvttsd2si('r11','xmm0');a.cvtsi2sd('xmm1','r11');a.ucomisd('xmm0','xmm1');a.jcc('ne',slow);a.jcc('p',slow);
   a.test('r11','r11');a.jcc('e',slow);
   a.mov('r9','rcx');a.mov('rax','r10');a.mov('rdx',0);a.idiv('r11');a.cvtsi2sd('xmm0','rdx');
   a.mov('rax',3);a.store({base:'r9'},'rax');a.storesd({base:'r9',disp:8},'xmm0');a.jmp(fastDone);
   a.label(slow);
  }
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  if(op==='add'){
   a.lea('rcx',slot(64));a.call('rt.toPrimitive');a.lea('rcx',slot(80));a.load('rdx',slot(56));a.call('rt.toPrimitive');
   a.lea('rdx',slot(64));a.store(slot(48),'rdx');a.lea('r8',slot(80));a.store(slot(56),'r8');
   a.load('rax',{base:'rdx'});a.cmp('rax',4);a.jcc('e','rt.add.string');a.load('rax',{base:'r8'});a.cmp('rax',4);a.jcc('e','rt.add.string');
  }else{
   a.lea('rcx',slot(64));a.call('rt.toNumeric');a.lea('rcx',slot(80));a.load('rdx',slot(56));a.call('rt.toNumeric');a.lea('rdx',slot(64));a.store(slot(48),'rdx');a.lea('r8',slot(80));a.store(slot(56),'r8');
  }
  const bigDone=a.unique('bigDone');
  if(op==='add'||op==='sub'||op==='mul'||op==='div'||op==='rem'||op==='pow'){
   a.load('rdx',slot(48));a.load('rax',{base:'rdx'});const normal=a.unique('normal');a.cmp('rax',7);a.jcc('ne',normal);
   a.load('r8',slot(56));a.load('rax',{base:'r8'});a.cmp('rax',7);a.jcc('ne',normal);
   if(op==='sub'){a.lea('rcx',slot(80));a.mov('rdx','r8');a.call('rt.bigintNeg');a.lea('r8',slot(80));a.load('rdx',slot(48));}
   a.load('rcx',slot(40));if(op==='div'||op==='rem')a.mov('r9',op==='rem'?1:0);a.call(op==='mul'?'rt.bigintMul':op==='div'||op==='rem'?'rt.bigintDivRem':op==='pow'?'rt.bigintPow':'rt.bigintAdd');a.jmp(op==='add'?'rt.add.done':bigDone);a.label(normal);
  }
  a.lea('rcx',slot(64));a.load('rdx',slot(48));a.call('rt.toNumber');a.lea('rcx',slot(80));a.load('rdx',slot(56));a.call('rt.toNumber');
  a.movsd('xmm0',slot(72));a.movsd('xmm1',slot(88));if(op==='rem')a.call('rt.remainder');else if(op==='pow')a.call('rt.numberPow');else if(op==='add')a.addsd('xmm0','xmm1');else if(op==='sub')a.subsd('xmm0','xmm1');else if(op==='mul')a.mulsd('xmm0','xmm1');else a.divsd('xmm0','xmm1');
  a.load('rcx',slot(40));a.storesd({base:'rcx',disp:8},'xmm0');tag(a,3);
  if(op==='add'){a.jmp('rt.add.done');a.label('rt.add.string');a.lea('rcx',slot(64));a.load('rdx',slot(48));a.call('rt.toString');a.lea('rcx',slot(80));a.load('rdx',slot(56));a.call('rt.toString');a.load('rcx',slot(40));a.lea('rdx',slot(64));a.lea('r8',slot(80));a.call('rt.concatLazy');a.label('rt.add.done');}
  if(op==='sub'||op==='mul'||op==='div'||op==='rem'||op==='pow')a.label(bigDone);
  a.label(fastDone);
 });
 // RCX result, RDX left Value*, R8 right Value*: `left === right` (a
 // Boolean) without a rooted frame. Numbers compare by value (NaN unequal,
 // -0 equal to 0), different tags are unequal, undefined and null equal
 // themselves, booleans compare by truth, objects and symbols by identity,
 // strings of the same record are equal; other strings and BigInts take
 // rt.strictEq.
 b.fn('rt.strictEquals',40,a=>{
  const yes=a.unique('yes'),no=a.unique('no'),store=a.unique('store'),number=a.unique('number'),bool=a.unique('bool'),identity=a.unique('identity'),generic=a.unique('generic'),leftFalse=a.unique('leftFalse'),done=a.unique('done');
  a.load('rax',{base:'rdx'});a.load('r10',{base:'r8'});a.cmp('rax','r10');a.jcc('ne',no);
  a.cmp('rax',3);a.jcc('e',number);a.cmp('rax',1);a.jcc('be',yes);a.cmp('rax',2);a.jcc('e',bool);a.cmp('rax',5);a.jcc('e',identity);a.cmp('rax',6);a.jcc('e',identity);
  a.cmp('rax',4);a.jcc('ne',generic);a.load('rax',{base:'rdx',disp:8});a.load('r10',{base:'r8',disp:8});a.cmp('rax','r10');a.jcc('e',yes);a.jmp(generic);
  a.label(number);a.movsd('xmm0',{base:'rdx',disp:8});a.ucomisd('xmm0',{base:'r8',disp:8});a.jcc('p',no);a.jcc('e',yes);a.jmp(no);
  a.label(identity);a.load('rax',{base:'rdx',disp:8});a.load('r10',{base:'r8',disp:8});a.cmp('rax','r10');a.jcc('e',yes);a.jmp(no);
  a.label(bool);a.load('rax',{base:'rdx',disp:8});a.load('r10',{base:'r8',disp:8});a.test('rax','rax');a.jcc('e',leftFalse);a.test('r10','r10');a.jcc('ne',yes);a.jmp(no);
  a.label(leftFalse);a.test('r10','r10');a.jcc('e',yes);
  a.label(no);a.mov('rax',0);a.jmp(store);
  a.label(yes);a.mov('rax',1);
  a.label(store);a.store({base:'rcx',disp:8},'rax');a.mov('rax',2);a.store({base:'rcx'},'rax');a.jmp(done);
  a.label(generic);a.call('rt.strictEq');
  a.label(done);
 });
 for(const op of ['strictEq','eq','lt','le','gt','ge'])rootedFn(b,'rt.'+op,120,binaryRoots,a=>{
 const p='rt.'+op;const eq=op==='eq'||op==='strictEq';a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');if(!eq){a.lea('rcx',slot(64));a.call('rt.toPrimitive');a.lea('rcx',slot(80));a.load('rdx',slot(56));a.call('rt.toPrimitive');a.lea('rdx',slot(64));a.store(slot(48),'rdx');a.lea('r8',slot(80));a.store(slot(56),'r8');}a.load('r10',{base:'rdx'});a.load('r11',{base:'r8'});
 if(eq){a.cmp('r10','r11');a.jcc('e',p+'.same');if(op==='strictEq')a.jmp(p+'.false');else {a.cmp('r10',1);a.jcc('a',p+'.leftNotNull');a.cmp('r11',1);a.jcc('be',p+'.true');a.jmp(p+'.false');a.label(p+'.leftNotNull');a.cmp('r11',1);a.jcc('be',p+'.false');a.cmp('r10',6);a.jcc('e',p+'.symbolMismatch');a.cmp('r11',6);a.jcc('e',p+'.symbolMismatch');a.jmp(p+'.numeric');a.label(p+'.symbolMismatch');a.cmp('r10',5);a.jcc('e',p+'.numeric');a.cmp('r11',5);a.jcc('e',p+'.numeric');a.jmp(p+'.false');}a.label(p+'.same');a.cmp('r10',1);a.jcc('be',p+'.true');a.cmp('r10',5);a.jcc('e',p+'.identity');a.cmp('r10',6);a.jcc('e',p+'.identity');const notBig=a.unique('notBig');a.cmp('r10',7);a.jcc('ne',notBig);a.load('rcx',{base:'rdx',disp:8});a.load('rdx',{base:'r8',disp:8});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',p+'.true');a.jmp(p+'.false');a.label(notBig);a.cmp('r10',2);a.jcc('ne',p+'.notBool');a.label(p+'.identity');a.load('rax',{base:'rdx',disp:8});a.load('r10',{base:'r8',disp:8});a.cmp('rax','r10');a.jcc('e',p+'.true');a.jmp(p+'.false');a.label(p+'.notBool');}
 a.cmp('r10',4);a.jcc('ne',p+'.numeric');a.cmp('r11',4);a.jcc('ne',p+'.numeric');a.load('rcx',{base:'rdx',disp:8});a.load('rdx',{base:'r8',disp:8});a.call('rt.compareStrings');a.cmp('rax',0);a.jcc(eq?'e':op==='lt'?'l':op==='le'?'le':op==='gt'?'g':'ge',p+'.true');a.jmp(p+'.false');
 a.label(p+'.numeric');
 if(op!=='strictEq'){
  const notBig=a.unique('notBig'),bothBig=a.unique('bothBig'),leftBig=a.unique('leftBig'),compareReady=a.unique('compareReady'),leftNumber=a.unique('leftNumber'),rightNumber=a.unique('rightNumber'),reverse=a.unique('reverse'),leftString=a.unique('leftString'),rightString=a.unique('rightString');
  a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r10',{base:'rdx'});a.load('r11',{base:'r8'});
  a.cmp('r10',7);a.jcc('e',leftBig);a.cmp('r11',7);a.jcc('ne',notBig);a.cmp('r10',4);a.jcc('e',leftString);a.cmp('r10',3);a.jcc('e',leftNumber);a.cmp('r10',2);a.jcc('e',leftNumber);if(!eq){a.cmp('r10',1);a.jcc('be',leftNumber);}a.jmp(notBig);
  a.label(leftString);a.mov('r10','rdx');a.mov('rdx','r8');a.mov('r8','r10');a.call('rt.bigintCompareString');a.jmp(reverse);
  a.label(leftNumber);a.lea('rcx',slot(64));a.call('rt.toNumber');a.load('rdx',slot(56));a.lea('r8',slot(64));a.call('rt.bigintCompareNumber');a.jmp(reverse);
  a.label(reverse);a.cmp('rax',2);a.jcc('e',compareReady);a.neg('rax');a.jmp(compareReady);
  a.label(leftBig);a.cmp('r11',7);a.jcc('e',bothBig);a.cmp('r11',4);a.jcc('e',rightString);a.cmp('r11',3);a.jcc('e',rightNumber);a.cmp('r11',2);a.jcc('e',rightNumber);if(!eq){a.cmp('r11',1);a.jcc('be',rightNumber);}a.jmp(notBig);
  a.label(rightString);a.call('rt.bigintCompareString');a.jmp(compareReady);
  a.label(rightNumber);a.lea('rcx',slot(80));a.mov('rdx','r8');a.call('rt.toNumber');a.load('rdx',slot(48));a.lea('r8',slot(80));a.call('rt.bigintCompareNumber');a.jmp(compareReady);
  a.label(bothBig);a.mov('rcx','rdx');a.mov('rdx','r8');a.call('rt.bigintCompareSigned');
  a.label(compareReady);a.cmp('rax',2);a.jcc('e',p+'.false');a.cmp('rax',0);a.jcc(eq?'e':op==='lt'?'l':op==='le'?'le':op==='gt'?'g':'ge',p+'.true');a.jmp(p+'.false');a.label(notBig);
 }
 if(op==='eq'){const plain=a.unique('plain');a.cmp('r10',5);a.jcc('e',p+'.object');a.cmp('r11',5);a.jcc('ne',plain);a.label(p+'.object');a.lea('rcx',slot(64));a.load('rdx',slot(48));a.call('rt.toPrimitive');a.lea('rcx',slot(80));a.load('rdx',slot(56));a.call('rt.toPrimitive');a.load('rcx',slot(40));a.lea('rdx',slot(64));a.lea('r8',slot(80));a.call('rt.eq');a.jmp(p+'.done');a.label(plain);}a.lea('rcx',slot(64));a.load('rdx',slot(48));a.call('rt.toNumber');a.lea('rcx',slot(80));a.load('rdx',slot(56));a.call('rt.toNumber');a.movsd('xmm0',slot(72));a.ucomisd('xmm0',slot(88));a.jcc('p',p+'.false');a.jcc(eq?'e':op==='lt'?'b':op==='le'?'be':op==='gt'?'a':'ae',p+'.true');a.label(p+'.false');a.mov('rax',0);a.jmp(p+'.save');a.label(p+'.true');a.mov('rax',1);a.label(p+'.save');a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');tag(a,2);a.label(p+'.done');
 });
}
