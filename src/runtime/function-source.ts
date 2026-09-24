import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O} from './object-layout.js';
import {FunctionLayout as F,FunctionKind} from './functions.js';
import {emitFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const sourceStaticProperties=builtinPropertyRoots('rt.functionToString','toString');
export function emitFunctionSource(b:RuntimeBuilder):void {
 emitFunctionBuiltin(b,'rt.functionToString','toString',0,'rt.functionPrototype.bind');
 b.fn('rt.functionToString.code',40,a=>{a.load('rdx',slot(80));a.call('rt.functionSource');});
 // RCX output, RDX receiver Value*. Source descriptors are immutable static
 // literals; neither name mutation nor deletion changes this representation.
 b.fn('rt.functionSource',40,a=>{
  a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('rdx',{base:'rdx',disp:8});
  a.load('rax',{base:'rdx',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rdx',disp:F.sourceText});a.store({base:'rcx',disp:8},'rax');a.mov('rax',4);a.store({base:'rcx'},'rax');
 });
}
