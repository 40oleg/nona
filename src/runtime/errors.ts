import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {errorConstructorNames} from '../global-builtins.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';
import type {Fixup} from '../backend/pe/model.js';

export const ErrorKind=5;
export const errorRoots=[...errorConstructorNames.map(n=>'rt.'+n.toLowerCase()+'Prototype'),'rt.errorToString'];
export const errorPropertyRoots=[...errorConstructorNames.flatMap(n=>['name','message'].map(k=>'rt.'+n.toLowerCase()+'Prototype.'+k)),...builtinPropertyRoots('rt.errorToString','toString','rt.errorPrototype')];
const pointer=(offset:number,target:string):Fixup=>({offset,kind:'va64',target,addend:0});

export function emitErrors(b:RuntimeBuilder):void {
 b.bundle.fragments.push(stringLiteral('rt.error.runtimeMessage','Invalid operation'));
 const runtimeMessage=new Uint8Array(16);runtimeMessage[0]=4;
 b.bundle.fragments.push({name:'rt.error.runtimeMessageValue',section:'.rdata',alignment:8,bytes:runtimeMessage,symbols:{},fixups:[pointer(8,'rt.error.runtimeMessage')]});
 // Intrinsic construction with a static string has no callbacks or safepoints.
 // The thrown object is copied into the catch root before collection can run.
 for(const name of ['TypeError','ReferenceError','RangeError','URIError'])b.fn('rt.throw'+name,72,a=>{
  a.lea('rcx',slot(48));a.mov('rdx',1);a.lea('r8',{rip:'rt.error.runtimeMessageValue'});a.call('rt.'+name+'.code');
  a.lea('rcx',slot(48));a.call('rt.throw');
 });
 b.bundle.fragments.push(stringLiteral('rt.error.messageText','message'),stringLiteral('rt.error.separator',': '),stringLiteral('rt.error.tag','[object Error]'));
 for(const [key,text] of [['message','rt.error.messageText'],['name','rt.str.name'],['defaultName','rt.Error.text'],['empty','rt.str.empty'],['separator','rt.error.separator']] as const){
  const bytes=new Uint8Array(16);bytes[0]=4;
  b.bundle.fragments.push({name:'rt.error.key.'+key,section:'.rdata',alignment:8,bytes,symbols:{},fixups:[pointer(8,text)]});
 }
 for(const name of errorConstructorNames){
  const prototype='rt.'+name.toLowerCase()+'Prototype';
  b.bundle.fragments.push({name:prototype,section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[pointer(O.prototype,name==='Error'?'rt.objectPrototype':'rt.errorPrototype'),pointer(O.properties,prototype+'.name')]});
  for(const key of ['name','message']){
   const bytes=new Uint8Array(P.size);bytes[P.value]=4;bytes[P.attributes]=A.writable|A.configurable;
   b.bundle.fragments.push({name:prototype+'.'+key,section:'.data',alignment:8,bytes,symbols:{},fixups:[pointer(P.key,key==='name'?'rt.str.name':'rt.error.messageText'),pointer(P.value+8,key==='name'?'rt.'+name+'.text':'rt.str.empty'),...(key==='name'?[pointer(P.next,prototype+'.message')]:[])]});
  }
  for(const construct of [false,true])rootedFn(b,'rt.'+name+(construct?'.construct':'.code'),136,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:3}],(a,frame)=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
   a.lea('rcx',slot(80));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
   a.load('r10',slot(88));a.mov('rax',ErrorKind);a.store({base:'r10',disp:O.kind},'rax');
   if(construct){a.load('rax',slot(frame+40));a.load('rax',{base:'rax',disp:8});a.load('rax',{base:'rax',disp:O.prototype});}
   else a.lea('rax',{rip:prototype});
   a.store({base:'r10',disp:O.prototype},'rax');
   const done=a.unique('done');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',done);
   a.load('rdx',slot(56));a.load('rax',{base:'rdx'});a.test('rax','rax');a.jcc('e',done);
   a.lea('rcx',slot(96));a.call('rt.toString');
   a.lea('rcx',slot(80));a.lea('rdx',{rip:'rt.error.key.message'});a.lea('r8',slot(96));a.mov('r9',1);a.call('rt.setProperty');
   a.load('rcx',slot(88));a.lea('rdx',{rip:'rt.error.messageText'});a.call('rt.findOwnProperty');a.mov('r10',A.writable|A.configurable);a.store({base:'rax',disp:P.attributes},'r10');
   a.label(done);a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',slot(80+offset));a.store({base:'rcx',disp:offset},'rax');}
  });
 }
 prependFunctionBuiltin(b,'rt.errorToString','toString',0,'rt.errorPrototype');
 rootedFn(b,'rt.errorToString.code',168,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:6}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(frame+40));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(64+offset),'rax');}
  for(const [key,offset,fallback] of [['name',96,'defaultName'],['message',112,'empty']] as const){
   a.lea('rcx',slot(80));a.lea('rdx',slot(64));a.lea('r8',{rip:'rt.error.key.'+key});a.call('rt.getProperty');
   const convert=a.unique('convert'),ready=a.unique('ready');a.load('rax',slot(80));a.test('rax','rax');a.jcc('ne',convert);
   for(const n of [0,8]){a.load('rax',{rip:'rt.error.key.'+fallback,addend:n});a.store(slot(offset+n),'rax');}a.jmp(ready);
   a.label(convert);a.lea('rcx',slot(offset));a.lea('rdx',slot(80));a.call('rt.toString');a.label(ready);
  }
  const nameEmpty=a.unique('nameEmpty'),messageEmpty=a.unique('messageEmpty'),done=a.unique('done');
  a.load('rax',slot(104));a.load('rax',{base:'rax'});a.test('rax','rax');a.jcc('e',nameEmpty);
  a.load('rax',slot(120));a.load('rax',{base:'rax'});a.test('rax','rax');a.jcc('e',messageEmpty);
  a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.lea('r8',{rip:'rt.error.key.separator'});a.call('rt.concat');
  a.load('rcx',slot(40));a.lea('rdx',slot(128));a.lea('r8',slot(112));a.call('rt.concat');a.jmp(done);
  for(const [label,offset] of [[nameEmpty,112],[messageEmpty,96]] as const){a.label(label);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(offset+n));a.store({base:'rcx',disp:n},'rax');}a.jmp(done);}
  a.label(done);
 });
}
