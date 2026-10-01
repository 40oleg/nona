import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H,ValueListLayout as L} from './heap-layout.js';
import {ObjectLayout as O} from './object-layout.js';
import {PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {ContextLayout,StackBudget} from './context-switch.js';
import {GeneratorStack} from './generator-stack.js';
import {emitNativeFunction} from './function-builtin.js';
import {stringLiteral} from './value.js';
import {HandlerLayout as EH,preservedGp,preservedXmm} from './exception-layout.js';
import {FunctionLayout as F,FunctionKind} from './functions.js';

export const GeneratorKind=9;
export const GeneratorLayout={source:O.size,receiver:O.size+16,arguments:O.size+32,count:O.size+40,state:O.size+48,stack:O.size+56,context:O.size+64,
 resumeValue:O.size+64+ContextLayout.size,yieldValue:O.size+80+ContextLayout.size,resumeMode:O.size+96+ContextLayout.size,returnValue:O.size+104+ContextLayout.size,yieldRaw:O.size+120+ContextLayout.size,size:O.size+128+ContextLayout.size} as const;
export const generatorRoots=['rt.generatorNext.fn','rt.generatorThrow.fn','rt.generatorReturn.fn','rt.generatorSelf.fn'];
export const generatorPropertyRoots=['rt.generatorPrototype.next','rt.generatorPrototype.throw','rt.generatorPrototype.return','rt.generatorPrototype.@@iterator','rt.generatorPrototype.constructor','rt.generatorPrototype.@@toStringTag','rt.generatorFunctionPrototype.prototype',...generatorRoots.flatMap(name=>[name+'.name',name+'.length'])];

export function emitGenerators(b:RuntimeBuilder):void {
 // The fresh prototype object of a generator function inherits the shared
 // generator prototype. Generator methods retain that own prototype too.
 b.fn('rt.initializeGeneratorFunction',56,a=>{
  a.load('rcx',{base:'rcx',disp:8});a.store(slot(40),'rcx');a.lea('rdx',{rip:'rt.str.prototype'});a.call('rt.findOwnProperty');
  a.load('rax',{base:'rax',disp:P.value+8});a.lea('r10',{rip:'rt.generatorPrototype'});a.store({base:'rax',disp:O.prototype},'r10');
  a.mov('r10',0);a.store({base:'rax',disp:O.properties},'r10');
  a.load('rax',slot(40));a.lea('r10',{rip:'rt.generatorFunctionPrototype'});a.store({base:'rax',disp:O.prototype},'r10');
 });
 const prototype=new Uint8Array(O.size);
 b.bundle.fragments.push({name:'rt.generatorPrototype',section:'.data',alignment:8,bytes:prototype,symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.iteratorPrototype',addend:0},
  {offset:O.properties,kind:'va64',target:'rt.generatorPrototype.@@toStringTag',addend:0},
 ]});
 b.bundle.fragments.push(stringLiteral('rt.gen.tag','Generator'));
 const tagProperty=new Uint8Array(P.size);tagProperty[P.value]=4;tagProperty[P.attributes]=A.configurable;
 b.bundle.fragments.push({name:'rt.generatorPrototype.@@toStringTag',section:'.data',alignment:8,bytes:tagProperty,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:'rt.generatorPrototype.constructor',addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.gen.tag',addend:0},
 ]});
 const constructorProperty=new Uint8Array(P.size);constructorProperty[P.value]=5;constructorProperty[P.attributes]=A.configurable;
 b.bundle.fragments.push({name:'rt.generatorPrototype.constructor',section:'.data',alignment:8,bytes:constructorProperty,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:'rt.generatorPrototype.return',addend:0},
  {offset:P.key,kind:'va64',target:'rt.str.constructor',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.generatorFunctionPrototype',addend:0},
 ]});
 // %GeneratorFunction.prototype% is an ordinary object, not a function.
 const functionPrototype=new Uint8Array(O.size);
 b.bundle.fragments.push({name:'rt.generatorFunctionPrototype',section:'.data',alignment:8,bytes:functionPrototype,symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.functionPrototype',addend:0},
  {offset:O.properties,kind:'va64',target:'rt.generatorFunctionPrototype.prototype',addend:0},
 ]});
 const generatorPrototypeProperty=new Uint8Array(P.size);generatorPrototypeProperty[P.value]=5;generatorPrototypeProperty[P.attributes]=A.configurable;
 b.bundle.fragments.push({name:'rt.generatorFunctionPrototype.prototype',section:'.data',alignment:8,bytes:generatorPrototypeProperty,symbols:{},fixups:[
  {offset:P.key,kind:'va64',target:'rt.str.prototype',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.generatorPrototype',addend:0},
 ]});
 emitNativeFunction(b,'rt.generatorNext.fn','next',1);
 emitNativeFunction(b,'rt.generatorThrow.fn','throw',1);
 emitNativeFunction(b,'rt.generatorReturn.fn','return',1);
 emitNativeFunction(b,'rt.generatorSelf.fn','[Symbol.iterator]',0);
 const returnProperty=new Uint8Array(P.size);returnProperty[P.value]=5;returnProperty[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push({name:'rt.generatorPrototype.return',section:'.data',alignment:8,bytes:returnProperty,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:'rt.generatorPrototype.throw',addend:0},
  {offset:P.key,kind:'va64',target:'rt.iter.return',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.generatorReturn.fn',addend:0},
 ]});
 b.bundle.fragments.push(stringLiteral('rt.gen.throw','throw'));
 b.bundle.fragments.push(stringLiteral('rt.gen.await','await'));
 const throwProperty=new Uint8Array(P.size);throwProperty[P.value]=5;throwProperty[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push({name:'rt.generatorPrototype.throw',section:'.data',alignment:8,bytes:throwProperty,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:'rt.generatorPrototype.@@iterator',addend:0},
  {offset:P.key,kind:'va64',target:'rt.gen.throw',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.generatorThrow.fn',addend:0},
 ]});
 const iteratorProperty=new Uint8Array(P.size);iteratorProperty[P.value]=5;iteratorProperty[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push({name:'rt.generatorPrototype.@@iterator',section:'.data',alignment:8,bytes:iteratorProperty,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:'rt.generatorPrototype.next',addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.iterator.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.generatorSelf.fn',addend:0},
 ]});
 const nextProperty=new Uint8Array(P.size);nextProperty[P.value]=5;nextProperty[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push({name:'rt.generatorPrototype.next',section:'.data',alignment:8,bytes:nextProperty,symbols:{},fixups:[
  {offset:P.key,kind:'va64',target:'rt.iter.next',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.generatorNext.fn',addend:0},
 ]});
 b.fn('rt.generatorSelf.fn.code',56,a=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(96));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',GeneratorKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rcx',slot(40));a.mov('rax',5);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'r10');
 });
 // RCX output, RDX source function Value*, R8 argc, R9 argv; the receiver
 // Value* is the fifth Win64 argument. Copy arguments into managed storage
 // before publishing the generator, since the caller frame may later suspend.
 for(const coroutine of [false,true])rootedFn(b,coroutine?'rt.newAsyncCoroutine':'rt.newGenerator',184,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'range',register:'r9',count:'r8'},{kind:'locals',offset:64,count:3},{kind:'locals',offset:120,count:1},{kind:'locals',offset:136,count:2}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(112),'r9');
  for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(64+offset),'rax');}
  a.load('r10',slot(frame+40));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store(slot(80+offset),'rax');}
  a.lea('rcx',slot(96));a.load('rdx',slot(56));a.call('rt.newValueList');
  a.load('r8',slot(56));a.load('r9',slot(112));a.load('r10',slot(104));a.add('r10',L.values);
  const loop=a.unique('copyArgs'),done=a.unique('argsDone');a.label(loop);a.test('r8','r8');a.jcc('e',done);
  for(const offset of [0,8]){a.load('rax',{base:'r9',disp:offset});a.store({base:'r10',disp:offset},'rax');}
  a.add('r9',16);a.add('r10',16);a.sub('r8',1);a.jmp(loop);a.label(done);
  a.mov('rcx',GeneratorLayout.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',0);for(let offset=0;offset<GeneratorLayout.size;offset+=8)a.store({base:'rax',disp:offset},'r10');
  a.mov('r10',GeneratorKind);a.store({base:'rax',disp:O.kind},'r10');
  a.lea('r10',{rip:'rt.generatorPrototype'});a.store({base:'rax',disp:O.prototype},'r10');
  for(const [dest,source] of [[GeneratorLayout.source,64],[GeneratorLayout.receiver,80]] as const)
   for(const offset of [0,8]){a.load('r10',slot(source+offset));a.store({base:'rax',disp:dest+offset},'r10');}
  a.load('r10',slot(104));a.store({base:'rax',disp:GeneratorLayout.arguments},'r10');
  a.load('r10',slot(56));a.store({base:'rax',disp:GeneratorLayout.count},'r10');
  a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',5);a.store({base:'rcx'},'rax');
  // An async function body starts on the driver's first resume, so parameter
  // errors reject its promise; its internal coroutine keeps the default prototype.
  if(coroutine)return;
  // Run parameter binding and declaration instantiation at call time. The
  // compiled body pauses immediately afterward, before its first statement.
  a.mov('rax',0);a.store(slot(32),'rax');a.lea('rcx',slot(136));a.load('rdx',slot(40));a.lea('r8',{rip:'rt.undefinedValue'});a.lea('r9',slot(168));a.call('rt.resumeGenerator');
  a.lea('rcx',slot(120));a.lea('rdx',slot(64));a.lea('r8',{rip:'rt.key.prototype'});a.call('rt.getProperty');
  const defaultPrototype=a.unique('defaultPrototype'),prototypeReady=a.unique('prototypeReady');
  a.load('r10',slot(120));a.cmp('r10',5);a.jcc('ne',defaultPrototype);
  a.load('r10',slot(128));a.jmp(prototypeReady);
  a.label(defaultPrototype);a.lea('r10',{rip:'rt.generatorPrototype'});a.label(prototypeReady);
  a.load('r11',slot(40));a.load('r11',{base:'r11',disp:8});a.store({base:'r11',disp:O.prototype},'r10');
 });
 // Entered by the first context switch, with a synthetic return address on
 // the generator stack. The compiled body keeps its normal source-function ABI.
 b.fn('rt.generatorStart',376,a=>{
  const handler=80,failed=a.unique('failed'),finish=a.unique('finish');
  a.load('r11',{rip:'rt.currentGenerator'});
  a.load('rax',{rip:'rt.exceptionHandler'});a.store(slot(handler+EH.next),'rax');
  a.mov('rax','rsp');a.store(slot(handler+EH.stack),'rax');
  a.lea('rax',{rip:failed});a.store(slot(handler+EH.target),'rax');
  a.load('rax',{rip:'rt.gcRoots'});a.store(slot(handler+EH.roots),'rax');
  a.lea('rax',{base:'r11',disp:GeneratorLayout.yieldValue});a.store(slot(handler+EH.value),'rax');
  a.load('rax',{rip:'rt.cleanupHead'});a.store(slot(handler+EH.cleanup),'rax');
  preservedGp.forEach((reg,i)=>a.store(slot(handler+EH.gp+8*i),reg));
  preservedXmm.forEach((reg,i)=>a.storeXmm128(slot(handler+EH.xmm+16*i),reg));
  a.mov('rax',2);a.store(slot(handler+EH.kind),'rax');
  a.lea('rax',slot(handler));a.store({rip:'rt.exceptionHandler'},'rax');
  a.lea('rcx',{base:'r11',disp:GeneratorLayout.yieldValue});
  a.load('rdx',{base:'r11',disp:GeneratorLayout.count});
  a.load('r8',{base:'r11',disp:GeneratorLayout.arguments});a.add('r8',L.values);
  a.load('r9',{base:'r11',disp:GeneratorLayout.source+8});
  a.load('r10',{base:'r9',disp:O.size});
  a.lea('rax',{base:'r11',disp:GeneratorLayout.receiver});a.store(slot(32),'rax');
  a.lea('rax',{rip:'rt.undefinedValue'});a.store(slot(40),'rax');
  a.callRegister('r10');
  a.load('rax',slot(handler+EH.next));a.store({rip:'rt.exceptionHandler'},'rax');
  a.load('r11',{rip:'rt.currentGenerator'});a.mov('rax',3);a.store({base:'r11',disp:GeneratorLayout.state},'rax');
  a.jmp(finish);
  a.label(failed);a.load('r11',{rip:'rt.currentGenerator'});a.load('rax',{base:'r11',disp:GeneratorLayout.yieldValue});
  const ordinaryFailure=a.unique('ordinaryFailure');a.cmp('rax',254);a.jcc('ne',ordinaryFailure);a.mov('rax',5);a.jmp(ordinaryFailure+'.ready');
  a.label(ordinaryFailure);a.mov('rax',4);a.label(ordinaryFailure+'.ready');a.store({base:'r11',disp:GeneratorLayout.state},'rax');
  a.label(finish);
  a.lea('rcx',{base:'r11',disp:GeneratorLayout.context});
  a.load('rdx',{base:'rcx',disp:ContextLayout.parent});a.call('rt.switchContext');
  a.call('rt.fail');
 });
 b.fn('rt.generatorInitialSuspend',56,a=>{
  a.load('r11',{rip:'rt.currentGenerator'});a.mov('rax',6);a.store({base:'r11',disp:GeneratorLayout.state},'rax');
  a.lea('rcx',{base:'r11',disp:GeneratorLayout.context});a.load('rdx',{base:'rcx',disp:ContextLayout.parent});a.call('rt.switchContext');
 });
 // RCX output Value*, RDX generator Value*, R8 sent Value*, R9 done flag*,
 // fifth argument: resume mode (0 next, 1 throw, 2 return).
 rootedFn(b,'rt.resumeGenerator',424,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:64,count:2}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(400),'r9');a.load('rax',slot(frame+40));a.store(slot(408),'rax');
  a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r11',{base:'rdx',disp:8});a.load('rax',{base:'r11',disp:O.kind});a.cmp('rax',GeneratorKind);failIf(a,'ne','rt.throwTypeError');
  const completed=a.unique('completed'),start=a.unique('start'),ready=a.unique('ready'),finish=a.unique('finish'),unstarted=a.unique('unstarted'),resume=a.unique('resume');
  a.load('rax',{base:'r11',disp:GeneratorLayout.state});a.cmp('rax',3);a.jcc('e',completed);
  a.cmp('rax',6);a.jcc('e',unstarted);
  a.cmp('rax',1);failIf(a,'e','rt.throwTypeError');a.test('rax','rax');a.jcc('e',start);
  a.jmp(resume);
  a.label(unstarted);a.load('rax',slot(408));a.test('rax','rax');a.jcc('e',resume);
  a.load('rcx',{base:'r11',disp:GeneratorLayout.stack});a.call('rt.freeGeneratorStack');
  a.load('r11',slot(48));a.load('r11',{base:'r11',disp:8});a.mov('rax',0);
  for(const offset of [GeneratorLayout.stack,GeneratorLayout.context+ContextLayout.stack,GeneratorLayout.context+ContextLayout.roots,GeneratorLayout.context+ContextLayout.parent])a.store({base:'r11',disp:offset},'rax');
  a.mov('rax',3);a.store({base:'r11',disp:GeneratorLayout.state},'rax');a.jmp(completed);
  a.label(resume);
  // A value sent to suspended yield becomes that expression's result.
  a.load('r10',slot(56));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store({base:'r11',disp:GeneratorLayout.resumeValue+offset},'rax');}
  a.load('rax',slot(408));a.cmp('rax',2);const noReturn=a.unique('noReturn');a.jcc('ne',noReturn);
  a.load('r10',slot(56));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store({base:'r11',disp:GeneratorLayout.returnValue+offset},'rax');}
  a.label(noReturn);
  a.load('rax',slot(408));a.store({base:'r11',disp:GeneratorLayout.resumeMode},'rax');
  a.jmp(ready);
  a.label(start);a.load('rax',slot(408));a.cmp('rax',2);const startReturn=a.unique('startReturn');a.jcc('e',startReturn);
  a.test('rax','rax');const startNext=a.unique('startNext');a.jcc('e',startNext);
  a.mov('rax',3);a.store({base:'r11',disp:GeneratorLayout.state},'rax');a.load('rcx',slot(56));a.call('rt.throw');
  a.label(startReturn);a.mov('rax',3);a.store({base:'r11',disp:GeneratorLayout.state},'rax');a.jmp(completed);
  a.label(startNext);a.call('rt.allocGeneratorStack');a.test('rax','rax');failIf(a,'e');
  a.load('r11',slot(48));a.load('r11',{base:'r11',disp:8});a.store({base:'r11',disp:GeneratorLayout.stack},'rax');
  a.lea('r10',{base:'rax',disp:GeneratorStack.bytes-56});a.lea('rax',{rip:'rt.generatorStart'});a.store({base:'r10',disp:40},'rax');
  a.store({base:'r11',disp:GeneratorLayout.context+ContextLayout.stack},'r10');
  a.load('r10',{base:'r11',disp:GeneratorLayout.stack});a.add('r10',GeneratorStack.guard+StackBudget.generatorMargin);a.store({base:'r11',disp:GeneratorLayout.context+ContextLayout.stackLimit},'r10');
  a.label(ready);a.load('r11',slot(48));a.load('r11',{base:'r11',disp:8});
  a.lea('rax',slot(112));a.store({base:'r11',disp:GeneratorLayout.context+ContextLayout.parent},'rax');
  a.store({base:'r11',disp:GeneratorLayout.context+ContextLayout.generator},'r11');
  a.mov('rax',1);a.store({base:'r11',disp:GeneratorLayout.state},'rax');
  a.lea('rcx',slot(112));a.lea('rdx',{base:'r11',disp:GeneratorLayout.context});a.call('rt.switchContext');
  a.load('r11',slot(48));a.load('r11',{base:'r11',disp:8});
  a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',{base:'r11',disp:GeneratorLayout.yieldValue+offset});a.store({base:'rcx',disp:offset},'rax');}
  const yielded=a.unique('yielded'),failed=a.unique('failed'),returned=a.unique('returned');a.load('rax',{base:'r11',disp:GeneratorLayout.state});a.cmp('rax',4);a.jcc('e',failed);a.cmp('rax',5);a.jcc('e',returned);a.cmp('rax',3);a.jcc('ne',yielded);
  a.load('rcx',{base:'r11',disp:GeneratorLayout.stack});a.call('rt.freeGeneratorStack');
  a.load('r11',slot(48));a.load('r11',{base:'r11',disp:8});a.mov('rax',0);
  for(const offset of [GeneratorLayout.stack,GeneratorLayout.context+ContextLayout.stack,GeneratorLayout.context+ContextLayout.roots,GeneratorLayout.context+ContextLayout.parent])a.store({base:'r11',disp:offset},'rax');
  a.mov('rax',1);a.jmp(finish);a.label(yielded);a.mov('rax',0);
  a.jmp(finish);a.label(failed);
  a.load('rcx',{base:'r11',disp:GeneratorLayout.stack});a.call('rt.freeGeneratorStack');
  a.load('r11',slot(48));a.load('r11',{base:'r11',disp:8});a.mov('rax',0);
  for(const offset of [GeneratorLayout.stack,GeneratorLayout.context+ContextLayout.stack,GeneratorLayout.context+ContextLayout.roots,GeneratorLayout.context+ContextLayout.parent])a.store({base:'r11',disp:offset},'rax');
  a.mov('rax',3);a.store({base:'r11',disp:GeneratorLayout.state},'rax');
  a.load('rcx',slot(40));a.call('rt.throw');
  a.label(returned);
  a.load('rcx',{base:'r11',disp:GeneratorLayout.stack});a.call('rt.freeGeneratorStack');
  a.load('r11',slot(48));a.load('r11',{base:'r11',disp:8});a.mov('rax',0);
  for(const offset of [GeneratorLayout.stack,GeneratorLayout.context+ContextLayout.stack,GeneratorLayout.context+ContextLayout.roots,GeneratorLayout.context+ContextLayout.parent])a.store({base:'r11',disp:offset},'rax');
  a.mov('rax',3);a.store({base:'r11',disp:GeneratorLayout.state},'rax');
  a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',{base:'r11',disp:GeneratorLayout.returnValue+offset});a.store({base:'rcx',disp:offset},'rax');}
  a.mov('rax',1);a.jmp(finish);
  a.label(finish);a.load('r10',slot(400));a.store({base:'r10'},'rax');a.jmp(finish+'.end');
  a.label(completed);a.load('rax',slot(408));a.cmp('rax',2);const completedReturn=a.unique('completedReturn');a.jcc('e',completedReturn);
  a.test('rax','rax');const completedNext=a.unique('completedNext');a.jcc('e',completedNext);
  a.load('rcx',slot(56));a.call('rt.throw');a.label(completedNext);
  a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
  a.jmp(completedReturn+'.done');a.label(completedReturn);
  a.load('r10',slot(56));a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store({base:'rcx',disp:offset},'rax');}
  a.label(completedReturn+'.done');a.load('r10',slot(400));a.mov('rax',1);a.store({base:'r10'},'rax');a.label(finish+'.end');
 });
 // RCX destination of yield expression, RDX yielded Value*.
 b.fn('rt.generatorYield',72,a=>{
  a.store(slot(40),'rcx');a.load('r11',{rip:'rt.currentGenerator'});
  a.mov('rax',0);a.store({base:'r11',disp:GeneratorLayout.yieldRaw},'rax');
  for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store({base:'r11',disp:GeneratorLayout.yieldValue+offset},'rax');}
  a.mov('rax',2);a.store({base:'r11',disp:GeneratorLayout.state},'rax');
  a.lea('rcx',{base:'r11',disp:GeneratorLayout.context});a.load('rdx',{base:'rcx',disp:ContextLayout.parent});a.call('rt.switchContext');
  a.load('r11',{rip:'rt.currentGenerator'});a.load('rcx',slot(40));
  a.load('rax',{base:'r11',disp:GeneratorLayout.resumeMode});a.test('rax','rax');const normal=a.unique('normal');a.jcc('e',normal);
  const injectReturn=a.unique('injectReturn');a.cmp('rax',2);a.jcc('e',injectReturn);
  a.mov('rax',0);a.store({base:'r11',disp:GeneratorLayout.resumeMode},'rax');a.lea('rcx',{base:'r11',disp:GeneratorLayout.resumeValue});a.call('rt.throw');
  a.label(injectReturn);a.mov('rax',0);a.store({base:'r11',disp:GeneratorLayout.resumeMode},'rax');
  a.mov('rax',254);a.store(slot(48),'rax');a.mov('rax',0);a.store(slot(56),'rax');a.lea('rcx',slot(48));a.call('rt.throw');
  a.label(normal);
  for(const offset of [0,8]){a.load('rax',{base:'r11',disp:GeneratorLayout.resumeValue+offset});a.store({base:'rcx',disp:offset},'rax');}
 });
 // Await suspends like yield; yieldRaw 2 lets the async driver distinguish it.
 b.fn('rt.generatorAwait',72,a=>{
  a.store(slot(40),'rcx');a.load('r11',{rip:'rt.currentGenerator'});
  a.mov('rax',2);a.store({base:'r11',disp:GeneratorLayout.yieldRaw},'rax');
  for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store({base:'r11',disp:GeneratorLayout.yieldValue+offset},'rax');}
  a.mov('rax',2);a.store({base:'r11',disp:GeneratorLayout.state},'rax');
  a.lea('rcx',{base:'r11',disp:GeneratorLayout.context});a.load('rdx',{base:'rcx',disp:ContextLayout.parent});a.call('rt.switchContext');
  a.load('r11',{rip:'rt.currentGenerator'});a.load('rcx',slot(40));
  a.load('rax',{base:'r11',disp:GeneratorLayout.resumeMode});a.test('rax','rax');const normal=a.unique('normal');a.jcc('e',normal);
  a.mov('rax',0);a.store({base:'r11',disp:GeneratorLayout.resumeMode},'rax');a.lea('rcx',{base:'r11',disp:GeneratorLayout.resumeValue});a.call('rt.throw');
  a.label(normal);
  for(const offset of [0,8]){a.load('rax',{base:'r11',disp:GeneratorLayout.resumeValue+offset});a.store({base:'rcx',disp:offset},'rax');}
 });
 // A delegated yield returns the caller's resume mode to the compiled loop.
 // That loop forwards throw/return to the inner iterator before it resumes.
 // The Value variant (async generator yield*) yields an ordinary value that
 // the driver wraps, but still reports the resumption mode to compiled code.
 for(const raw of [true,false])b.fn(raw?'rt.generatorYieldDelegated':'rt.generatorYieldDelegatedValue',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'r8');a.load('r11',{rip:'rt.currentGenerator'});
  a.mov('rax',raw?1:0);a.store({base:'r11',disp:GeneratorLayout.yieldRaw},'rax');
  for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store({base:'r11',disp:GeneratorLayout.yieldValue+offset},'rax');}
  a.mov('rax',2);a.store({base:'r11',disp:GeneratorLayout.state},'rax');
  a.lea('rcx',{base:'r11',disp:GeneratorLayout.context});a.load('rdx',{base:'rcx',disp:ContextLayout.parent});a.call('rt.switchContext');
  a.load('r11',{rip:'rt.currentGenerator'});a.load('r10',slot(48));
  a.mov('rax',3);a.store({base:'r10'},'rax');
  a.load('rax',{base:'r11',disp:GeneratorLayout.resumeMode});a.cvtsi2sd('xmm0','rax');a.storesd({base:'r10',disp:8},'xmm0');
  a.mov('rax',0);a.store({base:'r11',disp:GeneratorLayout.resumeMode},'rax');
  a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',{base:'r11',disp:GeneratorLayout.resumeValue+offset});a.store({base:'rcx',disp:offset},'rax');}
 });
 for(const [method,mode] of [['Next',0],['Throw',1],['Return',2]] as const)rootedFn(b,`rt.generator${method}.fn.code`,168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:6}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('r10',slot(frame+40));
  for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store(slot(64+offset),'rax');}
  const noArgument=a.unique('noArgument'),argumentReady=a.unique('argumentReady');a.test('rdx','rdx');a.jcc('e',noArgument);
  for(const offset of [0,8]){a.load('rax',{base:'r8',disp:offset});a.store(slot(80+offset),'rax');}a.jmp(argumentReady);
  a.label(noArgument);a.mov('rax',0);a.store(slot(80),'rax');a.store(slot(88),'rax');a.label(argumentReady);
  a.mov('rax',0);a.store(slot(160),'rax');
  a.mov('rax',mode);a.store(slot(32),'rax');a.lea('rcx',slot(96));a.lea('rdx',slot(64));a.lea('r8',slot(80));a.lea('r9',slot(120));a.call('rt.resumeGenerator');
  const wrapped=a.unique('wrapped');a.load('rax',slot(120));a.test('rax','rax');a.jcc('ne',wrapped);
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:GeneratorLayout.yieldRaw});a.test('rax','rax');a.jcc('e',wrapped);
  // Internal async coroutines report awaits as {value, done:false, await:true}.
  a.cmp('rax',2);const rawResult=a.unique('rawResult');a.jcc('ne',rawResult);a.mov('rax',1);a.store(slot(160),'rax');a.jmp(wrapped);a.label(rawResult);
  a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',slot(96+offset));a.store({base:'rcx',disp:offset},'rax');}
  const methodDone=a.unique('methodDone');a.jmp(methodDone);a.label(wrapped);
  a.mov('rax',2);a.store(slot(112),'rax');
  a.lea('rcx',slot(128));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
  a.mov('rax',4);a.store(slot(144),'rax');a.lea('rax',{rip:'rt.iter.value'});a.store(slot(152),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(144));a.lea('r8',slot(96));a.mov('r9',A.writable|A.enumerable|A.configurable);a.call('rt.setProperty');
  a.lea('rax',{rip:'rt.iter.done'});a.store(slot(152),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(144));a.lea('r8',slot(112));a.mov('r9',A.writable|A.enumerable|A.configurable);a.call('rt.setProperty');
  const notAwait=a.unique('notAwait');a.load('rax',slot(160));a.test('rax','rax');a.jcc('e',notAwait);
  a.lea('rax',{rip:'rt.gen.await'});a.store(slot(152),'rax');a.mov('rax',2);a.store(slot(112),'rax');a.mov('rax',1);a.store(slot(120),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(144));a.lea('r8',slot(112));a.mov('r9',A.writable|A.enumerable|A.configurable);a.call('rt.setProperty');
  a.label(notAwait);
  a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',slot(128+offset));a.store({base:'rcx',disp:offset},'rax');}
  a.label(methodDone);
 });
}
