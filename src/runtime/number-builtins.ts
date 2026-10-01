import {RuntimeBuilder,slot,failIf} from './abi.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {stringLiteral} from './value.js';

const names=['isFinite','isInteger','isNaN','isSafeInteger'] as const;
export const numberBuiltinRoots=[...names.map(name=>'rt.Number.'+name+'.fn'),...['isFinite','isNaN','parseInt','parseFloat','eval'].map(name=>'rt.global.'+name+'.fn')];
export const numberBuiltinPropertyRoots=[...names.flatMap(name=>builtinPropertyRoots('rt.Number.'+name+'.fn',name,'rt.Number')),...['isFinite','isNaN','parseInt','parseFloat','eval'].flatMap(name=>builtinPropertyRoots('rt.global.'+name+'.fn',name,'rt.globalObject')),'rt.Number.parseInt','rt.Number.parseFloat'];

function aliasNumberMethod(b:RuntimeBuilder,name:string,symbol:string):void {
 const owner=b.bundle.fragments.find(f=>f.name==='rt.Number')!;
 const head=owner.fixups.find(f=>f.offset===O.properties);
 const property=new Uint8Array(P.size);property[P.value]=5;property[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push(stringLiteral('rt.Number.'+name+'.key',name));
 b.bundle.fragments.push({name:'rt.Number.'+name,section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
  ...(head?[{offset:P.next,kind:'va64' as const,target:head.target,addend:0}]:[]),
  {offset:P.key,kind:'va64',target:'rt.Number.'+name+'.key',addend:0},
  {offset:P.value+8,kind:'va64',target:symbol,addend:0},
 ]});
 if(head)head.target='rt.Number.'+name;else owner.fixups.push({offset:O.properties,kind:'va64',target:'rt.Number.'+name,addend:0});
}

