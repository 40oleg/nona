import {rootedFn} from './root-scope.js';
import {defaultConstructorCapacity} from './shapes.js';
import {bumpEpochIfPrototype} from './property-cache.js';
import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O,ObjectFlags as OF,PropertyLayout as P,PropertyAttributes as A,ProxyKind,ProxyCallable,ProxyConstructable} from './object-layout.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';
import {stringLiteral} from './value.js';
import {BoundDataLayout as B} from './bound-layout.js';
import {TailCallTag} from './tail-calls.js';
import {RealmFlagShift,realmTable} from './constructor-prototype.js';

/** Inline property nodes of a constructor's first instances. */
export const FunctionLayout={code:O.size,environment:O.size+8,constructable:O.size+16,rawThis:O.size+24,bound:O.size+32,sourceText:O.size+40,constructCode:O.size+48,homeObject:O.size+56,arrow:O.size+64,lexicalThis:O.size+72,lexicalNewTarget:O.size+88,generator:O.size+104,realm:O.size+112,/** The root shape this constructor's next instances start from (shapes.ts), or 0 before the first. */instanceShape:O.size+120,size:O.size+128} as const;
export const FunctionKind=2;

export function emitFunctions(b:RuntimeBuilder):void {
 b.bundle.fragments.push(stringLiteral('rt.str.function','function'));
 b.bundle.fragments.push(stringLiteral('rt.str.nativeFunction','function () { [native code] }'));
 for(const name of ['prototype','constructor','name','length']){
  if(name!=='length')b.bundle.fragments.push(stringLiteral('rt.str.'+name,name));
  const key=new Uint8Array(16);key[0]=4;
  b.bundle.fragments.push({name:'rt.key.'+name,section:'.rdata',alignment:8,bytes:key,symbols:{},
   fixups:[{offset:8,kind:'va64',target:'rt.str.'+name,addend:0}]});
 }
 const prototype=new Uint8Array(FunctionLayout.size);prototype[O.kind]=FunctionKind;
 b.bundle.fragments.push({name:'rt.functionPrototype',section:'.data',alignment:8,bytes:prototype,symbols:{},fixups:[
  {offset:O.properties,kind:'va64',target:'rt.functionPrototype.toString',addend:0},
  {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
  {offset:FunctionLayout.code,kind:'va64',target:'rt.emptyFunction',addend:0},
  {offset:FunctionLayout.sourceText,kind:'va64',target:'rt.str.nativeFunction',addend:0},
 ]});
 for(const name of ['name','length']){
  const property=new Uint8Array(P.size);property[P.value]=name==='name'?4:3;property[P.attributes]=A.configurable;
  const fixups:{offset:number;kind:'va64';target:string;addend:number}[]=[{offset:P.key,kind:'va64',target:'rt.str.'+name,addend:0}];
  if(name==='name')fixups.push({offset:P.next,kind:'va64',target:'rt.functionPrototype.length',addend:0},{offset:P.value+8,kind:'va64',target:'rt.str.empty',addend:0});
  b.bundle.fragments.push({name:'rt.functionPrototype.'+name,section:'.data',alignment:8,bytes:property,symbols:{},fixups});
 }
 b.fn('rt.emptyFunction',40,a=>{a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');});
 // Install fresh own data properties on function/prototype objects. Public
 // Public defineProperty requires the later descriptors stage.
 b.fn('rt.initFunctionProperty',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.load('rcx',{base:'rcx',disp:8});bumpEpochIfPrototype(a,'rcx');a.load('rdx',{base:'rdx',disp:8});a.call('rt.findOwnProperty');
  const create=a.unique('create');a.test('rax','rax');a.jcc('e',create);
  a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.configurable);a.test('r10','r10');a.jcc('e',create);
  a.load('r10',slot(56));for(const offset of [0,8]){a.load('r11',{base:'r10',disp:offset});a.store({base:'rax',disp:P.value+offset},'r11');}
  a.load('r10',slot(64));a.store({base:'rax',disp:P.attributes},'r10');a.mov('r10',0);
  for(const offset of [P.getter,P.getter+8,P.setter,P.setter+8])a.store({base:'rax',disp:offset},'r10');
  const done=a.unique('done');a.jmp(done);a.label(create);
  a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));
  a.mov('r9',1);a.call('rt.setProperty');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:8});
  a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:8});a.call('rt.findOwnProperty');
  a.load('r10',slot(64));a.store({base:'rax',disp:P.attributes},'r10');
  a.label(done);
 });
 // RCX fresh function Value*, RDX name descriptor, R8 simple parameter count.
 // The function was just created, so `length` and `name` cannot exist yet:
 // their property nodes are built and linked directly rather than through
 // the generic [[Set]] (a prototype-chain walk, a key conversion and a
 // second lookup each). Key order stays length, name, prototype: the
 // prototype node, when there is one, is kept at the head of the list.
 b.fn('rt.initFunctionMetadata',88,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  const node=(key:string)=>{
   a.mov('rcx',P.size);a.call('rt.alloc');a.mov('r10',HeapKind.property);a.store({base:'rax',disp:H.kind-H.size},'r10');
   a.lea('r10',{rip:key});a.store({base:'rax',disp:P.key},'r10');a.mov('r10',A.configurable);a.store({base:'rax',disp:P.attributes},'r10');
  };
  node('rt.str.length');a.mov('r10',3);a.store({base:'rax',disp:P.value},'r10');a.load('r10',slot(56));a.cvtsi2sd('xmm0','r10');a.storesd({base:'rax',disp:P.value+8},'xmm0');a.store(slot(64),'rax');
  node('rt.str.name');a.mov('r10',4);a.store({base:'rax',disp:P.value},'r10');a.load('r10',slot(48));a.store({base:'rax',disp:P.value+8},'r10');
  a.load('r10',slot(64));a.store({base:'rax',disp:P.next},'r10');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:8});a.load('r11',{base:'rcx',disp:O.properties});
  const behind=a.unique('behindPrototype'),done=a.unique('done');a.test('r11','r11');a.jcc('ne',behind);
  a.store({base:'rcx',disp:O.properties},'rax');a.jmp(done);
  a.label(behind);a.load('r9',{base:'r11',disp:P.next});a.store({base:'r10',disp:P.next},'r9');a.store({base:'r11',disp:P.next},'rax');
  a.label(done);
 });
 // Concise methods, accessors, arrows and async functions have no own
 // prototype and cannot construct: they get the bare function object rather
 // than a prototype object and two property nodes that are dropped at once.
 b.fn('rt.newMethod',56,a=>{
  a.store(slot(40),'rcx');a.call('rt.newFunctionBare');a.load('rax',slot(40));a.load('rax',{base:'rax',disp:8});a.mov('r10',0);
  a.store({base:'rax',disp:FunctionLayout.constructable},'r10');
 });
 // RCX result, RDX code, R8 capture count, R9 array of internal Cell Values:
 // an ordinary function with its own `prototype` object.
 b.fn('rt.newFunction',56,a=>{
  a.store(slot(40),'rcx');a.call('rt.newFunctionBare');a.load('rcx',slot(40));a.call('rt.installFunctionPrototype');
 });
 // RCX a fresh function Value*: its own `prototype` object, whose `constructor` is the function.
 b.fn('rt.installFunctionPrototype',72,a=>{
  a.store(slot(40),'rcx');
  a.lea('rcx',slot(48));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
  a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.key.prototype'});a.lea('r8',slot(48));a.mov('r9',A.writable);a.call('rt.initFunctionProperty');
  a.lea('rcx',slot(48));a.lea('rdx',{rip:'rt.key.constructor'});a.load('r8',slot(40));a.mov('r9',A.writable|A.configurable);a.call('rt.initFunctionProperty');
 });
 // The same without the prototype object.
 b.fn('rt.newFunctionBare',56,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  a.mov('rcx','r8');a.mov('rdx','r9');a.call('rt.newEnvironment');
  a.load('rcx',slot(40));a.load('rdx',slot(48));a.mov('r8','rax');a.call('rt.newFunctionWithEnvironment');
 });
 // RCX result, RDX code, R8 a raw environment (or 0): the function object itself.
 b.fn('rt.newFunctionWithEnvironment',104,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(72),'r8');
  a.mov('rcx',FunctionLayout.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',FunctionKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.shape,O.flags,FunctionLayout.rawThis,FunctionLayout.bound,FunctionLayout.constructCode,FunctionLayout.homeObject,FunctionLayout.arrow,FunctionLayout.lexicalThis,FunctionLayout.lexicalThis+8,FunctionLayout.lexicalNewTarget,FunctionLayout.lexicalNewTarget+8,FunctionLayout.generator])a.store({base:'rax',disp:offset},'r10');
  a.load('r10',{rip:'rt.realmIndex'});a.store({base:'rax',disp:FunctionLayout.realm},'r10');
  a.lea('r10',{rip:'rt.functionPrototype'});a.store({base:'rax',disp:O.prototype},'r10');
  a.mov('r10',1);a.store({base:'rax',disp:FunctionLayout.constructable},'r10');
  a.load('r10',slot(48));a.store({base:'rax',disp:FunctionLayout.code},'r10');
  a.load('r10',slot(72));a.store({base:'rax',disp:FunctionLayout.environment},'r10');
  a.lea('r10',{rip:'rt.str.nativeFunction'});a.store({base:'rax',disp:FunctionLayout.sourceText},'r10');
  a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',5);a.store({base:'rcx'},'rax');
 });
 // RCX result, RDX callee Value*, R8 argc, R9 argv. Caller Value slots retain
 // callee and arguments across the nested JS frame's safepoints. Fifth argument
 // is a receiver Value*. The callee roots a copy before its first safepoint.
 // rt.invokeTailTarget is the call path used by rt.tailDispatch: it returns a
 // further tail call marker to the dispatch loop instead of nesting.
 for(const [name,construct,tailTarget] of [['rt.invoke',false,false],['rt.invokeSourceConstruct',true,false],['rt.invokeTailTarget',false,true]] as const)b.fn(name,104,a=>{
  a.store(slot(40),'rcx');a.store(slot(96),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.load('r10',slot(144));a.store(slot(72),'r10');
  a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rdx',disp:8});a.load('r10',{base:'rax',disp:O.kind});
  const ready=a.unique('ready'),box=a.unique('box'),ordinary=a.unique('ordinary'),done=a.unique('done');
  if(!construct){const ordinaryCallee=a.unique('ordinaryCallee');a.cmp('r10',ProxyKind);a.jcc('ne',ordinaryCallee);
   a.load('r10',{base:'rax',disp:O.flags});a.and('r10',ProxyCallable);a.test('r10','r10');failIf(a,'e','rt.throwTypeError');
   a.load('rax',slot(72));a.store(slot(32),'rax');a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r9',slot(64));a.call('rt.proxyApply');a.jmp(done);a.label(ordinaryCallee);
   a.cmp('r10',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  }else{a.cmp('r10',FunctionKind);failIf(a,'ne','rt.throwTypeError');}
  a.load('r10',{base:'rax',disp:FunctionLayout.bound});a.test('r10','r10');a.jcc('e',ordinary);
  a.mov('rax',0);a.store(slot(32),'rax');a.call('rt.invokeBound');a.jmp(done);
  a.label(ordinary);
  // Calling a class constructor throws a TypeError of the constructor's own
  // realm ([[Call]] of a classConstructor runs in its callee context).
  if(!construct){const callable=a.unique('callable');a.load('r10',{base:'rax',disp:FunctionLayout.constructable});a.cmp('r10',2);a.jcc('ne',callable);
   a.load('r10',{base:'rax',disp:FunctionLayout.realm});a.and('r10',255);a.shl('r10',3);a.lea('r11',{rip:realmTable('rt.throwTypeError')});a.add('r11','r10');a.load('r11',{base:'r11'});a.callRegister('r11');
   a.label(callable);}
  const notArrow=a.unique('notArrow');a.load('r10',{base:'rax',disp:FunctionLayout.arrow});a.test('r10','r10');a.jcc('e',notArrow);
  a.lea('r10',{base:'rax',disp:FunctionLayout.lexicalThis});a.store(slot(72),'r10');
  a.label(notArrow);
  a.load('r10',{base:'rax',disp:FunctionLayout.rawThis});a.test('r10','r10');a.jcc('ne',ready);
  a.load('rdx',slot(72));a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('e',ready);a.cmp('rax',1);a.jcc('a',box);
  // OrdinaryCallBindThis: the global this value of the callee's realm.
  a.load('r10',slot(48));a.load('r10',{base:'r10',disp:8});a.load('rax',{base:'r10',disp:FunctionLayout.realm});a.and('rax',255);a.shl('rax',3);
  a.lea('r10',{rip:realmTable('rt.globalValue')});a.add('r10','rax');a.load('rax',{base:'r10'});a.store(slot(72),'rax');a.jmp(ready);
  a.label(box);a.lea('rcx',slot(80));a.call('rt.boxReceiver');a.lea('rax',slot(80));a.store(slot(72),'rax');
  // The fresh box is copied into the JS frame root before its first safepoint.
  a.label(ready);a.load('rax',slot(72));a.store(slot(32),'rax');
  if(!construct){
   const ordinaryCall=a.unique('ordinaryCall');a.load('r10',slot(48));a.load('r10',{base:'r10',disp:8});
   a.load('r10',{base:'r10',disp:FunctionLayout.generator});a.test('r10','r10');a.jcc('e',ordinaryCall);
   // 2: async function, 3: async generator. The internal coroutine is handed
   // to the Promise prelude, which returns the public promise or generator.
   const syncGenerator=a.unique('syncGenerator'),asyncGenerator=a.unique('asyncGenerator');
   a.cmp('r10',1);a.jcc('e',syncGenerator);a.cmp('r10',3);a.jcc('e',asyncGenerator);
   a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r9',slot(64));a.call('rt.newAsyncCoroutine');
   a.load('rcx',slot(40));a.mov('rdx',2);a.call('rt.startAsync');a.jmp(done);
   a.label(asyncGenerator);
   a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r9',slot(64));a.call('rt.newGenerator');
   a.load('rcx',slot(40));a.mov('rdx',3);a.call('rt.startAsync');a.jmp(done);
   a.label(syncGenerator);
   a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r9',slot(64));a.call('rt.newGenerator');a.jmp(done);
   a.label(ordinaryCall);
  }
  a.load('rax',slot(48));a.load('r9',{base:'rax',disp:8});a.load('r10',{base:'r9',disp:FunctionLayout.code});
  a.load('rcx',slot(40));a.load('rdx',slot(56));a.load('r8',slot(64));
  // Sixth source-function argument: stable new.target Value pointer. The saved
  // output at slot40 has already been loaded; it is dead across this call.
  if(construct){
    const targetReady=a.unique('constructTargetReady');a.load('rax',slot(152));a.test('rax','rax');a.jcc('ne',targetReady);
    a.load('rax',slot(48));a.label(targetReady);
  }else{
    const ordinaryTarget=a.unique('ordinaryTarget'),targetReady=a.unique('targetReady');
    a.load('r11',slot(48));a.load('r11',{base:'r11',disp:8});a.load('rax',{base:'r11',disp:FunctionLayout.arrow});a.test('rax','rax');a.jcc('e',ordinaryTarget);
    a.lea('rax',{base:'r11',disp:FunctionLayout.lexicalNewTarget});a.jmp(targetReady);
    a.label(ordinaryTarget);a.lea('rax',{rip:'rt.undefinedValue'});a.label(targetReady);
  }a.store(slot(40),'rax');
  a.callRegister('r10');
  if(!tailTarget){
   const value=a.unique('value');a.load('rcx',slot(96));a.load('rax',{base:'rcx'});a.cmp('rax',TailCallTag);a.jcc('ne',value);
   a.call('rt.tailDispatch');a.label(value);
  }
  a.label(done);
 });
 // Construction is split at IR safepoints: prepare rooted instance, invoke JS,
 // choose returned object or instance. No unregistered runtime locals span JS.
 for(const raw of [false,true])rootedFn(b,raw?'rt.newInstanceRaw':'rt.newInstance',104,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  const complete=a.unique('complete');
  const unwrap=a.unique('unwrap'),unwrapped=a.unique('unwrapped');a.label(unwrap);
  a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rdx',disp:8});a.load('r10',{base:'rax',disp:O.kind});const proxyInstance=a.unique('proxyInstance');a.cmp('r10',ProxyKind);a.jcc('e',proxyInstance);a.cmp('r10',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'rax',disp:FunctionLayout.constructable});a.test('r10','r10');failIf(a,'e','rt.throwTypeError');const validInstance=a.unique('validInstance');a.jmp(validInstance);
  a.label(proxyInstance);a.load('r10',{base:'rax',disp:O.flags});a.and('r10',ProxyConstructable);a.test('r10','r10');failIf(a,'e','rt.throwTypeError');
  if(!raw){a.load('rcx',slot(40));a.lea('r10',{rip:'rt.undefinedValue'});for(const part of [0,8]){a.load('rax',{base:'r10',disp:part});a.store({base:'rcx',disp:part},'rax');}a.jmp(complete);}
  a.label(validInstance);
  if(!raw){a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',ProxyKind);a.jcc('e',unwrapped);a.load('r10',{base:'rax',disp:FunctionLayout.bound});a.test('r10','r10');a.jcc('e',unwrapped);
   a.lea('rdx',{base:'r10',disp:B.target});a.jmp(unwrap);}a.label(unwrapped);
  a.store(slot(88),'rdx');a.lea('rcx',slot(64));a.lea('r8',{rip:'rt.key.prototype'});a.call('rt.getProperty');
  // Instances of a function start from its root shape, whose inline slots
  // grow when earlier instances outgrew them (rt.shapeConstructorRoot).
  {const plain=a.unique('plainCallee'),create=a.unique('create');
   a.load('r10',slot(88));a.load('r10',{base:'r10',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',FunctionKind);a.jcc('ne',plain);
   a.load('rcx',{base:'r10',disp:FunctionLayout.instanceShape});a.call('rt.shapeConstructorRoot');
   a.load('r10',slot(88));a.load('r10',{base:'r10',disp:8});a.store({base:'r10',disp:FunctionLayout.instanceShape},'rax');a.mov('rdx','rax');a.jmp(create);
   a.label(plain);a.mov('rcx',defaultConstructorCapacity);a.call('rt.shapeLiteralRoot');a.mov('rdx','rax');
   a.label(create);a.load('rcx',slot(40));a.call('rt.newShapedObject');}
  const done=a.unique('done'),fallback=a.unique('fallback');a.load('rax',slot(64));a.cmp('rax',5);a.jcc('ne',fallback);
  a.load('rcx',slot(40));a.lea('rdx',slot(64));a.call('rt.setPrototype');a.jmp(done);
  // GetPrototypeFromConstructor falls back to the intrinsic of new.target's realm.
  a.label(fallback);a.load('rcx',slot(48));a.load('rcx',{base:'rcx',disp:8});a.call('rt.functionRealm');
  a.load('r10',slot(40));a.load('r10',{base:'r10',disp:8});
  a.mov('r11','rax');a.shl('r11',RealmFlagShift);a.or('r11',OF.defaultPrototypeFallback);a.load('rcx',{base:'r10',disp:O.flags});a.or('rcx','r11');a.store({base:'r10',disp:O.flags},'rcx');
  a.shl('rax',3);a.lea('r11',{rip:realmTable('rt.objectPrototype')});a.add('r11','rax');a.load('r11',{base:'r11'});a.store({base:'r10',disp:O.prototype},'r11');
  a.label(done);a.label(complete);
 });
 b.fn('rt.constructorResult',40,a=>{
  const copy=a.unique('copy');a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('e',copy);a.mov('rdx','r8');
  a.label(copy);a.load('rax',{base:'rdx'});a.store({base:'rcx'},'rax');a.load('rax',{base:'rdx',disp:8});a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.ordinaryHasInstance',104,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  const unwrap=a.unique('unwrap'),unwrapped=a.unique('unwrapped');a.label(unwrap);
  a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r8',disp:8});a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rax',disp:FunctionLayout.bound});a.test('rax','rax');a.jcc('e',unwrapped);
  a.lea('r8',{base:'rax',disp:B.target});a.jmp(unwrap);a.label(unwrapped);
  const no=a.unique('no'),yes=a.unique('yes'),loop=a.unique('loop'),save=a.unique('save');
  a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('ne',no);
  a.lea('rcx',slot(64));a.mov('rdx','r8');a.lea('r8',{rip:'rt.key.prototype'});a.call('rt.getProperty');
  a.load('rax',slot(64));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('rdx',slot(72));
  a.load('r10',slot(48));for(const part of [0,8]){a.load('rax',{base:'r10',disp:part});a.store(slot(80+part),'rax');}
  a.label(loop);a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.call('rt.getPrototype');
  a.load('rax',slot(80));a.cmp('rax',1);a.jcc('e',no);a.load('rax',slot(88));a.load('r10',slot(72));a.cmp('rax','r10');a.jcc('e',yes);a.jmp(loop);
  a.label(no);a.mov('rax',0);a.jmp(save);a.label(yes);a.mov('rax',1);
  a.label(save);a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',2);a.store({base:'rcx'},'rax');
 });
 rootedFn(b,'rt.instanceOf',120,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:64,count:3}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',6);a.store(slot(64),'rax');a.lea('rax',{rip:'rt.Symbol.hasInstance.value'});a.store(slot(72),'rax');
  a.lea('rcx',slot(80));a.load('rdx',slot(56));a.lea('r8',slot(64));a.call('rt.getProperty');
  const ordinary=a.unique('ordinary'),done=a.unique('done');a.load('rax',slot(80));a.cmp('rax',1);a.jcc('be',ordinary);
  a.load('rax',slot(56));a.store(slot(32),'rax');a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.mov('r8',1);a.load('r9',slot(48));a.call('rt.invoke');
  a.lea('rcx',slot(96));a.call('rt.toBoolean');a.load('rcx',slot(40));a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');a.jmp(done);
  a.label(ordinary);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.call('rt.ordinaryHasInstance');a.label(done);
 });
}
