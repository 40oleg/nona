import {ErrorKind} from './errors.js';
import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O,ProxyKind,ProxyCallable} from './object-layout.js';
import {RootLayout as R} from './heap-layout.js';
import {FunctionKind} from './functions.js';
import {BoxKind,BoxLayout} from './boxing.js';
import {DateKind} from './date.js';
import {RegExpKind} from './regexp.js';
import {emitFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';
import {rootedFn} from './root-scope.js';

const methods=[
 ['rt.objectToString','rt.objectPrototype','toString',0,'rt.objectPrototype.valueOf'],
 ['rt.objectValueOf','rt.objectPrototype','valueOf',0,undefined],
 ['rt.arrayToStringMethod','rt.arrayPrototype','toString',0,'rt.arrayPrototype.join'],
 ['rt.arrayJoinMethod','rt.arrayPrototype','join',1,undefined],
] as const;
export const objectMethodRoots=methods.map(([symbol])=>symbol);
export const objectMethodPropertyRoots=methods.flatMap(([symbol,owner,method])=>builtinPropertyRoots(symbol,method,owner));

export function emitObjectMethods(b:RuntimeBuilder):void {
 for(const [symbol,name] of [['arrayValue','Array'],['functionValue','Function'],['argumentsValue','Arguments'],['errorValue','Error'],['dateValue','Date'],['regexpValue','RegExp']])b.bundle.fragments.push(stringLiteral('rt.str.'+symbol,'[object '+name+']'));
 for(const [symbol,owner,method,length,next] of methods)emitFunctionBuiltin(b,symbol,method,length,next,owner);
 for(const name of ['Undefined','Null','Boolean','Number','String','Symbol'])b.bundle.fragments.push(stringLiteral('rt.str.tag'+name,'[object '+name+']'));
 b.bundle.fragments.push(stringLiteral('rt.str.tagOpen','[object '),stringLiteral('rt.str.tagClose',']'));
 const key=new Uint8Array(16);key[0]=4;
 b.bundle.fragments.push({name:'rt.key.join',section:'.rdata',alignment:8,bytes:key,symbols:{},fixups:[{offset:8,kind:'va64',target:'rt.str.join',addend:0}]});
 b.fn('rt.toObject',40,a=>{
  a.load('rax',{base:'rdx'});a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');const object=a.unique('object'),done=a.unique('done');a.cmp('rax',5);a.jcc('e',object);
  a.call('rt.boxReceiver');a.jmp(done);a.label(object);a.store({base:'rcx'},'rax');a.load('rax',{base:'rdx',disp:8});a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
 b.fn('rt.objectValueOf.code',40,a=>{a.load('rdx',slot(80));a.call('rt.toObject');});
 b.fn('rt.objectToString.code',40,a=>{a.load('rdx',slot(80));a.call('rt.objectTag');});
 // @@toStringTag is read with the original receiver and can invoke a getter.
 rootedFn(b,'rt.objectTag',184,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:5}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.mov('rax',0);a.store(slot(56),'rax');a.load('rax',{base:'rdx'});const defaultTag=a.unique('defaultTag'),dynamicDone=a.unique('dynamicDone');a.cmp('rax',1);a.jcc('be',defaultTag);
  a.mov('rcx','rdx');a.call('rt.isArray');a.store(slot(56),'rax');
  a.mov('rax',6);a.store(slot(64),'rax');a.lea('rax',{rip:'rt.Symbol.toStringTag.value'});a.store(slot(72),'rax');
  a.lea('rcx',slot(80));a.load('rdx',slot(48));a.lea('r8',slot(64));a.call('rt.getProperty');a.load('rax',slot(80));a.cmp('rax',4);a.jcc('ne',defaultTag);
  a.mov('rax',4);for(const offset of [96,112])a.store(slot(offset),'rax');a.lea('rax',{rip:'rt.str.tagOpen'});a.store(slot(104),'rax');a.lea('rax',{rip:'rt.str.tagClose'});a.store(slot(120),'rax');
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.lea('r8',slot(80));a.call('rt.concat');
  a.load('rcx',slot(40));a.lea('rdx',slot(128));a.lea('r8',slot(112));a.call('rt.concat');a.jmp(dynamicDone);
  a.label(defaultTag);a.load('rcx',slot(40));a.load('rdx',slot(48));
  const save=a.unique('save');a.load('r10',slot(56));const notArray=a.unique('notArray');a.test('r10','r10');a.jcc('e',notArray);a.lea('rax',{rip:'rt.str.arrayValue'});a.jmp(save);a.label(notArray);a.load('r10',{base:'rdx'});
  for(const [tag,name] of ['Undefined','Null','Boolean','Number','String'].entries()){
   const next=a.unique('tag');a.cmp('r10',tag);a.jcc('ne',next);a.lea('rax',{rip:'rt.str.tag'+name});a.jmp(save);a.label(next);
  }
  const objectPrimitive=a.unique('objectPrimitive');a.cmp('r10',5);a.jcc('e',objectPrimitive);a.lea('rax',{rip:'rt.str.objectValue'});a.jmp(save);a.label(objectPrimitive);
  a.load('rdx',{base:'rdx',disp:8});a.load('r10',{base:'rdx',disp:O.kind});
  const notCallableProxy=a.unique('notCallableProxy');a.cmp('r10',ProxyKind);a.jcc('ne',notCallableProxy);a.load('r10',{base:'rdx',disp:O.flags});a.and('r10',ProxyCallable);a.test('r10','r10');a.jcc('e',notCallableProxy);a.lea('rax',{rip:'rt.str.functionValue'});a.jmp(save);a.label(notCallableProxy);a.load('r10',{base:'rdx',disp:O.kind});
  for(const [kind,symbol] of [[1,'arrayValue'],[FunctionKind,'functionValue'],[3,'argumentsValue'],[ErrorKind,'errorValue'],[DateKind,'dateValue'],[RegExpKind,'regexpValue']] as const){
   const next=a.unique('kind');a.cmp('r10',kind);a.jcc('ne',next);a.lea('rax',{rip:'rt.str.'+symbol});a.jmp(save);a.label(next);
  }
  const ordinary=a.unique('ordinary');a.cmp('r10',BoxKind);a.jcc('ne',ordinary);a.load('r10',{base:'rdx',disp:BoxLayout.value});
  for(const [tag,name] of [[2,'Boolean'],[3,'Number'],[4,'String']] as const){const next=a.unique('box');a.cmp('r10',tag);a.jcc('ne',next);a.lea('rax',{rip:'rt.str.tag'+name});a.jmp(save);a.label(next);}
  a.label(ordinary);a.lea('rax',{rip:'rt.str.objectValue'});a.label(save);a.store({base:'rcx',disp:8},'rax');a.mov('rax',4);a.store({base:'rcx'},'rax');a.label(dynamicDone);
 });
 // Roots receiver and join method before reentrant user JS. The result belongs
 // to the outer caller; no further safepoint occurs after invoke returns.
 b.fn('rt.arrayToStringMethod.code',136,a=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(176));a.mov('rax',0);for(const offset of [64,72,80,88])a.store(slot(offset),'rax');
  a.load('rax',{rip:'rt.gcRoots'});a.store(slot(104+R.next),'rax');a.lea('rax',slot(64));a.store(slot(104+R.values),'rax');a.mov('rax',2);a.store(slot(104+R.count),'rax');a.lea('rax',slot(104));a.store({rip:'rt.gcRoots'},'rax');
  a.lea('rcx',slot(64));a.call('rt.toObject');a.lea('rcx',slot(80));a.lea('rdx',slot(64));a.lea('r8',{rip:'rt.key.join'});a.call('rt.getProperty');
  const fallback=a.unique('fallback'),done=a.unique('done');a.load('rax',slot(80));a.cmp('rax',5);a.jcc('ne',fallback);a.load('rax',slot(88));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',FunctionKind);a.jcc('ne',fallback);
  a.lea('rax',slot(64));a.store(slot(32),'rax');a.load('rcx',slot(40));a.lea('rdx',slot(80));a.mov('r8',0);a.lea('r9',{rip:'rt.undefinedValue'});a.call('rt.invoke');a.jmp(done);
  a.label(fallback);a.load('rcx',slot(40));a.lea('rdx',slot(64));a.call('rt.objectTag');
  a.label(done);a.load('rax',slot(104+R.next));a.store({rip:'rt.gcRoots'},'rax');
 });
 b.fn('rt.arrayJoinMethod.code',104,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.load('rdx',slot(144));a.lea('rcx',slot(64));a.call('rt.toObject');
  a.lea('r8',{rip:'rt.undefinedValue'});a.load('rax',slot(48));const ready=a.unique('ready');a.test('rax','rax');a.jcc('e',ready);a.load('r8',slot(56));a.label(ready);
  a.load('rcx',slot(40));a.lea('rdx',slot(64));a.call('rt.arrayJoinBody');
 });
}
