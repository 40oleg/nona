import {RuntimeBuilder,slot} from '../../src/runtime/abi.js';
import {prependFunctionBuiltin} from '../../src/runtime/function-builtin.js';
import {PropertyLayout as P,PropertyAttributes as A} from '../../src/runtime/object-layout.js';

export const oracleInstaller='globalThis.installAccessor=function(o,k,g,s){Object.defineProperty(o,k,{get:g,set:s,enumerable:true,configurable:true});};';
/** Test-only installation. Public descriptor validation must not use this path. */
export function installAccessorFixture(builder:RuntimeBuilder):void {
 prependFunctionBuiltin(builder,'test.installAccessor','installAccessor',4,'rt.globalObject');
 builder.fn('test.installAccessor.code',88,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'r8');
  a.mov('rcx','r8');a.lea('rdx',{base:'r8',disp:16});a.lea('r8',{rip:'rt.undefinedValue'});a.mov('r9',1);a.call('rt.setProperty');
  a.load('rdx',slot(48));a.load('rcx',{base:'rdx',disp:8});a.load('rdx',{base:'rdx',disp:24});a.call('rt.findOwnProperty');
  a.mov('r11','rax');a.load('rdx',slot(48));
  for(const [field,offset] of [[P.getter,32],[P.setter,48]])for(const n of [0,8]){a.load('rax',{base:'rdx',disp:offset!+n});a.store({base:'r11',disp:field!+n},'rax');}
  a.mov('rax',A.accessor|A.enumerable|A.configurable);a.store({base:'r11',disp:P.attributes},'rax');
  a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
}
