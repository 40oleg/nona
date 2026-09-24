import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {DescriptorLayout as D,DescriptorFields as F} from './descriptor-layout.js';
import {FunctionKind} from './functions.js';
import {ObjectLayout as O} from './object-layout.js';

export function emitDescriptorConversion(b:RuntimeBuilder):void {
 // RCX writable record, RDX descriptor object Value*. The record must not
 // overlap the input Value. Initialize every output slot before any callback;
 // its root range keeps previously read fields alive during later getters.
 rootedFn(b,'rt.toPropertyDescriptor',104,[{kind:'range',register:'rcx',count:6},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  a.mov('rax',0);for(let n=0;n<D.size;n+=8)a.store({base:'rcx',disp:n},'rax');
  a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  for(const name of ['enumerable','configurable','value','writable','get','set'] as const){
   const absent=a.unique('absent');a.mov('rax',4);a.store(slot(64),'rax');a.lea('rax',{rip:'rt.descriptorKey.'+name});a.store(slot(72),'rax');
   a.lea('rcx',slot(80));a.load('rdx',slot(48));a.lea('r8',slot(64));a.call('rt.hasProperty');a.load('rax',slot(88));a.test('rax','rax');a.jcc('e',absent);
   a.load('rcx',slot(40));a.add('rcx',D[name]);a.load('rdx',slot(48));a.lea('r8',slot(64));a.call('rt.getProperty');
   if(name==='enumerable'||name==='configurable'||name==='writable'){
    a.load('rcx',slot(40));a.add('rcx',D[name]);a.call('rt.toBoolean');a.load('rcx',slot(40));a.store({base:'rcx',disp:D[name]+8},'rax');a.mov('rax',2);a.store({base:'rcx',disp:D[name]},'rax');
   }else if(name==='get'||name==='set'){
    const valid=a.unique('valid');a.load('rcx',slot(40));a.load('rax',{base:'rcx',disp:D[name]});a.test('rax','rax');a.jcc('e',valid);a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
    a.load('rax',{base:'rcx',disp:D[name]+8});a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');a.label(valid);
   }
   a.load('rcx',slot(40));a.load('rax',{base:'rcx',disp:D.present});a.or('rax',F[name]);a.store({base:'rcx',disp:D.present},'rax');a.label(absent);
  }
  const valid=a.unique('valid');a.load('rcx',slot(40));a.load('rax',{base:'rcx',disp:D.present});a.mov('r10','rax');a.and('r10',F.get|F.set);a.test('r10','r10');a.jcc('e',valid);
  a.and('rax',F.value|F.writable);a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');a.label(valid);
 });
 // RCX valid initialized partial record. Default booleans to false and choose
 // data versus accessor fields without losing the explicit undefined case.
 b.fn('rt.completePropertyDescriptor',40,a=>{
  a.load('r11',{base:'rcx',disp:D.present});
  for(const name of ['value','get','set'] as const){
   const present=a.unique('present');a.mov('rax','r11');a.and('rax',F[name]);a.test('rax','rax');a.jcc('ne',present);
   a.mov('rax',0);a.store({base:'rcx',disp:D[name]},'rax');a.store({base:'rcx',disp:D[name]+8},'rax');a.label(present);
  }
  for(const name of ['enumerable','configurable','writable'] as const){
   const present=a.unique('present');a.mov('rax','r11');a.and('rax',F[name]);a.test('rax','rax');a.jcc('ne',present);
   a.mov('rax',2);a.store({base:'rcx',disp:D[name]},'rax');a.mov('rax',0);a.store({base:'rcx',disp:D[name]+8},'rax');a.label(present);
  }
  a.and('r11',F.get|F.set);a.test('r11','r11');a.mov('rax',F.data);const data=a.unique('data');a.jcc('e',data);a.mov('rax',F.accessor);a.label(data);a.store({base:'rcx',disp:D.present},'rax');
 });
}
