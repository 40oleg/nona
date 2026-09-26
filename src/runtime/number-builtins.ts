import {RuntimeBuilder,slot} from './abi.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

const names=['isFinite','isInteger','isNaN','isSafeInteger'] as const;
export const numberBuiltinRoots=names.map(name=>'rt.Number.'+name+'.fn');
export const numberBuiltinPropertyRoots=names.flatMap(name=>builtinPropertyRoots('rt.Number.'+name+'.fn',name,'rt.Number'));

export function emitNumberBuiltins(b:RuntimeBuilder):void {
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
