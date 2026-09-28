import {rootedFn} from './root-scope.js';
import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';
import {stringLiteral} from './value.js';
import {BoundDataLayout as B} from './bound-layout.js';

export const FunctionLayout={code:O.size,environment:O.size+8,constructable:O.size+16,rawThis:O.size+24,bound:O.size+32,sourceText:O.size+40,constructCode:O.size+48,homeObject:O.size+56,arrow:O.size+64,lexicalThis:O.size+72,lexicalNewTarget:O.size+88,generator:O.size+104,size:O.size+112} as const;
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
  a.load('rcx',{base:'rcx',disp:8});a.load('rdx',{base:'rdx',disp:8});a.call('rt.findOwnProperty');
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
 b.fn('rt.initFunctionMetadata',88,a=>{
  a.store(slot(40),'rcx');a.mov('rax',4);a.store(slot(48),'rax');a.store(slot(56),'rdx');
  a.mov('rax',3);a.store(slot(64),'rax');a.cvtsi2sd('xmm0','r8');a.storesd(slot(72),'xmm0');
  a.lea('rdx',{rip:'rt.key.length'});a.lea('r8',slot(64));a.mov('r9',A.configurable);a.call('rt.initFunctionProperty');
  a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.key.name'});a.lea('r8',slot(48));a.mov('r9',A.configurable);a.call('rt.initFunctionProperty');
  // Move the fresh prototype node to the newest position: length, name, prototype.
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:8});a.lea('rdx',{rip:'rt.str.prototype'});a.call('rt.findOwnProperty');a.store(slot(80),'rax');const noPrototype=a.unique('noPrototype');a.test('rax','rax');a.jcc('e',noPrototype);
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:8});a.lea('rdx',{rip:'rt.str.length'});a.call('rt.findOwnProperty');
  a.load('r10',slot(80));a.load('r11',{base:'r10',disp:P.next});a.store({base:'rax',disp:P.next},'r11');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:8});a.load('r11',{base:'rcx',disp:O.properties});a.store({base:'r10',disp:P.next},'r11');a.store({base:'rcx',disp:O.properties},'r10');a.label(noPrototype);
 });
 // Concise methods/accessors have no own prototype and cannot construct.
 b.fn('rt.newMethod',56,a=>{
  a.store(slot(40),'rcx');a.call('rt.newFunction');a.load('rax',slot(40));a.load('rax',{base:'rax',disp:8});a.mov('r10',0);
  a.store({base:'rax',disp:O.properties},'r10');a.store({base:'rax',disp:FunctionLayout.constructable},'r10');
 });
 // RCX result, RDX code, R8 capture count, R9 array of internal Cell Values.
 b.fn('rt.newFunction',104,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  a.mov('rcx','r8');a.mov('rdx','r9');a.call('rt.newEnvironment');a.store(slot(72),'rax');
  a.mov('rcx',FunctionLayout.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',FunctionKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying,O.flags,FunctionLayout.rawThis,FunctionLayout.bound,FunctionLayout.constructCode,FunctionLayout.homeObject,FunctionLayout.arrow,FunctionLayout.lexicalThis,FunctionLayout.lexicalThis+8,FunctionLayout.lexicalNewTarget,FunctionLayout.lexicalNewTarget+8,FunctionLayout.generator])a.store({base:'rax',disp:offset},'r10');
  a.lea('r10',{rip:'rt.functionPrototype'});a.store({base:'rax',disp:O.prototype},'r10');
  a.mov('r10',1);a.store({base:'rax',disp:FunctionLayout.constructable},'r10');
  a.load('r10',slot(48));a.store({base:'rax',disp:FunctionLayout.code},'r10');
  a.load('r10',slot(72));a.store({base:'rax',disp:FunctionLayout.environment},'r10');
  a.lea('r10',{rip:'rt.str.nativeFunction'});a.store({base:'rax',disp:FunctionLayout.sourceText},'r10');
  a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',5);a.store({base:'rcx'},'rax');
  a.lea('rcx',slot(80));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
  a.load('rcx',slot(40));a.lea('rdx',{rip:'rt.key.prototype'});a.lea('r8',slot(80));a.mov('r9',A.writable);a.call('rt.initFunctionProperty');
  a.lea('rcx',slot(80));a.lea('rdx',{rip:'rt.key.constructor'});a.load('r8',slot(40));a.mov('r9',A.writable|A.configurable);a.call('rt.initFunctionProperty');
 });
 // RCX result, RDX callee Value*, R8 argc, R9 argv. Caller Value slots retain
 // callee and arguments across the nested JS frame's safepoints. Fifth argument
 // is a receiver Value*. The callee roots a copy before its first safepoint.
 for(const construct of [false,true])b.fn(construct?'rt.invokeSourceConstruct':'rt.invoke',104,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  a.load('r10',slot(144));a.store(slot(72),'r10');
  a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rdx',disp:8});a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  const ready=a.unique('ready'),box=a.unique('box'),ordinary=a.unique('ordinary'),done=a.unique('done');
  a.load('r10',{base:'rax',disp:FunctionLayout.bound});a.test('r10','r10');a.jcc('e',ordinary);
  a.mov('rax',0);a.store(slot(32),'rax');a.call('rt.invokeBound');a.jmp(done);
  a.label(ordinary);
  if(!construct){a.load('r10',{base:'rax',disp:FunctionLayout.constructable});a.cmp('r10',2);failIf(a,'e','rt.throwTypeError');}
  const notArrow=a.unique('notArrow');a.load('r10',{base:'rax',disp:FunctionLayout.arrow});a.test('r10','r10');a.jcc('e',notArrow);
  a.lea('r10',{base:'rax',disp:FunctionLayout.lexicalThis});a.store(slot(72),'r10');
  a.label(notArrow);
  a.load('r10',{base:'rax',disp:FunctionLayout.rawThis});a.test('r10','r10');a.jcc('ne',ready);
  a.load('rdx',slot(72));a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('e',ready);a.cmp('rax',1);a.jcc('a',box);
  a.lea('rax',{rip:'rt.globalValue'});a.store(slot(72),'rax');a.jmp(ready);
  a.label(box);a.lea('rcx',slot(80));a.call('rt.boxReceiver');a.lea('rax',slot(80));a.store(slot(72),'rax');
  // The fresh box is copied into the JS frame root before its first safepoint.
  a.label(ready);a.load('rax',slot(72));a.store(slot(32),'rax');
  if(!construct){
   const ordinaryCall=a.unique('ordinaryCall');a.load('r10',slot(48));a.load('r10',{base:'r10',disp:8});
   a.load('r10',{base:'r10',disp:FunctionLayout.generator});a.test('r10','r10');a.jcc('e',ordinaryCall);
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
  a.callRegister('r10');a.label(done);
 });
 // Construction is split at IR safepoints: prepare rooted instance, invoke JS,
 // choose returned object or instance. No unregistered runtime locals span JS.
 for(const raw of [false,true])rootedFn(b,raw?'rt.newInstanceRaw':'rt.newInstance',88,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  const unwrap=a.unique('unwrap'),unwrapped=a.unique('unwrapped');a.label(unwrap);
  a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rdx',disp:8});a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'rax',disp:FunctionLayout.constructable});a.test('r10','r10');failIf(a,'e','rt.throwTypeError');
  if(!raw){a.load('r10',{base:'rax',disp:FunctionLayout.bound});a.test('r10','r10');a.jcc('e',unwrapped);
   a.lea('rdx',{base:'r10',disp:B.target});a.jmp(unwrap);}a.label(unwrapped);
  a.lea('rcx',slot(64));a.lea('r8',{rip:'rt.key.prototype'});a.call('rt.getProperty');
  a.load('rcx',slot(40));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
  const done=a.unique('done');a.load('rax',slot(64));a.cmp('rax',5);a.jcc('ne',done);
  a.load('rcx',slot(40));a.lea('rdx',slot(64));a.call('rt.setPrototype');a.label(done);
 });
 b.fn('rt.constructorResult',40,a=>{
  const copy=a.unique('copy');a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('e',copy);a.mov('rdx','r8');
  a.label(copy);a.load('rax',{base:'rdx'});a.store({base:'rcx'},'rax');a.load('rax',{base:'rdx',disp:8});a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.ordinaryHasInstance',88,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:64,count:1}],a=>{
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
  a.load('rax',slot(48));a.load('rax',{base:'rax',disp:8});
  a.label(loop);a.load('rax',{base:'rax',disp:O.prototype});a.test('rax','rax');a.jcc('e',no);a.cmp('rax','rdx');a.jcc('e',yes);a.jmp(loop);
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
