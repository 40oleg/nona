import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O} from './object-layout.js';
import {FunctionLayout as F,FunctionKind} from './functions.js';
import {emitFunctionBuiltin,prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const sourceStaticProperties=[...builtinPropertyRoots('rt.functionToString','toString'),
 ...builtinPropertyRoots('rt.markNativeBuiltin','__nonaMarkNativeInternal')];
export function emitFunctionSource(b:RuntimeBuilder):void {
 emitFunctionBuiltin(b,'rt.functionToString','toString',0,'rt.functionPrototype.bind');
 prependFunctionBuiltin(b,'rt.markNativeBuiltin','__nonaMarkNativeInternal',1,'rt.functionPrototype');
 b.fn('rt.markNativeBuiltin.code',40,a=>{
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r8',disp:8});a.load('r10',{base:'rax',disp:O.kind});a.cmp('r10',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.lea('r10',{rip:'rt.str.nativeFunction'});a.store({base:'rax',disp:F.sourceText},'r10');
  a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
 b.fn('rt.functionToString.code',40,a=>{a.load('rdx',slot(80));a.call('rt.functionSource');});
 // RCX output, RDX receiver Value*. Source descriptors are immutable static
 // literals; neither name mutation nor deletion changes this representation.
 b.fn('rt.functionSource',40,a=>{
  a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('rdx',{base:'rdx',disp:8});
  a.load('rax',{base:'rdx',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rdx',disp:F.sourceText});a.store({base:'rcx',disp:8},'rax');a.mov('rax',4);a.store({base:'rcx'},'rax');
 });
}
