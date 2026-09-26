import {rootedFn} from './root-scope.js';
import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O} from './object-layout.js';
import {BoxKind,BoxLayout} from './boxing.js';
import {emitFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

const brands=[['boolean',2],['number',3],['string',4],['symbol',6]] as const;
export const wrapperMethodRoots=[...brands.flatMap(([brand])=>['rt.'+brand+'ValueOf','rt.'+brand+'ToString']),'rt.numberToFixed'];
export const wrapperMethodPropertyRoots=[...brands.flatMap(([brand])=>['valueOf','toString'].flatMap(method=>builtinPropertyRoots('rt.'+brand+(method==='valueOf'?'ValueOf':'ToString'),method,'rt.'+brand+'Prototype'))),...builtinPropertyRoots('rt.numberToFixed','toFixed','rt.numberPrototype')];

export function emitWrapperMethods(b:RuntimeBuilder):void {
 for(const [brand,tag] of brands){
  const owner='rt.'+brand+'Prototype';
  emitFunctionBuiltin(b,'rt.'+brand+'ToString','toString',brand==='number'?1:0,owner+(brand==='number'?'.toFixed':'.valueOf'),owner);
  emitFunctionBuiltin(b,'rt.'+brand+'ValueOf','valueOf',0,undefined,owner);
  // Accept only the actual primitive or its branded wrapper, never a prototype
  // lookalike. Missing/nullish receivers remain errors because builtins use raw this.
  b.fn('rt.this'+brand+'Value',40,a=>{
   const copy=a.unique('copy');a.load('rax',{base:'rdx'});a.cmp('rax',tag);a.jcc('e',copy);a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
   a.load('rdx',{base:'rdx',disp:8});a.load('rax',{base:'rdx',disp:O.kind});a.cmp('rax',BoxKind);failIf(a,'ne','rt.throwTypeError');
   a.add('rdx',BoxLayout.value);a.load('rax',{base:'rdx'});a.cmp('rax',tag);failIf(a,'ne','rt.throwTypeError');
   a.label(copy);a.store({base:'rcx'},'rax');a.load('rax',{base:'rdx',disp:8});if(brand==='symbol'){a.test('rax','rax');failIf(a,'e','rt.throwTypeError');}a.store({base:'rcx',disp:8},'rax');
  });
  b.fn('rt.'+brand+'ValueOf.code',40,a=>{a.load('rdx',slot(80));a.call('rt.this'+brand+'Value');});
  if(brand!=='number')b.fn('rt.'+brand+'ToString.code',72,a=>{
   a.store(slot(40),'rcx');a.load('rdx',slot(112));a.lea('rcx',slot(56));a.call('rt.this'+brand+'Value');
   a.load('rcx',slot(40));a.lea('rdx',slot(56));a.call(brand==='symbol'?'rt.symbolDescriptiveString':'rt.toString');
  });
 }
 rootedFn(b,'rt.numberToString.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:2}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.load('rdx',slot(frame+40));a.lea('rcx',slot(64));a.call('rt.thisnumberValue');
  a.mov('rax',10);a.store(slot(96),'rax');const format=a.unique('format');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',format);
  a.load('rdx',slot(56));a.load('rax',{base:'rdx'});a.test('rax','rax');a.jcc('e',format);
  a.lea('rcx',slot(80));a.call('rt.toNumber');a.movsd('xmm0',slot(88));a.mov('rax',2);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'p','rt.throwRangeError');failIf(a,'b','rt.throwRangeError');
  a.mov('rax',37);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'ae','rt.throwRangeError');a.cvttsd2si('rax','xmm0');a.store(slot(96),'rax');
  a.label(format);a.load('rcx',slot(96));a.movsd('xmm0',slot(72));a.call('rt.formatRadix');a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',4);a.store({base:'rcx'},'rax');
 });
 emitFunctionBuiltin(b,'rt.numberToFixed','toFixed',1,'rt.numberPrototype.valueOf','rt.numberPrototype');
 rootedFn(b,'rt.numberToFixed.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:2}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));a.lea('rcx',slot(64));a.call('rt.thisnumberValue');
  a.mov('rax',0);a.store(slot(96),'rax');const ready=a.unique('digitsReady'),zero=a.unique('digitsZero');
  a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',ready);
  a.load('rdx',slot(56));a.lea('rcx',slot(80));a.call('rt.toNumber');a.movsd('xmm0',slot(88));
  a.ucomisd('xmm0','xmm0');a.jcc('p',zero);
  a.mov('rax',-1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'be','rt.throwRangeError');
  a.mov('rax',101);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'ae','rt.throwRangeError');
  a.cvttsd2si('rax','xmm0');a.store(slot(96),'rax');a.jmp(ready);
  a.label(zero);a.mov('rax',0);a.store(slot(96),'rax');
  a.label(ready);a.load('rcx',slot(96));a.movsd('xmm0',slot(72));a.call('rt.formatFixed');
  a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',4);a.store({base:'rcx'},'rax');
 });
}
