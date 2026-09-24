import {ErrorKind} from './errors.js';
import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O} from './object-layout.js';
import {RootLayout as R} from './heap-layout.js';
import {FunctionKind} from './functions.js';
import {BoxKind,BoxLayout} from './boxing.js';
import {emitFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';

const methods=[
 ['rt.objectToString','rt.objectPrototype','toString',0,'rt.objectPrototype.valueOf'],
 ['rt.objectValueOf','rt.objectPrototype','valueOf',0,undefined],
 ['rt.arrayToStringMethod','rt.arrayPrototype','toString',0,'rt.arrayPrototype.join'],
 ['rt.arrayJoinMethod','rt.arrayPrototype','join',1,undefined],
] as const;
export const objectMethodRoots=methods.map(([symbol])=>symbol);
export const objectMethodPropertyRoots=methods.flatMap(([symbol,owner,method])=>builtinPropertyRoots(symbol,method,owner));

export function emitObjectMethods(b:RuntimeBuilder):void {
 for(const [symbol,name] of [['arrayValue','Array'],['functionValue','Function'],['argumentsValue','Arguments'],['errorValue','Error']])b.bundle.fragments.push(stringLiteral('rt.str.'+symbol,'[object '+name+']'));
 for(const [symbol,owner,method,length,next] of methods)emitFunctionBuiltin(b,symbol,method,length,next,owner);
 for(const name of ['Undefined','Null','Boolean','Number','String'])b.bundle.fragments.push(stringLiteral('rt.str.tag'+name,'[object '+name+']'));
 const key=new Uint8Array(16);key[0]=4;
 b.bundle.fragments.push({name:'rt.key.join',section:'.rdata',alignment:8,bytes:key,symbols:{},fixups:[{offset:8,kind:'va64',target:'rt.str.join',addend:0}]});
 b.fn('rt.toObject',40,a=>{
  a.load('rax',{base:'rdx'});a.cmp('rax',1);failIf(a,'be','rt.throwTypeError');const object=a.unique('object'),done=a.unique('done');a.cmp('rax',5);a.jcc('e',object);
  a.call('rt.boxReceiver');a.jmp(done);a.label(object);a.store({base:'rcx'},'rax');a.load('rax',{base:'rdx',disp:8});a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
 b.fn('rt.objectValueOf.code',40,a=>{a.load('rdx',slot(80));a.call('rt.toObject');});
 b.fn('rt.objectToString.code',40,a=>{a.load('rdx',slot(80));a.call('rt.objectTag');});
 // Builtin Object toString ignores user toString/valueOf. Symbol.toStringTag
 // belongs to the future Symbol/property-key implementation.
 b.fn('rt.objectTag',40,a=>{
  const save=a.unique('save');a.load('r10',{base:'rdx'});
  for(const [tag,name] of ['Undefined','Null','Boolean','Number','String'].entries()){
   const next=a.unique('tag');a.cmp('r10',tag);a.jcc('ne',next);a.lea('rax',{rip:'rt.str.tag'+name});a.jmp(save);a.label(next);
  }
  a.load('rdx',{base:'rdx',disp:8});a.load('r10',{base:'rdx',disp:O.kind});
  for(const [kind,symbol] of [[1,'arrayValue'],[FunctionKind,'functionValue'],[3,'argumentsValue'],[ErrorKind,'errorValue']] as const){
   const next=a.unique('kind');a.cmp('r10',kind);a.jcc('ne',next);a.lea('rax',{rip:'rt.str.'+symbol});a.jmp(save);a.label(next);
  }
  const ordinary=a.unique('ordinary');a.cmp('r10',BoxKind);a.jcc('ne',ordinary);a.load('r10',{base:'rdx',disp:BoxLayout.value});
  for(const [tag,name] of [[2,'Boolean'],[3,'Number'],[4,'String']] as const){const next=a.unique('box');a.cmp('r10',tag);a.jcc('ne',next);a.lea('rax',{rip:'rt.str.tag'+name});a.jmp(save);a.label(next);}
  a.label(ordinary);a.lea('rax',{rip:'rt.str.objectValue'});a.label(save);a.store({base:'rcx',disp:8},'rax');a.mov('rax',4);a.store({base:'rcx'},'rax');
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
