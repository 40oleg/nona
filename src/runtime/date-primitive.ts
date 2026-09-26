import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {FunctionKind} from './functions.js';
import {emitNativeFunction} from './function-builtin.js';

export function emitDatePrimitive(b:RuntimeBuilder):void {
 emitNativeFunction(b,'rt.Date.toPrimitive.fn','[Symbol.toPrimitive]',1);
 const property=new Uint8Array(P.size);property[P.value]=5;property[P.attributes]=A.configurable;
 const prototype=b.bundle.fragments.find(f=>f.name==='rt.datePrototype')!;
 const head=prototype.fixups.find(f=>f.offset===O.properties)!;
 b.bundle.fragments.push({name:'rt.datePrototype.@@toPrimitive',section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:head.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.toPrimitive.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.Date.toPrimitive.fn',addend:0},
 ]});head.target='rt.datePrototype.@@toPrimitive';
 rootedFn(b,'rt.Date.toPrimitive.fn.code',168,[{kind:'output',register:'rcx'},{kind:'locals',offset:80,count:4}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('r10',slot(frame+40));a.load('rax',{base:'r10'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.store(slot(80),'rax');a.load('rax',{base:'r10',disp:8});a.store(slot(88),'rax');
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');a.load('rax',{base:'r8'});a.cmp('rax',4);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r8',disp:8});a.store(slot(48),'rax');
  const stringHint=a.unique('stringHint'),numberHint=a.unique('numberHint'),start=a.unique('start'),done=a.unique('done');
  for(const [hint,target] of [['string',stringHint],['default',stringHint],['number',numberHint]] as const){
   a.load('rcx',slot(48));a.lea('rdx',{rip:'rt.str.hint.'+hint});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',target);
  }
  a.call('rt.throwTypeError');
  a.label(stringHint);a.mov('rax',1);a.store(slot(56),'rax');a.jmp(start);
  a.label(numberHint);a.mov('rax',0);a.store(slot(56),'rax');a.label(start);
  const emitMethod=(method:string)=>{
   const next=a.unique('next');a.mov('rax',4);a.store(slot(128),'rax');a.lea('rax',{rip:'rt.str.'+method});a.store(slot(136),'rax');
   a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.lea('r8',slot(128));a.call('rt.getProperty');
   a.load('rax',slot(96));a.cmp('rax',5);a.jcc('ne',next);a.load('r10',slot(104));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',FunctionKind);a.jcc('ne',next);
   a.lea('rax',slot(80));a.store(slot(32),'rax');a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.mov('r8',0);a.lea('r9',{rip:'rt.undefinedValue'});a.call('rt.invoke');
   a.load('rax',slot(112));a.cmp('rax',5);a.jcc('e',next);a.load('rcx',slot(40));a.store({base:'rcx'},'rax');a.load('rax',slot(120));a.store({base:'rcx',disp:8},'rax');a.jmp(done);a.label(next);
  };
  const numberFirst=a.unique('numberFirst');a.load('rax',slot(56));a.test('rax','rax');a.jcc('e',numberFirst);
  emitMethod('toString');emitMethod('valueOf');a.call('rt.throwTypeError');
  a.label(numberFirst);emitMethod('valueOf');emitMethod('toString');a.call('rt.throwTypeError');a.label(done);
 });
}