export function emitNumberBuiltins(b:RuntimeBuilder):void {
 {
  const symbol='rt.global.parseFloat.fn';
  prependFunctionBuiltin(b,symbol,'parseFloat',1,'rt.globalObject');
  aliasNumberMethod(b,'parseFloat',symbol);
  rootedFn(b,symbol+'.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
   a.store(slot(40),'rcx');const haveString=a.unique('haveString');
   a.test('rdx','rdx');a.jcc('ne',haveString);a.mov('rax',0);a.store(slot(96),'rax');a.store(slot(104),'rax');a.lea('rdx',slot(96));a.jmp(haveString+'.convert');
   a.label(haveString);a.mov('rdx','r8');a.label(haveString+'.convert');a.lea('rcx',slot(64));a.call('rt.toString');
   a.load('rcx',slot(72));a.call('rt.parseFloatString');
   a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.movqFromXmm('rax','xmm0');a.store({base:'rcx',disp:8},'rax');
  });
 }
 {
  const symbol='rt.global.parseInt.fn';
  prependFunctionBuiltin(b,symbol,'parseInt',2,'rt.globalObject');
  aliasNumberMethod(b,'parseInt',symbol);
  rootedFn(b,symbol+'.code',136,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
   const haveString=a.unique('haveString'),haveRadix=a.unique('haveRadix');
   a.test('rdx','rdx');a.jcc('ne',haveString);a.mov('rax',0);a.store(slot(96),'rax');a.store(slot(104),'rax');a.lea('rdx',slot(96));a.jmp(haveString+'.convert');
   a.label(haveString);a.mov('rdx','r8');a.label(haveString+'.convert');a.lea('rcx',slot(64));a.call('rt.toString');
   a.load('rax',slot(48));a.cmp('rax',2);a.jcc('ae',haveRadix);a.mov('rdx',0);a.jmp(haveRadix+'.ready');
   a.label(haveRadix);a.load('rcx',slot(56));a.add('rcx',16);a.call('rt.toInt32');a.mov('rdx','rax');
   a.label(haveRadix+'.ready');a.load('rcx',slot(72));a.call('rt.parseIntString');
   a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.movqFromXmm('rax','xmm0');a.store({base:'rcx',disp:8},'rax');
  });
 }
 // eval is a documented exception: it exists with its standard metadata and
 // returns non-string arguments unchanged (PerformEval step 2), but source
 // text would need runtime compilation and throws EvalError instead.
 prependFunctionBuiltin(b,'rt.global.eval.fn','eval',1,'rt.globalObject');
 b.fn('rt.global.eval.fn.code',40,a=>{
  const undefinedResult=a.unique('undefinedResult'),done=a.unique('done');a.test('rdx','rdx');a.jcc('e',undefinedResult);
  // A string argument: source made only of white space and line terminators
  // is an empty Script (completion undefined); anything else needs a compiler.
  {const notString=a.unique('notString'),loop=a.unique('loop'),dynamic=a.unique('dynamic');
  a.load('rax',{base:'r8'});a.cmp('rax',4);a.jcc('ne',notString);
  a.load('r10',{base:'r8',disp:8});a.load('r11',{base:'r10'});a.add('r10',8);
  a.label(loop);a.test('r11','r11');a.jcc('e',undefinedResult);a.load('rax',{base:'r10'},16);
  for(const c of [9,10,11,12,13,32,0xa0,0x1680,0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff]){const next=a.unique('ws');a.cmp('rax',c);a.jcc('ne',next);a.add('r10',2);a.sub('r11',1);a.jmp(loop);a.label(next);}
  a.cmp('rax',0x2000);a.jcc('b',dynamic);a.cmp('rax',0x200a);a.jcc('a',dynamic);a.add('r10',2);a.sub('r11',1);a.jmp(loop);
  a.label(dynamic);a.call('rt.throwDynamicCode');a.label(notString);}
  for(const offset of [0,8]){a.load('rax',{base:'r8',disp:offset});a.store({base:'rcx',disp:offset},'rax');}a.jmp(done);
  a.label(undefinedResult);a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
 for(const name of ['isFinite','isNaN'] as const){
  const symbol='rt.global.'+name+'.fn';
  prependFunctionBuiltin(b,symbol,name,1,'rt.globalObject');
  rootedFn(b,symbol+'.code',88,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
   a.store(slot(40),'rcx');const missing=a.unique('missing'),convert=a.unique('convert'),yes=a.unique('yes'),done=a.unique('done');
   a.test('rdx','rdx');a.jcc('e',missing);a.mov('rdx','r8');a.jmp(convert);
   a.label(missing);a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');a.lea('rdx',slot(64));
   a.label(convert);a.lea('rcx',slot(64));a.call('rt.toNumber');
   a.load('rax',slot(72));a.mov('r10',0x7fffffffffffffffn);a.and('rax','r10');
   a.mov('r10',0x7ff0000000000000n);a.cmp('rax','r10');
   a.mov('rax',0);a.jcc(name==='isNaN'?'a':'b',yes);a.jmp(done);
   a.label(yes);a.mov('rax',1);a.label(done);a.load('rcx',slot(40));a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
  });
 }
 for(const name of names){
  prependFunctionBuiltin(b,'rt.Number.'+name+'.fn',name,1,'rt.Number');
  b.fn('rt.Number.'+name+'.fn.code',56,a=>{
   a.store(slot(40),'rcx');const no=a.unique('no'),yes=a.unique('yes'),done=a.unique('done');
   a.test('rdx','rdx');a.jcc('e',no);a.load('rax',{base:'r8'});a.cmp('rax',3);a.jcc('ne',no);
   a.load('rax',{base:'r8',disp:8});a.mov('r10',0x7fffffffffffffffn);a.and('rax','r10');
   a.mov('r10',0x7ff0000000000000n);a.cmp('rax','r10');
   if(name==='isNaN')a.jcc('a',yes);else a.jcc('ae',no);
   if(name==='isFinite')a.jmp(yes);
   else if(name!=='isNaN'){
    if(name==='isSafeInteger'){a.mov('r10',0x433fffffffffffffn);a.cmp('rax','r10');a.jcc('a',no);}
    a.test('rax','rax');a.jcc('e',yes);
    a.mov('r10','rax');a.shr('r10',52);a.sub('r10',1023);a.cmp('r10',0);a.jcc('l',no);a.cmp('r10',52);a.jcc('ae',yes);
    a.mov('rcx',52);a.sub('rcx','r10');a.mov('r11',1);a.shl('r11','cl');a.sub('r11',1);a.and('rax','r11');a.test('rax','rax');a.jcc('e',yes);
   }
   a.label(no);a.mov('rax',0);a.jmp(done);a.label(yes);a.mov('rax',1);a.label(done);
   a.load('rcx',slot(40));a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
  });
 }
}
